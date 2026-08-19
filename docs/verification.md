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

## 结论
- **三客户端规则注入 + 行为遵循全部通过**
- 验证纪律（规则 3）被一致遵守
- build/fix 分类（规则 1）：Codex 最遵守，其他部分

## 复现方法
```bash
./install.sh --all
./scripts/verify-injection.sh
./scripts/verify-behavior.sh
```