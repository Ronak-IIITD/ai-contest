(function initCodeforcesOverlay() {
  const tierRank = { low: 0, medium: 1, high: 2 };
  const state = {
    enabled: true,
    scores: {},
    status: null,
    contestId: null,
    minTier: 'low',
    bannerDismissed: false,
  };

  const badgeClass = 'spa-risk-badge';
  const summaryId = 'spa-summary-banner';

  function contestIdFromUrl(url = window.location.href) {
    const match = String(url).match(/\/contest\/(\d+)\/standings/i);
    return match ? match[1] : null;
  }

  function shouldShow(score) {
    const scoreTier = score?.tier ?? 'low';
    return tierRank[scoreTier] >= tierRank[state.minTier];
  }

  function makeTooltip(score) {
    const flags = Array.isArray(score?.flags) ? score.flags : [];
    if (!flags.length) return 'No heuristics triggered';
    return flags.map((f) => `${f.heuristic} (+${f.weight}): ${f.detail}`).join('\n');
  }

  function colorForTier(tier) {
    if (tier === 'high') return '#b91c1c';
    if (tier === 'medium') return '#b45309';
    return '#166534';
  }

  function getStatusWarning(status) {
    if (!status) return '';
    if (status.stale) {
      return status.message || 'Data may be stale due to recent fetch failure.';
    }
    if (status.isPartial) {
      if (status.message) return status.message;
      const fetched = Number(status.fetchedRows);
      const total = Number(status.totalRows);
      if (Number.isFinite(fetched) && Number.isFinite(total)) {
        return `Partial standings fetched (${fetched}/${total}).`;
      }
      return 'Partial standings fetched.';
    }
    return '';
  }

  function upsertSummaryBanner(scoresObj) {
    let banner = document.getElementById(summaryId);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = summaryId;
      banner.style.cssText = [
        'position:sticky',
        'top:0',
        'z-index:9999',
        'display:flex',
        'justify-content:space-between',
        'align-items:center',
        'padding:8px 12px',
        'margin:6px 0',
        'border:1px solid #334155',
        'background:#0f172a',
        'color:#f8fafc',
        'font-size:12px',
        'border-radius:6px',
      ].join(';');

      const content = document.createElement('div');
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.gap = '4px';

      const text = document.createElement('span');
      text.className = 'spa-summary-text';
      const warn = document.createElement('span');
      warn.className = 'spa-status-warning';
      warn.style.color = '#fbbf24';

      content.append(text, warn);

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Dismiss';
      close.style.cssText =
        'border:1px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:4px;padding:2px 8px;cursor:pointer;';
      close.addEventListener('click', () => {
        state.bannerDismissed = true;
        banner.remove();
      });

      banner.append(content, close);

      const table = document.querySelector('table.standings, table');
      table?.parentElement?.insertBefore(banner, table);
    }

    if (state.bannerDismissed) {
      banner.style.display = 'none';
      return;
    }

    const values = Object.values(scoresObj || {});
    const totals = {
      participants: values.length,
      low: values.filter((s) => s.tier === 'low' && s.total > 0).length,
      medium: values.filter((s) => s.tier === 'medium').length,
      high: values.filter((s) => s.tier === 'high').length,
    };
    const text = banner.querySelector('.spa-summary-text');
    if (text) {
      text.textContent = `Suspicion summary: total ${totals.participants}, low ${totals.low}, medium ${totals.medium}, high ${totals.high}`;
    }

    const warn = banner.querySelector('.spa-status-warning');
    if (warn) {
      const warningText = getStatusWarning(state.status);
      warn.textContent = warningText;
      warn.style.display = warningText ? 'block' : 'none';
    }

    banner.style.display = state.enabled ? 'flex' : 'none';
  }

  function getHandleFromRow(row) {
    const anchor = row.querySelector('td.contestant-cell a, td .rated-user, td a[href*="/profile/"]');
    if (!anchor) return null;
    const text = anchor.textContent?.trim();
    if (text) return text;
    const hrefHandle = anchor.getAttribute('href')?.split('/').filter(Boolean).pop();
    return hrefHandle || null;
  }

  function getRows() {
    const table = document.querySelector('table.standings');
    if (!table) return [];
    return [...table.querySelectorAll('tr')].filter((tr) => tr.querySelector('td'));
  }

  function getBadgeContainer(row) {
    const whoCell = row.querySelector('td.contestant-cell') ?? row.querySelector('td:nth-child(2)');
    if (!whoCell) return null;

    let container = whoCell.querySelector('.spa-badge-container');
    if (!container) {
      container = document.createElement('span');
      container.className = 'spa-badge-container';
      container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:6px;';
      whoCell.appendChild(container);
    }
    return container;
  }

  function clearBadges() {
    document.querySelectorAll(`.${badgeClass}`).forEach((el) => el.remove());
    document.querySelectorAll('.spa-badge-container').forEach((el) => {
      if (!el.querySelector(`.${badgeClass}`)) {
        el.remove();
      }
    });
  }

  function render() {
    clearBadges();
    upsertSummaryBanner(state.scores);
    if (!state.enabled) return;

    for (const row of getRows()) {
      const handle = getHandleFromRow(row);
      if (!handle) continue;
      const score = state.scores?.[handle];
      if (!score || !shouldShow(score)) continue;

      const container = getBadgeContainer(row);
      if (!container) continue;

      const badge = document.createElement('span');
      badge.className = badgeClass;
      badge.title = makeTooltip(score);
      badge.textContent = `Risk ${score.total}`;
      badge.style.cssText = [
        'display:inline-block',
        'padding:2px 7px',
        'border-radius:999px',
        'font-size:11px',
        'font-weight:600',
        `background:${colorForTier(score.tier)}`,
        'color:#fff',
      ].join(';');
      container.appendChild(badge);
    }
  }

  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = requestAnimationFrame(() => {
      renderTimer = null;
      try {
        render();
      } catch (error) {
        console.warn('[SPA] Codeforces overlay render failed', error);
      }
    });
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
  }

  async function loadInitial() {
    state.contestId = contestIdFromUrl();
    state.bannerDismissed = false;
    if (!state.contestId) return;

    const scoreKey = `scores:${state.contestId}`;
    const statusKey = `status:${state.contestId}`;
    const { [scoreKey]: scorePacket, [statusKey]: statusPacket, settings } = await storageGet([
      scoreKey,
      statusKey,
      'settings',
    ]);

    state.enabled = Boolean(settings?.overlayEnabled ?? true);
    state.minTier = settings?.minTierToShowBadge ?? 'low';
    state.scores = scorePacket?.scores ?? {};
    state.status = statusPacket ?? null;
    render();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'SCORES_UPDATED' || message.type === 'STATUS_UPDATED') {
      const contestId = contestIdFromUrl();
      if (!contestId || String(message.contestId) !== String(contestId)) return;
      storageGet([`scores:${contestId}`, `status:${contestId}`]).then((data) => {
        state.scores = data[`scores:${contestId}`]?.scores ?? state.scores;
        state.status = data[`status:${contestId}`] ?? message.status ?? state.status;
        scheduleRender();
      });
      return;
    }

    if (message.type === 'OVERLAY_TOGGLE') {
      state.enabled = Boolean(message.enabled);
      scheduleRender();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.settings) {
      const next = changes.settings.newValue || {};
      state.enabled = Boolean(next.overlayEnabled ?? true);
      state.minTier = next.minTierToShowBadge ?? 'low';
      scheduleRender();
    }
    const contestId = contestIdFromUrl();
    if (contestId && changes[`status:${contestId}`]) {
      state.status = changes[`status:${contestId}`].newValue ?? null;
      scheduleRender();
    }
  });

  try {
    const observer = new MutationObserver(() => scheduleRender());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (error) {
    console.error('[SPA] Failed to initialize Codeforces overlay observer', error);
  }

  loadInitial().catch((error) => {
    console.error('[SPA] Failed to initialize Codeforces overlay', error);
  });
})();
