# Historical Paired Comparisons

> Each task has one artifact per variant. These figures describe the exploratory corpus and do not establish repeatability or causation.

| Client | Baseline | Tested | Paired cases | Full pass | Runtime clean | Median contract | Improved | Regressed | Tied |
|---|---|---|---:|---:|---:|---:|---|---|---|
| claude | no-rules | current | 5 | 2 → 3 | 3 → 4 | 100.0% → 100.0% | dashboard, race | helicopter | game, music |
| codex | no-rules | current | 6 | 4 → 3 | 4 → 4 | 100.0% → 93.8% | dashboard, race | game, blackhole | helicopter, music |
| opencode | no-rules | current | 6 | 2 → 1 | 4 → 4 | 93.8% → 86.6% | race | helicopter, dashboard | game, music, blackhole |
| dsh | minimal | router-standard | 6 | 4 → 5 | 5 → 5 | 100.0% → 100.0% | helicopter, dashboard | blackhole | game, music, race |

The machine-readable file beside this report contains every paired artifact and delta.
