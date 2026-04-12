import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreWithModel } from '../background/engine/ml/runtime.js';
import { MODEL_PACK } from '../background/engine/ml/model-pack.js';

test('returns expected output shape and bounded ranges', () => {
  const result = scoreWithModel(
    {
      heuristic_total_norm: 0.8,
      solve_count_norm: 0.5,
      rank_percentile: 0.9,
      cluster_participation: 1,
      rapid_solve_flag: 0,
      rating_jump_flag: 1,
      speed_flag: 1,
      dormant_flag: 0,
      wrong_attempt_ratio: 0.2,
      partial_data_penalty: 0,
    },
    MODEL_PACK,
  );

  assert.equal(typeof result.modelVersion, 'string');
  assert.equal(result.modelVersion, MODEL_PACK.version);
  assert.equal(result.probability >= 0 && result.probability <= 1, true);
  assert.equal(Number.isInteger(result.mlScore), true);
  assert.equal(result.mlScore >= 0 && result.mlScore <= 100, true);
  assert.equal(result.confidence >= 0 && result.confidence <= 1, true);
  assert.equal(Array.isArray(result.topFactors), true);
  assert.equal(typeof result.belowMinConfidence, 'boolean');
});

test('belowMinConfidence reflects model threshold', () => {
  const highConf = scoreWithModel(
    { heuristic_total_norm: 0.9, rank_percentile: 0.95 },
    { version: 'test', bias: 5, weights: { heuristic_total_norm: 3, rank_percentile: 2 }, thresholds: { minConfidence: 0.3 } },
  );
  assert.equal(highConf.belowMinConfidence, false);

  const lowConf = scoreWithModel(
    { heuristic_total_norm: 0.1 },
    { version: 'test', bias: 0, weights: { heuristic_total_norm: 0.01 }, thresholds: { minConfidence: 0.9 } },
  );
  assert.equal(lowConf.belowMinConfidence, true);
});

test('remains numerically stable for extreme linear values', () => {
  const high = scoreWithModel({ x: 1 }, { version: 'high', bias: 1e9, weights: {} });
  const low = scoreWithModel({ x: 1 }, { version: 'low', bias: -1e9, weights: {} });

  assert.equal(high.probability, 1);
  assert.equal(high.mlScore, 100);
  assert.equal(high.confidence, 1);

  assert.equal(low.probability, 0);
  assert.equal(low.mlScore, 0);
  assert.equal(low.confidence, 1);
});

test('topFactors are sorted by absolute contribution and capped at 3', () => {
  const result = scoreWithModel(
    { a: 1, b: 1, c: 1, d: 1 },
    {
      version: 'factors',
      bias: 0,
      weights: {
        a: 0.1,
        b: -1.2,
        c: 0.7,
        d: -0.4,
      },
    },
  );

  assert.equal(result.topFactors.length, 3);
  assert.deepEqual(
    result.topFactors.map((f) => f.feature),
    ['b', 'c', 'd'],
  );

  const absContribs = result.topFactors.map((f) => Math.abs(f.contribution));
  assert.equal(absContribs[0] >= absContribs[1] && absContribs[1] >= absContribs[2], true);
});

test('safely falls back for invalid model pack and features', () => {
  const result = scoreWithModel(null, null);

  assert.equal(result.modelVersion, 'unknown');
  assert.equal(result.probability, 0.5);
  assert.equal(result.mlScore, 50);
  assert.equal(result.confidence, 0.35);
  assert.equal(result.belowMinConfidence, true);
  assert.deepEqual(result.topFactors, []);
});
