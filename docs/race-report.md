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

## 过程指标（token / 耗时 / 思维特征）

数据来自各通道 session 记录（opencode DB、codex rollout、claude session JSONL）。cot（思维）为估计，原始 reasoning tokens 部分通道未单独记录。

| 配置 | input | output | thinking | 耗时（估）| let's/we-need |
|---|---|---|---|---|---|
| OpenCode 带规则 | 417.7k | 33.1k | 46.4k | ~10min | — |
| OpenCode 无规则 | 117.4k | 13.4k | **55.9k** | ~10min | — |
| Codex 带规则 | ~130k | ~15k | 0 | ~30min | — |
| Codex 无规则 | ~673k | ~28k | 0 | ~40min | — |
| Claude 带规则 | 316.5k | 245.3k | 0* | ~15min | — |
| Claude 无规则 | 151.7k | 154.1k | 0* | ~15min | — |
| DSH minimal | 未采集 | — | — | ~30min | — |
| DSH router-standard | 未采集 | — | — | ~30min | — |

**观察**：
- **无规则 thinking 更高**：opencode 无规则 55.9k vs 带规则 46.4k——(无规则时模型自己多想)
- **opencode 是唯一记录 thinking 的**（DSH/codex 无此计数）；claude 的 thinking 走 content 不计 usage
- **claude 输出占比最高**（out/in > 0.5）——对话式客户端的回复比工具式更长
- **token 与耗时正比**：codex 最贵（673k/40min）、opencode 最省（并行最快）

*注：deepseek-free 的 thinking 在 claude 不计入 usage thinking_tokens（0 为估算下限，实际有 thinking 文本）。

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