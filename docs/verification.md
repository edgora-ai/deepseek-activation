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

## 复杂任务对比（3D 黑洞渲染，n=3 per client）

任务：`Create blackhole.html: 3D black hole render with Three.js: accretion disk (particles with glow), bloom postprocessing, starfield, orbiting camera.`

### Codex

| 条件 | 成功 | 代码行 | 吸积盘粒子 | 验证行为 |
|---|---|---|---|---|
| 有规则 | ✅ | 298 | 14000 | 写文件 + 尝试无头截图 |
| 无规则 | ✅ | 247 | 4500/4200 | 起 http.server + curl + node verify |

### OpenCode（自带 free 中转）

| 条件 | 成功 | 代码行 | 吸积盘粒子 | 验证行为 |
|---|---|---|---|---|
| 有规则 | ✅ | 368 | **55000** | 写文件 + 本地验证 |
| 无规则 | ✅ | 259-282 | 14000 | 写文件 + 本地验证 |

### Claude Code

| 条件 | 成功 | 备注 |
|---|---|---|
| 有/无规则 | ❌ 4 次 1 成 3 断流 | "Execution error" 流中断；带规则重试也会失败 |

## 结论

- **规则 = 放大器，不是开关**：有规则时粒子/代码更大（14000 vs 4500；55000 vs 14000），但无规则也出 bloom/黑洞——质量基线相同
- **补一句最诚实的**：规则把"验证"纪律变成默认行为（codex 无规则时也保留了 curl/测试验证，因为它自己的系统提示已经要求验证）——规则收益是**密度/颗粒度**，不是"有/无"
- **Claude Code 断流与规则无关**：复杂任务多次带规则/不带规则都失败，是 deepseek-free 长输出流中断
- **受客户端影响**: codex/opencode 稳定，Claude Code 超长任务不稳定

## 复现方法

```bash
./install.sh --all
./scripts/verify-injection.sh
./scripts/verify-behavior.sh
```