const BASE_URL = 'https://www.codechef.com/api';

export function detectContestCodeFromCodeChefUrl(url = '') {
  const match = String(url).match(/codechef\.com\/rankings\/([^/?#]+)/i);
  return match ? match[1] : null;
}

export async function fetchStandings(contestCode, { apiKey = '', fetchImpl = fetch } = {}) {
  if (!contestCode) {
    throw new Error('contestCode is required');
  }

  const endpoint = `${BASE_URL}/contests/${encodeURIComponent(contestCode)}/standings`;
  const headers = {
    accept: 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetchImpl(endpoint, { headers });
  if (!response.ok) {
    throw new Error(`CodeChef API request failed with ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.standings)
    ? payload.standings.map((row, idx) => ({
        handle: String(row?.user_handle ?? row?.username ?? `codechef-${idx}`),
        rank: Number(row?.rank ?? idx + 1),
        rating: Number(row?.rating ?? 0),
        solveCount: Number(row?.score ?? 0),
        penalty: Number(row?.penalty ?? 0),
        solves: [],
        totalSubmissions: Number(row?.total_submissions ?? 0),
      }))
    : [];

  return {
    contestId: `cc:${contestCode}`,
    platform: 'codechef',
    rows,
    problems: [],
  };
}
