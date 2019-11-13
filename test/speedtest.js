const IpCloudy = require('../src/ipCloudy.js');
const NanoTimer = require('nanotimer');
const timer = new NanoTimer();
const Faker = require('faker');

const ipc = new IpCloudy({
    whoisFallback: {
        enabled: false,
        // https://www.npmjs.com/package/lru-cache
        cacheConfig: {
            max: 10000,
            length: n => (n && n.length) || 1
        }
    },
    whoisConfig: {
        timeout: 1000
    },
    providerCache: {
        name: 'CIDR_RANGE_CACHE', // name of the cache to use
        path: __dirname, // cache path, undefined will use flat-cache's default location
        refreshRate: 60000, // milliseconds
        maxAge: 604800000, // milliseconds (1 week). -1 for no maxAge
        writeToFile: true // save cache to file when its update
    }
});

let speeds = [];

function checkIP(ip, callback) {
    ipc.check(ip).then(callback);
}

function runIPTimer() {
    timer.time(checkIP, [Faker.internet.ip()], 'u', function(time) {
        speeds.push(time);
        const length = speeds.length;
        if (length % 100 === 0) {
            const sum = speeds.reduce((a, b) => a + b, 0);
            const avg = sum / length;
            console.log(`Avg ${avg.toFixed(3)} microseconds per IP over ${length} ips`);
        }
    });
}

async function main() {
    console.log('Initializing ipcloudy...');
    await ipc.init();
    timer.setInterval(runIPTimer, '', '0u', function(err) {
        if (err) {
            console.error(err);
        }
    });

    return;
}

main().then(() => {
    ipc.stopRefresh();
});
