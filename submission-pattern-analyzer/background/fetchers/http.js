import { getLastRequestTimestamp, setLastRequestTimestamp } from '../engine/store.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFetch(fetchImpl) {
  const impl = fetchImpl ?? globalThis.fetch;
  if (typeof impl !== 'function') {
    throw new Error('fetch implementation is not available');
  }
  return impl;
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function shouldRetryResponseStatus(status) {
  return status === 429 || Number(status) >= 500;
}

export function shouldRetryError(error) {
  if (!error) return false;
  if (error?.name === 'AbortError') return true;
  if (error?.name === 'TypeError') return true;
  const message = String(error?.message ?? '').toLowerCase();
  return /network|failed to fetch|timed out|timeout/.test(message);
}

export function parseRetryAfterMs(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;

  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(60_000, asSeconds * 1000);
  }

  const asDate = Date.parse(value);
  if (!Number.isFinite(asDate)) return null;
  return Math.max(0, Math.min(60_000, asDate - Date.now()));
}

function backoffWithJitterMs(attempt, { baseBackoffMs, maxBackoffMs }) {
  const base = Math.min(maxBackoffMs, baseBackoffMs * 2 ** Math.max(0, attempt - 1));
  const jitterMultiplier = 0.7 + Math.random() * 0.6;
  return Math.max(100, Math.floor(base * jitterMultiplier));
}

async function enforceHostRateLimit(url, minGapMs) {
  const host = hostFromUrl(url);
  if (!host || !Number.isFinite(minGapMs) || minGapMs <= 0) return;

  const last = await getLastRequestTimestamp(host);
  const waitMs = minGapMs - (Date.now() - last);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  await setLastRequestTimestamp(host, Date.now());
}

export async function fetchJsonWithPolicy(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    retries = 3,
    timeoutMs = 12_000,
    baseBackoffMs = 800,
    maxBackoffMs = 16_000,
    minGapMs = 0,
    fetchImpl,
  } = options;

  const maxAttempts = Math.max(1, Number(retries) || 1);
  const doFetch = resolveFetch(fetchImpl);

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await enforceHostRateLimit(url, minGapMs);

      const response = await doFetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = Number(response.status);
        const retryable = shouldRetryResponseStatus(status);
        if (!retryable || attempt >= maxAttempts) {
          throw new Error(`HTTP ${status}`);
        }

        const retryAfterMs = parseRetryAfterMs(response.headers?.get?.('retry-after'));
        const backoffMs =
          retryAfterMs ?? backoffWithJitterMs(attempt, { baseBackoffMs, maxBackoffMs });
        await sleep(backoffMs);
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const backoffMs = backoffWithJitterMs(attempt, { baseBackoffMs, maxBackoffMs });
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error('Request failed');
}
