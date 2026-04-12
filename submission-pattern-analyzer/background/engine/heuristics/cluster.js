function collectAcceptedSolves(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const byProblem = new Map();

  for (const row of rows) {
    const solves = Array.isArray(row?.solves) ? row.solves : [];
    for (const solve of solves) {
      const problemId = solve?.problemId;
      const solveTime = Number(solve?.solveTime);
      if (!problemId || !Number.isFinite(solveTime)) continue;
      if (!byProblem.has(problemId)) byProblem.set(problemId, []);
      byProblem.get(problemId).push({
        handle: row.handle,
        solveTime,
      });
    }
  }

  for (const records of byProblem.values()) {
    records.sort((a, b) => a.solveTime - b.solveTime);
  }

  return byProblem;
}

function maxDifficulty(snapshot) {
  const problems = Array.isArray(snapshot?.problems) ? snapshot.problems : [];
  const values = problems
    .map((p) => Number(p?.rating))
    .filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  return Math.max(...values);
}

export function detectSubmissionClusters(snapshot, { weight = 35, memberWeight = 20, minUsers = 5, windowSeconds = 45 } = {}) {
  const byProblem = collectAcceptedSolves(snapshot);
  const flags = new Map();
  const clusterEvents = [];
  const ratingThreshold = Math.max(1300, Math.floor(maxDifficulty(snapshot) * 0.6));

  for (const problem of Array.isArray(snapshot?.problems) ? snapshot.problems : []) {
    const problemId = problem?.id;
    if (!problemId) continue;
    const problemRating = Number(problem?.rating ?? 0);
    if (problemRating && problemRating < ratingThreshold) continue;

    const records = byProblem.get(problemId) ?? [];
    let left = 0;

    for (let right = 0; right < records.length; right += 1) {
      while (records[right].solveTime - records[left].solveTime > windowSeconds) {
        left += 1;
      }
      const window = records.slice(left, right + 1);
      const uniqueHandles = [...new Set(window.map((x) => x.handle))];
      if (uniqueHandles.length >= minUsers) {
        clusterEvents.push({
          problemId,
          from: window[0].solveTime,
          to: window[window.length - 1].solveTime,
          handles: uniqueHandles,
        });
        for (const handle of uniqueHandles) {
          if (!flags.has(handle)) {
            flags.set(handle, {
              heuristic: 'H3',
              weight: memberWeight,
              detail: `Part of ${uniqueHandles.length}-user AC cluster on ${problemId} in ${windowSeconds}s`,
            });
          }
        }
        left = right + 1;
      }
    }
  }

  return { flags, clusterEvents, clusterWeight: weight };
}
