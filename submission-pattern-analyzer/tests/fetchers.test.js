import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchStandings as fetchCodeforces } from '../background/fetchers/codeforces.js';
import { fetchStandings as fetchLeetCode } from '../background/fetchers/leetcode.js';
import { fetchJsonWithPolicy, shouldRetryResponseStatus } from '../background/fetchers/http.js';

function mockJsonResponse(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test('Codeforces fetcher paginates and reports partial when capped', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    const from = Number(parsed.searchParams.get('from'));
    const count = Number(parsed.searchParams.get('count'));

    const makeRow = (handleSuffix, rank) => ({
      rank,
      party: { members: [{ handle: `u${handleSuffix}` }] },
      problemResults: [{ points: 1, rejectedAttemptCount: 0, bestSubmissionTimeSeconds: 100 + rank }],
    });

    if (from === 1) {
      assert.equal(count, 2);
      return mockJsonResponse(200, {
        status: 'OK',
        result: {
          totalRows: 5,
          problems: [{ index: 'A', name: 'A' }],
          rows: [makeRow(1, 1), makeRow(2, 2)],
        },
      });
    }

    if (from === 3) {
      return mockJsonResponse(200, {
        status: 'OK',
        result: {
          totalRows: 5,
          problems: [{ index: 'A', name: 'A' }],
          rows: [makeRow(3, 3), makeRow(4, 4)],
        },
      });
    }

    throw new Error(`Unexpected call ${url}`);
  };

  const snapshot = await fetchCodeforces('1234', {
    pageSize: 2,
    maxRows: 4,
    retries: 1,
    minGapMs: 0,
    timeoutMs: 2_000,
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(snapshot.fetchedRows, 4);
  assert.equal(snapshot.totalRows, 5);
  assert.equal(snapshot.isPartial, true);
  assert.equal(snapshot.rows.length, 4);
});

test('LeetCode fetcher paginates until completion when not capped', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(_url);
    const body = JSON.parse(init.body);
    const pageNum = body.variables.pageNum;

    const makeNode = (rank) => ({
      rank,
      score: 3,
      finishTimeInSeconds: 1234 + rank,
      currentRating: 1500,
      user: { username: `user${rank}` },
    });

    if (pageNum === 1) {
      return mockJsonResponse(200, {
        data: {
          contestRankingV2: {
            totalNum: 3,
            rankingNodes: [makeNode(1), makeNode(2)],
          },
        },
      });
    }

    if (pageNum === 2) {
      return mockJsonResponse(200, {
        data: {
          contestRankingV2: {
            totalNum: 3,
            rankingNodes: [makeNode(3)],
          },
        },
      });
    }

    return mockJsonResponse(200, {
      data: {
        contestRankingV2: {
          totalNum: 3,
          rankingNodes: [],
        },
      },
    });
  };

  const snapshot = await fetchLeetCode('weekly-400', {
    maxPages: 10,
    retries: 1,
    minGapMs: 0,
    timeoutMs: 2_000,
    fetchImpl,
  });

  assert.equal(snapshot.fetchedRows, 3);
  assert.equal(snapshot.totalRows, 3);
  assert.equal(snapshot.isPartial, false);
  assert.equal(snapshot.rows.length, 3);
  assert.equal(calls.length, 2);
});

test('retry classification retries 500/429 but not 400', () => {
  assert.equal(shouldRetryResponseStatus(400), false);
  assert.equal(shouldRetryResponseStatus(500), true);
  assert.equal(shouldRetryResponseStatus(429), true);
});

test('HTTP helper does not retry on 400 response', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return mockJsonResponse(400, { error: 'bad request' });
  };

  await assert.rejects(
    fetchJsonWithPolicy('https://example.com/test', {
      retries: 3,
      minGapMs: 0,
      timeoutMs: 1000,
      fetchImpl,
    }),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});

test('HTTP helper retries on 500 then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return mockJsonResponse(500, { error: 'server error' });
    }
    return mockJsonResponse(200, { ok: true });
  };

  const payload = await fetchJsonWithPolicy('https://example.com/test', {
    retries: 2,
    minGapMs: 0,
    timeoutMs: 1000,
    baseBackoffMs: 1,
    maxBackoffMs: 1,
    fetchImpl,
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(calls, 2);
});
