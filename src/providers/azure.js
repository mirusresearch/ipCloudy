/* global module, require */

const _ = require('lodash');
const xml = require('xml2js');
const axios = require('axios');
const Promise = require('bluebird');

const axiosCookieJarSupport = require('axios-cookiejar-support').default;

axiosCookieJarSupport(axios);
const parse = Promise.promisify(xml.parseString);

const uri = 'https://www.microsoft.com/en-us/download/confirmation.aspx?id=41653';
const fileRegex = /href="(.*?PublicIPs.*?xml)"/;

module.exports = async function() {
    console.log('getting azure ips');
    let response = await axios.get(uri, { jar: true, withCredentials: true });
    let page = response.data;

    let uriMatches = fileRegex.exec(page);
    if (uriMatches.length < 2) {
        throw new Error('Azure: No file download urls found at ' + uri);
    }
    let rangeXMLUri = uriMatches[1];

    let xmlResponse = await axios.get(rangeXMLUri, { jar: true, withCredentials: true });
    let jsonData = await parse(xmlResponse.data);
    let regions = jsonData.AzurePublicIpAddresses.Region.map(range =>
        (range.IpRange || []).map(ipr => ipr.$.Subnet)
    );

    return _.flatten(regions);
};
