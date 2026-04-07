export function detectDormantSurge(snapshot, { weight = 25 } = {}) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const flags = new Map();
  const cutoffRank = Math.max(1, Math.floor(rows.length * 0.1));

  for (const row of rows) {
    const totalSubmissions = row?.totalSubmissions;
    const submissionsRaw =
      totalSubmissions === null || totalSubmissions === undefined ? Number.NaN : Number(totalSubmissions);
    if (!Number.isFinite(submissionsRaw) || submissionsRaw < 0) {
      continue;
    }
    const submissions = submissionsRaw;
    const rankValue = Number(row?.rank);
    if (!Number.isFinite(rankValue) || rankValue <= 0) {
      continue;
    }
    const rank = rankValue;

    if (submissions < 10 && rank <= cutoffRank) {
      flags.set(row.handle, {
        heuristic: 'H4',
        weight,
        detail: `Dormant account (${submissions} lifetime submissions) in top 10% rank`,
      });
    }
  }

  return flags;
}
