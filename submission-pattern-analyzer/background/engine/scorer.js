import { detectSolveSpeed } from './heuristics/solve-speed.js';
import { detectRatingJump } from './heuristics/rating-jump.js';
import { detectSubmissionClusters } from './heuristics/cluster.js';
import { detectDormantSurge } from './heuristics/dormant.js';
import { detectRapidSolve } from './heuristics/rapid-solve.js';
import { normalizeSettings } from '../../shared/settings.js';
import { MODEL_PACK } from './ml/model-pack.js';
import { extractMlFeatures } from './ml/features.js';
import { scoreWithModel } from './ml/runtime.js';

function tierFromTotal(total) {
  if (total >= 61) return 'high';
  if (total >= 31) return 'medium';
  return 'low';
}

function addFlag(map, handle, flag) {
  if (!handle || !flag) return;
  if (!map.has(handle)) {
    map.set(handle, []);
  }
  map.get(handle).push(flag);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function buildRiskScore(handle, flags, now, row, snapshot, settings) {
  const heuristicTotal = Math.min(100, flags.reduce((sum, f) => sum + (Number(f.weight) || 0), 0));
  const mlSettings = settings.ml;

  let ml = {
    enabled: Boolean(mlSettings?.enabled),
    mode: mlSettings?.mode ?? 'heuristic',
    modelVersion: null,
    probability: null,
    score: null,
    confidence: null,
    topFactors: [],
  };

  let total = heuristicTotal;
  let mlDetail = null;
  let mlInfluencedScore = false;

  if (ml.enabled) {
    const features = extractMlFeatures({ snapshot, row, heuristicTotal, flags });
    const mlRun = scoreWithModel(features, MODEL_PACK);
    const minConfidence = clamp(Number(mlSettings?.minConfidenceToApply ?? 0), 0, 1);
    const hasConfidence = !mlRun.belowMinConfidence && Number(mlRun.confidence) >= minConfidence;
    const mode = ml.mode;
    const blend = clamp(Number(mlSettings?.blend ?? 0), 0, 1);
    mlInfluencedScore = (mode === 'ml-only' || mode === 'hybrid') && hasConfidence;

    if (mode === 'ml-only') {
      total = hasConfidence ? mlRun.mlScore : heuristicTotal;
    } else if (mode === 'hybrid') {
      total = hasConfidence ? Math.round((1 - blend) * heuristicTotal + blend * mlRun.mlScore) : heuristicTotal;
    } else {
      total = heuristicTotal;
    }

    const topNames = mlRun.topFactors.map((f) => f.feature).slice(0, 2).join(', ');
    mlDetail = `ML risk ${mlRun.mlScore} (p=${mlRun.probability.toFixed(2)}, conf=${mlRun.confidence.toFixed(2)})${
      topNames ? ` via ${topNames}` : ''
    }`;

    ml = {
      enabled: true,
      mode,
      modelVersion: mlRun.modelVersion,
      probability: mlRun.probability,
      score: mlRun.mlScore,
      confidence: mlRun.confidence,
      topFactors: mlRun.topFactors,
    };
  }

  if (ml.enabled && mlInfluencedScore && mlDetail) {
    flags = [...flags, { heuristic: 'ML', weight: 0, detail: mlDetail }];
  }

  total = clamp(Math.round(total), 0, 100);

  return {
    handle,
    total,
    tier: tierFromTotal(total),
    flags,
    heuristicTotal,
    ml,
    updatedAt: now,
  };
}

export function scoreSnapshot(snapshot, settings = {}) {
  const normalized = normalizeSettings(settings);
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const weights = {
    H1: Number(normalized?.weights?.H1 ?? 30),
    H2: Number(normalized?.weights?.H2 ?? 25),
    H3: Number(normalized?.weights?.H3 ?? 35),
    H4: Number(normalized?.weights?.H4 ?? 25),
    H5: Number(normalized?.weights?.H5 ?? 20),
  };

  const userFlags = new Map();

  const h1 = detectSolveSpeed(snapshot, { weight: weights.H1 });
  const h2 = detectRatingJump(snapshot, { weight: weights.H2 });
  const h3 = detectSubmissionClusters(snapshot, {
    weight: weights.H3,
    memberWeight: Math.min(weights.H3, 20),
  });
  const h4 = detectDormantSurge(snapshot, { weight: weights.H4 });
  const h5 = detectRapidSolve(snapshot, { weight: weights.H5 });

  for (const [handle, flag] of h1.entries()) addFlag(userFlags, handle, flag);
  for (const [handle, flag] of h2.entries()) addFlag(userFlags, handle, flag);
  for (const [handle, flag] of h3.flags.entries()) addFlag(userFlags, handle, flag);
  for (const [handle, flag] of h4.entries()) addFlag(userFlags, handle, flag);
  for (const [handle, flag] of h5.entries()) addFlag(userFlags, handle, flag);

  const now = Date.now();
  const scores = new Map();

  for (const row of rows) {
    const flags = userFlags.get(row.handle) ?? [];
    scores.set(row.handle, buildRiskScore(row.handle, flags, now, row, snapshot, normalized));
  }

  return {
    scores,
    clusterEvents: h3.clusterEvents,
  };
}

export function mapToObject(scoreMap) {
  return Object.fromEntries(scoreMap.entries());
}
