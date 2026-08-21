# DeepSeek Activation v2 受控评测结论

## 结论

固定模型 `hroze-sp/deepseek-v4-flash`、固定 OpenCode 客户端、两个任务、三个规则处理组、每组每任务三次独立 session 的正式矩阵已完成 **18/18**。方法 5 重新评测后共有 **17/18 full pass**，18 次 usage 均由 SQLite 直接按 session ID 读回，并能按中性 title 与时间窗独立检索；18 个 session ID 互不重复，provider 基础设施失败为 **0**。

正式判定如下：

- **current vs no-rules：支持 current 优化。** 两者均为 6/6 full pass、6/6 runtime pass，合同重复均不劣；六次运行的 token 中位数从 `535,737.5` 降至 `434,971.5`，比值 `0.812`，降低约 **18.8%**，通过预先声明的 15% 效率门槛。
- **candidate-v2 vs current：不支持。** candidate-v2 为 5/6 full pass、5/6 runtime pass，低于 current 的 6/6；build R3 存在真实浏览器运行时回退。质量回退不能由 fix 路径的 token 节省抵消。
- **candidate-v2 vs no-rules：不支持。** candidate-v2 同样从 no-rules 的 6/6 回退到 5/6。虽然六次运行的总体 token 中位数较低，但它未通过无 runtime/full-pass 回退门槛。
- **candidate-v2 不安装、不推广。** `~/.config/opencode/AGENTS.md` 已恢复为 current 规则，SHA-256 为 `94b1fb18e45afcb0892078e9924b1355e0601f557ae2fd51aa322105888c4213`；candidate-v2 哈希 `2b571d81262ae7780b5314c407923b527b41e36c7d4ab9ac8cd9eb3af343e9d7` 未安装。

这里的“支持 current 优化”只适用于本次 **OpenCode × 指定模型 × build/fix 仪表盘任务**的受控范围。它不证明三个 CLI、所有任务或 DSH preset 上的普遍收益。48 份历史产物的同客户端 N=1 配对方向仍然混合。

## 完整性门槛

最终报告的 evidence complete 为 `true`，并逐项要求：

| 门槛 | 结果 |
|---|---:|
| 精确轮换的 18-run 网格 | PASS |
| 固定模型别名 | PASS |
| 两个固定 prompt 哈希 | PASS |
| 中性 session title、run path 与模型命令 | PASS |
| current/candidate 精确规则哈希，no-rules 为 absent | PASS |
| 评测方法 5 | PASS |
| 基础设施分类方法 2 | PASS |
| provider 基础设施失败为 0 | PASS |
| execution mode / concurrency group 注释有效 | PASS |
| 18 个独立、正数、可归属 SQLite session | PASS |

报告生成器还对九种破坏性 metadata 变体执行自检：错误模型、prompt 哈希、模型命令、规则哈希、评测方法、基础设施方法、usage 目录、重复 session ID 和 execution annotation 均必须使 evidence complete 变为 false。

固定输入：

```text
model: hroze-sp/deepseek-v4-flash
build prompt: 6aa490f957bb8189c15b056a5995592519da363a3d76f3a95c63b46e32a496b8
fix prompt:   bc69b59c078bb8094af6f2c41d063f36f53d71cc4d49871430376ba33f348a49
current:      94b1fb18e45afcb0892078e9924b1355e0601f557ae2fd51aa322105888c4213
candidate-v2: 2b571d81262ae7780b5314c407923b527b41e36c7d4ab9ac8cd9eb3af343e9d7
```

## 任务级结果

| 任务 | 处理组 | Full pass | Runtime | Token 中位数 | Agent steps 中位数 | Tool calls 中位数 |
|---|---|---:|---:|---:|---:|---:|
| build | no-rules | 3/3 | 3/3 | 631,396 | 21 | 23 |
| build | current | 3/3 | 3/3 | 410,927 | 16 | 16 |
| build | candidate-v2 | 2/3 | 2/3 | 1,037,724 | 36 | 35 |
| fix | no-rules | 3/3 | 3/3 | 447,203 | 19 | 21 |
| fix | current | 3/3 | 3/3 | 459,016 | 19 | 22 |
| fix | candidate-v2 | 3/3 | 3/3 | 387,145 | 17 | 21 |

