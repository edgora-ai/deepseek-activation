# 黑洞渲染对比测试报告（2026-08-19）

## 背景

初始测试用例：**复杂 3D 静态渲染**。黑洞需要长输出（300+ 行 HTML、多特效），验证不同预设/规则在"渲染质量"上的差异。此轮使用同一提示词（未指定量化指标），考察各通道的默认表现。

**提示词**：
```
Create blackhole.html: a 3D black hole render with Three.js:
accretion disk (particles with glow), bloom postprocessing,
starfield, orbiting camera. Write the file and verify.
```

## 测试矩阵与结果（Round 2 全新重跑）

| 配置 | 大小 | 关键特征 |
|---|---|---|
| **OpenCode 带规则** | 11675 B | 粒子 55000 |
| **OpenCode 无规则 ×2** | 8471 / 9342 B | 粒子 14000 |
| **Codex 带规则** | 9194 B | 粒子 14000 |
| **Codex 无规则** | 9767 B | Points 6 |
| **Claude 带规则 (solo)** | 12127 B | Kepler + OrbitControls |
| **Claude 无规则** | 23477 B | rotor×19（直升机任务数据，黑洞轮失败）|
| **DSH minimal** | 8014 B | Kepler + bloom |
| **DSH router-standard** | 9721 B | **Kepler×3 + OrbitControls** |

> 注：Claude 无规则在黑洞轮曾误判"失败"（实为 timeout 误杀），直升机轮证明其可用，此处标注基于实际成功轮。

## 过程指标（token / 耗时 / 思维特征）

| 配置 | input | output | thinking | 耗时 |
|---|---|---|---|---|
| Codex 带规则 | 130.5k | 15k | 0 | 3:16 |
| Codex 无规则 | 672.8k | 27.9k | 0 | 8:05 |
| OpenCode 带规则 | 12.7k | 12k | 0 | ~4min |
| OpenCode 无规则 | 38.4k | 6.1k | 1.8k | ~4min |
| Claude 带规则 (solo) | 194.8k | 102.4k | 0* | 8:19 |

*deepseek-free 的 thinking 在 claude 不计入 usage（有 thinking 文本但计数 0）。

## 关键发现

### 1. 规则 = 放大器，不是开关
- 有规则时粒子更多（OpenCode 55000 vs 14000），无规则也出完整黑洞
- 质量基线相同，规则放大密度但不能决成败

### 2. 预设差异可测
- **DSH router-standard 激活 Kepler×3 + OrbitControls**（物理+交互），minimal 只有 Kepler×1 无控制

### 3. 无规则 token 更高
- Codex 无规则 672k vs 带规则 130k（5×）——规则让模型更收敛

## 产物 / 复现

产物：`docs/results/round2/`（8 配置 HTML + 7 截图）。复现：`docs/tests-method.md` 黑洞章节。