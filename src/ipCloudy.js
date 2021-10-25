/* global module, require, __dirname */
'use strict';

const { defaultsDeep } = require('lodash');
const { setIntervalAsync, clearIntervalAsync } = require('set-interval-async/fixed');
const lruCache = require('lru-cache');
const publicIp = require('public-ip');
const debug = require('debug')('index');
const flatCache = require('flat-cache');
const ipaddr = require('ipaddr.js');

const providerNames = ['gce', 'aws', 'azure'];

function isNil(value) {
    return value == null;
}
class IpCloudy {
    constructor(config) {
        this.config = defaultsDeep(config, {
            whoisFallback: {
                enabled: false,
                cacheConfig: {
                    max: 100,
                    length: (n) => n.length,
                },
                whoisConfig: { timeout: 5000 },
            },
            providerCache: {
                name: 'CIDR_RANGE_CACHE',
                path: undefined,
                refreshRate: 5000, // 5 seconds, null to disable
                maxAge: 604800000, // 1 week, -1 for no max age
                writeToFile: true,
            },
        });

        // IP ranges
        this.providers = Object.fromEntries(
            providerNames.map((key) => [key, require(`${__dirname}/providers/${key}.js`)])
        );

        this.providerCache = flatCache.load(
            this.config.providerCache.name,
            this.config.providerCache.path // if undefined, will use the modules default
        );

        // after load do the internal conversion
        Object.keys(this.providers).forEach((name) => {
            this._convertRangestring(name, this.providerCache.getKey(name));
        });
        //

        // whois fallback
        this.whoisFallback = require('./providers/whois.js');
        if (this.config.whoisFallback.enabled) {
            this.whoisCache = new lruCache(this.config.whoisFallback.cacheConfig);
        }

        // keep track of timers so we can close them
        this.refreshTimers = [];
    }

    async _convertRangestring(name, data) {
        if (!data) {
            return;
        }
        // transform provider ranges to ipv4, ipv6, cidr parts
        // for ips, store the normalized form only
        const ipv4 = [];
        const ipv6 = [];
        const cidr4 = [];
        const cidr6 = [];

        for (let i = 0; i < data.length; i++) {
            try {
                // single ip (unlikely to have any, but we need it to comply with ip-range-check)
                if (data[i].indexOf('/') === -1) {
                    let ip = ipaddr.process(data[i]);
                    if (ip.kind() === 'ipv6') {
                        ipv6.push(ip.toNormalizedString());
                    } else {
                        ipv4.push(ip.toString());
                    }
                } else {
                    // ranges
                    let cidr_range = ipaddr.parseCIDR(data[i]);

                    // hacky solution to get range type
                    if (cidr_range[0].kind() === 'ipv6') {
                        cidr6.push(cidr_range);
                    } else {
                        cidr4.push(cidr_range);
                    }
                }
            } catch (err) {
                debug(err);
            }
        }

        this.providerCache.setKey(name + ':ipv4', ipv4);
        this.providerCache.setKey(name + ':ipv6', ipv6);
        this.providerCache.setKey(name + ':cidripv4', cidr4);
        this.providerCache.setKey(name + ':cidripv6', cidr6);
    }

    async _refreshProviderCache(name) {
        try {
            let data = await this.providers[name]();
            this._convertRangestring(name, data);
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

    async _refreshProviderCacheIfExpired(name, forceRefresh = false) {
        const now = Date.now();
        const maxAge = this.config.providerCache.maxAge;
        const age = this.providerCache.getKey(name + ':timestamp');

        if (isNil(age) || (age + maxAge < now && maxAge > -1) || forceRefresh) {
            return this._refreshProviderCache(name);
        }

        return 0;
    }

    _startRefreshInterval(name) {
        const refreshRate = this.config.providerCache.refreshRate;
        const timer = setIntervalAsync(async () => {
            await this._refreshProviderCacheIfExpired(name);
        }, refreshRate);
        this.refreshTimers.push(timer);
    }

    async init(forceRefresh = false) {
        const maxAge = this.config.providerCache.maxAge;

        for (let name of providerNames) {
            await this._refreshProviderCacheIfExpired(name, forceRefresh);
            if (maxAge > -1) {
                this._startRefreshInterval(name);
            }
        }
    }

    async stopRefresh() {
        debug('ending refresh loops..');
        for (let timer of this.refreshTimers) {
            await clearIntervalAsync(timer);
        }
    }

    async check(ip = null) {
        let result = { cloud: null, whois: null };

        if (ip === null) {
            ip = await publicIp.v4();
        }

        try {
            const parsedIp = ipaddr.process(ip);
            const normalizedIp =
                parsedIp.kind() === 'ipv6' ? parsedIp.toNormalizedString() : parsedIp.toString();

            for (let name of providerNames) {
                let ips = this.providerCache.getKey(name + ':' + parsedIp.kind());
                let ranges = this.providerCache.getKey(name + ':cidr' + parsedIp.kind());

                // check single IP matches
                for (let i = 0; i < ips.length; i++) {
                    if (ips[i] === normalizedIp) {
                        result.cloud = name;
                        break;
                    }
                }

                // do not check cidr if we have single ip match
                if (result.cloud !== null) {
                    break;
                }

                // check ranges
                for (let i = 0; i < ranges.length; i++) {
                    if (parsedIp.match(ranges[i])) {
                        result.cloud = name;
                        break;
                    }
                }

                // break provider loop
                if (result.cloud !== null) {
                    break;
                }
            }
        } catch (err) {
            debug(err);
        }

        if (!result.cloud && this.config.whoisFallback.enabled) {
            let whoisValue = this.whoisCache.get(ip);
            if (isNil(whoisValue)) {
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
