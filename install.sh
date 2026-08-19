#!/usr/bin/env bash
# DeepSeek Activation 一键安装
# 用法: ./install.sh [--claude|--codex|--opencode|--all]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_claude() {
  mkdir -p "$HOME/.claude"
  cp "$REPO_DIR/claude-code/AGENTS.md" "$HOME/.claude/AGENTS.md"
  echo "✅ Claude Code: ~/.claude/AGENTS.md"
}

install_codex() {
  mkdir -p "$HOME/.codex"
  cp "$REPO_DIR/codex/AGENTS.md" "$HOME/.codex/AGENTS.md"
  echo "✅ Codex: ~/.codex/AGENTS.md"
}

install_opencode() {
  mkdir -p "$HOME/.config/opencode"
  cp "$REPO_DIR/opencode/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"
  echo "✅ OpenCode: ~/.config/opencode/AGENTS.md"
}

case "${1:---all}" in
  --claude) install_claude ;;
  --codex) install_codex ;;
  --opencode) install_opencode ;;
  --all)
    install_claude
    install_codex
    install_opencode
    ;;
  *)
    echo "用法: ./install.sh [--claude|--codex|--opencode|--all]"
    exit 1
    ;;
esac

echo ""
echo "安装完成。规则会在新会话生效（无需重启客户端）。"
echo "验证: ./scripts/verify-injection.sh"