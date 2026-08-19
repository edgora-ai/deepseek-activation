# DeepSeek Activation — DeepSeek 潜能激活指南

在 **Claude Code / Codex / OpenCode** 三个 CLI 中激活 DeepSeek 模型（deepseek-free / v4-flash / v4-flash-free）潜能的**可移植配置仓库**。

基于社区研究（[dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) / [J-Space Cognition Suite V3.6](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6) / [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)）的方法论，**实际落地并验证**。

## 原理（三句话）

1. **轨迹（trajectory）** = 模型首条思维链的风格——由**首轮工具 schema + 上下文注入**决定（anchored-standard 实测）。
2. **分层 persona** = 模型不同（Pro/Flash）用不同提示词策略（routing-suite 实测 +5.0/+5.7 区分度）。
3. **工作空间治理** = 模式路由（fast/full/loop）+ 第一人称控制语法 + 验证/恢复（J-Space 实测效率 2.53×）。

**本仓库落地的是"规则层"机制**（第 2、3 条，三客户端可移植）；"工具 schema 锚定"（第 1 条）因三客户端工具面固定而不可移植（详见 [docs/limitations.md](docs/limitations.md)）。

## 快速开始（30 秒）

```bash
# 一键安装（三客户端全部配置）
./scripts/install.sh

# 或单客户端
./scripts/install.sh --claude
./scripts/install.sh --codex
./scripts/install.sh --opencode
```

安装后**新开会话**即生效（无需重启客户端）。

## 目录

```
deepseek-activation/
├── README.md              # 本文件
├── install.sh             # 一键安装（复制配置到各客户端）
├── claude-code/
│   └── AGENTS.md          # Claude Code 规则（→ ~/.claude/AGENTS.md）
├── codex/
│   └── AGENTS.md          # Codex 规则（→ ~/.codex/AGENTS.md）
├── opencode/
│   └── AGENTS.md          # OpenCode 规则（→ ~/.config/opencode/AGENTS.md）
├── scripts/
│   ├── verify-injection.sh  # 验证规则是否注入（marker 测试）
│   └── verify-behavior.sh   # 验证行为遵循（标准任务测试）
└── docs/
    ├── principles.md      # 原理详解（社区研究 + 实验）
    ├── limitations.md     # 已知限制（anchored 不可移植等）
    └── faq.md             # 常见问题（限流、注入失败等）
```

## 验证（不要假设，跑一下）

安装后：

```bash
./scripts/verify-injection.sh   # 让模型复述规则 → 确认注入
./scripts/verify-behavior.sh    # 跑标准任务 → 确认遵循
```

实测结果（2026-08-19）：
| 客户端 | 注入 | 行为遵循 |
|---|---|---|
| Claude Code | ✅ | ✅ verify 17 次 |
| Codex | ✅ | ✅ build 分类 + verify 8 |
| OpenCode | ✅ | ✅ 测试通过 |

详见 [docs/verification.md](docs/verification.md)。

## 原理细节

- [原理详解](docs/principles.md)
- [已知限制](docs/limitations.md)
- [常见问题](docs/faq.md)