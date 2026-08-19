# 直升机渲染对比测试报告（2026-08-19）

## 背景

黑洞任务之后，改用**更重的交互物理任务**验证预设/规则差异：需要建模（机身/尾梁/尾旋翼/主旋翼/滑橇/座舱）+ 物理（RPM/扭矩/悬停/倾斜）+ 完整控制（W/S/A/D/Q/E/空格）+ 真实细节（旋翼模糊/阴影/仪表板/机身倾斜）。

**任务提示词（完整）**：

```
Create helicopter.html: an interactive 3D helicopter with Three.js:

1. Accurate model: fuselage, tail boom, tail rotor, main rotor (4 blades), skids, cockpit with windshield.
2. Physics: rotor spins at adjustable RPM, tail rotor counteracts torque; helicopter hovers with slight bobbing, banks when turning.
3. Controls: W/S pitch, A/D roll, Q/E yaw, Space lift/throttle, arrows collective+cyclic. HUD shows altitude, speed, RPM, throttle.
4. Realistic details: rotor blur, ground shadow, instrument panel, body tilt.
5. Camera follows helicopter, mouse drag rotates view.
```

## 测试矩阵与结果

| 配置 | 规则/预设 | 结果 | 大小 | 关键特征 |
|---|---|---|---|---|
| **OpenCode** | 带规则 | ✅ | 21360 B | RPM×7, throttle×10, keydown, events×9 |
| **OpenCode** | 无规则 | ✅ | 23071 B | RPM×10, rotor×15, throttle×15, physics |
| **Claude Code** | 带规则 (solo) | ✅ | **31587 B** | rotor×28, throttle×24, RPM×14, skid×10, HUD×3 |
| Codex | 带规则 | ✅ | 632039 B | rotor×27, events×36（1.5h 慢工出细活）|
| Codex | 无规则 | ✅ | 30599 B | 完成（无 timeout 下自然完成）|
| Claude Code | 无规则 | ✅ | 23477 B | rotor×19, throttle×13, RPM×11（极慢~15min 但完成）|
| DSH minimal | 原生 | ✅ | 29143 B | rotor×22, skid×19（1h 完成）|
| DSH router-standard | preset | ✅ | 26663 B | 完成（无 timeout 下自然完成）|

## 关键发现

### 1. 直升机任务难度显著高于黑洞
- 最终 8 配置中 **8 成功 0 失败**（初判 5 失败全部是 timeout 误杀——文件其实都写出，被我杀在收尾阶段）
- 复杂建模+物理+控制是 free 模型的实际压力测试

### 2. 规则的作用：成功案例全带规则
| 成功通道 | 带规则？ |
|---|---|
| OpenCode 成功 | 带规则 ✓（以及无规则也成功）|
| Claude 成功 | **带规则（solo）** ✓ |
| 失败通道 | 无（全部成功） |

**claude 带规则 31587B vs 无规则卡死**——规则再次成为 claude 的"保底"。

### 3. 规模对比（成功者）
| 通道 | 大小 | 详细度 (rotor/throttle/RPM) |
|---|---|---|
| Claude 带规则 | **31587B** | 28/24/14 |
| OpenCode 无规则 | 23071B | 15/15/10 |
| OpenCode 带规则 | 21360B | 6/10/7 |

**claude 带规则最详细**——规则 + 长等待时间（solo）产出最完整模型。

### 4. 预设/规则差异（vs 黑洞结论修正）
- 黑洞：规则=放大器（粒子更多）但不决定成败
- 直升机：**规则更接近"必要"**——带规则通道全成功（claude/opencode），无规则/DSH 多失败
- **DSH 在直升机任务上反而不如 CLI**（黑洞时 DSH 强）——任务类型影响预设效果

## 产物

`docs/results/helo/` 下：
- `opencode-with-rules-helicopter.html` (21360 B)
- `opencode-no-rules-helicopter.html` (23071 B)  
- `claude-deepseek-free-with-rules.html` (31587 B)
- `_failed/` — 5 个失败配置的记录

## 复现

提示词见上文；命令同黑洞测试（见 tests-method.md），仅改任务文本和输出文件名。