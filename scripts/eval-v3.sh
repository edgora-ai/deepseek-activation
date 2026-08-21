#!/usr/bin/env bash
# Single-owner launcher for the eval-v3 matrix. One bash process owns exactly
# one background worker per config; each worker runs its 6 tasks in order.
# The launcher itself is the only process group, so a single kill of this
# script's process tree stops everything cleanly.
set -Eeuo pipefail

REPO_DIR="/home/ubuntu/deepseek-activation"
LOGS="$REPO_DIR/docs/results/eval-v3"
PIDS=()

cd "$REPO_DIR"

cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 2
  for pid in "${PIDS[@]:-}"; do
    kill -KILL "$pid" 2>/dev/null || true
  done
  pkill -f "run-one-v3" 2>/dev/null || true
  pkill -f "opencode run --model hroze-sp" 2>/dev/null || true
  pkill -f "bin.ts --profile headless" 2>/dev/null || true
  printf '[cleanup] all workers stopped\n' >&2
}
trap cleanup EXIT INT TERM

for config in opencode-no-rules opencode-current dsh-minimal dsh-router-standard; do
  (
    for task in blackhole helicopter race game music dashboard; do
      printf '[start] %s/%s %s\n' "$config" "$task" "$(date +%H:%M:%S)"
      if node eval/run-one-v3.mjs --config "$config" --task "$task" --timeout-ms 2400000 --vision >> "$LOGS/${config//-/_}.log" 2>&1; then
        rc=0
      else
        rc=$?
      fi
      printf '[done] %s/%s rc=%s %s\n' "$config" "$task" "$rc" "$(date +%H:%M:%S)"
    done
  ) &
  PIDS+=("$!")
done

wait
echo ALL_DONE