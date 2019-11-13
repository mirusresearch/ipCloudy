/* global module, require, __dirname */
'use strict';

const _ = require('lodash');
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
                    length: n => n.length
                },
                whoisConfig: { timeout: 5000 }
            },
            providerCache: {
                name: 'CIDR_RANGE_CACHE',
                path: undefined,
                refreshRate: 5000, // 5 seconds, null to disable
                maxAge: 604800000, // 1 week, -1 for no max age
                writeToFile: true
            }
        });

        // IP ranges
        this.providers = _.reduce(
            providerNames,
            (acc, name) => _.set(acc, name, require(`${__dirname}/providers/${name}.js`)),
            {}
        );

        this.providerCache = flatCache.load(
            this.config.providerCache.name,
            this.config.providerCache.path // if undefined, will use the modules default
        );

        // whois fallback
        this.whoisFallback = require('./providers/whois.js');
        if (this.config.whoisFallback.enabled) {
            this.whoisCache = new lruCache(this.config.whoisFallback.cacheConfig);
        }

        // if true the infinite refresh loops will halt
        this._closed = false;
        this.timings = {};
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
        let maxAge = this.config.providerCache.maxAge;
        let age = this.providerCache.getKey(name + ':timestamp');

        if (_.isNil(age) || (age + maxAge < now && maxAge > -1)) {
            return this._refreshProviderCache(name);
        }
        return Promise.resolve(0);
    }

    async _startRefreshInterval(name) {
        let maxAge = this.config.providerCache.maxAge;
        let refreshRate = this.config.providerCache.refreshRate;

        if (maxAge > -1 && !this._closed) {
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
            const ranges = this.providerCache.getKey(name);
            const hrstart = process.hrtime();
            const matched = ipRangeCheck(ip, ranges);
            const hrend = process.hrtime(hrstart);
            this.timings[name] = this.timings[name] || [];
            this.timings[name].push(hrend[1]);
            if (this.timings[name].length % 100 === 0) {
                for (const [key, speeds] of Object.entries(this.timings)) {
                    const sum = speeds.reduce((a, b) => a + b, 0);
                    const avg = sum / speeds.length;
                    console.info(`avg ipRangeCheck: ${avg.toFixed(1)}ms for ${key} `);
                }
                console.log('-------');
            }

            if (matched) {
                result.cloud = name;
                break;
            }
        }

        if (!result.cloud && this.config.whoisFallback.enabled) {
            let whoisValue = this.whoisCache.get(ip);
            if (_.isNil(whoisValue)) {
                debug(`${ip} whois not in cache, getting it`);
                whoisValue = await this.whoisFallback(ip, this.config.whoisFallback.whoisConfig);
                this.whoisCache.set(ip, whoisValue);
            }
            result.whois = whoisValue;
        }
        return result;
    }
}

module.exports = IpCloudy;
