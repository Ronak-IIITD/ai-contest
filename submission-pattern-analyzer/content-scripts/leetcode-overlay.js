(function initLeetCodeOverlay() {
  const tierRank = { low: 0, medium: 1, high: 2 };
  const state = {
    enabled: true,
    minTier: 'low',
    scores: {},
    contestId: null,
  };

  function contestIdFromUrl(url = window.location.href) {
    const match = String(url).match(/\/contest\/([^/]+)\/ranking/i);
    return match ? `lc:${match[1]}` : null;
  }

  function colorForTier(tier) {
    if (tier === 'high') return '#dc2626';
    if (tier === 'medium') return '#d97706';
    return '#16a34a';
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (result) => resolve(result || {})));
  }

  function shouldShow(score) {
    return tierRank[score?.tier ?? 'low'] >= tierRank[state.minTier];
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

  function render() {
    for (const row of getTableRows()) {
      row.querySelectorAll('.spa-lc-badge').forEach((n) => n.remove());
      row.querySelectorAll('.spa-lc-badge-container').forEach((n) => {
        if (!n.querySelector('.spa-lc-badge')) {
          n.remove();
        }
      });
      if (!state.enabled) continue;

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
      badge.style.cssText = `padding:2px 7px;border-radius:999px;color:#fff;font-size:11px;background:${colorForTier(
        score.tier,
      )};`;
      container.appendChild(badge);
    }
  }

  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      try {
        render();
      } catch (error) {
        console.warn('[SPA] LeetCode overlay render failed', error);
      }
    }, 120);
  }

  async function loadInitial() {
    state.contestId = contestIdFromUrl();
    if (!state.contestId) return;
    const key = `scores:${state.contestId}`;
    const { [key]: scorePacket, settings } = await storageGet([key, 'settings']);
    state.scores = scorePacket?.scores ?? {};
    state.enabled = Boolean(settings?.overlayEnabled ?? true);
    state.minTier = settings?.minTierToShowBadge ?? 'low';
    render();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'SCORES_UPDATED') {
      const contestId = contestIdFromUrl();
      if (!contestId || message.contestId !== contestId) return;
      storageGet([`scores:${contestId}`]).then((data) => {
        state.scores = data[`scores:${contestId}`]?.scores ?? {};
        scheduleRender();
      });
    }
    if (message.type === 'OVERLAY_TOGGLE') {
      state.enabled = Boolean(message.enabled);
      scheduleRender();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.settings) return;
    const next = changes.settings.newValue || {};
    state.enabled = Boolean(next.overlayEnabled ?? true);
    state.minTier = next.minTierToShowBadge ?? 'low';
    scheduleRender();
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
