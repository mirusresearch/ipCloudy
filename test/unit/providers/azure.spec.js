const test = require('ava');
const provider = require('../../../src/providers/azure.js');

test('returns a array of IP ranges for azure', async (t) => {
    let result = await provider();

    t.true(Array.isArray(result));
    t.true(result.includes('13.70.64.0/18'));
});
