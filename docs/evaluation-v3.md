# 免费模型评测：Claude Code × 5 模型 × 6 任务（2026-08-21）

## 背景

- deepseek-free 下线后，评测目标改为：**同一客户端（Claude Code）下 5 个免费模型的差异**。
- 5 模型：`nv3`（nemotron-3-ultra-free）、`hy3`（hy3-free）、`mino-free`（mimo-v2.5-free）、`muse-free`（muse-spark-1.2-contributor-free）、`opencode-free`（ox-alpha-free）。
- 6 任务：blackhole / helicopter / race / game / music / dashboard（单文件 HTML，浏览器验收）。
- 评测方法 v6：语法 + 浏览器 runtime + 合同 + 交互 + 像素 sanity + gpt-5.6 视觉判定。

## 最终结果（含多轮补跑与修复）

| 模型 | Full pass | 真实文件 | 产物 | 主要差距 |
|---|---:|---:|---:|---|
| muse-free | **6/6** | 6/6 | 1456 KB | 全过（race/music 曾因写错路径被误判，恢复后 7/7） |
| hy3 | 4/6 | 6/6 | 789 KB | blackhole 5/6、game 7/8 |
| opencode-free | 4/6 | 6/6 | 1374 KB | helicopter 修复后 7/7；game 修复后 7/8 |
| mino-free | 3/6 | 6/6 | 107 KB | 质量偏低（blackhole 6/6 但浏览器报错） |
| nv3 | 1/6 | 2/6 | 37 KB | 5 个任务 0 次 Write 调用（假完成） |

## 关键发现

1. **DSH 工具调用缺陷（已确认是 DSH 自身 bug）**：同一 gateway 下 Claude Code 能正常调用工具，直连 gateway 实验也证明模型会返回 `tool_use`；只有 DSH 的 headless/pi-ai 链路不执行工具循环，模型"自报完成"但文件不存在。
2. **"假完成"是评测器必须抓的信号**：nv3 类模型只输出"计划/描述"文本作为最终回答，Claude Code `-p` 把它当任务完成。评测器检查文件真实存在性才能识别。
3. **模型写错路径（muse-free 的 race/music）**：模型真实调用 Write 写了文件，但写到 `/home/ubuntu/artifact.html` 而非 runDir。从 session JSONL 恢复产物后评测 7/7 FULL PASS —— 这类失败不是能力问题，是环境路径语义问题。
4. **`claude -p` 的"先说后做"陷阱（opencode-free）**：模型会先输出"我计划这样修"的文本，`-p` 单轮模式将其当作最终答复而结束。prompt 加 "do NOT narrate a plan first, directly call Write" 后立即触发真实修复。
5. **修复轮验证**：opencode-free/helicopter 修复成功（诊断出 `<script>` 未闭合根因，7/7）；game 从 5/8 修到 7/8（碰撞/道具/启动按钮补上）；muse-free/blackhole 优化无退化（保持 6/6）。

## 结论与使用建议

- **主力默认：muse-free**（6/6 全过、视觉最强、修复稳定）。
- **次选：hy3 或 opencode-free**（全勤产出；opencode-free 需在交互会话中规避 `-p` 的"先说后做"截断）。
- **不推荐 nv3**（假完成率最高）。
- **评测基础设施**（`eval/`）为后续模型对比提供：浏览器验收、gpt-5.6 视觉判定、会话 JSONL 取证、路径修复。

## 数据位置

- `docs/results/eval-v5-claude-models/`：30 次基准 + 补跑 + 路径修复（models-summary.*、gallery.html、runs/）
- `docs/results/eval-v6-fix-round/`：修复轮（3 次）
- `docs/results/eval-v4-models/`：DSH 轮（假完成证据，README 说明）
- `docs/results/eval-v7-max-effort/`：max 推理强度对照轮（见下）
- 截图未入库（体积），本地可看 `runs/<model>/<task>/screenshot.png` 与 `gallery.html`。

## 附：max 推理强度对照轮（2026-08-21 晚）

通过 `CLAUDE_CODE_EFFORT_LEVEL` 注入 max（nv3→high）重跑。结果：**max 对这批免费模型是净伤害**。

| 模型 | v5 默认 | v7 max | 变化 |
|---|---:|---:|---|
| hy3 | 4/6 | 4/6（全勤 1344KB） | 持平，唯一双强度稳定者 |
| mino-free | 2/6 | 3/6（全勤） | 略升 |
| opencode-free | 4/6 | 2/6 | 高强度下计划过大被 `-p` 单轮截断 |
| muse-free | 6/6 | 0/6 | **Write 工具调用发出空参数**（会话 JSONL 取证 `Write [] {}`） |

结论：hro
## 附2：DSH 标准模式重测（协议修复后，high 强度）

根因：hroze gateway 的 anthropic-messages 流式对带 tools 的响应丢 tool_use/终止块 → DSH 换 openai-completions 协议后工具链路恢复；opencode-free 强制思考需 anthropic 协议 + effort≥low（实测 high）。

| 模型 | DSH Full (high) | Claude Code 对照 | 说明 |
|---|---:|---:|---|
| mino-free | 4/6 全勤 | 2/6 | DSH 标准模式首选 |
| hy3 | 3/6 全勤 | 4/6 | low 时曾达 5/6；强度敏感 |
| opencode-free | 1/6 | 4/6 | 流式 agentic 不稳定，4 任务假完成 |
| muse-free | 0/6 | 6/6 | gateway 对 muse 上游丢 finish_reason（子代理实验证实，流式/非流式同时缺失），能力看 CC 轮 |

数据：docs/results/eval-v8-dsh-oai/（v8-final-summary.*、report-v8-high.html、runs/）。
e 免费模型一律保持默认 effort；muse-free 只在默认强度下可用。gateway 免费池持续轮换（deepseek-free、nv3 先后下线，muse-free 间歇 400），对比结论有时效性。

数据：`docs/results/eval-v7-max-effort/models-summary-maxeffort.{json,md}`