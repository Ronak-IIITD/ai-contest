import { fetchStandings as fetchCodeforces, detectContestIdFromCodeforcesUrl } from './fetchers/codeforces.js';
import { fetchStandings as fetchLeetCode, detectContestSlugFromLeetCodeUrl } from './fetchers/leetcode.js';
import { scoreSnapshot, mapToObject } from './engine/scorer.js';
import {
  getSettings,
  saveSettings,
  writeContestRun,
  setStatus,
  purgeOldData,
  getLastScanTimestamp,
  setLastScanTimestamp,
} from './engine/store.js';

const POLL_ALARM = 'poll';
const PURGE_ALARM = 'purge';
const POLL_PERIOD_MINUTES = 1;
const PURGE_PERIOD_MINUTES = 24 * 60;
const RELEVANT_TAB_PATTERNS = [
  'https://codeforces.com/contest/*/standings*',
  'https://leetcode.com/contest/*/ranking*',
];

const CONTEST_LOCKS = new Map();

function callbackToPromise(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const err = chrome.runtime?.lastError;
      if (err) return reject(new Error(err.message));
      resolve(result);
    });
  });
}

async function queryTabs(queryInfo) {
  return callbackToPromise((done) => chrome.tabs.query(queryInfo, done));
}

async function sendTabMessage(tabId, message) {
  if (!Number.isFinite(Number(tabId))) return;
  try {
    await callbackToPromise((done) => chrome.tabs.sendMessage(tabId, message, done));
  } catch (_) {
    // Ignore tabs without listeners.
  }
}

async function relevantTabs() {
  try {
    return await queryTabs({ url: RELEVANT_TAB_PATTERNS });
  } catch {
    return [];
  }
}

async function broadcastMessage(message, { contestId } = {}) {
  try {
    chrome.runtime.sendMessage(message);
  } catch (_) {
    // Ignore if runtime has no listeners yet.
  }

  const tabs = await relevantTabs();
  const filtered = contestId
    ? tabs.filter((tab) => String(detectContestFromUrl(tab?.url ?? '')?.contestId ?? '') === String(contestId))
    : tabs;

  await Promise.all(filtered.map((tab) => sendTabMessage(tab.id, message)));
}

function detectContestFromUrl(url = '') {
  const contestId = detectContestIdFromCodeforcesUrl(url);
  if (contestId) {
    return { platform: 'codeforces', contestId };
  }

  const contestSlug = detectContestSlugFromLeetCodeUrl(url);
  if (contestSlug) {
    return { platform: 'leetcode', contestId: `lc:${contestSlug}`, contestSlug };
  }

  return null;
}

async function getActiveContest() {
  const tabs = await queryTabs({ active: true, currentWindow: true });
  const url = tabs?.[0]?.url ?? '';
  return detectContestFromUrl(url);
}

async function shouldScan(contestId, intervalSeconds, force = false) {
  if (force) return true;
  const last = await getLastScanTimestamp(contestId);
  return Date.now() - last >= intervalSeconds * 1000;
}

async function withContestLock(contestId, runner) {
  if (!contestId) return runner();
  if (CONTEST_LOCKS.has(contestId)) {
    return { ok: true, skipped: 'in-flight', contestId };
  }

  const lock = (async () => runner())();
  CONTEST_LOCKS.set(contestId, lock);
  try {
    return await lock;
  } finally {
    if (CONTEST_LOCKS.get(contestId) === lock) {
      CONTEST_LOCKS.delete(contestId);
    }
  }
}

function buildPartialMessage(status) {
  if (!status?.isPartial) return '';
  const fetched = Number(status?.fetchedRows);
  const total = Number(status?.totalRows);
  if (Number.isFinite(fetched) && Number.isFinite(total)) {
    return `Partial data: fetched ${fetched}/${total} rows`;
  }
  return 'Partial data: standings fetch was capped/incomplete';
}

