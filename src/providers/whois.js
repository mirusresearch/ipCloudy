/* global module, require */

const _ = require('lodash');
const whois = require('whois');
const Promise = require('bluebird');

const lookup = Promise.promisify(whois.lookup);
const entryRegex = /^(network:)?Organization(;I)?:\W*(.*)/;

module.exports = async function(ip) {
    let data;
    try {
        data = await lookup(ip);
    } catch (error) {
        console.error('ipCloudy:', error);
        return null;
    }
    let org = data.split('\n').filter(entry => entryRegex.test(entry));
    if (org.length) {
        return org[0].replace(entryRegex, '$3');
    }
    return null;
};
