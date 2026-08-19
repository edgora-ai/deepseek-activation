# 黑洞渲染对比测试报告（2026-08-19）

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

## 结果

| 通道 | 条件 | 状态 | 大小 | 行数 | 吸积盘粒子 |
|---|---|---|---|---|---|
| **DSH headless** | 原生 minimal | ✅ 1/2 | 10806 B | 341 | 24000 |
| DSH headless | 重复跑 | ❌ 超时 | — | — | — |
| **Codex** | 有规则 | ✅ | 9525 B | 298 | 14000 |
| Codex | 无规则 | ✅ | 9166 B | 247 | 4200–4500 |
| **OpenCode** | 有规则 | ✅ | 11675 B | 368 | **55000** |
| OpenCode | 无规则 ×2 | ✅✅ | 8471/9342 B | 259/282 | 14000 |
| **Claude Code** | deepseek-free | ⚠️ 假失败×2 + 断流×2 | 10680 B（写出） | 297 | — |

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

## 附录：假失败的复现

```bash
# Claude Code（deepseek-free，黑洞任务）
claude -p "Create /tmp/bh-cc/blackhole.html: 3D black hole ..."
# → stderr: [claude-code:unrecognized_model] (标题生成)
# → 文件已写出 /tmp/bh-cc/blackhole.html
# → stdout: "Execution error" + exit 124 (假失败)
```