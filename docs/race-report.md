# SVG 赛跑渲染对比测试报告（2026-08-19）

## 背景

黑洞（静态渲染）、直升机（交互物理）之后，第三个用例转向**叙事动画 SVG**：角色细节 + 自然动作 + 场景。验证不同预设/规则在"人物细节丰富、动作自然"类任务上的表现。

**任务**：兔子骑自行车、乌龟骑摩托车、白头鹰骑人力三轮车，在火星星环上赛跑。要求贴近真实的 SVG 动画、人物细节丰富、动作自然。

**提示词（完整）**：

```
Create race.html: an animated SVG race scene on Saturn's rings with three racers:
1. Racers (detailed SVG characters, rich details, natural motion):
   - A rabbit riding a bicycle (pedaling legs, ears flapping)
   - A turtle riding a motorcycle (helmet, leaning into turns)
   - A bald eagle riding a human-pedaled tricycle (wings spread, pedaling)
2. Scene: Saturn-like planet with rings, road/track on rings, floating stars, perspective.
3. Animation: racers move at different speeds and weave; keep in frame; legs pedal, wheels spin, ears/wings flap.
4. Race elements: start/finish line, distance markers, leaderboard.
5. All inline SVG/CSS/JS in ONE html file. No external assets.
```

## 测试矩阵与结果（8/8 全部成功）

| 配置 | 大小 | 关键特征 |
|---|---|---|
| **OpenCode 带规则** | 35150 B | rabbit×4, turtle×3, eagle×3, ring×7 |
| **OpenCode 无规则** | 29467 B | — |
| **Codex 带规则** | 30475 B | rabbit×5, turtle×5, eagle×5, ring×13 |
| **Codex 无规则** | 34617 B | rabbit×11, turtle×11, eagle×9 |
| **Claude 带规则** | 30371 B | 角色×车型全齐 |
| **Claude 无规则** | 33484 B | rabbit×4, eagle×5, Saturn×4 |
| **DSH minimal** | 30703 B | 角色×车型全齐 |
| **DSH router-standard** | 38003 B | **rabbit×29, eagle×31, turtle×24, score×4** |

## 关键发现

### 1. 8/8 全部成功（SVG 任务比直升机简单）

SVG 动画任务三个测试中最"温和"——所有通道、带/无规则都完成。无 timeout 误杀（并行 + 长 timeout 给足）。

### 2. 差异在细节密度，不是成败

| 配置 | 大小 | 角色出现次数合计 |
|---|---|---|
| DSH router-standard | 38003 B | **84**（29+31+24）|
| Codex 无规则 | 34617 B | 31（11+11+9）|
| OpenCode 带规则 | 35150 B | 10（4+3+3）|

**DSH router-standard 角色细节最丰富**（84 次角色引用），远超其他——**router-standard 预设的"细节优先"特性在 SVG 任务上凸显**。

### 3. 规则 vs 无规则（本任务）

| 通道 | 带规则 | 无规则 | 谁更详细 |
|---|---|---|---|
| OpenCode | 35150 B | 29467 B | 带规则更详细 |
| Codex | 30475 B | 34617 B | 无规则更详细 |
| Claude | 30371 B | 33484 B | 无规则更详细 |

**SVG 任务上规则无一致增益**——动画叙事任务模型自主发挥，规则影响弱于"任务复杂度"。

### 4. 三用例横向总结

| 用例 | 复杂任务 | 规则作用 |
|---|---|---|
| 黑洞（静态渲染） | 中 | 放大器（粒子 3-4×）|
| 直升机（交互物理） | 高 | 保底（claude 无规则超时）|
| 赛跑（SVG 动画） | 中低 | 几乎无差异 |

**结论**：规则增益随任务复杂度变化——越复杂越需要规则兜底，简单任务规则无感。

## 产物

`docs/results/race/` 下 8 个 HTML（命名 `<通道>-<规则>/-race.html`）。截图待补。

## 复现

提示词见上；命令同 tests-method.md（并行跑 + 90min timeout + 文件 stdin 传参给 claude）。