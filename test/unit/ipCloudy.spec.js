/* global require */

const test = require('ava');
const tk = require('timekeeper');

const IpCloudy = require('../../src/ipCloudy.js');
const date = 1330688329321;

test.before(() => {
    tk.freeze(new Date(date));
});

test.after(() => {
    tk.reset();
});

test.beforeEach(async (t) => {
    t.context.ipc = new IpCloudy({
        providerCache: {
            writeToFile: false,
            path: `${__dirname}/.cache/`,
            maxAge: -1,
        },
    });
    await t.context.ipc.init();
});

test.afterEach((t) => {
    t.context.ipc.stopRefresh();
});

test('constructor() | does not fail', (t) => {
    new IpCloudy();
    t.pass();
});

test('init() | saves values to cache', async (t) => {
    let expected = [
        'gce:ipv4',
        'gce:ipv6',
        'gce:cidripv4',
        'gce:cidripv6',
        'gce',
        'gce:timestamp',
        'aws:ipv4',
        'aws:ipv6',
        'aws:cidripv4',
        'aws:cidripv6',
        'aws',
        'aws:timestamp',
        'azure:ipv4',
        'azure:ipv6',
        'azure:cidripv4',
        'azure:cidripv6',
        'azure',
        'azure:timestamp',
    ];
    let ipc = new IpCloudy({ providerCache: { writeToFile: true, path: `${__dirname}/.cache/` } });
    await ipc.init();
    let k = Object.keys(ipc.providerCache.all());
    t.deepEqual(k, expected);
});

test('_refreshProviderCache() | updates cache', async (t) => {
    t.context.ipc.providers.test = async () => ['10.0.0.0/24'];
    await t.context.ipc._refreshProviderCache('test');
    t.is(t.context.ipc.providerCache.getKey('test:cidripv4')[0].toString(), '10.0.0.0/24');
    t.is(t.context.ipc.providerCache.getKey('test:timestamp'), date);
});

test('_refreshProviderCacheIfExpired() | udpates when past max age', async (t) => {
    let ipc = t.context.ipc;
    ipc.config.providerCache.maxAge = 4999;
    ipc.providerCache.setKey('test', ['10.0.0.0/24']);
    ipc.providerCache.setKey('test:timestamp', date - 5000);
    ipc._refreshProviderCache = async (n) => n;
    let result = await ipc._refreshProviderCacheIfExpired('test');
    t.is(result, 'test');
});

test('_refreshProviderCacheIfExpired() | do not update when under max age', async (t) => {
    let ipc = t.context.ipc;
    ipc.config.providerCache.maxAge = 5001;
    ipc.providerCache.setKey('test', ['10.0.0.0/24']);
    ipc.providerCache.setKey('test:timestamp', date - 5000);
    ipc._refreshProviderCache = async (n) => n;
    let result = await ipc._refreshProviderCacheIfExpired('test');
    t.is(result, 0);
});

test('_startRefreshinterval() | resolves when closed, stops timer', async (t) => {
    let ipc = new IpCloudy({ providerCache: { refreshRate: 100, writeToFile: false } });
    ipc._startRefreshInterval('gce');

    await ipc.stopRefresh();
    t.is(ipc.refreshTimers[0].stopped, true);
});

test('check() | returns appropriate response for azure ip', async (t) => {
    let result = await t.context.ipc.check('13.70.64.1');
    t.is(result.cloud, 'azure');
});

test('check() | returns appropriate response for azure ip in ipv6 format', async (t) => {
    let result = await t.context.ipc.check('0:0:0:0:0:ffff:d46:4001');
    t.is(result.cloud, 'azure');
});

test('check() | returns appropriate response for aws ip', async (t) => {
    let result = await t.context.ipc.check('54.173.231.161');
    t.is(result.cloud, 'aws');
});

test('check() | returns appropriate response for gce ip', async (t) => {
    let result = await t.context.ipc.check('104.196.27.39');
    t.is(result.cloud, 'gce');
});

test('check() | returns appropriate response for gce ipv6', async (t) => {
    let result = await t.context.ipc.check('2600:1900:0000:0000:0000:0000:0000:0000');
    t.is(result.cloud, 'gce');
});

test('check() | falls back to whois organization when enabled', async (t) => {
    let ipc = new IpCloudy({ whoisFallback: { enabled: true } });
    await ipc.init();
    let result = await ipc.check('208.43.118.0');
    const org = result.whois.toLowerCase();
    t.is(org.startsWith('softlayer'), true);
});

test('check() | returns "unknown" if ip is not recognized', async (t) => {
    let result = await t.context.ipc.check('999.999.999.999');
    t.is(result.whois, null);
    t.is(result.cloud, null);
});

test('_convertRangestring() | returns "undefined" if no data provided', async (t) => {
    let ipc = new IpCloudy({ providerCache: { refreshRate: 100, writeToFile: false } });
    const result = await ipc._convertRangestring('gce', null);
    t.is(result, undefined);
});

test('_convertRangestring() | support individual ips', async (t) => {
    let ipc = new IpCloudy({ providerCache: { refreshRate: 100, writeToFile: false } });
    const result = await ipc._convertRangestring('gce', [
        '192.168.1.1',
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    ]);
    t.is(result, undefined);
});
