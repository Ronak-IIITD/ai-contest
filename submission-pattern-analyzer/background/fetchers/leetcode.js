import { fetchJsonWithPolicy } from './http.js';

const GRAPHQL_URL = 'https://leetcode.com/graphql';

const MIN_REQUEST_GAP_MS = 10_000;
const DEFAULT_MAX_PAGES = 20;

const RANKING_QUERY = `
  query ContestRanking($contestSlug: String!, $pageNum: Int!) {
    contestRankingV2(contestSlug: $contestSlug, pageNum: $pageNum) {
      totalNum
      rankingNodes {
        rank
        score
        finishTimeInSeconds
        currentRating
        user {
          username
        }
      }
    }
  }
`;

async function postGraphql(body, { retries = 3, timeoutMs = 12_000, minGapMs = MIN_REQUEST_GAP_MS, fetchImpl } = {}) {
  return fetchJsonWithPolicy(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    retries,
    timeoutMs,
    minGapMs,
    fetchImpl,
  });
}

function normalizeRankingNodes(nodes = []) {
  return nodes
    .map((node, index) => {
      const handle = node?.user?.username;
      if (!handle) return null;

      const rank = Number(node?.rank ?? index + 1);
      const solveCount = Number(node?.score ?? 0);
      const finish = Number(node?.finishTimeInSeconds ?? 0);

      return {
        handle,
        rank,
        rating: Number(node?.currentRating ?? 0),
        solveCount,
        penalty: finish,
        solves: [],
        totalSubmissions: Number.isFinite(Number(node?.totalSubmissions))
          ? Number(node.totalSubmissions)
          : null,
      };
    })
    .filter(Boolean);
}

export function detectContestSlugFromLeetCodeUrl(url = '') {
  const match = String(url).match(/leetcode\.com\/contest\/([^/]+)\/ranking/i);
  return match ? match[1] : null;
}

export async function fetchStandings(contestSlug, { maxPages = DEFAULT_MAX_PAGES, ...opts } = {}) {
  if (!contestSlug) {
    throw new Error('contestSlug is required');
  }

  const normalizedMaxPages = Math.max(1, Number(maxPages) || DEFAULT_MAX_PAGES);
  const rows = [];
  let total = null;
  let isPartial = false;

  for (let pageNum = 1; pageNum <= normalizedMaxPages; pageNum += 1) {
    const payload = await postGraphql(
      {
        query: RANKING_QUERY,
        variables: { contestSlug, pageNum },
      },
      opts,
    );

    if (Array.isArray(payload?.errors) && payload.errors.length) {
      throw new Error(`LeetCode GraphQL error: ${payload.errors[0]?.message ?? 'unknown'}`);
    }

    const block = payload?.data?.contestRankingV2;
    if (!block) break;
    if (Number.isFinite(Number(block.totalNum))) {
      total = Number(block.totalNum);
    }

    const batch = normalizeRankingNodes(block?.rankingNodes ?? []);
    if (!batch.length) break;
    rows.push(...batch);

    if (total !== null && rows.length >= total) break;

    if (pageNum === normalizedMaxPages) {
      isPartial = total === null ? true : rows.length < total;
    }
  }

  const fetchedRows = rows.length;
  const totalRows = Number.isFinite(total) ? total : fetchedRows;
  if (Number.isFinite(total) && fetchedRows < total) {
    isPartial = true;
  }

  return {
    contestId: `lc:${contestSlug}`,
    platform: 'leetcode',
    rows,
    problems: [],
    fetchedRows,
    totalRows,
    isPartial,
  };
}
