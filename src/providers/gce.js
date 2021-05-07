/* global module, require */
const dns = require('dns');
const Promise = require('bluebird');

Promise.promisifyAll(dns);

const blockUrl = '_cloud-netblocks.googleusercontent.com';

async function lookupDns(url) {
    let result = await dns.resolveTxtAsync(url);
    let inner = result[0];
    return Array.isArray(inner) ? inner[0] : inner;
}

module.exports = async function () {
    let textRecord = await lookupDns(blockUrl);
    let blocks = textRecord
        .split(' ')
        .filter((r) => r.includes('include:')) // take the strings with 'include:'
        .map((r) => r.replace('include:', '')); // remove 'include:'
    let rawIPs = await Promise.map(blocks, async (b) => await lookupDns(b));
    const extractedIPs = [
        ...rawIPs
            .filter(Boolean) // remove falsey array elements
            .join(' ') // combine to a single string
            // grab CIDR ranges starting with ip4: or ip6:
            // https://regex101.com/r/jB5UwF/1
            .matchAll(/(?:ip[46]:)(?<ip>(\d|:|\.|\/)+)/gm),
    ].map((m) => m.groups.ip); // grab the ip capture
    return extractedIPs;
};
