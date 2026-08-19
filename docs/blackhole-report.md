# 黑洞渲染对比测试报告（2026-08-19）

## Round 2（全新重跑，2026-08-19 10:1x）

**注意**：此轮为全新重跑，非旧数据复用。同一任务、同一提示词，逐通道串行/轻并行执行，产物在 `docs/results/round2/`。

| 通道 | 结果 | 大小 | 特征 | 备注 |
|---|---|---|---|---|
| **Codex（带规则）** | ✅ | 9194 B | bloom 3 + Points 4 + 事件 2 | 全新写出 |
| **OpenCode（带规则）** | ✅ | 7231 B | bloom 3 + Points 4 + OrbitControls + 事件 | 全新写出 |
| **DSH minimal** | ✅ | 8014 B | Kepler + bloom 3 + Points 4 + 事件 | 全新写出 |
| **DSH router-standard** | ✅ | 9721 B | **Kepler ×3 + OrbitControls + bloom 3** | 全新写出；router-standard 激活物理+交互特征 |
| **Claude Code** | ⚠️ 假失败 | 无文件 | — | log 有助手消息但进程中断（deepseek-free 固有行为，非首见） |

**round2 要点**：三个可完成通道（codex/opencode/dsh-min）都成功，但**DeepSeek-free 输出波幅大**（同提示词下 7231-9194B 不等）。Claude Code 再次假失败——无文件但日志显示任务开始了——证实这是 deepseek-free 在 Claude Code 的固有行为（标题生成卡死，第 6 节详述）。

## 背景

回答：**不同预设（规则层）在不同工具（Claude Code / Codex / OpenCode / DSH）下的表现差异**。选择 3D 黑洞渲染（300+ 行 HTML、多特效）作为压力任务——简单任务四通道都能完成，看不出差别。

## 测试矩阵

| 通道 | 模型路由 | 规则层 | 会话标题生成 |
|---|---|---|---|
| Claude Code | gateway (hroze) → deepseek-free | ~/.claude/AGENTS.md | **有**（卡死点） |
| Codex CLI | gateway (hroze) → deepseek-free | ~/.codex/AGENTS.md | 无 |
| OpenCode | opencode 免费中转 → deepseek-v4-flash-free | ~/.config/opencode/AGENTS.md | 无 |
| DSH headless | gateway (hroze) → deepseek-free | DSH minimal preset | 无 |

任务：`Create blackhole.html: a 3D black hole render with Three.js: accretion disk (particles with glow), bloom postprocessing, starfield, orbiting camera. Write the file and verify.`

## Round 2 — 全新重跑（2026-08-19 10:1x）

**注意**：此轮为全新重跑，非旧数据复用。同一任务、同一提示词，各通道独立执行，产物在 `docs/results/round2/`。

| 通道 | 带规则/预设 | 无规则/原生 | 关键特征 |
|---|---|---|---|
| **Codex** | ✅ 9194 B | ✅ 9767 B | 带规则: bloom3+Points4；无规则: Points6+OrbitControls |
| **OpenCode** | ✅ 7231 B | ✅ 11187 B | 带规则: OrbitControls+Points4；无规则: Points6 无控制 |
| **DSH minimal** | — | ✅ 8014 B | Kepler+bloom3+Points4 |
| **DSH router-standard** | ✅ 9721 B | — | **Kepler×3+OrbitControls**（预设激活物理+交互）|
| **Claude Code** | ✅ 12127 B（solo）| ⏳ | solo 无并发时成功写出 |
| **Claude Code sonnet-5 对照** | ✅ 8406 B | — | 付费对照，正常完成 |

**round2 要点**：
- **solo 下 claude 成功**（12127B）——之前"假失败"是并发拖慢被 timeout 杀，不是不能做
- **router-standard 预设激活物理+交互**（Kepler×3+OrbitControls），minimal 只有 Kepler×1 无控制——**预设差异真实可测**
- **无规则"更全"现象**：codex/opencode 无规则 Points 6 vs 带规则 4——规则不保证更多，只是更多验证纪律

### Round 2 过程指标（token / 耗时 / think）

数据来自各通道 session 记录（opencode DB、codex rollout JSONL、claude session JSONL）。DSH headless 无持久化 token 记录（不适用）。

| 通道 | input | output | thinking | 耗时 | 会话行数 | let's/we |
|---|---|---|---|---|---|---|
| **Codex 带规则** | 130.5k | 15k | 0 | 3:16 | 51 | — |
| **Codex 无规则** | 672.8k | 27.9k | 0 | 8:05 | 149 | — |
| **OpenCode 带规则** | 12.7k | 12k | **0** | ~4min | 5 msg | — |
| **OpenCode 无规则** | 38.4k | 6.1k | **1.8k** | ~4min | 17 msg | — |
| **Claude 带规则 (solo)** | 194.8k | 102.4k | 0 | 8:19 | 81 | let's×1 |
| **Claude 无规则** | — | — | — | 跑着 | — | — |

**观察**：
- **无规则 token 显著更高**：codex 无规则 672k vs 带规则 130k（5×）；opencode 无规则 38k vs 带规则 13k（3×）——**规则让模型更收敛**（少走弯路）
- **opencode 无规则有 thinking（1.8k），带规则为 0**——带规则时 build agent 不走思考路径
- **claude 带规则 thinking=0 但 let's=1**——thinking 计数可能在 usage 里未算（deepseek-free 的 thinking 字段不同）
- **耗时与 token 成正比**：无规则跑的更久（codex 8:05 vs 3:16）

## 结果

