# 黑洞渲染对比：历史探索与 v2 复核（2026-08-20）

## 结论先行

旧报告主要比较文件大小、粒子数和源码关键词，并错误地把直升机任务的 Claude 无规则数据放入黑洞表。v2 对 `docs/results/round2/` 的 8 份 HTML 做语法、浏览器 runtime、任务合同、交互和截图像素检查后，**full pass 为 3/8**。规则和 preset 确实改变输出，但没有形成一致的质量提升方向。

机器结果见 [`results/eval-v2/audit/artifact-scores.json`](results/eval-v2/audit/artifact-scores.json)，同客户端配对见 [`results/eval-v2/audit/comparisons.md`](results/eval-v2/audit/comparisons.md)。

## 提示词

```text
Create blackhole.html: a 3D black hole render with Three.js:
accretion disk (particles with glow), bloom postprocessing,
starfield, orbiting camera. Write the file and verify.
```

## v2 机器复核

| 配置 | 语法 | runtime | 合同 | full pass | 主要原因 |
|---|---:|---:|---:|---:|---|
| Claude DeepSeek 带规则 | ✅ | ✅ | 6/6 | ✅ | 本语料没有可配对的 Claude DeepSeek 无规则产物 |
| Claude Sonnet 5 control | ✅ | ❌ | 5/6 | ❌ | `THREE.EffectComposer` 构造失败，且不是同一模型对照 |
| Codex 带规则 | ✅ | ✅ | 5/6 | ❌ | 缺 1 项明确需求 |
| Codex 无规则 | ✅ | ✅ | 6/6 | ✅ | — |
| DSH router-standard | ✅ | ❌ | 6/6 | ❌ | WebGL shader 校验失败，`vColor` 未声明 |
| DSH minimal | ✅ | ✅ | 6/6 | ✅ | — |
| OpenCode 带规则 | ✅ | ✅ | 5/6 | ❌ | 缺 1 项明确需求 |
| OpenCode 无规则 | ✅ | ✅ | 5/6 | ❌ | 缺 1 项明确需求 |

汇总：语法 8/8、runtime 6/8、合同满分 4/8、full pass 3/8。Claude Sonnet control 的截图未通过视觉 sanity；其模型不同，不能用于 DeepSeek 规则效果归因。

## 配对观察

- Codex：无规则 full pass，带规则从 6/6 回退到 5/6。
- OpenCode：带规则与无规则都为 5/6，均未 full pass。
- DSH：minimal full pass；router-standard 虽满足静态合同，但 shader 编译失败，构成 runtime 回退。
- Claude：只有 DeepSeek 带规则样本；旧表中的“Claude 无规则 23477 B、rotor×19”来自直升机任务，现已删除，不能形成配对。

因此，“规则放大粒子密度”可作为源码规模观察，但“质量基线相同”“router-standard 更优”“无规则 token 更高且规则更收敛”都没有被本轮可靠证明。

## 旧过程指标为何不再用于结论

旧报告中的 token 数值在多个任务报告中重复，不能证明与该黑洞 session 唯一对应；thinking 字段也跨客户端不可比。v2 只接受运行目录、标题、时间窗唯一归属的 session usage，无法归属时记录 `null`，不会估算或复用其他任务数据。

粒子数、`Kepler`、`OrbitControls` 和文件字节数只保留为描述性指标。尤其 DSH router-standard 展示了更多物理/交互线索，却因为 shader 错误未达到 runtime-clean completion，说明源码关键词不能代替执行验证。

## 产物与复现

- 原始 HTML：`docs/results/round2/`
- v2 截图：`docs/results/eval-v2/audit/screenshots/round2__*.png`
- 复核命令：`node eval/audit-existing.mjs && node eval/report-audit.mjs`
- 方法：[`tests-method.md`](tests-method.md)
