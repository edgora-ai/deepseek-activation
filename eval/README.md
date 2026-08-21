# Evaluation v2

This directory contains the reproducible evaluation used to separate file generation from working task completion.

## Existing corpus audit

```bash
node eval/audit-existing.mjs
node eval/report-audit.mjs
```

The audit loads all 48 historical HTML artifacts through a loopback-only HTTP server and isolated headless Chromium. It records inline JavaScript syntax, browser exceptions and console errors, requirement checks, interaction changes, screenshot pixel statistics, screenshots, and legacy screenshot presence under `docs/results/eval-v2/audit/`.

A full pass requires all of the following:

- executable inline JavaScript is syntactically valid;
- the browser reports no unhandled runtime or console error;
- every machine-testable prompt requirement passes;
- the required interaction changes observable state;
- the screenshot contains non-uniform visible content.

File size and source keyword counts remain descriptive fields only. They are not quality scores.

## Controlled OpenCode A/B

Preview the fixed 18-run matrix without changing rules or creating run directories:

```bash
scripts/eval.sh --dry-run
```

Run the matrix:

```bash
scripts/eval.sh --parallel-cases
node eval/report.mjs  # JSON, CSV, Markdown, and screenshot-linked HTML
```

After an inspected interruption, reclassify existing logs and resume without replacing completed sessions:

```bash
node eval/recheck-infrastructure.mjs --expect <completed-count>
node eval/recheck-execution.mjs --expect <completed-count>
node eval/verify-usage.mjs --expect <completed-count>
scripts/eval.sh --resume --parallel-cases
```

Resume validates every existing prompt, treatment mapping, rule hash, model, method version, neutral command, artifact, screenshot, execution annotation, and attributable positive usage before skipping it. An incomplete or mismatched run fails before either case in that treatment is launched instead of being overwritten.

The matrix has two tasks (`build-dashboard` and `fix-dashboard`), three rule variants (`no-rules`, `current`, and `candidate-v2`), and three independent sessions on the exact model alias `hroze-sp/deepseek-v4-flash`. Variant order rotates for each repetition. The prompt always names the relative target `dashboard.html`; the runner passes an explicit neutral `repeat-N/slot-N/case` path through OpenCode `--dir`, and the OpenCode session title uses `client-case-repeat-slot`, so prompt, model-visible path, session metadata, and parent runner arguments do not expose the rule variant. Dry-run verification requires exactly two prompt hashes across all 18 runs and no variant name in any run path, session title, or model-visible command.

Every run stores its exact prompt, active rule hash, timestamps, process result, stdout/stderr, target artifact, screenshot, browser assertions, and attributable OpenCode session usage in `docs/results/eval-v2/runs/`. Dashboard controls are identified semantically from labels and attributes: a valid period range may be one range input, two start/end selects, or another labeled control, and region/category controls may be selects, checkboxes, radios, or buttons. The evaluator changes each group in an isolated page reload and verifies that KPI data changes; hover is exercised through a real pointer event.

The batch script takes an exclusive rule-file lock, backs up `~/.config/opencode/AGENTS.md`, verifies every activated variant by SHA-256, and restores the original bytes on normal exit, failure, or interruption. With `--parallel-cases`, it preflights both neutral case directories, launches build and fix under one active treatment, waits for both at a barrier, verifies the rule hash again, and only then changes treatment. A failing case terminates and joins its sibling before the rule file can change. Each run records `executionMode` and a neutral `rN-slot-N` concurrency group; token usage remains independently attributable, but mixed serial/parallel wall times are descriptive and are not used as strict causal evidence. An uncoordinated companion collision that motivated this change is preserved and excluded under `operational-incidents/parallel-companion-collision/`. A provider API failure is written to run metadata, exits the runner with temporary-failure status 75, and stops the batch instead of counting infrastructure failure against a treatment. Infrastructure-classifier method 2 trusts structured OpenCode stdout error events and uses plain-text matching only on process stderr; model-visible stdout can contain historical error text returned by tools and is not itself provider evidence. The known rate-limited pilot still resolves to `APIError`, status 429, retryable true. The method-1 false stop and original classification are preserved under `operational-incidents/provider-classifier-stdout-false-positive/`. `scripts/eval.sh --verify-rules-only` tests the activation and restoration path without invoking a model.

OpenCode token values are accepted only when exactly one new SQLite session matches the unique run title and timestamp, and its stored directory and model match the explicit neutral run directory and requested model. All-zero, ambiguous, mismatched, or missing usage is stored as `null`; no cumulative value is copied from another session. `totalTokens` includes input, output, thinking, cache-read, and cache-write fields. The final verifier reads each accepted session back from SQLite by ID and independently searches it by title/time before comparing every stored token field. Reports also count structured agent steps, tool calls, tool errors, and tool mix from stdout; zero exposed reasoning parts or thinking tokens is not interpreted as absence of internal reasoning.

