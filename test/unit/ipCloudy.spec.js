/* global require */

import test from 'ava';
import { keys, difference, isEmpty } from 'lodash';
import * as tk from 'timekeeper';

const Promise = require('bluebird');
const flatCache = require('flat-cache');

const IpCloudy = require('../../src/ipCloudy.js');
const date = 1330688329321;

test.before(t => {
    tk.freeze(new Date(date));
});

test.after(t => {
    tk.reset();
});

test.beforeEach(async t => {
    t.context.ipc = new IpCloudy({
        providerCache: {
            writeToFile: false,
            path: `${__dirname}/.cache/`,
            maxAge: -1
        }
    });
    await t.context.ipc.init();
});

test.afterEach(t => {
    t.context.ipc.stopRefresh();
});

test('constructor() | does not fail', t => {
    new IpCloudy();
    t.pass();
});

test('init() | saves values to cache', async t => {
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
        'azure:timestamp'
    ];
    let ipc = new IpCloudy({ providerCache: { writeToFile: true, path: `${__dirname}/.cache/` } });
    await ipc.init();
    let k = keys(ipc.providerCache.all());
    t.true(isEmpty(difference(k, expected)));
});

test('_refreshProviderCache() | updates cache', async t => {
    t.context.ipc.providers.test = async () => ['10.0.0.0/24'];
    await t.context.ipc._refreshProviderCache('test');
    t.is(t.context.ipc.providerCache.getKey('test:cidripv4')[0].toString(), '10.0.0.0/24');
    t.is(t.context.ipc.providerCache.getKey('test:timestamp'), date);
});

test('_refreshProviderCacheIfExpired() | udpates when past max age', async t => {
    let ipc = t.context.ipc;
    ipc.config.providerCache.maxAge = 4999;
    ipc.providerCache.setKey('test', ['10.0.0.0/24']);
    ipc.providerCache.setKey('test:timestamp', date - 5000);
    ipc._refreshProviderCache = n => Promise.resolve(n);
    let result = await ipc._refreshProviderCacheIfExpired('test');
    t.is(result, 'test');
});

test('_refreshProviderCacheIfExpired() | do not update when under max age', async t => {
    let ipc = t.context.ipc;
    ipc.config.providerCache.maxAge = 5001;
    ipc.providerCache.setKey('test', ['10.0.0.0/24']);
    ipc.providerCache.setKey('test:timestamp', date - 5000);
    ipc._refreshProviderCache = n => Promise.resolve(n);
    let result = await ipc._refreshProviderCacheIfExpired('test');
    t.is(result, 0);
});

// cant test that the function never halts...thats the halting problem
// I can make sure it does multiple loops without resolving though
test('_startRefreshinterval() | resolves when closed', async t => {
    let ipc = new IpCloudy({ providerCache: { refreshRate: 100, writeToFile: false } });
    let bluePromise = Promise.resolve(ipc._startRefreshInterval('gce'));
    return bluePromise
        .timeout(500)
        .then(() => t.fail('should not resolve'))
        .catch(Promise.TimeoutError, e => t.pass('should timeout because it never resolves'));
});

test('_startRefreshinterval() | resolves when closed', async t => {
    let ipc = new IpCloudy({ providerCache: { refreshRate: 100, writeToFile: false } });
    let promise = ipc._startRefreshInterval('gce');

    ipc.stopRefresh();
    t.is(await promise, 0);
});

test('check() | returns appropriate response for azure ip', async t => {
    let result = await t.context.ipc.check('13.70.64.1');
    t.is(result.cloud, 'azure');
});

test('check() | returns appropriate response for azure ip in ipv6 format', async t => {
    let result = await t.context.ipc.check('0:0:0:0:0:ffff:d46:4001');
    t.is(result.cloud, 'azure');
});

test('check() | returns appropriate response for aws ip', async t => {
    let result = await t.context.ipc.check('54.173.231.161');
    t.is(result.cloud, 'aws');
});

test('check() | returns appropriate response for gce ip', async t => {
    let result = await t.context.ipc.check('104.196.27.39');
    t.is(result.cloud, 'gce');
});

test('check() | returns appropriate response for gce ipv6', async t => {
    let result = await t.context.ipc.check('2600:1900:0000:0000:0000:0000:0000:0000');
    t.is(result.cloud, 'gce');
});

test('check() | falls back to whois organization when enabled', async t => {
    let ipc = new IpCloudy({ whoisFallback: { enabled: true } });
    await ipc.init();
    let result = await ipc.check('208.43.118.0');
    const org = result.whois.toLowerCase();
    t.is(org.startsWith('softlayer'), true);
});

test('check() | returns "unknown" if ip is not recognized', async t => {
    let result = await t.context.ipc.check('999.999.999.999');
    t.is(result.whois, null);
    t.is(result.cloud, null);
});
