#!/usr/bin/env bash
# Third attempt for every model/task that produced no artifact.
# 9 runs: nv3(blackhole,helicopter,race,music,dashboard) mino-free(race)
#         muse-free(race,music) opencode-free(race)
set -Eeuo pipefail

REPO_DIR="/home/ubuntu/deepseek-activation"
LOGS="$REPO_DIR/docs/results/eval-v5-claude-models"
JOBS=(
  "nv3:blackhole" "nv3:helicopter" "nv3:race" "nv3:music" "nv3:dashboard"
  "mino-free:race" "muse-free:race" "muse-free:music" "opencode-free:race"
)
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
  printf '[cleanup] stopped fill workers\n' >&2
}
trap cleanup EXIT INT TERM

job() {
  local model="$1" task="$2"
  printf '[start] %s/%s %s\n' "$model" "$task" "$(date +%H:%M:%S)" | tee -a "$LOGS/fill.log"
  if node eval/run-claude-models.mjs --model "$model" --task "$task" --timeout-ms 1800000 --vision >> "$LOGS/${model}-fill.log" 2>&1; then
    rc=0
  else
    rc=$?
  fi
  printf '[done] %s/%s rc=%s %s\n' "$model" "$task" "$rc" "$(date +%H:%M:%S)" | tee -a "$LOGS/fill.log"
}

for entry in "${JOBS[@]}"; do
  model="${entry%%:*}"
  task="${entry##*:}"
  job "$model" "$task" &
  PIDS+=("$!")
done

wait
printf 'ALL_DONE\n' | tee -a "$LOGS/fill.log"