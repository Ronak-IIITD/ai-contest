import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { scoreSnapshot } from '../background/engine/scorer.js';

const here = dirname(fileURLToPath(import.meta.url));

async function loadJson(relPath) {
  const text = await readFile(join(here, relPath), 'utf8');
  return JSON.parse(text);
}

test('scoreSnapshot matches fixture snapshot', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const expected = await loadJson('fixtures/expected-scores.snapshot.json');

  const { scores } = scoreSnapshot(snapshot, {
    weights: {
      H1: 30,
      H2: 25,
      H3: 35,
      H4: 25,
      H5: 20,
    },
    ml: {
      enabled: true,
      mode: 'heuristic',
      blend: 0.35,
      minConfidenceToApply: 0.4,
    },
  });

  const actual = {};
  for (const [handle, entry] of scores.entries()) {
    actual[handle] = {
      total: entry.total,
      tier: entry.tier,
      flags: entry.flags.map((f) => f.heuristic).sort(),
    };
  }

  assert.deepEqual(actual, expected);
});
