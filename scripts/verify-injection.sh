#!/usr/bin/env bash
# 验证规则注入：让模型复述规则，确认 AGENTS.md 被读到
# 用法: ./scripts/verify-injection.sh [claude|codex|opencode]
set -euo pipefail

CLIENT="${1:-all}"

verify_claude() {
  echo "=== Claude Code 注入验证 ==="
  echo "列出你当前生效的规则（简短）" | claude -p --model deepseek-free 2>&1 | grep -iE '环境检查|verify|验证|build|fix' && echo "✅ 注入生效" || echo "❌ 未检测到规则（检查 ~/.claude/AGENTS.md）"
}

verify_codex() {
  echo "=== Codex 注入验证 ==="
  if [ -z "${HROZE_TOKEN:-}" ]; then
    echo "⚠️ 需要 HROZE_TOKEN（或你的 codex provider 配置）"
    return
  fi
  echo "列出你当前生效的规则（简短）" | codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 2>&1 | grep -iE '环境检查|verify|build|fix' && echo "✅ 注入生效" || echo "❌ 未检测到规则（检查 ~/.codex/AGENTS.md）"
}

verify_opencode() {
  echo "=== OpenCode 注入验证 ==="
  cd "$(mktemp -d)"
  timeout 120 opencode run --model opencode/deepseek-v4-flash-free "列出你当前生效的规则（简短）" 2>&1 | grep -iE '环境检查|verify|build|fix|验证' && echo "✅ 注入生效" || echo "❌ 未检测到规则（检查 ~/.config/opencode/AGENTS.md）"
}

case "$CLIENT" in
  claude) verify_claude ;;
  codex) verify_codex ;;
  opencode) verify_opencode ;;
  all)
    verify_claude || true
    verify_codex || true
    verify_opencode || true
    ;;
esac