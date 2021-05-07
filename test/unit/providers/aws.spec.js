/* global require */

const test = require('ava');
const provider = require('../../../src/providers/aws.js');

test('returns a array of IP ranges for aws', async (t) => {
    let result = await provider();

    t.true(Array.isArray(result));
    t.true(result.includes('23.20.0.0/14'));
});
