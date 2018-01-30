/* global module, require, __dirname, setInterval, setTimeout */
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
            providerCacheName: 'CIDR_RANGE_CACHE',
            providerCacheMaxAge: 604800000, // 1 week
            saveCache: true
        })

        // IP ranges
        this.providers = _.reduce(
            providerNames,
            (acc, name) => _.set(acc, name, require(`./providers/${name}.js`)),
            {}
        )
        this.providerCache = flatCache.load(this.config.providerCacheName)

        // whois fallback
        this.whoisFallback = require('./providers/whois.js')
        if (this.config.whoisFallback.enabled) {
            this.whoisCache = lruCache({ max: this.config.whoisFallback.cacheConfig })
        }
    }

    async _refreshProviderCache(name) {
        let data = await this.providers[name]()
        this.providerCache.setKey(name, data)
        this.providerCache.setKey(name + ':timestamp', Date.now())
        debug(`refreshed ${name} ip ranges`)

        if (this.config.saveCache) {
            this.providerCache.save(true)
            debug(`save ${name} cache out to file`)
        }
    }

    _provideCacheExpired(name) {
        let now = Date.now()
        let age = this.providerCache.getKey(name + ':timestamp')

        if (_.isNil(age)) {
            return true
        } else if (age + this.config.providerCacheMaxAge < now) {
            return true
        } else {
            return false
        }
    }

    _timeTilProviderCacheExpire(name) {
        let now = Date.now()
        let age = this.providerCache.getKey(name + ':timestamp') || 0
        return Math.abs(now - (age + this.config.providerCacheMaxAge))
    }

    _startRefreshInterval(name) {
        setInterval(
            async () => await this._refreshProviderCache(name),
            this.config.providerCacheMaxAge
        )
    }

    async init(forceRefresh = false) {
        await Promise.each(providerNames, async name => {
            try {
                if (this._provideCacheExpired(name)) {
                    // doesnt exist counts as expired
                    await this._refreshProviderCache(name)
                    this._startRefreshInterval(name)
                } else {
                    setTimeout(async () => {
                        await this._refreshProviderCache(name)
                        this._startRefreshInterval(name)
                    }, this._timeTilProviderCacheExpire(name))
                }
            } catch (err) {
                debug(err)
            }
        })
    }

    async check(ip = null) {
        if (ip === null) {
            ip = await publicIp.v4()
        }

        for (let name of providerNames) {
            let ranges = this.providerCache.getKey(name)
            // if (name === 'gce') {
            //     console.log(ranges)
            // }
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
