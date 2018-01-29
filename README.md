# ipCloudy
Lookup module for checking if an IP is in a cloud service range. Ip ranges for the providers are cached in memory (and optionally written out to file). Ranges will be auto refreshed after a configured interval (1 week by default). If the whois fallback is enabled, the first 100 (this is configurable) ips will be cached using a lru cache.

# Usage
```javascript
    const IpCloudy = require('ipCloudy') // you'll need to import directly from this repo for now
    const ipc = new IpCloudy({
            whoisFallback: {
                enabled: false, // if true fallback to whois
                cacheConfig: { // https://www.npmjs.com/package/lru-cache
                    max: 100,
                    length: (n, key) => n.length
                }
            },
            cidrRangeRefresh: 604800000, // 1 week. force update to ip range cache
            saveCache: true // save cache to file when its updated
    })

    ipc.init() // load ip ranges into cache (using saved file if present, else going out and getting the ranges)

    console.log(await ipc.check('104.196.27.39')) // -> 'gce'
    console.log(await ipc.check()) // use public ip or current host
```

# linting

This project uses [Prettier.js](https://prettier.io/) for code formating and linting. I would recomend installing it globally as described [here](https://prettier.io/docs/en/install.html) and integrate it with your editor.

here is the configuration used

```
--no-semi: true
--single-quote: true
--tab-width: 4
```

check out `.eslint.rc` as well