After a benchmark implementation change, run `node eval/recheck-runs.mjs --expect 18` before reporting. It reruns every artifact through evaluation method version 5 and atomically replaces only the evaluation section and screenshot; model output and usage remain unchanged. Method 3 added hidden checkbox/radio inputs whose visible wrapping labels act as the controls. Method 4 assigns each control to exactly one semantic group using its nearest unambiguous local label or ancestor. Method 5 probes up to 80 visible chart marks or canvas coordinates with real pointer movement and accepts hover only when native details, a newly visible tooltip, or a hover state appears; selecting the first arbitrary SVG primitive is insufficient.

Candidate-v2 is promoted for a client only when it passes the same gates against both current and no-rules: the exact 18-run grid uses 18 distinct attributable sessions and one evaluation method, both tasks avoid runtime and full-pass regression, at least two of three paired repetitions per task have a contract score no lower than the baseline, and the configured quality/cost threshold passes. If full-pass totals tie, median duration or tokens must improve by at least 15%; if full-pass totals improve, neither median may grow by more than 20%. The report separately states whether current or candidate demonstrates optimization over no-rules. `eval/report.mjs` derives the expected model, prompt hashes, rule hashes/states, neutral command, both method versions, and usage identity fields from source and rejects nine corrupted metadata variants before emitting the verdict; it does not trust an edited table. The completed result is documented in [`../docs/evaluation-v2.md`](../docs/evaluation-v2.md): current is supported over no-rules for this OpenCode/model/task scope; candidate-v2 is not promoted.

Three treatment-confounded pilots are preserved under `docs/results/eval-v2/pilot-runs-path-confounded/`, `pilot-runs-title-confounded/`, and `pilot-runs-parent-args-confounded/` and excluded from reports. The first exposed the treatment in the absolute output path; the second fixed the path but still used the treatment name as the OpenCode session title; the third neutralized prompt, path, and title but still passed `--rules` and the expected rule hash to the runner, which a model could theoretically observe through its parent process. They are diagnostic evidence only. The formal runner receives only repeat and neutral slot values and maps them to treatments internally.

A later neutralized attempt is preserved under `pilot-runs-rate-limited/` with `open-code-ab-pilot-rate-limited.log`. Its first `opencode/deepseek-v4-flash-free` session received a retryable provider HTTP 429 before generating an artifact, and the batch was stopped during the second session. A cooldown canary received the same 429, while an explicit-directory canary for `hroze-sp/deepseek-v4-flash` completed and its SQLite row matched the requested directory/model with positive usage. The formal matrix therefore uses the latter exact alias; the failed free-tier attempt remains operational evidence only and is excluded from reports. The canary summaries are stored in `provider-canaries/summary.json`.

One partial `hroze-sp/deepseek-v4-flash` launch is preserved under `pilot-runs-background-task-timeout-risk/`. It was intentionally stopped at 180 seconds, before any `meta.json`, after recognizing that the original host background task had a finite execution deadline shorter than the 18-run matrix. The formal batch is instead owned by a persistent supervisor that forwards termination signals so the rule-restoration trap still runs.

The first persistent run is preserved under `pilot-runs-control-discovery-false-negative/`. Its rendered dashboard visibly contained working region and category pill filters implemented as hidden checkbox inputs inside visible labels, but method 2 excluded the hidden inputs and incorrectly scored the controls as absent. The batch was stopped after one completed sample, the probe was corrected and bumped to method 3, and calibration then scored that unchanged artifact 11/11 plus the prior build/fix reference artifacts 11/11 and 10/10.

The next first-session attempt is preserved under `pilot-runs-semantic-control-cross-contamination/`. Method 3 found the real controls but accumulated text from their common filter card, causing the same region button to be selected for all three interaction checks: every recorded descriptor and post-mutation KPI vector was identical. The batch was stopped during the following fix session. Method 4 classifies each element once from the nearest local descriptor that matches exactly one semantic group; on the unchanged artifact it identifies three region buttons, three category buttons, and two period ranges, mutates `North`, `Electronics`, and `rFrom` separately, and produces three different KPI outcomes.

The following first-session attempt is preserved under `pilot-runs-hover-target-false-negative/`. Its source binds tooltip listeners to SVG groups and the tooltip appears over data points, but method 4 moved the pointer only to the first SVG primitive, which was an unbound chart decoration, and incorrectly failed hover at 10/11. Method 5 tries visible marks in order until one produces observable hover evidence; on the unchanged artifact the third candidate is a data-point circle and reveals the expected tooltip, restoring 11/11. A page without working hover remains a negative control.

## Behavior smoke

```bash
scripts/verify-behavior.sh opencode
```

The smoke asks the selected client to generate a small counter page and then independently checks the target file, inline JavaScript syntax, browser runtime, self-containment, and click behavior. Model output containing words such as “verify” or “passed” is not treated as evidence.
