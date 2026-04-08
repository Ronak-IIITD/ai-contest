function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function hasFlag(flags, heuristic) {
  if (!Array.isArray(flags)) return false;
  return flags.some((f) => f?.heuristic === heuristic);
}

export function extractMlFeatures({ snapshot, row, heuristicTotal, flags }) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const totalUsers = Math.max(1, rows.length);

  const solveCount = Number(row?.solveCount ?? (Array.isArray(row?.solves) ? row.solves.length : 0));
  const rank = Number(row?.rank ?? totalUsers);
  const solves = Array.isArray(row?.solves) ? row.solves : [];

  const attempts = solves
    .map((s) => Number(s?.attempts ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const totalAttempts = attempts.reduce((sum, n) => sum + n, 0);
  const wrongAttempts = attempts.reduce((sum, n) => sum + Math.max(0, n - 1), 0);
  const wrongAttemptRatio = totalAttempts > 0 ? wrongAttempts / totalAttempts : 0;

  const features = {
    heuristic_total_norm: clamp(Number(heuristicTotal || 0) / 100),
    solve_count_norm: clamp(solveCount / 8),
    rank_percentile: clamp((totalUsers - rank + 1) / totalUsers),
    cluster_participation: hasFlag(flags, 'H3') ? 1 : 0,
    rapid_solve_flag: hasFlag(flags, 'H5') ? 1 : 0,
    rating_jump_flag: hasFlag(flags, 'H2') ? 1 : 0,
    speed_flag: hasFlag(flags, 'H1') ? 1 : 0,
    dormant_flag: hasFlag(flags, 'H4') ? 1 : 0,
    wrong_attempt_ratio: clamp(wrongAttemptRatio),
    partial_data_penalty: snapshot?.isPartial ? 1 : 0,
  };

  return features;
}
