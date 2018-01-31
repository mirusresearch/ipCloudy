/* global require */

import test from 'ava';
import { isArray, includes } from 'lodash';

const provider = require('../../../src/providers/aws.js');

test('returns a array of IP ranges for aws', async t => {
    let result = await provider();

    t.true(isArray(result));
    t.true(includes(result, '23.20.0.0/14'));
});
