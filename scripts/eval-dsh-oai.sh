#!/usr/bin/env bash
# v8 high-effort: DSH standard preset, per-model protocol.
# opencode-free forces thinking -> anthropic protocol + effort>=low;
# everything else runs the OpenAI-completions protocol (anthropic streaming
# drops tool_use on this gateway).
set -Eeuo pipefail
REPO_DIR="/home/ubuntu/deepseek-activation"
LOGS="$REPO_DIR/docs/results/eval-v8-dsh-oai"
MODELS=(hy3 muse-free opencode-free mino-free)
TASKS=(blackhole helicopter race game music dashboard)
cd "$REPO_DIR"
mkdir -p "$LOGS"
worker() {
  local model="$1"
  local patch="/tmp/dsh-openai-patch.yml"
  if [[ "$model" == "opencode-free" ]]; then patch="/tmp/dsh-anthropic-patch.yml"; fi
  for task in "${TASKS[@]}"; do
    printf '[start] %s/%s %s\n' "$model" "$task" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
    if node eval/run-dsh-oai.mjs --model "$model" --task "$task" --dsh-home "/tmp/dsh-oai-homes/$model" --patch "$patch" --timeout-ms 2400000 --vision >> "$LOGS/${model}.log" 2>&1; then rc=0; else rc=$?; fi
    printf '[done] %s/%s rc=%s %s\n' "$model" "$task" "$rc" "$(date +%H:%M:%S)" | tee -a "$LOGS/launcher.log"
  done
}
for model in "${MODELS[@]}"; do worker "$model" & done
wait
printf 'ALL_DONE\n' | tee -a "$LOGS/launcher.log"
