/* global module, require, __dirname, setInterval, setTimeout */
'use strict'

const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const Promise = require('bluebird')
const lruCache = require('lru-cache')
const publicIp = require('public-ip')
const debug = require('debug')('index')
const flatCache = require('flat-cache')
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
            providerCache: {
                name: 'CIDR_RANGE_CACHE',
                refreshRate: 5000, // 5 seconds
                maxAge: 604800000 // 1 week
            },
            saveCache: true
        })

        // IP ranges
        this.providers = _.reduce(
            providerNames,
            (acc, name) => _.set(acc, name, require(`./providers/${name}.js`)),
            {}
        )
        this.providerCache = flatCache.load(this.config.providerCache.name)

        // whois fallback
        this.whoisFallback = require('./providers/whois.js')
        if (this.config.whoisFallback.enabled) {
            this.whoisCache = lruCache({ max: this.config.whoisFallback.cacheConfig })
        }
    }

    async _refreshProviderCache(name) {
        try {
            let data = await this.providers[name]()
            this.providerCache.setKey(name, data)
            this.providerCache.setKey(name + ':timestamp', Date.now())
            debug(`refreshed ${name} ip ranges`)

            if (this.config.saveCache) {
                this.providerCache.save(true)
                debug(`save ${name} cache out to file`)
            }
        } catch (err) {
            debug(err)
        }
    }

    async _refreshProviderCacheIfExpired(name) {
        let now = Date.now()
        let age = this.providerCache.getKey(name + ':timestamp')

        if (_.isNil(age) || age + this.config.providerCache.maxAge < now) {
            return this._refreshProviderCache(name)
        }
        return Promise.resolve()
    }

    _startRefreshInterval(name) {
        setTimeout(async () => {
            await this._refreshProviderCacheIfExpired(name)
            this._startRefreshInterval(name)
        }, this.config.providerCache.refreshRate)
    }

    async init(forceRefresh = false) {
        await Promise.each(providerNames, async name => {
            await this._refreshProviderCacheIfExpired(name)
            this._startRefreshInterval(name)
        })
    }

    async check(ip = null) {
        if (ip === null) {
            ip = await publicIp.v4()
        }

        for (let name of providerNames) {
            let ranges = this.providerCache.getKey(name)

            if (ipRangeCheck(ip, ranges)) {
                return name
            }
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
        return 'unknown'
    }
}

module.exports = IpCloudy
