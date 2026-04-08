import test from 'node:test';
import assert from 'node:assert/strict';

import { extractMlFeatures } from '../background/engine/ml/features.js';

function makeInput(overrides = {}) {
  const base = {
    snapshot: {
      isPartial: false,
      rows: [{ handle: 'a' }, { handle: 'b' }, { handle: 'c' }, { handle: 'd' }],
    },
    row: {
      rank: 2,
      solveCount: 3,
      solves: [
        { attempts: 1 },
        { attempts: 3 },
      ],
    },
    heuristicTotal: 55,
    flags: [{ heuristic: 'H3' }, { heuristic: 'H1' }],
  };
  return { ...base, ...overrides };
}

test('includes all expected feature keys', () => {
  const features = extractMlFeatures(makeInput());
  assert.deepEqual(Object.keys(features).sort(), [
    'cluster_participation',
    'dormant_flag',
    'heuristic_total_norm',
    'partial_data_penalty',
    'rank_percentile',
    'rapid_solve_flag',
    'rating_jump_flag',
    'solve_count_norm',
    'speed_flag',
    'wrong_attempt_ratio',
  ]);
});

test('all extracted feature values are normalized to [0,1]', () => {
  const features = extractMlFeatures(
    makeInput({
      row: {
        rank: -20,
        solveCount: 100,
        solves: [{ attempts: 999 }],
      },
      heuristicTotal: 900,
      snapshot: { isPartial: true, rows: [{}, {}] },
      flags: [{ heuristic: 'H1' }, { heuristic: 'H2' }, { heuristic: 'H3' }, { heuristic: 'H4' }, { heuristic: 'H5' }],
    }),
  );

  for (const value of Object.values(features)) {
    assert.equal(value >= 0 && value <= 1, true);
  }
});

test('computes wrong_attempt_ratio correctly', () => {
  const features = extractMlFeatures(
    makeInput({
      row: {
        rank: 1,
        solveCount: 3,
        solves: [
          { attempts: 1 },
          { attempts: 2 },
          { attempts: 4 },
        ],
      },
    }),
  );

  assert.equal(features.wrong_attempt_ratio, 4 / 7);
});

test('sets partial_data_penalty based on snapshot.isPartial', () => {
  const partial = extractMlFeatures(makeInput({ snapshot: { isPartial: true, rows: [{}, {}] } }));
  const full = extractMlFeatures(makeInput({ snapshot: { isPartial: false, rows: [{}, {}] } }));

  assert.equal(partial.partial_data_penalty, 1);
  assert.equal(full.partial_data_penalty, 0);
});

test('handles missing solves, rank, and flags gracefully', () => {
  const features = extractMlFeatures(
    makeInput({
      row: {
        solveCount: null,
        solves: null,
      },
      flags: null,
      snapshot: {
        isPartial: false,
        rows: [{}, {}, {}],
      },
    }),
  );

  assert.equal(features.solve_count_norm, 0);
  assert.equal(features.wrong_attempt_ratio, 0);
  assert.equal(features.rank_percentile, 1 / 3);
  assert.equal(features.cluster_participation, 0);
  assert.equal(features.speed_flag, 0);
});
