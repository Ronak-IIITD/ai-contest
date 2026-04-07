import { fetchJsonWithPolicy } from './http.js';

const BASE_URL = 'https://codeforces.com/api';

const DEFAULT_PAGE_SIZE = 5000;
const DEFAULT_MAX_ROWS = 20_000;
const MIN_REQUEST_GAP_MS = 5000;

function normalizeSolve(problem, result) {
  const points = Number(result?.points);
  const solved = Number.isFinite(points) && points > 0;
  if (!solved) return null;

  const problemId = problem?.index ?? problem?.name;
  if (!problemId) return null;

  const attempts = Number(result?.rejectedAttemptCount);
  const bestSubmissionTimeSeconds = Number(result?.bestSubmissionTimeSeconds);

  return {
    problemId: String(problemId),
    solveTime: Number.isFinite(bestSubmissionTimeSeconds) ? bestSubmissionTimeSeconds : null,
    attempts: Number.isFinite(attempts) ? attempts + 1 : null,
  };
}

function normalizeRows(rawRows = []) {
  return rawRows
    .map((row) => {
      const members = row?.party?.members;
      const handle = members?.[0]?.handle;
      if (!handle) return null;

      const solves = Array.isArray(row?.problemResults)
        ? row.problemResults
            .map((result, idx) => normalizeSolve(row.problemResults?.[idx]?.problem, result))
            .filter(Boolean)
        : [];

      return {
        handle,
        rank: Number.isFinite(Number(row?.rank)) ? Number(row.rank) : null,
        rating: Number.isFinite(Number(row?.rating)) ? Number(row.rating) : null,
        solveCount: solves.length,
        penalty: Number.isFinite(Number(row?.penalty)) ? Number(row.penalty) : 0,
        solves,
        totalSubmissions: Number.isFinite(Number(row?.totalSubmissions)) ? Number(row.totalSubmissions) : null,
        history: {
          avgSolveTime: Number.isFinite(Number(row?.history?.avgSolveTime)) ? Number(row.history.avgSolveTime) : null,
          stdSolveTime: Number.isFinite(Number(row?.history?.stdSolveTime)) ? Number(row.history.stdSolveTime) : null,
          ratingDeltas: Array.isArray(row?.history?.ratingDeltas)
            ? row.history.ratingDeltas.filter((n) => Number.isFinite(Number(n))).map(Number)
            : [],
        },
      };
    })
    .filter(Boolean);
}

function normalizeProblems(rawProblems = []) {
  return rawProblems.map((problem) => ({
    id: String(problem?.index ?? problem?.name ?? 'unknown'),
    name: String(problem?.name ?? ''),
    rating: Number(problem?.rating ?? 0),
  }));
}

export function detectContestIdFromCodeforcesUrl(url = '') {
  const match = String(url).match(/codeforces\.com\/contest\/(\d+)\/standings/i);
  return match ? match[1] : null;
}

export async function fetchStandings(contestId, opts = {}) {
  if (!contestId) {
    throw new Error('contestId is required');
  }

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    maxRows = DEFAULT_MAX_ROWS,
    minGapMs = MIN_REQUEST_GAP_MS,
    retries = 3,
    timeoutMs = 12_000,
    fetchImpl,
  } = opts;

  const normalizedPageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const normalizedMaxRows = Math.max(normalizedPageSize, Number(maxRows) || DEFAULT_MAX_ROWS);

  let from = 1;
  let problems = [];
  let totalRows = null;
  const rows = [];

  while (rows.length < normalizedMaxRows) {
    const remaining = normalizedMaxRows - rows.length;
    const count = Math.min(normalizedPageSize, remaining);
    const url = `${BASE_URL}/contest.standings?contestId=${encodeURIComponent(contestId)}&from=${from}&count=${count}`;
    const payload = await fetchJsonWithPolicy(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      minGapMs,
      retries,
      timeoutMs,
      fetchImpl,
    });

    if (payload?.status !== 'OK') {
      throw new Error(`Codeforces API error: ${payload?.comment ?? 'unknown'}`);
    }

    const result = payload?.result ?? {};
    if (!problems.length) {
      problems = normalizeProblems(result?.problems ?? []);
    }
    if (Number.isFinite(Number(result?.totalRows))) {
      totalRows = Number(result.totalRows);
    }

    const batch = Array.isArray(result?.rows) ? result.rows : [];
    if (!batch.length) break;

    rows.push(
      ...batch.map((r) => ({
        ...r,
        problemResults: (r.problemResults ?? []).map((pr, idx) => ({
          ...pr,
          problem: result?.problems?.[idx] ?? problems[idx],
        })),
      })),
    );

    from += batch.length;
    if (batch.length < count) break;
    if (Number.isFinite(totalRows) && rows.length >= totalRows) break;
  }

  const cappedRows = rows.slice(0, normalizedMaxRows);
  const knownTotalRows = Number.isFinite(totalRows) ? totalRows : cappedRows.length;
  const isPartial = Number.isFinite(totalRows)
    ? cappedRows.length < totalRows
    : rows.length >= normalizedMaxRows;

  return {
    contestId: String(contestId),
    platform: 'codeforces',
    rows: normalizeRows(cappedRows),
    problems,
    fetchedRows: cappedRows.length,
    totalRows: knownTotalRows,
    isPartial,
  };
}
