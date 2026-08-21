# 三类工程任务：历史探索与 v2 复核（2026-08-20）

## 结论先行

旧报告把 24 份已写出的 HTML 记为 24/24 成功。v2 在浏览器中检查 JavaScript runtime、任务合同、筛选/刷新/控制交互和截图像素后，**full pass 为 13/24**：仪表盘 2/8、太空射击 5/8、音乐可视化 6/8。文件存在和体积不能代表功能完成。

机器结果见 [`results/eval-v2/audit/artifact-scores.json`](results/eval-v2/audit/artifact-scores.json)，同客户端配对见 [`results/eval-v2/audit/comparisons.md`](results/eval-v2/audit/comparisons.md)。本轮每个配置只有一个样本，结果用于发现失败模式，不用于稳定增益声明。

## 用例

1. **仪表盘**：4 个 KPI、4 类图表、刷新、地区/类别/时间范围筛选、hover。
2. **太空射击**：飞船、敌人、移动、射击、碰撞、计分、粒子与道具。
3. **音乐可视化**：文件/麦克风入口、播放控制、60+ 频谱表示、3 种模式或主题、平滑动画。

## v2 汇总

| 用例 | 语法 | runtime | 合同满分 | full pass |
|---|---:|---:|---:|---:|
| 仪表盘 | 8/8 | 3/8 | 2/8 | **2/8** |
| 太空射击 | 8/8 | 7/8 | 5/8 | **5/8** |
| 音乐可视化 | 8/8 | 6/8 | 8/8 | **6/8** |
| **合计** | **24/24** | **16/24** | **15/24** | **13/24** |

## 仪表盘（2/8 full pass）

| 配置 | runtime | 合同 | full pass | 主要原因 |
|---|---:|---:|---:|---|
| Claude 带规则 | ✅ | 6/7 | ❌ | 缺 1 项功能 |
| Claude 无规则 | ❌ | 3/7 | ❌ | `renderAll` 未定义，文件以占位实现结束 |
| Codex 带规则 | ❌ | 5/7 | ❌ | 对未定义数据读取 `length` |
| Codex 无规则 | ❌ | 3/7 | ❌ | `$` 未定义 |
| DSH router-standard | ✅ | 7/7 | ✅ | — |
| DSH minimal | ❌ | 5/7 | ❌ | 对未定义项读取 `label` |
| OpenCode 带规则 | ❌ | 6/7 | ❌ | 对不存在节点设置 `innerHTML` |
| OpenCode 无规则 | ✅ | 7/7 | ✅ | — |

同客户端 N=1 观察：DSH router-standard 改善；OpenCode 带规则回退；Claude 和 Codex 都没有产生 full-pass 改善。

## 太空射击（5/8 full pass）

| 配置 | runtime | 合同 | full pass | 主要原因 |
|---|---:|---:|---:|---|
| Claude 带规则 / 无规则 | ✅ / ✅ | 8/8 / 8/8 | ✅ / ✅ | 两者都通过 |
| Codex 带规则 / 无规则 | ❌ / ✅ | 7/8 / 8/8 | ❌ / ✅ | 带规则版本对未定义对象绑定事件 |
| DSH router-standard / minimal | ✅ / ✅ | 8/8 / 8/8 | ✅ / ✅ | 两者都通过 |
| OpenCode 带规则 / 无规则 | ✅ / ✅ | 7/8 / 7/8 | ❌ / ❌ | 两者各缺 1 项功能 |

## 音乐可视化（6/8 full pass）

Claude、Codex 和 DSH 的六份产物均为 7/7 full pass。OpenCode 两份产物静态合同都是 7/7，但浏览器 runtime 调用了空对象的 `fill`，所以都不通过。这个案例直接说明源码功能线索齐全仍不能替代运行验证。

## 配对汇总

只看这三个 n2 任务：

| 通道 | 基线 full pass | 测试变体 full pass | 观察 |
|---|---:|---:|---|
| Claude no-rules → current | 2/3 | 2/3 | dashboard 合同提高但仍未满分，其余持平 |
| Codex no-rules → current | 2/3 | 1/3 | game 发生 runtime 回退 |
| OpenCode no-rules → current | 1/3 | 0/3 | dashboard 发生 runtime/合同回退 |
| DSH minimal → router-standard | 2/3 | 3/3 | dashboard 从失败变为 full pass |

这些方向不一致，否定了旧报告的“规则在复杂任务上稳定保底”“输出收敛已证明 token 效率”结论。

## 文件大小的正确用途

旧报告记录的字节数仍可复查实现规模，但不参与成功判定。例如最大或更大的文件同样可能在启动时抛异常；更小的 OpenCode 无规则仪表盘反而是两份 full-pass 仪表盘之一。字节数只能回答“输出有多大”，不能回答“功能是否可用”。

## 产物与复现

- 原始 HTML：`docs/results/n2/`
- v2 截图：`docs/results/eval-v2/audit/screenshots/n2__*.png`
- 复核命令：`node eval/audit-existing.mjs && node eval/report-audit.mjs`
- 方法：[`tests-method.md`](tests-method.md)
