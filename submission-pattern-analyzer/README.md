# Submission Pattern Analyzer (Chrome Extension)

Risk-signal overlay for competitive programming standings pages.

## Current support scope

- **Platforms implemented in active pipeline**
  - Codeforces standings (`/contest/{id}/standings`)
  - LeetCode contest ranking (`/contest/{slug}/ranking`)
- **Not in active pipeline today**
  - CodeChef/AtCoder are not enabled in manifest permissions or background polling flow.

## Operational behavior

- Service worker polls every minute (`tick` log retained).
- Polling runs only for the active supported contest tab.
- Per-contest in-flight lock prevents concurrent poll + manual refresh for same contest.
- Scan interval timestamps are persisted in storage and survive service-worker restarts.
- Storage purge runs on a separate daily alarm (plus startup best-effort purge), not every minute.
- Broadcast messages are sent only to relevant Codeforces/LeetCode contest tabs.

## Data status: stale and partial

For each contest, `status:{contestId}` is stored and updated with:

- `stale`: true when latest refresh failed and previous data may be outdated.
- `isPartial` / `partial`: true when fetch was capped or incomplete.
- `fetchedRows`, `totalRows`: data coverage metadata when available.
- `message`: human-readable warning for popup and overlays.

This status is also included in emitted update payloads so popup/content scripts can react immediately.

## Heuristics limitation notes

- **H4 Dormant Surge** now depends on known lifetime submission counts.
- If lifetime submissions are unavailable/unknown, H4 is skipped for that user to avoid false positives from defaulting to `0`.

## Directory layout

```text
submission-pattern-analyzer/
├── manifest.json
├── background/
│   ├── service-worker.js
│   ├── fetchers/
│   │   ├── http.js
│   │   ├── codeforces.js
│   │   ├── leetcode.js
│   │   └── codechef.js
│   └── engine/
│       ├── scorer.js
│       ├── store.js
│       └── heuristics/
│           ├── solve-speed.js
│           ├── rating-jump.js
│           ├── cluster.js
│           ├── dormant.js
│           └── rapid-solve.js
├── content-scripts/
│   ├── codeforces-overlay.js
│   └── leetcode-overlay.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── settings/
│   ├── settings.html
│   └── settings.js
├── shared/
│   └── settings.js
├── tests/
│   ├── heuristics.test.js
│   ├── scorer.test.js
│   ├── fetchers.test.js
│   └── fixtures/
│       ├── snapshot.fixture.json
│       └── expected-scores.snapshot.json
└── package.json
```

## Local setup

1. Open Chrome and visit `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `submission-pattern-analyzer/`.
5. Open a supported standings page (CF/LC ranking) to start polling.

## Storage keys

- `snapshot:{contestId}`
- `scores:{contestId}`
- `status:{contestId}`
- `settings`
- `runtime:meta` (persistent runtime metadata like scan/request timestamps)
- `cache:rating:{handle}` (reserved)

## Testing

```bash
npm test
```

Uses Node built-in test runner (`node --test`).
