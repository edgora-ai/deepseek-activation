# 直升机渲染对比：历史探索与 v2 复核（2026-08-20）

## 结论先行

2026-08-19 的旧报告把“HTML 已写出”记为 8/8 成功。2026-08-20 使用 JavaScript 语法、浏览器 runtime、需求合同、控制交互和截图像素重新审计后，**full pass 为 4/8**。timeout 确实造成过误判，但不能据此把已写出的文件全部判为可运行。

本轮每个配置只有一个历史样本，因此以下差异是故障定位和假设来源，不是可重复因果证据。机器结果见 [`results/eval-v2/audit/artifact-scores.json`](results/eval-v2/audit/artifact-scores.json)，同客户端配对见 [`results/eval-v2/audit/comparisons.md`](results/eval-v2/audit/comparisons.md)。

## 提示词

```text
Create helicopter.html: an interactive 3D helicopter with Three.js:
1. Accurate model: fuselage, tail boom, tail rotor, main rotor (4 blades), skids, cockpit.
2. Physics: rotor RPM, tail torque counteraction, hover bob, banking.
3. Controls: W/S pitch, A/D roll, Q/E yaw, Space throttle. HUD shows altitude/speed/RPM.
4. Realistic details: rotor blur, ground shadow, instrument panel, body tilt.
5. Camera follows; mouse drag rotates.
```

## v2 机器复核

`full pass` 要求语法和浏览器 runtime 无错误、7 项合同全部通过、控制交互产生状态或画面变化、截图通过非空/非黑像素检查。

| 配置 | 语法 | runtime | 合同 | full pass | 主要原因 |
|---|---:|---:|---:|---:|---|
| Claude 带规则 | ❌ | ❌ | 5/7 | ❌ | 顶层 `collective` 重复声明，页面脚本无法执行 |
| Claude 无规则 | ✅ | ✅ | 6/7 | ❌ | 缺 1 项明确需求 |
| Codex 带规则 | ✅ | ✅ | 7/7 | ✅ | — |
| Codex 无规则 | ✅ | ✅ | 7/7 | ✅ | — |
| DSH router-standard | ✅ | ✅ | 7/7 | ✅ | — |
| DSH minimal | ✅ | ✅ | 6/7 | ❌ | 缺 1 项明确需求 |
| OpenCode 带规则 | ✅ | ✅ | 5/7 | ❌ | 缺 2 项明确需求 |
| OpenCode 无规则 | ✅ | ✅ | 7/7 | ✅ | — |

汇总：语法 7/8、runtime 7/8、合同满分 4/8、full pass 4/8。

## 配对观察

- Claude：两份都未 full pass；带规则版本还新增重复声明的硬失败。
- Codex：带规则和无规则都 full pass。
- OpenCode：无规则 full pass，带规则版本回退到 5/7。
- DSH：router-standard 从 minimal 的 6/7 提升到 7/7。

这些方向彼此不一致，不能支持“规则在高复杂度任务上稳定保底”的旧结论。

## 旧过程指标为何不再用于结论

旧表中的多组 token 数值后来在黑洞、直升机和赛跑报告中重复出现，无法证明与该任务的一次独立 session 一一对应；thinking 字段在各客户端也不是同一统计口径。因此旧 token/thinking 数字不再作为效率证据。受控 v2 只接受运行目录、时间窗和 session 唯一匹配的 usage，归属不唯一时记录 `null`。

文件大小和 `rotor`、`RPM` 等关键词次数仍可描述实现规模，但不能证明浏览器可运行或需求完成。

## timeout 与截图纠正

- timeout 只代表达到时间上限，不能单独判失败；应同时检查进程状态、CPU、网络、日志和目标文件。
- 历史轮只有 **3/8** 直升机截图，不是旧报告所称的 7 张；v2 审计已为 8 份 HTML 重新生成 8 张固定 viewport 截图。
- “文件已写出”只满足 `generated`，不能替代 runtime 和合同验收。

## 产物与复现

- 原始 HTML：`docs/results/helo/`
- 历史截图：`docs/results/screenshots/helo/`
- v2 截图：`docs/results/eval-v2/audit/screenshots/helo__*.png`
- 复核命令：`node eval/audit-existing.mjs && node eval/report-audit.mjs`
- 方法：[`tests-method.md`](tests-method.md)
