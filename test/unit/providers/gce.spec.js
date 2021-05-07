/* global require */

const test = require('ava');
const provider = require('../../../src/providers/gce.js');

test('returns a array of IP ranges for gce', async (t) => {
    let result = await provider();
    t.true(Array.isArray(result));
    t.true(result.includes('8.34.208.0/20'));
});
