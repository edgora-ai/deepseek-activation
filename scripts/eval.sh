#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVE_RULE="$HOME/.config/opencode/AGENTS.md"
CURRENT_RULE="$REPO_DIR/eval/rules/current/AGENTS.md"
CANDIDATE_RULE="$REPO_DIR/eval/rules/candidate-v2/AGENTS.md"
MODEL="hroze-sp/deepseek-v4-flash"
DRY_RUN=0
RULES_ONLY=0
RESUME=0
PARALLEL_CASES=0
TIMEOUT_MS=7200000
LAUNCHED_PID=
PENDING_CASES=()

usage() {
  printf '%s\n' 'Usage: scripts/eval.sh [--dry-run] [--verify-rules-only] [--resume] [--parallel-cases] [--model MODEL] [--timeout-ms MS]'
}

while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --verify-rules-only) RULES_ONLY=1; shift ;;
    --resume) RESUME=1; shift ;;
    --parallel-cases) PARALLEL_CASES=1; shift ;;
    --model) MODEL="${2:?--model requires a value}"; shift 2 ;;
    --timeout-ms) TIMEOUT_MS="${2:?--timeout-ms requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

hash_file() {
  if [[ -f "$1" ]]; then
    sha256sum "$1" | cut -d' ' -f1
  else
    printf '%s\n' absent
  fi
}

variant_hash() {
  case "$1" in
    no-rules) printf '%s\n' absent ;;
    current) hash_file "$CURRENT_RULE" ;;
    candidate-v2) hash_file "$CANDIDATE_RULE" ;;
    *) printf 'Unknown rules variant: %s\n' "$1" >&2; return 2 ;;
  esac
}

verify_active_variant() {
  local variant=$1 expected actual
  expected=$(variant_hash "$variant")
  actual=$(hash_file "$ACTIVE_RULE")
  if [[ "$actual" != "$expected" ]]; then
    printf 'Rule hash changed while %s was active: expected %s, found %s\n' "$variant" "$expected" "$actual" >&2
    return 1
  fi
  printf '[rules] verified=%s hash=%s\n' "$variant" "$actual"
}

activate_variant() {
  local variant=$1
  mkdir -p "$(dirname "$ACTIVE_RULE")"
  rm -f "$ACTIVE_RULE"
  case "$variant" in
    no-rules) ;;
    current) cp -p "$CURRENT_RULE" "$ACTIVE_RULE" ;;
    candidate-v2) cp -p "$CANDIDATE_RULE" "$ACTIVE_RULE" ;;
    *) printf 'Unknown rules variant: %s\n' "$variant" >&2; return 2 ;;
  esac
  local expected actual
  expected=$(variant_hash "$variant")
  actual=$(hash_file "$ACTIVE_RULE")
  if [[ "$actual" != "$expected" ]]; then
    printf 'Rule activation hash mismatch for %s: expected %s, found %s\n' "$variant" "$expected" "$actual" >&2
    return 1
  fi
  printf '[rules] active=%s hash=%s\n' "$variant" "$actual"
}

run_case_foreground() {
  local repeat=$1 slot=$2 variant=$3 case_id=$4 execution_mode=$5 concurrency_group=$6
  local -a args=(
    "$REPO_DIR/eval/run-ab.mjs"
    --client opencode
    --model "$MODEL"
    --case "$case_id"
    --repeat "$repeat"
    --slot "$slot"
    --timeout-ms "$TIMEOUT_MS"
    --execution-mode "$execution_mode"
  )
  if [[ -n "$concurrency_group" ]]; then
    args+=(--concurrency-group "$concurrency_group")
  fi
  if ((DRY_RUN)); then
    args+=(--dry-run)
  fi
  printf '[run] repeat=%s rules=%s case=%s model=%s execution=%s group=%s\n' \
    "$repeat" "$variant" "$case_id" "$MODEL" "$execution_mode" "${concurrency_group:-none}"
  local run_rc
  if node "${args[@]}"; then
    run_rc=0
  else
    run_rc=$?
  fi
  if ((run_rc != 0)); then
    printf '[failed] repeat=%s rules=%s case=%s exit=%s execution=%s\n' \
      "$repeat" "$variant" "$case_id" "$run_rc" "$execution_mode" >&2
    return "$run_rc"
  fi
  printf '[done] repeat=%s rules=%s case=%s execution=%s\n' \
    "$repeat" "$variant" "$case_id" "$execution_mode"
}

