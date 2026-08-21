# Controlled A/B Summary

Runs: 18

| Client | Case | Rules | Full pass | Runtime | Contract median | Duration median (descriptive) | Tokens median | Steps median | Tool calls median |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| opencode | build-dashboard | candidate-v2 | 2/3 | 2/3 | 100.0% | 344.8s | 1037724 | 36 | 35 |
| opencode | build-dashboard | current | 3/3 | 3/3 | 100.0% | 248.8s | 410927 | 16 | 16 |
| opencode | build-dashboard | no-rules | 3/3 | 3/3 | 100.0% | 291.8s | 631396 | 21 | 23 |
| opencode | fix-dashboard | candidate-v2 | 3/3 | 3/3 | 100.0% | 235.2s | 387145 | 17 | 21 |
| opencode | fix-dashboard | current | 3/3 | 3/3 | 100.0% | 183.2s | 459016 | 19 | 22 |
| opencode | fix-dashboard | no-rules | 3/3 | 3/3 | 100.0% | 201.8s | 447203 | 19 | 21 |

## Candidate-v2 decision

| Client | Candidate decision | Optimization verdict | Evidence complete | Current full pass | Candidate full pass | Comparable duration ratio | Token ratio |
|---|---|---|---:|---:|---:|---:|---:|
| opencode | candidate-not-proven | current-optimization-supported | PASS | 6 | 5 | null | 1.023 |

| Client | Case | No full-pass regression | No runtime regression | Contract non-inferior repeats | Token ratio | Token-lower repeats | ≥15% token wins | Gate |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| opencode | build-dashboard | FAIL | FAIL | 3/3 | 2.525 | 1/3 | 1/3 | FAIL |
| opencode | fix-dashboard | PASS | PASS | 3/3 | 0.843 | 3/3 | 3/3 | PASS |

## Baseline comparisons

| Client | Tested vs baseline | Gate | Full pass | Comparable duration ratio | Token ratio |
|---|---|---:|---:|---:|---:|
| opencode | candidate-v2 vs current | FAIL | 5/6 | null | 1.023 |
| opencode | candidate-v2 vs no-rules | FAIL | 5/6 | null | 0.830 |
| opencode | current vs no-rules | PASS | 6/6 | null | 0.812 |

Candidate-v2 is promoted only if it passes the same gates against both current and no-rules. A verdict also requires the exact rotated 18-run grid, two stable case prompt hashes, neutral slot paths, valid rule hashes and execution annotations, no provider infrastructure failure, one distinct attributable session with positive usage per run, evaluation method version 5, and all quality/cost gates. `totalTokens` includes input, output, thinking, cache-read, and cache-write fields; unavailable usage remains `null`. Duration medians remain descriptive. A duration ratio is eligible for a gate only when both compared variants use one identical execution mode; mixed serial, resume-single, overlapped, and parallel runs therefore use independently attributed tokens for the efficiency gate.
