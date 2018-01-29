/* global require */

import test from 'ava'
import { isArray, includes } from 'lodash'

const provider = require('../../../src/providers/gce.js')

test('returns a array of IP ranges for gce', async t => {
    let result = await provider()

    t.true(isArray(result))
    t.true(includes(result, '8.34.208.0/20'))
})
