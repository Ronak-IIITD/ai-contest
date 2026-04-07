import { detectSolveSpeed } from './heuristics/solve-speed.js';
import { detectRatingJump } from './heuristics/rating-jump.js';
import { detectSubmissionClusters } from './heuristics/cluster.js';
import { detectDormantSurge } from './heuristics/dormant.js';
import { detectRapidSolve } from './heuristics/rapid-solve.js';

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

function buildRiskScore(handle, flags, now) {
  const total = Math.min(100, flags.reduce((sum, f) => sum + (Number(f.weight) || 0), 0));
  return {
    handle,
    total,
    tier: tierFromTotal(total),
    flags,
    updatedAt: now,
  };
}

export function scoreSnapshot(snapshot, settings = {}) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const weights = {
    H1: Number(settings?.weights?.H1 ?? 30),
    H2: Number(settings?.weights?.H2 ?? 25),
    H3: Number(settings?.weights?.H3 ?? 35),
    H4: Number(settings?.weights?.H4 ?? 25),
    H5: Number(settings?.weights?.H5 ?? 20),
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
    scores.set(row.handle, buildRiskScore(row.handle, flags, now));
  }

  return {
    scores,
    clusterEvents: h3.clusterEvents,
  };
}

export function mapToObject(scoreMap) {
  return Object.fromEntries(scoreMap.entries());
}
