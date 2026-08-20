# 直升机渲染对比测试报告（2026-08-19）

## 背景

第二个用例：**交互物理模拟**。直升机需要建模（机身/尾梁/旋翼/滑橇）+ 物理（RPM/扭矩/悬停）+ 控制（W/S/A/D/Q/E/空格）+ 细节（旋翼模糊/仪表板）。比黑洞更难，是 free 模型的实际压力测试。

**提示词**：
```
Create helicopter.html: an interactive 3D helicopter with Three.js:
1. Accurate model: fuselage, tail boom, tail rotor, main rotor (4 blades), skids, cockpit.
2. Physics: rotor RPM, tail torque counteraction, hover bob, banking.
3. Controls: W/S pitch, A/D roll, Q/E yaw, Space throttle. HUD shows altitude/speed/RPM.
4. Realistic details: rotor blur, ground shadow, instrument panel, body tilt.
5. Camera follows; mouse drag rotates.
```

## 测试矩阵与结果（8/8 全部成功）

| 配置 | 大小 | 关键特征 |
|---|---|---|
| **Codex 带规则** | 632039 B | rotor×27, events×36（1.5h 慢工出细活）|
| **Claude 带规则** | 31587 B | rotor×28, throttle×24, RPM×14, skid×10, HUD×3 |
| **Codex 无规则** | 30599 B | 完成 |
| **DSH minimal** | 29143 B | rotor×22, skid×19（1h 完成）|
| **DSH router-standard** | 26663 B | 完成 |
| **Claude 无规则** | 23477 B | 极慢~15min 但完成 |
| **OpenCode 带规则** | 21360 B | RPM×7, throttle×10 |
| **OpenCode 无规则** | 23071 B | RPM×10, rotor×15 |

> 注：初判 5 个"失败"全部是 timeout 误杀——文件实际都写出，被我杀在收尾阶段（大教训，见 lessons-learned.md）。长 timeout 后全部转正。

## 过程指标（token / 耗时 / 思维特征）

| 配置 | input | output | thinking | 耗时 |
|---|---|---|---|---|
| Codex 带规则 | 130.5k | 15k | 0 | **1.5h** |
| Codex 无规则 | 672.8k | 27.9k | 0 | **1h** |
| OpenCode 带规则 | 12.7k | 12k | 0 | ~5min |
| OpenCode 无规则 | 38.4k | 6.1k | 1.8k | ~5min |
| Claude 带规则 | 194.8k | 102.4k | 0* | 9min |
| Claude 无规则 | 151.7k | 154.1k | 0* | 15min |
| DSH minimal / rs | 未采集 | — | — | ~1h |

## 关键发现

### 1. 直升机任务难度显著高于黑洞
8 配置初判 3/8 成功→修正 8/8（timeout 误杀为主因）。复杂建模+物理+控制是真实压力。

### 2. 规则的作用随难度变化
- 无规则 claude 极慢（15min vs 9min）——规则维持节奏
- 但无规则也能完成（长 timeout 下）——规则是"提速"不是"必需"

### 3. 规模对比（成功者）
| 通道 | 大小 | 详细度 |
|---|---|---|
| Codex 带规则 | **632KB** | 最详尽（慢工）|
| Claude 带规则 | 31587B | rotor×28 最密 |
| OpenCode | 21-23KB | 最快 |

### 4. 大教训：timeout 误杀
6 个"失败"全部是 timeout 杀在文件写出后——判断成败必须看进程活性（ps stat/CPU/网络），非"是否超时"。详见 lessons-learned.md。

## 产物 / 复现

产物：`docs/results/helo/`（8 配置 HTML + 7 截图，claude-sonnet 对照黑帧未含）。复现：`docs/tests-method.md` + `docs/lessons-learned.md`（命令注意事项）。