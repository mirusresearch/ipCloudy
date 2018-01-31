/* global module, require */

const _ = require('lodash');
const axios = require('axios');

module.exports = async function() {
    let response = await axios({
        method: 'get',
        url: 'https://ip-ranges.amazonaws.com/ip-ranges.json',
        json: true
    });
    return _.map(response.data.prefixes, obj => obj.ip_prefix);
};
