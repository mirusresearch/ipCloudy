/* global module, require */

const whois = require('whois');
const utils = require('utils');
const debug = require('debug')('whois');

const lookup = utils.promisify(whois.lookup);
const entryRegex = /^(network:)?Organization(;I)?:\W*(.*)/;

module.exports = async function (ip, whoisConfig) {
    try {
        const data = await lookup(ip, whoisConfig);
        const org = data.split('\n').filter((entry) => entryRegex.test(entry));

        return org.length ? org[0].replace(entryRegex, '$3') : null;
    } catch (error) {
        debug('ipCloudy:', error);
        return null;
    }
};
