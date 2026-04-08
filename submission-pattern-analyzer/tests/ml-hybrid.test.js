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

function baseSettings(overrides = {}) {
  const mergedMl = {
    enabled: true,
    mode: 'hybrid',
    blend: 0.35,
    minConfidenceToApply: 0.4,
    ...(overrides.ml || {}),
  };

  const { ml: _ignoredMl, ...rest } = overrides;
  return {
    weights: {
      H1: 30,
      H2: 25,
      H3: 35,
      H4: 25,
      H5: 20,
    },
    ...rest,
    ml: mergedMl,
  };
}

test('heuristic mode preserves prior totals', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const expected = await loadJson('fixtures/expected-scores.snapshot.json');

  const { scores } = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'heuristic' } }));

  const actual = {};
  for (const [handle, entry] of scores.entries()) {
    actual[handle] = {
      total: entry.total,
      tier: entry.tier,
      flags: entry.flags.map((f) => f.heuristic).sort(),
    };
    assert.equal(entry.heuristicTotal, entry.total);
    assert.equal(entry.ml.enabled, true);
    assert.equal(entry.ml.mode, 'heuristic');
  }

  assert.deepEqual(actual, expected);
});

test('hybrid mode adds ml metadata and blended totals', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const blend = 0.35;

  const { scores } = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'hybrid', blend, minConfidenceToApply: 0.4 } }));
  const u2 = scores.get('u2');

  assert.equal(Boolean(u2.ml.modelVersion), true);
  assert.equal(typeof u2.ml.probability, 'number');
  assert.equal(typeof u2.ml.score, 'number');
  assert.equal(typeof u2.ml.confidence, 'number');
  assert.equal(Array.isArray(u2.ml.topFactors), true);
  assert.equal(u2.ml.topFactors.length > 0, true);

  const expectedBlended = Math.round((1 - blend) * u2.heuristicTotal + blend * u2.ml.score);
  assert.equal(u2.total, expectedBlended);
  assert.equal(u2.flags.some((f) => f.heuristic === 'ML'), true);
});

test('ml-only mode uses mlScore', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const { scores } = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'ml-only', minConfidenceToApply: 0 } }));

  const u2 = scores.get('u2');
  assert.equal(u2.total, u2.ml.score);
  assert.equal(u2.flags.some((f) => f.heuristic === 'ML'), true);
});

test('low-confidence fallback uses heuristic total', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const { scores } = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'ml-only', minConfidenceToApply: 0.9 } }));

  const u1 = scores.get('u1');
  const u2 = scores.get('u2');

  assert.equal(u1.ml.confidence >= 0.9, true);
  assert.equal(u1.total, u1.ml.score);

  assert.equal(u2.ml.confidence < 0.9, true);
  assert.equal(u2.total, u2.heuristicTotal);
});

test('ml disabled keeps heuristic totals and does not add ML flag', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const { scores } = scoreSnapshot(snapshot, baseSettings({ ml: { enabled: false, mode: 'hybrid' } }));

  for (const entry of scores.values()) {
    assert.equal(entry.total, entry.heuristicTotal);
    assert.equal(entry.ml.enabled, false);
    assert.equal(entry.flags.some((f) => f.heuristic === 'ML'), false);
  }
});

test('hybrid blend boundaries use heuristic at 0 and ML score at 1', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const handle = 'u2';

  const blend0 = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'hybrid', blend: 0, minConfidenceToApply: 0 } })).scores.get(handle);
  const blend1 = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'hybrid', blend: 1, minConfidenceToApply: 0 } })).scores.get(handle);

  assert.equal(blend0.total, blend0.heuristicTotal);
  assert.equal(blend1.total, blend1.ml.score);
});

test('hybrid mode falls back to heuristic score when confidence is below threshold', async () => {
  const snapshot = await loadJson('fixtures/snapshot.fixture.json');
  const { scores } = scoreSnapshot(snapshot, baseSettings({ ml: { mode: 'hybrid', blend: 1, minConfidenceToApply: 0.9 } }));

  const u1 = scores.get('u1');
  const u2 = scores.get('u2');

  assert.equal(u1.ml.confidence >= 0.9, true);
  assert.equal(u1.total, u1.ml.score);

  assert.equal(u2.ml.confidence < 0.9, true);
  assert.equal(u2.total, u2.heuristicTotal);
});
