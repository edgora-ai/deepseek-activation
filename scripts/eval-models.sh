#!/usr/bin/env bash
# Serial launcher for the model-comparison matrix. DSH settings.yaml is a
# single global file, so model runs MUST be serial. One owner process runs all
# 30 cases (5 models x 6 tasks) sequentially, restoring settings after each.
set -Eeuo pipefail

REPO_DIR="/home/ubuntu/deepseek-activation"
LOGS="$REPO_DIR/docs/results/eval-v4-models"
MODELS=(nv3 hy3 mino-free muse-free opencode-free)
TASKS=(blackhole helicopter race game music dashboard)

cd "$REPO_DIR"
mkdir -p "$LOGS"

for model in "${MODELS[@]}"; do
  for task in "${TASKS[@]}"; do
    printf '[start] %s/%s %s\n' "$model" "$task" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
    if node eval/run-models.mjs --model "$model" --task "$task" --timeout-ms 3000000 --vision >> "$LOGS/${model}.log" 2>&1; then
      rc=0
    else
      rc=$?
    fi
    printf '[done] %s/%s rc=%s %s\n' "$model" "$task" "$rc" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
  done
done
printf 'ALL_DONE\n' | tee -a "$LOGS/launcher.log"