# 已知限制

诚实记录本仓库**不能**做什么（以及为什么）。

## 1. anchored 工具面锚定不可移植

dsh-anchored-standard 的"首轮 minimal 工具面 → We need 轨迹"依赖 DSH 的**按会话预设控制工具 schema**。三客户端：

| 客户端 | 限制工具方式 | 是否隐藏 schema |
|---|---|---|
| Claude Code | `--allowedTools` / `disabledTools` | ❌ 只拦执行，**schema 仍可见** |
| Codex | 无 | ❌ |
| OpenCode | 无 | ❌ |

实测（Claude Code `--allowedTools "Bash,Edit"`）：轨迹仍是 "Let me"，**无 We need 锚定**。

## 2. let's/let me 分布不可稳定控制

"先深度规划"提示词能**放大 thinking**（稳定），但 let's/let me 分布**漂移**（不稳定）：

| 实验 | let's | let me |
|---|---|---|
| opencode + 规划提示 | 7 | 28 |
| Claude Code + 规划提示 | 1 | 33 |

**不是提示词可控**——受客户端系统提示/协议影响。

## 3. OpenCode 自带 free 模型限流

`opencode/deepseek-v4-flash-free`（opencode 免费中转）有**速率限制**（实测 "Rate limit exceeded"），时好时坏。这是 opencode 服务端配额，不是本仓库问题。等待几分钟通常恢复。

## 4. Claude Code 复杂任务超时

deepseek-free 生成超长输出（如完整 3D 游戏单文件）时，`claude -p` 可能 "Execution error"（流中断）。**建议拆分任务**。

## 5. 本仓库不涵盖

- 模型权重/微调（纯推理时配置）
- 工具 schema 级控制（DSH 专属）
- OpenAI 官方 / Codex 订阅专用提示词（那是另一模型系）