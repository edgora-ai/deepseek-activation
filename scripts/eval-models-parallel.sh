#!/usr/bin/env bash
# Parallel model-comparison launcher: one worker per model, each with its own
# isolated DSH_HOME under /tmp/dsh-model-homes so models never touch a shared
# settings file. Each worker runs its 6 tasks in order.
set -Eeuo pipefail

REPO_DIR="/home/ubuntu/deepseek-activation"
LOGS="$REPO_DIR/docs/results/eval-v4-models"
MODELS=(nv3 hy3 mino-free muse-free opencode-free)
TASKS=(blackhole helicopter race game music dashboard)

cd "$REPO_DIR"
mkdir -p "$LOGS"

worker() {
  local model="$1"
  for task in "${TASKS[@]}"; do
    printf '[start] %s/%s %s\n' "$model" "$task" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
    if node eval/run-models.mjs --model "$model" --task "$task" \
      --dsh-home "/tmp/dsh-model-homes/$model" --timeout-ms 3000000 --vision \
      >> "$LOGS/${model}.log" 2>&1; then
      rc=0
    else
      rc=$?
    fi
    printf '[done] %s/%s rc=%s %s\n' "$model" "$task" "$rc" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
  done
}

for model in "${MODELS[@]}"; do
  worker "$model" &
done

wait
printf 'ALL_DONE\n' | tee -a "$LOGS/launcher.log"