/* global module, require, __dirname, setInterval */
'use strict'

const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const Promise = require('bluebird')
const publicIp = require('public-ip')
const lruCache = require('lru-cache')
const flatCache = require('flat-cache')
const debug = require('debug')('index')
const ipRangeCheck = require('ip-range-check')

const providerNames = ['gce', 'aws', 'azure']

class IpCloudy {
    constructor(config) {
        this.config = _.defaultsDeep(config, {
            whoisFallback: {
                enabled: false,
                cacheConfig: {
                    max: 100,
                    length: (n, key) => n.length
                }
            },
            cidrRangeRefresh: 604800000, // 1 week
            saveCache: true
        })

        // IP ranges
        this.providers = _.map(providerNames, p => ({
            name: p,
            func: require(`./providers/${p}.js`)
        }))
        this.cidrRangeCache = flatCache.load('CIDR_RANGE_CACHE')

        // whois fallback
        this.whoisFallback = require('./providers/whois.js')
        if (this.config.whoisFallback.enabled) {
            this.whoisCache = lruCache({ max: this.config.whoisFallback.cacheConfig })
        }
    }

    async _refreshCidrRangeCache() {
        await Promise.each(this.providers, async provider => {
            try {
                var newRanges = await provider.func()
                this.cidrRangeCache.setKey(provider.name, newRanges)
                debug(`refreshed ${provider.name} ip ranges`)
            } catch (err) {
                debug(err)
            }
        })

        if (this.config.saveCache) this.cidrRangeCache.save()
    }

    async init(forceRefresh = false) {
        if (forceRefresh || !_.isEqual(_.keys(this.cidrRangeCache.all()), providerNames)) {
            await this._refreshCidrRangeCache()
        } else {
            debug('used saved cache for ip ranges')
        }

        if (!_.isNil(this.config.cidrRangeRefresh)) {
            setInterval(async () => {
                await this._refreshCidrRangeCache()
            }, this.config.cidrRangeRefresh)
        }
    }

    async check(ip = null) {
        if (ip === null) ip = await publicIp.v4()

        for (let name of providerNames) {
            let ranges = this.cidrRangeCache.getKey(name)
            if (ipRangeCheck(ip, ranges)) return name
        }

        if (this.config.whoisFallback.enabled) {
            let cachedValue = this.whoisCache.get(ip)
            if (!_.isNil(cachedValue)) {
                debug(`${ip} whois cached, returning that`)
                return cachedValue
            }
            debug(`${ip} whois not in cache, getting it`)
            let newValue = this.whoisFallback(ip)
            this.whoisCache.set(ip, newValue)
            return newValue
        }
        return null
    }
}

module.exports = IpCloudy
