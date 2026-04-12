import { DEFAULT_SETTINGS, clampNumber, mergeDeep, normalizeSettings } from '../../shared/settings.js';

const memoryStorage = new Map();
const RUNTIME_META_KEY = 'runtime:meta';
const CONTEST_PAYLOAD_META = {
  schema: 'contest-payload',
  version: 1,
};

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withContestPayloadMeta(kind, payload) {
  return {
    ...payload,
    ts: Date.now(),
    _meta: {
      ...CONTEST_PAYLOAD_META,
      kind,
    },
  };
}

function normalizeRuntimeMeta(meta) {
  const raw = meta && typeof meta === 'object' ? meta : {};
  const lastScanTsByContest =
    raw.lastScanTsByContest && typeof raw.lastScanTsByContest === 'object'
      ? raw.lastScanTsByContest
      : {};
  const lastRequestTsByHost =
    raw.lastRequestTsByHost && typeof raw.lastRequestTsByHost === 'object'
      ? raw.lastRequestTsByHost
      : {};
  return {
    ts: Number(raw.ts) || 0,
    lastScanTsByContest,
    lastRequestTsByHost,
  };
}

export async function storageGet(keys = null) {
  if (hasChromeStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        const err = chrome.runtime?.lastError;
        if (err) return reject(new Error(err.message));
        resolve(result ?? {});
      });
    });
  }

  if (keys === null) {
    return Object.fromEntries(memoryStorage.entries());
  }

  if (typeof keys === 'string') {
    return { [keys]: memoryStorage.get(keys) };
  }

  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((k) => [k, memoryStorage.get(k)]));
  }

  if (typeof keys === 'object') {
    const out = {};
    for (const [key, defaultValue] of Object.entries(keys)) {
      out[key] = memoryStorage.has(key) ? memoryStorage.get(key) : defaultValue;
    }
    return out;
  }

  return {};
}

export async function storageSet(values) {
  if (!values || typeof values !== 'object') return;

  if (hasChromeStorage()) {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const err = chrome.runtime?.lastError;
        if (err) return reject(new Error(err.message));
        resolve();
      });
    });
    return;
  }

  for (const [key, value] of Object.entries(values)) {
    memoryStorage.set(key, value);
  }
}

export async function storageRemove(keys) {
  if (!keys) return;
  const normalized = Array.isArray(keys) ? keys : [keys];

  if (hasChromeStorage()) {
    await new Promise((resolve, reject) => {
      chrome.storage.local.remove(normalized, () => {
        const err = chrome.runtime?.lastError;
        if (err) return reject(new Error(err.message));
        resolve();
      });
    });
    return;
  }

  for (const key of normalized) memoryStorage.delete(key);
}

export function snapshotKey(contestId) {
  return `snapshot:${contestId}`;
}

export function scoresKey(contestId) {
  return `scores:${contestId}`;
}

export async function getSettings() {
  const data = await storageGet({ settings: DEFAULT_SETTINGS });
  return normalizeSettings(data.settings);
}

export async function saveSettings(nextSettings) {
  const current = await getSettings();
  const merged = normalizeSettings(mergeDeep(current, nextSettings));
  await storageSet({ settings: merged });
  return merged;
}

export async function writeSnapshot(contestId, snapshot) {
  if (!contestId || !snapshot) return;
  await storageSet({
    [snapshotKey(contestId)]: withContestPayloadMeta('snapshot', snapshot),
  });
}

export async function writeScores(contestId, scorePacket) {
  if (!contestId || !scorePacket) return;
  await storageSet({
    [scoresKey(contestId)]: withContestPayloadMeta('scores', scorePacket),
  });
}

export async function setStatus(contestId, status) {
  if (!contestId || !status) return;
  await storageSet({
    [`status:${contestId}`]: withContestPayloadMeta('status', status),
  });
}

export async function writeContestRun(contestId, { snapshot, scorePacket, status }) {
  if (!contestId) return;

  const payload = {};
  if (snapshot) {
    payload[snapshotKey(contestId)] = withContestPayloadMeta('snapshot', snapshot);
  }
  if (scorePacket) {
    payload[scoresKey(contestId)] = withContestPayloadMeta('scores', scorePacket);
  }
  if (status) {
    payload[`status:${contestId}`] = withContestPayloadMeta('status', status);
  }

  if (Object.keys(payload).length) {
    await storageSet(payload);
  }
}

export async function getRuntimeMeta() {
  const data = await storageGet({ [RUNTIME_META_KEY]: {} });
  return normalizeRuntimeMeta(data[RUNTIME_META_KEY]);
}

export async function updateRuntimeMeta(updater) {
  const current = await getRuntimeMeta();
  const next = normalizeRuntimeMeta(updater(clone(current)));
  next.ts = Date.now();
  await storageSet({ [RUNTIME_META_KEY]: next });
  return next;
}

export async function getLastScanTimestamp(contestId) {
  if (!contestId) return 0;
  const runtimeMeta = await getRuntimeMeta();
  return Number(runtimeMeta.lastScanTsByContest?.[contestId]) || 0;
}

export async function setLastScanTimestamp(contestId, timestamp = Date.now()) {
  if (!contestId) return;
  await updateRuntimeMeta((meta) => {
    meta.lastScanTsByContest = meta.lastScanTsByContest || {};
    meta.lastScanTsByContest[contestId] = Number(timestamp) || Date.now();
    return meta;
  });
}

export async function getLastRequestTimestamp(host) {
  if (!host) return 0;
  const runtimeMeta = await getRuntimeMeta();
  return Number(runtimeMeta.lastRequestTsByHost?.[host]) || 0;
}

export async function setLastRequestTimestamp(host, timestamp = Date.now()) {
  if (!host) return;
  await updateRuntimeMeta((meta) => {
    meta.lastRequestTsByHost = meta.lastRequestTsByHost || {};
    meta.lastRequestTsByHost[host] = Number(timestamp) || Date.now();
    return meta;
  });
}

export async function purgeOldData(retentionDays = DEFAULT_SETTINGS.storageRetentionDays) {
  const days = clampNumber(retentionDays, 1, 30, DEFAULT_SETTINGS.storageRetentionDays);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const data = await storageGet(null);

  const staleKeys = [];
  for (const [key, value] of Object.entries(data)) {
    if (!/^(snapshot:|scores:|status:|cache:rating:)/.test(key)) continue;
    if (!value || typeof value !== 'object') {
      staleKeys.push(key);
      continue;
    }
    if (!Number.isFinite(value.ts) || value.ts < cutoff) {
      staleKeys.push(key);
    }
  }

  if (staleKeys.length) {
    await storageRemove(staleKeys);
  }
}
