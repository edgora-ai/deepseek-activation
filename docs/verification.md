# 验证记录（2026-08-19 真实执行）

## 环境

- 模型: deepseek-free / deepseek-v4-flash-free（同一模型，网关/自有渠道）
- 时间: 2026-08-19

## 注入验证（规则被读到）

### OpenCode（marker 测试）
让模型回答"当前生效规则"，完整复述：
```
- No environment checks (echo/whoami/uname/date)
- Verify after each step
- Retry once after failure, then switch approach
- Think deeply before producing
```
→ **注入生效** ✅

## 行为验证（规则被遵守）

### 标准任务：写 helper.js（throttle/once）+ node 验证

| 客户端 | 模型 | 结果 | 遵循证据 |
|---|---|---|---|
| Claude Code | deepseek-free | ✅ 文件+验证 | thinking 中 verify/check 17 次 |
| Codex | deepseek-free | ✅ 文件+验证 | "This is a build task"（分类）+ verify 8 |
| OpenCode | deepseek-v4-flash-free | ✅ 文件+测试通过 | "ALL TESTS PASSED" |

## 复杂任务对比（3D 黑洞渲染）

任务：`Create blackhole.html: 3D black hole render with Three.js: accretion disk (particles with glow), bloom postprocessing, starfield, orbiting camera.`

### DSH 原生（headless profile，minimal preset，无规则层）

| 运行 | 结果 | 代码行 | 吸积盘粒子 | 备注 |
|---|---|---|---|---|
| 1 | ✅ | 341 | 24000 | 10806b，bloom+CanvasTexture+Clock |
| 2 | ❌ | — | — | 超时无文件（deepseek-free 长任务断流） |

### Codex CLI

| 条件 | 结果 | 代码行 | 吸积盘粒子 | 验证行为 |
|---|---|---|---|---|
| 有规则 | ✅ | 298 | 14000 | 写文件 + 尝试无头截图 |
| 无规则 | ✅ | 247 | 4500/4200 | 起 http.server + curl + node verify |

### OpenCode（自带 free 中转）

| 条件 | 结果 | 代码行 | 吸积盘粒子 | 验证行为 |
|---|---|---|---|---|
| 有规则 | ✅ | 368 | **55000** | 写文件 + 本地验证 |
| 无规则 | ✅ | 259-282 | 14000 | 写文件 + 本地验证 |
| 无规则 | ✅ | 282 | 14000 | 写文件 + 本地验证 |

### Claude Code

| 条件 | 结果 | 备注 |
|---|---|---|
| deepseek-free | ⚠️ 假失败（文件写出 + Execution error） | 任务实际成功；进程卡在标题生成（unrecognized_model）→ timeout 杀 → 误报 |
| claude-sonnet-5* | ✅ 52s 正常 | *.gateway 路由到真正付费 Claude Sonnet，非修复方案 |

## 四通道对比结论

| 通道 | 带规则 | 无规则/原生 | 粒子差 | 代码差 |
|---|---|---|---|---|
| DSH 原生 | — | ✅ 24000（1/2 成功） | — | 341L |
| Codex | ✅ 14000 | ✅ 4500 | 3× | 298 vs 247L |
| OpenCode | ✅ 55000 | ✅ 14000 | 4× | 368 vs 259L |
| Claude Code | ❌ | ❌ | — | — |

**核心发现**：
- **规则 = 放大器，不是开关**：有规则时粒子/代码更大（3-4×），但无规则也出 bloom/黑洞——质量基线相同
- **DSH 原生（minimal preset）本身即可 24000 粒子**——比两个 CLI 无规则更强，但跟 opencode 有规则（55000）仍有差距
- **所有通道都随机波动**：DSH 1/2、Claude Code 1/4 成功率——是 deepseek-free 长输出断流，与规则无关
- **DSH 的价值**：原生 preset 已内建治理（minimal/standard/router 预设），CLI 需要自己注入 AGENTS.md 才有等价物

## 复现方法

```bash
./install.sh --all
./scripts/verify-injection.sh
./scripts/verify-behavior.sh
```