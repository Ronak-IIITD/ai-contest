function average(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function estimateDelta(row, participantCount) {
  const rank = Number(row?.rank);
  const rating = Number(row?.rating ?? 0);
  if (!Number.isFinite(rank) || rank <= 0 || !Number.isFinite(participantCount) || participantCount <= 0) {
    return null;
  }

  const percentile = (participantCount - rank + 1) / participantCount;
  const center = percentile - 0.5;
  const base = center * 320;
  const damp = Math.max(0.55, 1 - rating / 5000);
  return base * damp;
}

export function detectRatingJump(snapshot, { weight = 25 } = {}) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const participantCount = rows.length || 1;
  const flags = new Map();

  for (const row of rows) {
    const predictedDelta = estimateDelta(row, participantCount);
    if (!Number.isFinite(predictedDelta)) continue;

    const history = Array.isArray(row?.history?.ratingDeltas)
      ? row.history.ratingDeltas.slice(0, 6).filter((n) => Number.isFinite(n))
      : [];
    if (!history.length) continue;

    const trailingAvg = average(history);
    if (!Number.isFinite(trailingAvg)) continue;

    if (predictedDelta - trailingAvg > 200) {
      flags.set(row.handle, {
        heuristic: 'H2',
        weight,
        detail: `Unusual rating projection (${Math.round(predictedDelta)} vs ${Math.round(trailingAvg)} avg delta)`,
      });
    }
  }

  return flags;
}

export { estimateDelta };