launch_case_background() {
  local repeat=$1 slot=$2 variant=$3 case_id=$4 concurrency_group=$5
  local -a args=(
    "$REPO_DIR/eval/run-ab.mjs"
    --client opencode
    --model "$MODEL"
    --case "$case_id"
    --repeat "$repeat"
    --slot "$slot"
    --timeout-ms "$TIMEOUT_MS"
    --execution-mode parallel-cases
    --concurrency-group "$concurrency_group"
  )
  printf '[run] repeat=%s rules=%s case=%s model=%s execution=parallel-cases group=%s\n' \
    "$repeat" "$variant" "$case_id" "$MODEL" "$concurrency_group"
  node "${args[@]}" &
  LAUNCHED_PID=$!
}

wait_parallel_pair() {
  local repeat=$1 variant=$2
  local pid_a=$3 case_a=$4 pid_b=$5 case_b=$6
  local finished_pid first_case other_pid other_case first_rc second_rc

  if wait -n -p finished_pid "$pid_a" "$pid_b"; then
    first_rc=0
  else
    first_rc=$?
  fi

  if [[ "$finished_pid" == "$pid_a" ]]; then
    first_case=$case_a
    other_pid=$pid_b
    other_case=$case_b
  else
    first_case=$case_b
    other_pid=$pid_a
    other_case=$case_a
  fi

  if ((first_rc != 0)); then
    printf '[failed] repeat=%s rules=%s case=%s exit=%s; stopping sibling=%s\n' \
      "$repeat" "$variant" "$first_case" "$first_rc" "$other_case" >&2
    if kill -0 "$other_pid" 2>/dev/null; then
      kill -TERM "$other_pid" 2>/dev/null || true
    fi
    if wait "$other_pid"; then
      second_rc=0
    else
      second_rc=$?
    fi
    printf '[sibling-stopped] repeat=%s rules=%s case=%s exit=%s\n' \
      "$repeat" "$variant" "$other_case" "$second_rc" >&2
    return "$first_rc"
  fi

  printf '[done] repeat=%s rules=%s case=%s execution=parallel-cases\n' \
    "$repeat" "$variant" "$first_case"
  if wait "$other_pid"; then
    second_rc=0
  else
    second_rc=$?
  fi
  if ((second_rc != 0)); then
    printf '[failed] repeat=%s rules=%s case=%s exit=%s\n' \
      "$repeat" "$variant" "$other_case" "$second_rc" >&2
    return "$second_rc"
  fi
  printf '[done] repeat=%s rules=%s case=%s execution=parallel-cases\n' \
    "$repeat" "$variant" "$other_case"
}

collect_pending_cases() {
  local repeat=$1 slot=$2 variant=$3 case_id run_dir meta_path
  PENDING_CASES=()
  for case_id in build-dashboard fix-dashboard; do
    run_dir="$REPO_DIR/docs/results/eval-v2/runs/opencode/repeat-$repeat/slot-$slot/$case_id"
    meta_path="$run_dir/meta.json"
    if [[ -f "$meta_path" ]]; then
      if ((!RESUME)); then
        printf 'Completed run already exists without --resume: %s\n' "$run_dir" >&2
        return 1
      fi
      node "$REPO_DIR/eval/validate-existing-run.mjs" \
        --meta "$meta_path" \
        --model "$MODEL" \
        --case "$case_id" \
        --repeat "$repeat" \
        --slot "$slot"
      printf '[skip] repeat=%s rules=%s case=%s existing-run-valid=yes\n' \
        "$repeat" "$variant" "$case_id"
    elif [[ -e "$run_dir" ]]; then
      printf 'Incomplete run directory exists; refusing to launch either case: %s\n' "$run_dir" >&2
      return 1
    else
      PENDING_CASES+=("$case_id")
    fi
  done
}

