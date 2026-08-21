#!/usr/bin/env bash
# Verify behavior with a generated file, browser runtime, and interaction assertion.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT="${1:-all}"
WORKDIR=$(mktemp -d /tmp/deepseek-activation-verify.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

prompt_for() {
  local output=$1
  printf '%s\n' "Create $output as one self-contained HTML file with no external assets. Add a button with id=\"increment\", a numeric output with id=\"count\" initially showing 0, and JavaScript that increments the count exactly once per click. Write the file, verify it, and do not modify any other file."
}

verify_output() {
  local output=$1
  if [[ ! -f "$output" ]]; then
    printf 'FAIL: target file was not generated: %s\n' "$output" >&2
    return 1
  fi
  node "$REPO_DIR/eval/verify-counter.mjs" "$output"
}

run_claude() {
  command -v claude >/dev/null || { printf '%s\n' 'SKIP: claude is not installed' >&2; return 2; }
  local dir="$WORKDIR/claude" output status
  mkdir -p "$dir"
  output="$dir/counter.html"
  set +e
  prompt_for "$output" | (cd "$dir" && timeout 1800 claude -p --model deepseek-free) >"$dir/client.log" 2>&1
  status=$?
  set -e
  printf '[claude] generation-exit=%s\n' "$status"
  verify_output "$output"
}

run_codex() {
  command -v codex >/dev/null || { printf '%s\n' 'SKIP: codex is not installed' >&2; return 2; }
  if [[ -z "${HROZE_TOKEN:-}" && -z "${ANTHROPIC_AUTH_TOKEN:-}" ]]; then
    printf '%s\n' 'SKIP: Codex provider credential is not configured' >&2
    return 2
  fi
  local dir="$WORKDIR/codex" output status
  mkdir -p "$dir"
  output="$dir/counter.html"
  set +e
  prompt_for "$output" | (cd "$dir" && HROZE_TOKEN="${HROZE_TOKEN:-$ANTHROPIC_AUTH_TOKEN}" timeout 3600 codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -) >"$dir/client.log" 2>&1
  status=$?
  set -e
  printf '[codex] generation-exit=%s\n' "$status"
  verify_output "$output"
}

run_opencode() {
  command -v opencode >/dev/null || { printf '%s\n' 'SKIP: opencode is not installed' >&2; return 2; }
  local dir="$WORKDIR/opencode" output status prompt
  mkdir -p "$dir"
  output="$dir/counter.html"
  prompt=$(prompt_for "$output")
  set +e
  (cd "$dir" && timeout 1800 opencode run --model opencode/deepseek-v4-flash-free "$prompt") >"$dir/client.log" 2>&1
  status=$?
  set -e
  printf '[opencode] generation-exit=%s\n' "$status"
  verify_output "$output"
}

run_one() {
  case "$1" in
    claude) run_claude ;;
    codex) run_codex ;;
    opencode) run_opencode ;;
    *) printf 'Unknown client: %s\n' "$1" >&2; return 2 ;;
  esac
}

case "$CLIENT" in
  claude|codex|opencode) run_one "$CLIENT" ;;
  all)
    result=0
    for client in claude codex opencode; do
      printf '=== %s behavior verification ===\n' "$client"
      run_one "$client" || result=1
    done
    exit "$result"
    ;;
  *) printf 'Usage: %s [claude|codex|opencode|all]\n' "$0" >&2; exit 2 ;;
esac
