/* global module, require */

const dns = require('dns')
const _ = require('lodash')
const Promise = require('bluebird')

Promise.promisifyAll(dns)

const blockUrl = '_cloud-netblocks.googleusercontent.com'

async function lookupDns(url) {
    let result = await dns.resolveTxtAsync(url)
    let inner = result[0]
    return _.isArray(inner) ? inner[0] : inner
}

module.exports = async function() {
    let textRecord = await lookupDns(blockUrl)
    let blocks = _(textRecord)
        .split(' ')
        .remove(r => _.includes(r, 'include:')) // take the strings with 'include:'
        .map(r => r.replace('include:', '')) // remove 'include:'
        .value()
    let rawIPs = await Promise.map(blocks, async b => await lookupDns(b))
    return _(rawIPs)
        .compact() // go from [[String]] -> [String]
        .split(' ')
        .remove(ip => _.includes(ip, 'ip')) // take the strings with 'ip'
        .map(ip => ip.replace('ip4:', '').replace('ip6:', '')) // remove 'ip4:' and 'ip6'
        .value()
}
