import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { detectSolveSpeed } from '../background/engine/heuristics/solve-speed.js';
import { detectRatingJump } from '../background/engine/heuristics/rating-jump.js';
import { detectSubmissionClusters } from '../background/engine/heuristics/cluster.js';
import { detectDormantSurge } from '../background/engine/heuristics/dormant.js';
import { detectRapidSolve } from '../background/engine/heuristics/rapid-solve.js';

const here = dirname(fileURLToPath(import.meta.url));

async function loadFixture() {
  const text = await readFile(join(here, 'fixtures', 'snapshot.fixture.json'), 'utf8');
  return JSON.parse(text);
}

test('H1 solve speed flags expected handle', async () => {
  const snapshot = await loadFixture();
  const flags = detectSolveSpeed(snapshot, { weight: 30 });
  assert.equal(flags.has('u1'), true);
  assert.equal(flags.get('u1')?.heuristic, 'H1');
});

test('H2 rating jump flags expected handle', async () => {
  const snapshot = await loadFixture();
  const flags = detectRatingJump(snapshot, { weight: 25 });
  assert.equal(flags.has('u2'), true);
  assert.equal(flags.get('u2')?.heuristic, 'H2');
});

test('H3 cluster flags 5 close handles', async () => {
  const snapshot = await loadFixture();
  const { flags, clusterEvents } = detectSubmissionClusters(snapshot, {
    weight: 35,
    memberWeight: 20,
    minUsers: 5,
    windowSeconds: 45,
  });
  for (const handle of ['u1', 'u2', 'u3', 'u4', 'u5']) {
    assert.equal(flags.has(handle), true, `Expected cluster flag for ${handle}`);
  }
  assert.equal(clusterEvents.length, 1);
  assert.equal(clusterEvents[0].problemId, 'C');
});

test('H4 dormant surge flags top dormant account', async () => {
  const snapshot = await loadFixture();
  const flags = detectDormantSurge(snapshot, { weight: 25 });
  assert.equal(flags.has('u1'), true);
});

test('H4 dormant surge skips when lifetime submissions are unavailable', async () => {
  const snapshot = await loadFixture();
  snapshot.rows[0].totalSubmissions = null;
  const flags = detectDormantSurge(snapshot, { weight: 25 });
  assert.equal(flags.has('u1'), false);
});

test('H5 rapid solve flags rapid account', async () => {
  const snapshot = await loadFixture();
  const flags = detectRapidSolve(snapshot, { weight: 20 });
  assert.equal(flags.has('u6'), true);
});