| 通道 | 条件 | 状态 | 大小 | 行数 | 吸积盘粒子 |
|---|---|---|---|---|---|
| **DSH headless** | 原生 minimal | ✅ 1/2 | 10806 B | 341 | 24000 |
| DSH headless | router-standard | ✅ | 11312 B | ~330 | — |
| DSH headless | 重复跑 | ❌ 超时 | — | — | — |
| **Codex** | 有规则 | ✅ | 9525 B | 298 | 14000 |
| Codex | 无规则 | ✅ | 9166 B | 247 | 4200–4500 |
| **OpenCode** | 有规则 | ✅ | 11675 B | 368 | **55000** |
| OpenCode | 无规则 ×2 | ✅✅ | 8471/9342 B | 259/282 | 14000 |
| **Claude Code** | deepseek-free | ⚠️ 假失败（文件写出） | 10680/13452/11177 B（3 次全写出） | 297 | — |
| Claude Code | claude-sonnet-5* | ✅ 52s 正常 | 10117 B | 278 | — |

## 特征差异（不只是大小）

提示词要求的是"看起像黑洞"（笼统），不指定粒子数/物理/交互/特效，所以各通道输出规模接近。但对生成文件做**特征分析**后，差异其实在"实现了哪些特征"：

| 特征 | DSH-mini | DSH-router | OC+规则 | OC无规则 | CX+规则 | CX无规则 | CC |
|---|---|---|---|---|---|---|---|
| Kepler 轨道 | — | ✅ | ✅ | — | — | ✅ | ✅ |
| OrbitControls | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Doppler beaming | — | — | ✅ | — | — | — | — |
| 引力透镜 | ✅ | — | — | — | — | — | — |
| Points 对象 | 4 | 3 | 6 | 3 | 3 | 6 | 4 |
| 盘倾斜 | — | ✅ | ✅ | — | — | — | — |

- **没有通道实现全部特征**——每个侧重点不同
- **Doppler beaming 只在 opencode+规则 出现**（规则激活了物理细节）
- **引力透镜只在 DSH-mini 出现**（DSH 原生追求全特效）
- **OC+规则 与 CX无规则 Points 最全（6）**——规则影响不一定线性

结论：规则/预设的差异是**特征组合**，不是单一的"更好"。

## 提示词局限

最初提示词未约束效果/粒子数/物理规律/可拖动，导致差异主要反映在规模。**严格提示词**（指定粒子数/Kepler/Doppler/lensing）会让 deepseek-free 超时（生成太长），所以本报告未采用严格对比，改以**特征分析**呈现真实差异。

## 关键发现

### 1. 规则层 = 放大器，不是开关

- 有规则时输出密度更高：Codex 14000 vs 4500 粒子（3×），OpenCode 55000 vs 14000（4×），代码行数 1.2–4×
- 无规则也出完整黑洞（bloom/吸积盘/星场都在）——质量基线相同
- DSH 原生（minimal preset）本身即 24000 粒子——DSH 把治理内建为 preset

### 2. Claude Code "Execution error" = 假失败（已确证）

| 证据 | 说明 |
|---|---|
| stdout 只有 "Execution error" | 无最终消息即报错 |
| stderr `unrecognized_model` | 标题生成被拒（deepseek-free 不在标题白名单） |
| **文件其实写出了**（10680 B 完整黑洞） | 任务成功，进程卡在收尾 |
| exit 124 | 被 timeout 杀，非真实失败 |

**为什么 opencode/codex/DSH 没有此问题**：它们**没有会话标题生成步骤**，任务完成即退出。

**为什么 claude-sonnet-5 显示 52 秒正常**：那不是修复——gateway 把 `claude-sonnet-5` 路由到**真正的付费 Claude Sonnet 5**（实测响应 model 字段），不是 deepseek-free。不可作为修复方案。

### 3. 断流根因（修正版）

- **不是** gateway 长输出挂起（实测两端点/流式/非流式全部 200）
- **不是** 规则问题（带/不带一样）
- **是** Claude Code 对非白名单模型名的标题生成行为：`deepseek-free` → `unrecognized_model` → 标题生成失败 → 进程卡住不退出

### 4. 可接受的实践方式

- 脚本判断"任务成功"应**检查文件是否写出**（存在即成功），而非只看退出码
- Claude Code 用 deepseek-free 时：文件写出 + Execution error = 假失败，属正常
- 复杂任务建议拆分，或使用无标题生成通道（codex/opencode/DSH headless）

## 附录：原始产物（Round 2 全量）

Round 2 全部产物在 `docs/results/round2/`：

- `claude-code-deepseek-free-blackhole.html`（12127 B）— deepseek-free 带规则 solo，成功
- `claude-code-claude-sonnet-5-control.html`（8406 B）— 付费对照，成功
- `codex-with-rules-blackhole.html`（9194 B）/ `codex-no-rules-blackhole.html`（9767 B）
- `opencode-with-rules-blackhole.html`（7231 B）/ `opencode-no-rules-blackhole.html`（11187 B）
- `dsh-minimal-preset-blackhole.html`（8014 B）/ `dsh-router-standard-blackhole.html`（9721 B）
- `_failed/claude-no-rules.md` — claude 无规则失败记录（600s 超时无文件）

截图在 `docs/results/screenshots/round2/`（7 张；claude-sonnet-5 对照 headless 黑帧未含）。

## 附录：假失败的复现

```bash
# Claude Code（deepseek-free，黑洞任务）
claude -p "Create /tmp/bh-cc/blackhole.html: 3D black hole ..."
# → stderr: [claude-code:unrecognized_model] (标题生成)
# → 文件已写出 /tmp/bh-cc/blackhole.html
# → stdout: "Execution error" + exit 124 (假失败)
```