/* global module, require */
const dns = require('dns');
const util = require('util');

util.promisifyAll(dns);

const blockUrl = '_cloud-netblocks.googleusercontent.com';

async function lookupDns(url) {
    const result = await dns.resolveTxtAsync(url);
    const inner = result[0];
    return Array.isArray(inner) ? inner[0] : inner;
}

module.exports = async function () {
    const textRecord = await lookupDns(blockUrl);
    const blocks = textRecord
        .split(' ')
        .filter((r) => r.includes('include:')) // take the strings with 'include:'
        .map((r) => r.replace('include:', '')); // remove 'include:'

    const rawIPs = [];
    for (let block of blocks) {
        const rawIP = await lookupDns(block);
        rawIPs.push(rawIP);
    }

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