async function runPipeline({ platform, contestId, contestSlug }, settings) {
  let snapshot;
  if (platform === 'codeforces') {
    snapshot = await fetchCodeforces(contestId);
  } else if (platform === 'leetcode') {
    snapshot = await fetchLeetCode(contestSlug ?? contestId.replace(/^lc:/, ''));
  } else {
    return;
  }

  const { scores, clusterEvents } = scoreSnapshot(snapshot, settings);
  const status = {
    stale: false,
    isPartial: Boolean(snapshot?.isPartial),
    fetchedRows: Number(snapshot?.fetchedRows) || 0,
    totalRows: Number(snapshot?.totalRows) || Number(snapshot?.fetchedRows) || 0,
    message: buildPartialMessage(snapshot),
  };

  await writeContestRun(contestId, {
    snapshot,
    scorePacket: {
      contestId,
      platform,
      scores: mapToObject(scores),
      clusterEvents,
      fetchedRows: status.fetchedRows,
      totalRows: status.totalRows,
      isPartial: status.isPartial,
    },
    status,
  });

  const ts = Date.now();
  await setLastScanTimestamp(contestId, ts);
  await broadcastMessage({ type: 'SCORES_UPDATED', contestId, platform, status, ts }, { contestId });
  return status;
}

async function pollActiveContest({ force = false } = {}) {
  const settings = await getSettings();

  const activeContest = await getActiveContest();
  if (!activeContest?.contestId) return { ok: true, skipped: 'no-active-contest' };

  if (activeContest.platform === 'codeforces' && !settings.autoScanCodeforces) {
    return { ok: true, skipped: 'codeforces-disabled' };
  }
  if (activeContest.platform === 'leetcode' && !settings.autoScanLeetCode) {
    return { skipped: 'leetcode-disabled' };
  }

  if (!(await shouldScan(activeContest.contestId, settings.scanIntervalSeconds, force))) {
    return { ok: true, skipped: 'scan-interval' };
  }

  return withContestLock(activeContest.contestId, async () => {
    try {
      const status = await runPipeline(activeContest, settings);
      return { ok: true, contestId: activeContest.contestId, status };
    } catch (error) {
      const status = {
        stale: true,
        partial: false,
        isPartial: false,
        message: `Data may be stale: ${error?.message ?? 'unknown error'}`,
      };
      await setStatus(activeContest.contestId, status);
      await broadcastMessage(
        {
          type: 'STATUS_UPDATED',
          contestId: activeContest.contestId,
          platform: activeContest.platform,
          status,
          ts: Date.now(),
        },
        { contestId: activeContest.contestId },
      );
      return { ok: false, contestId: activeContest.contestId, error: error?.message ?? 'Unknown fetch error', status };
    }
  });
}

function ensurePollAlarm() {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_PERIOD_MINUTES });
}

function ensurePurgeAlarm() {
  chrome.alarms.create(PURGE_ALARM, { periodInMinutes: PURGE_PERIOD_MINUTES });
}

function ensureAlarms() {
  ensurePollAlarm();
  ensurePurgeAlarm();
}

function runStartupPurge() {
  getSettings()
    .then((settings) => purgeOldData(settings.storageRetentionDays))
    .catch((error) => console.warn('[SPA] startup purge failed', error));
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms();
  runStartupPurge();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  runStartupPurge();
});

ensureAlarms();
runStartupPurge();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm?.name) return;

  const run = async () => {
    if (alarm.name === POLL_ALARM) {
      await pollActiveContest({ force: false });
      return;
    }
    if (alarm.name === PURGE_ALARM) {
      const settings = await getSettings();
      await purgeOldData(settings.storageRetentionDays);
    }
  };

  run().catch((error) => {
    console.error('[SPA] alarm handler failed', alarm?.name, error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;
  if (sender.id && sender.id !== chrome.runtime.id) return undefined;

  if (message.type === 'REFRESH_NOW') {
    pollActiveContest({ force: true })
      .then((result) => sendResponse({ ok: Boolean(result?.ok), result, error: result?.error }))
      .catch((error) => sendResponse({ ok: false, error: error?.message ?? 'refresh failed' }));
    return true;
  }

  if (message.type === 'SET_OVERLAY_ENABLED') {
    saveSettings({ overlayEnabled: Boolean(message.enabled) })
      .then((settings) => broadcastMessage({ type: 'OVERLAY_TOGGLE', enabled: settings.overlayEnabled }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message ?? 'failed to update overlay' }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.settings ?? {})
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error?.message ?? 'failed to save settings' }));
    return true;
  }

  if (message.type === 'GET_ACTIVE_CONTEST') {
    getActiveContest()
      .then((contest) => sendResponse({ ok: true, contest }))
      .catch((error) => sendResponse({ ok: false, error: error?.message ?? 'failed to detect contest' }));
    return true;
  }

  return undefined;
});
