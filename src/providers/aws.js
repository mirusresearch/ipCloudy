/* global module, require */

const axios = require('axios');

module.exports = async function () {
    let response = await axios({
        method: 'get',
        url: 'https://ip-ranges.amazonaws.com/ip-ranges.json',
        json: true,
    });
    return response.data.prefixes.map((obj) => obj.ip_prefix);
};
