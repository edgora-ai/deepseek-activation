#!/usr/bin/env bash
# 验证行为遵循：跑标准任务（写文件+验证），确认规则生效
# 用法: ./scripts/verify-behavior.sh [claude|codex|opencode]
set -euo pipefail

CLIENT="${1:-all}"
WORKDIR="$(mktemp -d)"

test_claude() {
  echo "=== Claude Code 行为验证 ==="
  cd "$WORKDIR"
  echo "创建 $WORKDIR/helper.js，含 throttle 和 once 函数。写文件后用 node 验证。" \
    | claude -p --model deepseek-free 2>&1 \
    | grep -qiE 'test|verify|passed|✓' && echo "✅ 行为遵循（验证步骤出现）" || echo "❌ 未见验证（检查规则）"
}

test_codex() {
  echo "=== Codex 行为验证 ==="
  cd "$WORKDIR"
  if [ -z "${HROZE_TOKEN:-}" ]; then
    echo "⚠️ 需要 HROZE_TOKEN"
    return
  fi
  echo "创建 $WORKDIR/helper.js，含 throttle 和 once 函数。写文件后用 node 验证。" \
    | codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 2>&1 \
    | grep -qiE 'test|verify|passed|✓' && echo "✅ 行为遵循" || echo "❌ 未见验证"
}

test_opencode() {
  echo "=== OpenCode 行为验证 ==="
  cd "$WORKDIR"
  timeout 180 opencode run --model opencode/deepseek-v4-flash-free \
    "创建 $WORKDIR/helper.js，含 throttle 和 once 函数。写文件后用 node 验证。" 2>&1 \
    | grep -qiE 'test|verify|passed|✓' && echo "✅ 行为遵循" || echo "❌ 未见验证"
}

case "$CLIENT" in
  claude) test_claude ;;
  codex) test_codex ;;
  opencode) test_opencode ;;
  all)
    test_claude || true
    test_codex || true
    test_opencode || true
    ;;
esac

rm -rf "$WORKDIR"