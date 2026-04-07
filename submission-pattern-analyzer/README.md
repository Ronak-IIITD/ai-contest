# Submission Pattern Analyzer

AI-powered cheating detection overlay for competitive programming contest leaderboards.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=google-chrome)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

> **Risk is not a verdict.** This extension surfaces suspicion signals, not automated verdicts. All detection is explainable, and users can judge signal quality themselves.

## What it does

Monitors live Codeforces and LeetCode contest standings, computes a heuristic risk score for each participant, and overlays color-coded badges directly on the leaderboard.

- **Real-time polling** (60s intervals, persisted across restarts)
- **Risk tiers**: Low (green), Medium (amber), High (red)
- **Explainable flags**: Hover any badge to see which heuristics triggered
- **Privacy-first**: All processing local, no data leaves your device

## Supported platforms

| Platform | Status | URL pattern |
|---|---|---|
| Codeforces | ✅ Active | `/contest/{id}/standings` |
| LeetCode | ✅ Active | `/contest/{slug}/ranking` |
| CodeChef | 🔜 Planned | — |
| AtCoder | 🔜 Planned | — |

## Quick start

```bash
# Clone and load
git clone https://github.com/Ronak-IIITD/ai-contest.git
cd ai-contest/submission-pattern-analyzer

# Run tests (optional)
npm test
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `submission-pattern-analyzer/` folder
5. Open a Codeforces or LeetCode contest standings page

## Heuristics (v1)

The current scoring engine uses 5 heuristic rules:

| ID | Heuristic | Weight | Triggers when... |
|---|---|---|---|
| H1 | Solve Speed | +30 | Solve time >2 std devs faster than user's historical average |
| H2 | Rating Jump | +25 | Predicted rating gain >200 pts vs trailing 6-contest average |
| H3 | Submission Cluster | +20 (+35) | ≥5 users AC same problem within 45s (no prior interaction) |
| H4 | Dormant Surge | +25 | <10 lifetime submissions, now in top 10% |
| H5 | Rapid Multi-Solve | +20 | 3+ problems solved in <8 mins, no wrong attempts |

Final score = sum of triggered weights (capped at 100).

**Note**: H4 is skipped when lifetime submission data is unavailable, avoiding false positives from implicit zeros.

---

## Roadmap: ML-Powered v2+

The v1 heuristic engine is a strong baseline, but has hard limits on detection quality. We're evolving toward a **world-class, privacy-preserving ML system**.

### Why ML matters

- **Context-aware thresholds**: ML learns per-user baselines instead of fixed cutoffs
- **Multi-signal patterns**: Detects subtle combinations (timing + language + difficulty + peer correlation)
- **Calibrated confidence**: Provides probability estimates, not just scores
- **Adaptive detection**: Models can be retrained to catch new evasion tactics

### Architecture vision

```
[Public API data] → [Local feature pipeline] → [ONNX Runtime Web (GBDT + anomaly)]
                                                    ↓
                                            [Explainability layer]
                                                    ↓
                                            [Calibrated risk + confidence]
```

- **On-device inference**: ONNX Runtime Web (WASM) — no server, no data leaves extension
- **Core model**: Gradient-boosted trees (LightGBM → ONNX)
- **Privacy**: Training uses public data only; model packs loaded locally

### Phased rollout

| Phase | ML capability | Target |
|---|---|---|
| **v2** | Replace weighted sum with calibrated GBDT | Big precision gain, <50ms inference |
| **v2.5** | Temporal features + per-user baseline | Detect stealth/multi-round cheating |
| **v3** | Cross-contest graph + ensemble + drift monitoring | Highest detection, auto-adapt |

### World-class differentiators

1. **Explainable by default** — every flag shows why (top factors, baseline comparison, confidence)
2. **Abstain zones** — "Insufficient evidence" instead of overconfident bad flags
3. **Drift-aware** — auto-fallback when model degrades
4. **Community feedback loop** — local correction labels, optional anonymized aggregate exports
5. **Moderator evidence packets** — one-click reproducible reports for human review

See [ML Roadmap Discussion](https://github.com/Ronak-IIITD/ai-contest/discussions) for technical specs.

---

## Operational behavior

- Service worker polls every minute (`tick` logged to console)
- Polling runs only for active supported contest tab
- **Per-contest in-flight lock** prevents concurrent poll + manual refresh
- Scan timestamps persisted in storage (survives MV3 restarts)
- Storage purge runs on daily alarm (not every minute)
- Broadcast messages only to relevant CF/LC tabs

### Data status handling

For each contest, `status:{contestId}` tracks:

- `stale`: latest refresh failed, data may be outdated
- `isPartial` / `partial`: fetch was capped or incomplete
- `fetchedRows`, `totalRows`: coverage metadata
- `message`: human-readable warning

Status is surfaced in popup and overlay summary.

---

## Directory layout

```
submission-pattern-analyzer/
├── manifest.json              # MV3 Chrome extension manifest
├── background/
│   ├── service-worker.js      # Polling orchestrator
│   ├── fetchers/
│   │   ├── http.js            # Shared HTTP utility (retry, backoff, rate-limit)
│   │   ├── codeforces.js     # CF standings fetcher (paginated)
│   │   └── leetcode.js       # LC GraphQL fetcher (paginated)
│   └── engine/
│       ├── scorer.js          # Heuristic scoring pipeline
│       ├── store.js           # Storage abstraction
│       └── heuristics/        # H1-H5 detection modules
├── content-scripts/
│   ├── codeforces-overlay.js  # CF leaderboard badge injection
│   └── leetcode-overlay.js    # LC leaderboard badge injection
├── popup/                     # Extension popup UI
├── settings/                  # Settings page
├── shared/                    # Shared utilities (settings defaults)
└── tests/                     # Node test suite
```

---

## Storage keys

| Key | Purpose |
|---|---|
| `snapshot:{contestId}` | Raw standings data |
| `scores:{contestId}` | Computed risk scores |
| `status:{contestId}` | Stale/partial status |
| `settings` | User preferences |
| `runtime:meta` | Persistent metadata (scan/request timestamps) |

---

## Testing

```bash
npm test
```

12 tests covering:
- Heuristic detection (H1-H5)
- Scorer pipeline
- Fetcher pagination + partial metadata
- HTTP retry policy

---

## Privacy

- **No private data**: Only reads publicly visible contest standings
- **No external calls**: All processing local to extension
- **No telemetry**: No analytics, no crash reporting in v1
- **No storage exports**: Data stays in chrome.storage.local only

---

## License

MIT — See LICENSE file for details.

---

## Contributing

This is a research prototype. For ML roadmap technical specs, feature proposals, or detection tuning discussions, open a GitHub issue or discussion.

**Disclaimer**: This tool is for informational purposes. It surfaces suspicion signals, not definitive proof of cheating. Always verify independently before taking action.