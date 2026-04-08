import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings.js';

test('applies defaults when input is empty', () => {
  const normalized = normalizeSettings({});
  assert.deepEqual(normalized, DEFAULT_SETTINGS);
});

test('clamps invalid interval, retention, and weights', () => {
  const normalized = normalizeSettings({
    scanIntervalSeconds: 5,
    storageRetentionDays: 500,
    weights: {
      H1: -10,
      H2: 999,
      H3: 'bad',
      H4: null,
      H5: 17,
    },
  });

  assert.equal(normalized.scanIntervalSeconds, 30);
  assert.equal(normalized.storageRetentionDays, 30);
  assert.equal(normalized.weights.H1, 0);
  assert.equal(normalized.weights.H2, 50);
  assert.equal(normalized.weights.H3, DEFAULT_SETTINGS.weights.H3);
  assert.equal(normalized.weights.H4, 0);
  assert.equal(normalized.weights.H5, 17);
});

test('validates ML mode and clamps blend/minConfidence', () => {
  const normalized = normalizeSettings({
    ml: {
      enabled: true,
      mode: 'not-a-mode',
      blend: 100,
      minConfidenceToApply: -12,
    },
  });

  assert.equal(normalized.ml.mode, DEFAULT_SETTINGS.ml.mode);
  assert.equal(normalized.ml.blend, 1);
  assert.equal(normalized.ml.minConfidenceToApply, 0);
});

test('normalizes booleans for ml.enabled and scan toggles', () => {
  const normalized = normalizeSettings({
    autoScanCodeforces: 0,
    autoScanLeetCode: 'yes',
    overlayEnabled: '',
    ml: {
      enabled: 0,
    },
  });

  assert.equal(normalized.autoScanCodeforces, false);
  assert.equal(normalized.autoScanLeetCode, true);
  assert.equal(normalized.overlayEnabled, false);
  assert.equal(normalized.ml.enabled, false);
});
