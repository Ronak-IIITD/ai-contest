export function detectRapidSolve(snapshot, { weight = 20 } = {}) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const flags = new Map();

  for (const row of rows) {
    const solves = Array.isArray(row?.solves)
      ? row.solves
          .filter((s) => Number.isFinite(s?.solveTime))
          .sort((a, b) => a.solveTime - b.solveTime)
      : [];

    if (solves.length < 3) continue;

    let trigger = false;
    for (let i = 0; i <= solves.length - 3; i += 1) {
      const first = solves[i];
      const third = solves[i + 2];
      const duration = third.solveTime - first.solveTime;
      const chunk = solves.slice(i, i + 3);
      const allNoWrongAnswers = chunk.every((s) => Number(s?.attempts ?? 0) <= 1);
      if (duration <= 8 * 60 && allNoWrongAnswers) {
        trigger = true;
        break;
      }
    }

    if (trigger) {
      flags.set(row.handle, {
        heuristic: 'H5',
        weight,
        detail: 'Solved 3+ problems within 8 minutes without wrong attempts',
      });
    }
  }

  return flags;
}
