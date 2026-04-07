function mean(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return sum / values.length;
}

function stdDev(values, avg) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const m = avg ?? mean(values);
  const variance = values.reduce((acc, n) => acc + (n - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function baselineFromHistory(row) {
  const solveTimes = row?.history?.solveTimes;
  if (Array.isArray(solveTimes) && solveTimes.length >= 5) {
    const avg = mean(solveTimes);
    const std = stdDev(solveTimes, avg);
    if (avg && std && std > 0) {
      return { avg, std };
    }
  }

  const avg = Number(row?.history?.avgSolveTime);
  const std = Number(row?.history?.stdSolveTime);
  if (Number.isFinite(avg) && Number.isFinite(std) && std > 0) {
    return { avg, std };
  }

  return null;
}

export function detectSolveSpeed(snapshot, { weight = 30 } = {}) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const flags = new Map();

  for (const row of rows) {
    const solves = Array.isArray(row?.solves)
      ? row.solves.filter((s) => Number.isFinite(s?.solveTime) && s.solveTime > 0)
      : [];
    if (!solves.length) continue;

    const baseline = baselineFromHistory(row);
    if (!baseline) continue;

    const userAvg = mean(solves.map((s) => s.solveTime));
    const threshold = baseline.avg - 2 * baseline.std;
    if (!Number.isFinite(userAvg) || !Number.isFinite(threshold)) continue;

    if (userAvg < threshold) {
      flags.set(row.handle, {
        heuristic: 'H1',
        weight,
        detail: `Fast solve profile (${Math.round(userAvg)}s < ${Math.round(threshold)}s threshold)`,
      });
    }
  }

  return flags;
}
