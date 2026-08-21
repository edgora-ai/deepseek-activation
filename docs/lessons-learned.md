# 调用 DeepSeek free 模型的评测教训（2026-08-20 修订）

黑洞、直升机和后续批量任务暴露了两类独立问题：一类是 timeout、命令、工作目录、规则恢复和并发造成的操作误判；另一类是已写出 HTML 本身的语法、浏览器 runtime 或功能缺陷。前者存在，不代表后者不存在。v2 审计结果见 [`evaluation-v2.md`](evaluation-v2.md)。

## 1. timeout 不是失败判据

历史轮观察到部分通道可能长时间等待模型或工具循环：Codex 最长约 1–1.5 小时、DSH 约 1 小时、Claude 无规则样本约 15 分钟、OpenCode 样本约 5 分钟。这些是当时任务和网关条件下的观察，不是稳定性能基准。

正确判断方式：

- 同时看进程状态、CPU、wait channel 和已建立网络连接。
- 记录 stdout/stderr 和目标文件字节数是否继续变化。
- timeout 后保留产物和日志，先审计再分类；不能把 timeout 自动算作模型失败。
- 文件可能已写到其他路径，结束进程前先确认工作目录和目标路径。

旧轮确实有进程在写出文件后被 timeout 终止，但“文件已写出”只证明 `generated`。v2 重新审计后，直升机只有 4/8 full pass，而不是旧结论的 8/8。

## 2. 命令和工作目录必须先做小样本验证

| 问题 | 修正 |
|---|---|
| 从无 `package.json` 的临时目录运行 DSH | 从 DeepSeek Harness 仓库根运行 |
| `claude -p --debug` 没有正确提供 prompt | 按 CLI 要求通过 stdin 提供 |
| 临时移走规则后忘记恢复或混用多个 `.bak` | 使用独占锁、临时备份目录、signal/EXIT trap 和 SHA-256 读回验证 |
| prompt 中目标目录替换不完整 | 每个 run 使用独立 cwd，并在 metadata 记录最终绝对路径 |
| 未先检查 CLI 参数支持 | 先读 `--help`，再跑单个 dry-run/smoke |

规则恢复不能依赖人工记忆。当前 `scripts/eval.sh` 在切换前备份原始字节，运行中验证每个 variant 哈希，并在正常结束、错误或 signal 后恢复及复核原哈希。

## 3. 共享网关不适合无控制并发

历史并发运行让多个客户端争用同一 gateway，导致排队和耗时膨胀。跨客户端绝对耗时还混入 system prompt、工具 schema、上下文管理和 transport 差异。

- 共享 gateway 的任务应串行或采用明确的并发配额。
- OpenCode 自有中转可单独评测，但不能直接与其他 gateway 的时间作因果比较。
- A/B 在同客户端内部做，顺序循环轮换；不要从客户端间 wall time 推导规则优劣。

## 4. 正确的诊断顺序

1. 保存 stdout/stderr 完整内容。
2. 查看进程状态：`ps -o stat,pcpu,wchan`。
3. 查看连接：按 PID 检查已建立网络连接。
4. 检查目标路径、文件大小和修改时间。
5. 进程结束后执行 JavaScript 语法检查。
6. 在真实浏览器中收集 exception、console error、功能断言和截图。
7. 只有通过任务全部必需断言才记 `full pass`。

进程仍活跃时使用“运行中”或“达到时间上限”，不要提前写“卡死”；进程结束且文件存在时也不能提前写“成功”。

## 5. token 与 thinking 必须可归属、可比较

旧报告中部分 token 数值跨黑洞、直升机和赛跑重复，无法确认对应哪个 session；不同客户端的 reasoning/thinking 字段含义也不同。修正原则：

- 只接受运行目录或唯一标题、时间窗与新 session ID 一一对应的数据。
- 每次运行保存 session ID 与原始 usage 字段。
- 无法唯一匹配时记录 `null`，不估算、不复制其他任务数字。
- 不跨客户端直接比较 reasoning token；优先比较同客户端内的 full pass、合同和总成本。

## 6. 截图和源码特征都不是单独的质量证明

- 非空截图可能来自页面静态部分，后台脚本仍可能持续报错。
- 关键词多、粒子多或文件大可能意味着展开更多，也可能包含不可执行代码。
- headless 截图像素 sanity 只排除明显黑帧/空帧，不替代主观视觉盲评。
- 机器验收必须把语法、runtime、合同和交互同时纳入。

## 7. 修订后的结论

- DeepSeek free 模型能够在所有客户端产生复杂 HTML，但历史 48 份产物只有 **25/48 full pass**。
- 当前规则和 DSH preset 会改变生成轨迹与结果；历史同客户端 N=1 方向混合，不能用来证明稳定优化。
- DSH router-standard 在历史六项中由 minimal 的 4/6 提升到 5/6，同时在黑洞产生 shader runtime 回退；不能只报告净总数而隐藏任务回退。
- 正式 OpenCode 18-run A/B 中，current 与 no-rules 均为 6/6 full pass，current 的总体 token 中位数降低约 18.8%，因此只在固定模型与 build/fix 范围内支持 current 优化。
- candidate-v2 的 fix 路径较省 token，但 build 为 2/3 runtime/full pass，并在 R3 产生真实交互运行时错误；candidate-v2 不安装、不推广。
