# 原理详解

本仓库的规则设计源自三个 DSH 社区研究成果的移植。以下说明"为什么这些规则有效"。

## 1. 轨迹（Trajectory）理论 — dsh-anchored-standard

**核心发现**：模型的**首条思维链风格**（"We need…" vs "Let me…"）由**首轮可见工具 schema + 上下文注入**决定，与模型能力无关。

| 条件 | 首行轨迹 |
|---|---|
| Minimal 工具面（bash + str_replace_editor）+ 无注入 | **"We need…"**（协作迭代）|
| Standard 工具面 + 注入 | **"Let me…"**（个人执行）|
| 有 AGENTS.md 摘要/技能提醒 | 锚定完全失效（0/9）|

**对本仓库的意义**：三客户端（Claude Code/Codex/OpenCode）工具 schema 固定，**无法复现工具面锚定**——但**上下文注入可控制**（犯错时先查 AGENTS.md 是否被干扰）。这也是"验证注入"脚本存在的理由。

## 2. 分层 Persona — dsh-routing-suite

按模型能力分层设计提示词（P1-P23 实测）：

| 模型 | 最佳 persona | 区分度增益 |
|---|---|---|
| Pro | spec 句 + few-shot | +5.0 |
| Flash | neutral + classify（build/fix 自分类）| +5.7 |

**rules 1（build/fix 分类）就是 Flash 最优 persona 的核心**：让模型先分类任务（build→动手、fix→先读后改），实测把开放任务完成率从 0% 提到 100%。

## 3. 工作空间治理 — J-Space Cognition Suite V3.6

推理时治理协议（不动权重），DeepSeek V4-Flash 实测：

| 指标 | 基线 | +J-Space |
|---|---|---|
| 效率（分数/时间）| 0.43 | 1.09（**2.53×**）|
| token 成本（token/分数）| 2.63 | 1.19（**2.21×** 降）|
| HLE（无工具）| 37.8 | 45.5 |

**核心机制**（仓库规则实现了其中 4 条）：
- **模式路由**：fast（一步）/ full（多步计划）/ loop（账本+验证+恢复）→ rules 开头"按复杂度选模式"
- **验证纪律**：每步行动后验证 → rules 3
- **失败恢复**：失败命名 → 重试一次 → 换方案 → rules 4
- **控制语法**：第一人称绑定状态到动作（we/let's）→ rules 5 的"Think deeply first"配套

## 4. 为什么不提示"先深度规划"就有效？（实验教训）

实测（2026-08-19）：
- "先深度规划"提示词 → thinking 放大 15-30 倍（3K → 49-94K），产出更精致，但**慢 3-5 倍 + 易超时**
- **但 let's/let me 分布不稳定**（opencode 7/28 vs Claude Code 1/33）——**不是提示词可控**
- **可靠收益来自规则层**（验证/分类/模式路由），不是措辞

**结论**：规则层（本仓库）是稳定可移植的；措辞层（let's 激活）不可靠。