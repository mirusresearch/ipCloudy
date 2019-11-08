![banner](https://github.com/mirusresearch/ipCloudy/blob/master/banner.jpg)
![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)
[![Build Status](https://travis-ci.org/mirusresearch/ipCloudy.svg?branch=master)](https://travis-ci.org/mirusresearch/ipCloudy)

# Description #
Lookup module for checking if an IP is in a cloud service range. Ip ranges for the providers are cached in memory (and optionally written out to file).
Ranges will be auto refreshed after a configured interval (1 week by default).
If the whois fallback is enabled, the first 100 (this is configurable) ips will be cached using a lru cache.

# Installation #
Using npm:

```
$ yarn add ip-cloudy
```

In Node.js:

```javascript
    const IpCloudy = require('ip-cloudy')
    const ipc = new IpCloudy({
            whoisFallback: {
                enabled: false, // if true fallback to whois
                cacheConfig: { // https://www.npmjs.com/package/lru-cache
                    max: 100,
                    length: (n, key) => n.length
                }
            },
            providerCache: {
                name: 'CIDR_RANGE_CACHE', // name of the cache to use
                path: undefined, // cache path, undefined will use flat-cache's default location
                refreshRate: 5000, // milliseconds
                maxAge: 604800000, // milliseconds (1 week). -1 for no maxAge
                writeToFile: true  // save cache to file when its update
            },
            whoisConfig: {
                // config from "whois" package
            }
    })
    // load ip ranges into cache. using saved file if present,
    // else going out and getting the ranges
    ipc.init()

    console.log(await ipc.check('104.196.27.39')) // -> {"cloud": "gce", "whois": null}
    console.log(await ipc.check()) // use public ip or current host

    // this will end the cache refresh intervals, so the node process can resolve
    // alternatively, you can set providerCache.refreshRate
    // to null to disable the refresh intervals
    ipc.stopRefresh()
```

# Development #
Issues and PR's are always welcome, just follow the prettier.js style guides described below.

## Testing ##
This project uses Ava.js. To run the tests clone the repo, then run:

```
$ yarn
$ yarn test
```

## Styling ##

This project uses [Prettier.js](https://prettier.io/) for code formating and linting. I would recomend installing it globally as described [here](https://prettier.io/docs/en/install.html) and integrate it with your editor.

here is the configuration used

```
--no-semi: false
--single-quote: true
--tab-width: 4
--print-width: 100
```

check out `.eslint.rc` as well
