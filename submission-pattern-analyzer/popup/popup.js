const platformBadge = document.getElementById('platformBadge');
const contestIdText = document.getElementById('contestIdText');
const freshness = document.getElementById('freshness');
const statusNote = document.getElementById('statusNote');
const topList = document.getElementById('topList');
const overlayToggle = document.getElementById('overlayToggle');
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');
const actionError = document.getElementById('actionError');

const statTotal = document.getElementById('statTotal');
const statLow = document.getElementById('statLow');
const statMedium = document.getElementById('statMedium');
const statHigh = document.getElementById('statHigh');

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime?.lastError;
      if (err) return reject(new Error(err.message));
      resolve(response);
    });
  });
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const err = chrome.runtime?.lastError;
      if (err) return reject(new Error(err.message));
      resolve(result);
    });
  });
}

function formatFreshness(ts) {
  if (!Number.isFinite(ts)) return '';
  return `Updated ${new Date(ts).toLocaleTimeString()}`;
}

function summarizeScores(scoresObj = {}) {
  const values = Object.values(scoresObj);
  const count = values.length;
  const low = values.filter((x) => x.tier === 'low' && x.total > 0).length;
  const medium = values.filter((x) => x.tier === 'medium').length;
  const high = values.filter((x) => x.tier === 'high').length;
  return { count, low, medium, high, values };
}

function showActionError(message = '') {
  actionError.hidden = !message;
  actionError.textContent = message;
}

function showStatus(status) {
  if (!status || (!status.stale && !status.isPartial)) {
    statusNote.hidden = true;
    statusNote.classList.remove('warning', 'error');
    statusNote.textContent = '';
    return;
  }

  const isError = Boolean(status.stale);
  statusNote.hidden = false;
  statusNote.classList.toggle('error', isError);
  statusNote.classList.toggle('warning', !isError);

  if (status.message) {
    statusNote.textContent = status.message;
    return;
  }

  if (status.isPartial) {
    const fetched = Number(status.fetchedRows);
    const total = Number(status.totalRows);
    if (Number.isFinite(fetched) && Number.isFinite(total)) {
      statusNote.textContent = `⚠️ Partial data (${fetched}/${total} rows fetched)`;
    } else {
      statusNote.textContent = '⚠️ Partial data detected';
    }
  }
}

function renderTop(values = [], scoresObj = {}) {
  topList.innerHTML = '';
  const sorted = [...values].sort((a, b) => b.total - a.total).slice(0, 10);
  if (!sorted.length) {
    const li = document.createElement('li');
    li.textContent =
      Object.keys(scoresObj || {}).length > 0 ? 'No suspicious users detected' : 'No scan data available';
    topList.appendChild(li);
    return;
  }
  for (let i = 0; i < sorted.length; i++) {
    const score = sorted[i];
    const li = document.createElement('li');

    const rankSpan = document.createElement('span');
    rankSpan.className = 'rank';
    rankSpan.textContent = `${i + 1}.`;

    const handleSpan = document.createElement('span');
    handleSpan.className = 'handle';
    handleSpan.textContent = score.handle;

    const tierSpan = document.createElement('span');
    tierSpan.className = `score-badge ${score.tier}`;
    tierSpan.textContent = score.tier.toUpperCase();

    const totalSpan = document.createElement('span');
    totalSpan.className = 'score-num';
    totalSpan.textContent = score.total;

    li.appendChild(rankSpan);
    li.appendChild(handleSpan);
    li.appendChild(tierSpan);
    li.appendChild(totalSpan);
    topList.appendChild(li);
  }
}

async function loadState() {
  const activeContestResp = await sendRuntimeMessage({ type: 'GET_ACTIVE_CONTEST' });
  const contest = activeContestResp?.contest ?? null;

  if (!contest?.contestId) {
    platformBadge.textContent = '-';
    contestIdText.textContent = 'No supported contest tab active';
    statTotal.textContent = '-';
    statLow.textContent = '-';
    statMedium.textContent = '-';
    statHigh.textContent = '-';
    freshness.textContent = '';
    showStatus(null);
    renderTop([]);
    return;
  }

  platformBadge.textContent = contest.platform || '-';
  contestIdText.textContent = contest.contestId || '-';

  const scoreKey = `scores:${contest.contestId}`;
  const statusKey = `status:${contest.contestId}`;
  const { [scoreKey]: scorePacket, [statusKey]: contestStatus, settings } = await storageGet([
    scoreKey,
    statusKey,
    'settings',
  ]);

  overlayToggle.checked = Boolean(settings?.overlayEnabled ?? true);
  showStatus(contestStatus);

  if (!scorePacket?.scores) {
    statTotal.textContent = '-';
    statLow.textContent = '-';
    statMedium.textContent = '-';
    statHigh.textContent = '-';
    freshness.textContent = '';
    renderTop([]);
    return;
  }

  const summary = summarizeScores(scorePacket.scores);
  statTotal.textContent = summary.count;
  statLow.textContent = summary.low;
  statMedium.textContent = summary.medium;
  statHigh.textContent = summary.high;
  freshness.textContent = formatFreshness(scorePacket.ts);
  renderTop(summary.values, scorePacket.scores);
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = '⏳ Refreshing...';
  showActionError('');
  try {
    const response = await sendRuntimeMessage({ type: 'REFRESH_NOW' });
    if (!response?.ok) {
      throw new Error(response?.error || response?.result?.error || 'Refresh failed');
    }
    if (response?.result?.skipped) {
      showActionError(`Skipped: ${response.result.skipped}`);
    }
    await loadState();
  } catch (error) {
    showActionError(`Refresh failed: ${error?.message ?? 'unknown error'}`);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Refresh';
  }
});

overlayToggle.addEventListener('change', async () => {
  const desired = overlayToggle.checked;
  showActionError('');
  try {
    const response = await sendRuntimeMessage({
      type: 'SET_OVERLAY_ENABLED',
      enabled: desired,
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to save overlay setting');
    }
  } catch (error) {
    overlayToggle.checked = !desired;
    showActionError(`Overlay toggle failed: ${error?.message ?? 'unknown error'}`);
  }
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== 'local') return;
  loadState().catch(() => {});
});

loadState().catch((error) => {
  showActionError(`Failed to load: ${error?.message ?? 'Unknown error'}`);
});
