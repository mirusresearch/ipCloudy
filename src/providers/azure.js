/* global module, require */

const xml = require('xml2js');
const axios = require('axios');
const util = require('util');

const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const jar = new CookieJar();

const client = wrapper(axios.create({ jar }));

const parse = util.promisify(xml.parseString);

const uri = 'https://www.microsoft.com/en-us/download/confirmation.aspx?id=41653';
const fileRegex = /href="(.*?PublicIPs.*?xml)"/;

module.exports = async function () {
    let response = await client.get(uri);
    let page = response.data;

    let uriMatches = fileRegex.exec(page);
    if (uriMatches.length < 2) {
        throw new Error('Azure: No file download urls found at ' + uri);
    }
    let rangeXMLUri = uriMatches[1];

    let xmlResponse = await client.get(rangeXMLUri);
    let jsonData = await parse(xmlResponse.data);
    let regions = jsonData.AzurePublicIpAddresses.Region.map((range) =>
        (range.IpRange || []).map((ipr) => ipr.$.Subnet)
    );
    return regions.flat();
};
