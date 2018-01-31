import test from 'ava';
import { isArray, includes } from 'lodash';

const provider = require('../../../src/providers/azure.js');

test('returns a array of IP ranges for azure', async t => {
    let result = await provider();

    t.true(isArray(result));
    t.true(includes(result, '13.70.64.0/18'));
});
