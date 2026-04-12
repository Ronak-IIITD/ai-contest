export const DEFAULT_SETTINGS = {
  autoScanCodeforces: true,
  autoScanLeetCode: true,
  scanIntervalSeconds: 60,
  weights: {
    H1: 30,
    H2: 25,
    H3: 35,
    H4: 25,
    H5: 20,
  },
  minTierToShowBadge: 'low',
  storageRetentionDays: 7,
  overlayEnabled: true,
  ml: {
    enabled: true,
    mode: 'hybrid',
    blend: 0.35,
    minConfidenceToApply: 0.4,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function mergeDeep(base, patch) {
  const safeBase = isPlainObject(base) ? base : {};
  if (!isPlainObject(patch)) return clone(safeBase);

  const out = clone(safeBase);
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeDeep(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function normalizeSettings(input = {}) {
  const merged = mergeDeep(DEFAULT_SETTINGS, input);
  merged.scanIntervalSeconds = clampNumber(merged.scanIntervalSeconds, 30, 300, 60);
  merged.storageRetentionDays = clampNumber(merged.storageRetentionDays, 1, 30, 7);

  for (const key of ['H1', 'H2', 'H3', 'H4', 'H5']) {
    merged.weights[key] = clampNumber(merged.weights[key], 0, 50, DEFAULT_SETTINGS.weights[key]);
  }

  if (!['low', 'medium', 'high'].includes(merged.minTierToShowBadge)) {
    merged.minTierToShowBadge = 'low';
  }

  merged.autoScanCodeforces = Boolean(merged.autoScanCodeforces);
  merged.autoScanLeetCode = Boolean(merged.autoScanLeetCode);
  merged.overlayEnabled = Boolean(merged.overlayEnabled);

  merged.ml = isPlainObject(merged.ml) ? merged.ml : clone(DEFAULT_SETTINGS.ml);
  merged.ml.enabled = Boolean(merged.ml.enabled);
  if (!['heuristic', 'hybrid', 'ml-only'].includes(merged.ml.mode)) {
    merged.ml.mode = DEFAULT_SETTINGS.ml.mode;
  }
  merged.ml.blend = clampNumber(merged.ml.blend, 0, 1, DEFAULT_SETTINGS.ml.blend);
  merged.ml.minConfidenceToApply = clampNumber(
    merged.ml.minConfidenceToApply,
    0,
    1,
    DEFAULT_SETTINGS.ml.minConfidenceToApply,
  );

  return merged;
}
