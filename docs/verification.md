# 验证记录：探索轮次与 v2 机器复核

## 证据等级

本仓库现在区分三类证据：

1. **注入证据**：模型能复述 `AGENTS.md`，只证明规则文本被客户端读取。
2. **探索产物**：单次生成的 HTML、日志和截图，可发现行为差异与失败模式，但不能证明稳定优化。
3. **受控验收**：固定 prompt/fixture、独立 session、重复运行、浏览器 runtime 与功能断言、唯一 usage 归属，才用于候选规则推广决策。

thinking 文本出现 `verify/check`、CLI 退出码为 0、文件存在、代码行数或粒子数均不能单独证明功能成功。

## 2026-08-19 注入观察

模型曾在 OpenCode marker 测试中复述以下规则：

```text
- No environment checks (echo/whoami/uname/date)
- Verify after each step
- Retry once after failure, then switch approach
- Think deeply before producing
```

这证明当时的 OpenCode 会话读取了规则，不证明这些规则提高质量或效率。旧 helper.js 任务中出现 “build”“verify” 或 “ALL TESTS PASSED” 同样只能作为轨迹观察；当前 [`scripts/verify-behavior.sh`](../scripts/verify-behavior.sh) 改为独立检查目标 HTML 的语法、浏览器 runtime 和点击行为。

## 2026-08-20 历史 corpus 客观审计

命令：

```bash
node eval/audit-existing.mjs
node eval/report-audit.mjs
```

48 份历史 HTML 的结果：

| 指标 | 通过 |
|---|---:|
| 目标文件存在 | 48/48 |
| inline JavaScript 语法 | 47/48 |
| 浏览器 runtime clean | 34/48 |
| 任务合同全部满足 | 30/48 |
| 交互产生可观察变化 | 46/48 |
| 截图像素 sanity | 47/48 |
| **full pass** | **25/48** |

按用例：

| 用例 | full pass | runtime clean |
|---|---:|---:|
| 黑洞 | 3/8 | 6/8 |
| 直升机 | 4/8 | 7/8 |
| SVG 赛跑 | 5/8 | 5/8 |
| 仪表盘 | 2/8 | 3/8 |
| 太空射击 | 5/8 | 7/8 |
| 音乐可视化 | 6/8 | 6/8 |

审计稳定检出两个此前被当作成功的硬失败：

- `docs/results/n2/dash-claude-norules.html` 调用未定义的 `renderAll()`，并以占位实现结束。
- `docs/results/helo/claude-deepseek-free-with-rules.html` 在同一作用域重复声明 `collective`，无法通过 JavaScript 解析。

另一个关键失败是 `docs/results/round2/dsh-router-standard-blackhole.html` 的 WebGL shader 校验错误。它满足静态黑洞合同并有非空截图，但不属于 runtime-clean completion。

完整行级结果：

- [`results/eval-v2/audit/artifact-scores.json`](results/eval-v2/audit/artifact-scores.json)
- [`results/eval-v2/audit/artifact-scores.csv`](results/eval-v2/audit/artifact-scores.csv)
- [`results/eval-v2/audit/comparisons.md`](results/eval-v2/audit/comparisons.md)
- `results/eval-v2/audit/screenshots/` 中的 48 张固定 viewport 截图

历史目录原有 42 张截图；v2 不覆盖它们，而是为全部 48 份产物重新截图。

## 历史配对能说明什么

同客户端、同任务的单次历史配对结果：

| 对比 | 基线 full pass | 测试变体 full pass | 方向 |
|---|---:|---:|---|
| Claude no-rules → current | 2/5 | 3/5 | +1，但直升机回退 |
| Codex no-rules → current | 4/6 | 3/6 | -1 |
| OpenCode no-rules → current | 2/6 | 1/6 | -1 |
| DSH minimal → router-standard | 4/6 | 5/6 | +1，但黑洞回退 |

这些样本证明规则/preset 会改变结果，也证明方向依客户端和任务而变化。它们没有重复运行、可靠的独立 token 归属或统一网关条件，所以不能证明可重复优化，也不能用于跨客户端绝对排名。

## v2 受控 A/B

固定矩阵为两个任务 × 三个规则变体 × 三次独立 session，共 18 次 OpenCode 运行：

- `build-dashboard`：测试 build 路径的最小可用产物和完整验收。
- `fix-dashboard`：从含 5 个确定性缺陷的 fixture 开始，要求先检查/复现再做针对性修复。
- 变体：`no-rules`、`current`、`candidate-v2`。
- 顺序：三轮循环轮换，降低固定顺序和时段偏差。

每个 run 保存 prompt 与哈希、规则哈希、fixture/产物哈希、退出状态、时长、stdout/stderr、runtime 异常、合同与交互断言、截图以及唯一归属的 OpenCode session usage。fix 任务还要求最终产物哈希发生变化。归属不唯一的 token 字段保持 `null`。

正式矩阵已完成 18/18：current 与 no-rules 均为 6/6 full pass，current 的六次 token 中位数比 no-rules 低约 18.8%，通过受控范围内的优化门槛；candidate-v2 为 5/6，build R3 出现真实 runtime 回退，因此不安装、不推广。完整任务级数据、SQLite 验证和适用范围见 [`evaluation-v2.md`](evaluation-v2.md)，机器汇总见 [`results/eval-v2/ab-summary.md`](results/eval-v2/ab-summary.md)。

## 复现入口

```bash
./install.sh --all
./scripts/verify-injection.sh        # 仅验证规则注入
./scripts/verify-behavior.sh         # 生成并独立验证最小交互产物
node eval/audit-existing.mjs         # 重审 48 份历史产物
node eval/report-audit.mjs           # 生成历史配对描述
scripts/eval.sh --dry-run            # 查看 18-run 顺序
scripts/eval.sh --parallel-cases     # 同处理组 build/fix 并行，处理组间 barrier
node eval/recheck-infrastructure.mjs --expect 18
node eval/recheck-execution.mjs --expect 18
node eval/recheck-runs.mjs --expect 18
node eval/verify-usage.mjs --expect 18
node eval/report.mjs                 # 生成 A/B 汇总与推广判定
```
