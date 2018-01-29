/* global module, require */

const GceIps = require('gce-ips')
const Promise = require('bluebird')

let gceIps = GceIps()
Promise.promisifyAll(gceIps)

module.exports = async function() {
    return gceIps.lookupAsync()
}
