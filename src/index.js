/* global module, require, __dirname, setInterval */
'use strict'

const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const Promise = require('bluebird')
const publicIp = require('public-ip')
const flatCache = require('flat-cache')
const debug = require('debug')('index')
const ipRangeCheck = require('ip-range-check')

const providerNames = ['gce', 'aws', 'azure']

class IpCloudy {
    constructor(config) {
        this.config = _.defaultsDeep(config, {
            whoisFallback: false,
            cidrRangeRefresh: null, //10000, //604800000 // 1 week
            saveCache: false
        })
        this.cidrRangeCache = flatCache.load('CIDR_RANGE_CACHE')
        this.providers = _.map(providerNames, p => ({
            name: p,
            func: require(`./providers/${p}.js`)
        }))
    }

    async _refreshCidrRangeCache() {
        await Promise.each(this.providers, async provider => {
            debug(`refreshing ${provider.name}`)
            this.cidrRangeCache.setKey(provider.name, await provider.func())
        })

        if (this.config.saveCache) this.cidrRangeCache.save()
    }

    async init() {
        await this._refreshCidrRangeCache()

        if (!_.isNil(this.config.cidrRangeRefresh)) {
            setInterval(async () => {
                await this._refreshCidrRangeCache()
            }, this.config.cidrRangeRefresh)
        }
    }

    async check(ip = null) {
        if (ip === null) {
            ip = await publicIp.v4()
        }

        for (let name of providerNames) {
            let ranges = this.cidrRangeCache.getKey(name)

            if (ipRangeCheck(ip, ranges)) {
                return true
            }
        }

        return false
    }
}

async function test() {
    let ipc = new IpCloudy({})
    await ipc.init()
    console.log(await ipc.check())
}
test()

module.exports = IpCloudy
