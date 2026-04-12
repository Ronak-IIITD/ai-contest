(function initLeetCodeOverlay() {
  const tierRank = { low: 0, medium: 1, high: 2 };
  const state = {
    enabled: true,
    minTier: 'low',
    scores: {},
    status: null,
    contestId: null,
    bannerDismissed: false,
  };

  const summaryId = 'spa-lc-summary-banner';

  function contestIdFromUrl(url = window.location.href) {
    const match = String(url).match(/\/contest\/([^/]+)\/ranking/i);
    return match ? `lc:${match[1]}` : null;
  }

  function shouldShow(score) {
    return tierRank[score?.tier ?? 'low'] >= tierRank[state.minTier];
  }

  function colorForTier(tier) {
    if (tier === 'high') return '#dc2626';
    if (tier === 'medium') return '#d97706';
    return '#16a34a';
  }

  function getStatusWarning(status) {
    if (!status) return '';
    if (status.stale) {
      return status.message || 'Data may be stale due to recent fetch failure.';
    }
    if (status.isPartial || status.partial) {
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
    if (state.bannerDismissed && banner) {
      banner.style.display = 'none';
      return;
    }
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
      text.className = 'spa-lc-summary-text';
      const warn = document.createElement('span');
      warn.className = 'spa-lc-status-warning';
      warn.style.color = '#fbbf24';

      content.append(text, warn);

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Dismiss';
      close.style.cssText =
        'border:1px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:4px;padding:2px 8px;cursor:pointer;';
      close.addEventListener('click', () => {
        state.bannerDismissed = true;
        banner.style.display = 'none';
      });

      banner.append(content, close);

      const table = document.querySelector('table');
      table?.parentElement?.insertBefore(banner, table);
    }

    const values = Object.values(scoresObj || {});
    const totals = {
      participants: values.length,
      low: values.filter((s) => s.tier === 'low' && s.total > 0).length,
      medium: values.filter((s) => s.tier === 'medium').length,
      high: values.filter((s) => s.tier === 'high').length,
    };
    const text = banner.querySelector('.spa-lc-summary-text');
    if (text) {
      text.textContent = `Suspicion summary: total ${totals.participants}, low ${totals.low}, medium ${totals.medium}, high ${totals.high}`;
    }

    const warn = banner.querySelector('.spa-lc-status-warning');
    if (warn) {
      const warningText = getStatusWarning(state.status);
      warn.textContent = warningText;
      warn.style.display = warningText ? 'block' : 'none';
    }

    banner.style.display = state.enabled ? 'flex' : 'none';
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (result) => resolve(result || {})));
  }

  function getTableRows() {
    const table = document.querySelector('table');
    if (!table) return [];
    return [...table.querySelectorAll('tbody tr')];
  }

  function getHandle(row) {
    const link = row.querySelector('a[href*="/u/"]');
    if (!link) return null;
    const text = link.textContent?.trim();
    if (text) return text;
    return link.getAttribute('href')?.split('/').filter(Boolean).pop() || null;
  }

  function getBadgeContainer(row) {
    const handleCell = row.querySelector('td a[href*="/u/"]')?.closest('td');
    const hostCell = handleCell || row.querySelector('td:last-child') || row.lastElementChild;
    if (!hostCell) return null;

    let container = hostCell.querySelector('.spa-lc-badge-container');
    if (!container) {
      container = document.createElement('span');
      container.className = 'spa-lc-badge-container';
      container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:6px;';
      hostCell.appendChild(container);
    }
    return container;
  }

  function clearBadges() {
    document.querySelectorAll('.spa-lc-badge').forEach((n) => n.remove());
    document.querySelectorAll('.spa-lc-badge-container').forEach((n) => {
      if (!n.querySelector('.spa-lc-badge')) {
        n.remove();
      }
    });
  }

  function render() {
    clearBadges();
    upsertSummaryBanner(state.scores);
    if (!state.enabled) return;

    for (const row of getTableRows()) {
      const handle = getHandle(row);
      if (!handle) continue;
      const score = state.scores?.[handle];
      if (!score || !shouldShow(score)) continue;

      const container = getBadgeContainer(row);
      if (!container) continue;

      const badge = document.createElement('span');
      badge.className = 'spa-lc-badge';
      badge.textContent = `Risk ${score.total}`;
      badge.title =
        (score.flags || []).map((f) => `${f.heuristic} (+${f.weight}): ${f.detail}`).join('\n') ||
        'No heuristics triggered';
      badge.style.cssText = `padding:2px 7px;border-radius:999px;color:#fff;font-size:11px;font-weight:600;background:${colorForTier(score.tier)};`;
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
        console.warn('[SPA] LeetCode overlay render failed', error);
      }
    });
  }

  async function loadInitial() {
    state.bannerDismissed = false;
    state.contestId = contestIdFromUrl();
    if (!state.contestId) return;
    const scoreKey = `scores:${state.contestId}`;
    const statusKey = `status:${state.contestId}`;
    const { [scoreKey]: scorePacket, [statusKey]: statusPacket, settings } = await storageGet([
      scoreKey,
      statusKey,
      'settings',
    ]);
    state.scores = scorePacket?.scores ?? {};
    state.status = statusPacket ?? null;
    state.enabled = Boolean(settings?.overlayEnabled ?? true);
    state.minTier = settings?.minTierToShowBadge ?? 'low';
    render();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'SCORES_UPDATED' || message.type === 'STATUS_UPDATED') {
      const contestId = contestIdFromUrl();
      if (!contestId || message.contestId !== contestId) return;
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
    console.error('[SPA] Failed to initialize LeetCode overlay observer', error);
  }

  loadInitial().catch((error) => {
    console.error('[SPA] Failed to initialize LeetCode overlay', error);
  });
})();
