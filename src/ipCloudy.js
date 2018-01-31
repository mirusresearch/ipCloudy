/* global module, require, __dirname */
'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const Promise = require('bluebird');
const lruCache = require('lru-cache');
const publicIp = require('public-ip');
const debug = require('debug')('index');
const flatCache = require('flat-cache');
const ipRangeCheck = require('ip-range-check');

const providerNames = ['gce', 'aws', 'azure'];

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
                refreshRate: 5000, // 5 seconds, null to disable
                maxAge: 604800000, // 1 week
                writeToFile: true
            }
        });

        // IP ranges
        this.providers = _.reduce(
            providerNames,
            (acc, name) => _.set(acc, name, require(`${__dirname}/providers/${name}.js`)),
            {}
        );
        this.providerCache = flatCache.load(this.config.providerCache.name);

        // whois fallback
        this.whoisFallback = require('./providers/whois.js');
        if (this.config.whoisFallback.enabled) {
            this.whoisCache = lruCache({ max: this.config.whoisFallback.cacheConfig });
        }

        // if true the infinite refresh loops will halt
        this._closed = false;
    }

    async _refreshProviderCache(name) {
        try {
            let data = await this.providers[name]();
            this.providerCache.setKey(name, data);
            this.providerCache.setKey(name + ':timestamp', Date.now());
            debug(`refreshed ${name} ip ranges`);

            if (this.config.providerCache.writeToFile) {
                this.providerCache.save(true);
                debug(`save ${name} cache out to file`);
            }
        } catch (err) {
            debug(err);
        }
    }

    async _refreshProviderCacheIfExpired(name) {
        let now = Date.now();
        let age = this.providerCache.getKey(name + ':timestamp');

        if (_.isNil(age) || age + this.config.providerCache.maxAge < now) {
            return this._refreshProviderCache(name);
        }
        return Promise.resolve(0);
    }

    async _startRefreshInterval(name) {
        let refreshRate = this.config.providerCache.refreshRate;

        if (!_.isNil(refreshRate) && !this._closed) {
            await Promise.delay(refreshRate);
            await this._refreshProviderCacheIfExpired(name);
            return this._startRefreshInterval(name);
        }
        return Promise.resolve(0);
    }

    async init(forceRefresh = false) {
        await Promise.each(providerNames, async name => {
            await this._refreshProviderCacheIfExpired(name);
            this._startRefreshInterval(name);
        });
    }

    stopRefresh() {
        debug('ending refresh loops..');
        this._closed = true;
    }

    async check(ip = null) {
        let result = { cloud: null, whois: null };

        if (ip === null) {
            ip = await publicIp.v4();
        }

        for (let name of providerNames) {
            let ranges = this.providerCache.getKey(name);

            if (ipRangeCheck(ip, ranges)) {
                result.cloud = name;
            }
        }

        if (!result.cloud && this.config.whoisFallback.enabled) {
            let whoisValue = this.whoisCache.get(ip);
            if (_.isNil(whoisValue)) {
                debug(`${ip} whois not in cache, getting it`);
                whoisValue = await this.whoisFallback(ip);
                this.whoisCache.set(ip, whoisValue);
            }
            result.whois = whoisValue;
        }
        return result;
    }
}

module.exports = IpCloudy;
