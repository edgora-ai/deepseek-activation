#!/usr/bin/env bash
# Claude Code x free-model matrix launcher.
# One worker per model; each worker runs its 6 tasks in order. launcher is the
# process-group root, so killing this script's tree stops everything.
set -Eeuo pipefail

REPO_DIR="/home/ubuntu/deepseek-activation"
LOGS="$REPO_DIR/docs/results/eval-v7-max-effort"
MODELS=(hy3 mino-free opencode-free)
TASKS=(blackhole helicopter race game music dashboard)
PIDS=()

cd "$REPO_DIR"
mkdir -p "$LOGS"

cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 2
  for pid in "${PIDS[@]:-}"; do
    kill -KILL "$pid" 2>/dev/null || true
  done
  pkill -f "run-claude-models.mjs" 2>/dev/null || true
  pkill -f "claude -p --model" 2>/dev/null || true
  printf '[cleanup] stopped all workers\n' >&2
}
trap cleanup EXIT INT TERM

worker() {
  local model="$1"
  for task in "${TASKS[@]}"; do
    printf '[start] %s/%s %s\n' "$model" "$task" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
    if node eval/run-claude-models.mjs --out-root "$REPO_DIR/docs/results/eval-v7-max-effort" --model "$model" --task "$task" --timeout-ms 1800000 --vision >> "$LOGS/${model}.log" 2>&1; then
      rc=0
    else
      rc=$?
    fi
    printf '[done] %s/%s rc=%s %s\n' "$model" "$task" "$rc" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
  done
}

for model in "${MODELS[@]}"; do
  worker "$model" &
  PIDS+=("$!")
done

wait
printf 'ALL_DONE\n' | tee -a "$LOGS/launcher.log"