current 的收益主要来自 build 路径：相对 no-rules，build token 中位数比值为 `0.651`，三次配对中有 2/3 至少降低 15%。fix 路径的 token 中位数比值为 `1.026`，没有中位数改善；三次配对中仍有 2/3 至少降低 15%，但 R2 的高成本导致中位数略高。因此正式总体门槛通过，不应写成“每个任务都更省 token”。

candidate-v2 呈现明显的路径分裂：

- fix 相对 current 的 token 中位数比值为 `0.843`，降低约 15.7%，三次配对均至少降低 15%，且 3/3 full pass。
- build 相对 current 的 token 中位数比值为 `2.525`，R1/R2 分别使用 `1,037,724` 和 `2,244,825` token，R3 虽降到 `276,219` token，却发生 runtime/full-pass 回退。
- build 的 agent steps 中位数为 36，高于 current 的 16；这与前两轮过度循环相符，但结构化 step/tool 计数是描述性轨迹指标，不单独构成质量评分。

## candidate-v2 build R3 的真实失败

该次运行正常退出，`exitCode=0`，`infrastructureFailure=null`，语法通过、合同 11/11、视觉与交互探针可运行，但浏览器捕获到：

```text
TypeError: Cannot read properties of undefined (reading 'setAttribute')
at renderDonut (dashboard.html:502)
```

根因是 donut 渲染先跳过零占比区域的 `<path>`，随后仍按未过滤的 `angles` 下标访问缩短后的 `slices` NodeList。地区筛选令一个区域占比为零后，`slices[i]` 为 `undefined`。模型自己的 Playwright 自测只在首次加载后检查错误列表；它在筛选交互之后没有再次检查累计 `pageerror`，因此 KPI 已变化便被误报为全通过。独立 method-5 评测在交互期间持续收集异常，正确把该 run 判为 runtime false、full false。

这不是 provider、timeout 或评测器失败，也不应从正式矩阵删除。它是 candidate-v2 的有效质量回退证据。

## 时长、并发与 token 解释

正式矩阵前八次为 serial，candidate build R2 的后段与一个已排除 companion 重叠，之后使用 treatment-local parallel 或 resume-single。共享 gateway、CPU 和网络竞争使不同 execution mode 的 wall time 不能作严格因果比较，所以最终效率门槛使用每个独立 SQLite session 的 token；时长只作描述。

`totalTokens` 为 input、output、thinking/reasoning、cache read 和 cache write 之和。OpenCode 在这些 run 中没有暴露正数 thinking token 或 reasoning part；这只表示客户端未提供该字段，不证明模型没有内部推理。

## 复现与机器证据

```bash
node eval/recheck-infrastructure.mjs --expect 18
node eval/recheck-execution.mjs --expect 18
node eval/recheck-runs.mjs --expect 18
node eval/verify-usage.mjs --expect 18
node eval/report.mjs
```

主要输出：

- [`results/eval-v2/ab-summary.json`](results/eval-v2/ab-summary.json)：完整 protocol、gate self-check、决策与逐 run 数据。
- [`results/eval-v2/ab-summary.csv`](results/eval-v2/ab-summary.csv)：逐 run 可分析字段。
- [`results/eval-v2/ab-summary.md`](results/eval-v2/ab-summary.md)：文本汇总。
- [`results/eval-v2/ab-summary.html`](results/eval-v2/ab-summary.html)：截图链接的可视报告。
- `results/eval-v2/runs/`：18 份 prompt、stdout/stderr、HTML、截图和 `meta.json` 原始证据。
- [`results/eval-v2/formal-parallel-execution-amendment.json`](results/eval-v2/formal-parallel-execution-amendment.json)：并发策略、source hash 与证据适用范围。

历史 48 份产物的客观审计见 [`verification.md`](verification.md) 和 `results/eval-v2/audit/`。
