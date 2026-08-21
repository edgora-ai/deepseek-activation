# Provider-classifier stdout false positive

The method-5 formal batch stopped after `opencode-fix-dashboard-r2-current` with exit 75 even though the session completed, produced an attributable positive-usage row, and passed runtime and all 10 contract checks.

Infrastructure-classifier method 1 parsed structured OpenCode error events correctly, then also searched the entire raw stdout stream for text such as `HTTP 429`. OpenCode JSON stdout includes model-visible tool results. During this run, a tool result reproduced `eval/README.md`, whose historical pilot description contains `HTTP 429` twice. Neither occurrence was a current provider event; stderr was empty and all 94 stdout lines parsed as non-error JSON events.

The unmodified pre-reclassification metadata and the first supervisor segment log/status are preserved in this directory. Infrastructure-classifier method 2 accepts structured stdout error events and limits plain-text fallback to process stderr. The known rate-limited pilot still yields structured `APIError`, status 429, retryable true; this completed run yields no infrastructure failure. Existing formal metadata is reclassified with method 2 while retaining the prior classification in `infrastructureClassificationHistory`.

This correction does not change prompts, treatments, generated artifacts, usage, browser evaluation, or evaluation method 5. The batch resumes only after all existing runs pass strict metadata validation.