run_matrix() {
  local -a order
  local repeat variant expected slot case_id execution_mode concurrency_group
  local variant_rc pid_a pid_b
  if ((RULES_ONLY)); then
    for variant in no-rules current candidate-v2; do
      expected=$(variant_hash "$variant")
      if ((DRY_RUN)); then
        printf '[dry-run] activate=%s expected-hash=%s restore-on-exit=yes\n' "$variant" "$expected"
      else
        activate_variant "$variant"
      fi
    done
    return
  fi

  for repeat in 1 2 3; do
    case "$repeat" in
      1) order=(no-rules current candidate-v2) ;;
      2) order=(current candidate-v2 no-rules) ;;
      3) order=(candidate-v2 no-rules current) ;;
    esac
    slot=0
    for variant in "${order[@]}"; do
      slot=$((slot + 1))
      concurrency_group="r${repeat}-slot-${slot}"

      if ((DRY_RUN)); then
        expected=$(variant_hash "$variant")
        printf '[dry-run] activate=%s expected-hash=%s restore-on-exit=yes\n' "$variant" "$expected"
        if ((PARALLEL_CASES)); then
          execution_mode=parallel-cases
          concurrency_group="r${repeat}-slot-${slot}"
        else
          execution_mode=serial-cases
          concurrency_group=
        fi
        for case_id in build-dashboard fix-dashboard; do
          run_case_foreground "$repeat" "$slot" "$variant" "$case_id" \
            "$execution_mode" "$concurrency_group"
        done
        continue
      fi

      collect_pending_cases "$repeat" "$slot" "$variant"
      if ((${#PENDING_CASES[@]} == 0)); then
        continue
      fi
      activate_variant "$variant"

      variant_rc=0
      if ((PARALLEL_CASES)) && ((${#PENDING_CASES[@]} == 2)); then
        launch_case_background "$repeat" "$slot" "$variant" "${PENDING_CASES[0]}" "$concurrency_group"
        pid_a=$LAUNCHED_PID
        launch_case_background "$repeat" "$slot" "$variant" "${PENDING_CASES[1]}" "$concurrency_group"
        pid_b=$LAUNCHED_PID
        if wait_parallel_pair "$repeat" "$variant" \
          "$pid_a" "${PENDING_CASES[0]}" "$pid_b" "${PENDING_CASES[1]}"; then
          variant_rc=0
        else
          variant_rc=$?
        fi
      else
        if ((PARALLEL_CASES)); then
          execution_mode=resume-single
          concurrency_group="r${repeat}-slot-${slot}"
        else
          execution_mode=serial-cases
          concurrency_group=
        fi
        for case_id in "${PENDING_CASES[@]}"; do
          if run_case_foreground "$repeat" "$slot" "$variant" "$case_id" \
            "$execution_mode" "$concurrency_group"; then
            variant_rc=0
          else
            variant_rc=$?
          fi
          ((variant_rc == 0)) || break
        done
      fi

      verify_active_variant "$variant" || return 1
      ((variant_rc == 0)) || return "$variant_rc"
    done
  done
}

if ((DRY_RUN)); then
  printf '[dry-run] original-rule-hash=%s\n' "$(hash_file "$ACTIVE_RULE")"
  run_matrix
  printf '[dry-run] no rule files or run directories were changed\n'
  exit 0
fi

mkdir -p "$(dirname "$ACTIVE_RULE")"
exec 9>"/tmp/deepseek-activation-opencode-rules.lock"
if ! flock -n 9; then
  printf '%s\n' 'Another activation evaluation owns the OpenCode rules lock.' >&2
  exit 1
fi

BACKUP_DIR=$(mktemp -d /tmp/deepseek-activation-rules.XXXXXX)
ORIGINAL_HASH=$(hash_file "$ACTIVE_RULE")
ORIGINAL_PRESENT=0
if [[ -f "$ACTIVE_RULE" ]]; then
  ORIGINAL_PRESENT=1
  cp -p "$ACTIVE_RULE" "$BACKUP_DIR/AGENTS.md"
fi

restore_rules() {
  local prior_status=$1
  set +e
  rm -f "$ACTIVE_RULE"
  if ((ORIGINAL_PRESENT)); then
    cp -p "$BACKUP_DIR/AGENTS.md" "$ACTIVE_RULE"
  fi
  local restored
  restored=$(hash_file "$ACTIVE_RULE")
  if [[ "$restored" != "$ORIGINAL_HASH" ]]; then
    printf 'FATAL: OpenCode rules restore mismatch: expected %s, found %s\n' "$ORIGINAL_HASH" "$restored" >&2
    prior_status=1
  else
    printf '[restore] OpenCode rules hash=%s\n' "$restored"
  fi
  rm -rf "$BACKUP_DIR"
  exit "$prior_status"
}

trap 'restore_rules $?' EXIT
trap 'exit 130' INT TERM HUP
printf '[backup] original-rule-hash=%s\n' "$ORIGINAL_HASH"
run_matrix
