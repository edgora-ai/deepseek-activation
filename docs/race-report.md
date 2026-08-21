# SVG 赛跑对比：历史探索与 v2 复核（2026-08-20）

## 结论先行

旧报告以文件存在和源码关键词判定 8/8 成功。v2 在真实浏览器中检查 SVG、三组角色与车辆、比赛元素、动画/交互、runtime 错误和截图像素后，**full pass 为 5/8**。带规则版本在 Claude、Codex、OpenCode 的三个单次历史配对中都修复了对应无规则版本的问题，但每组只有 N=1，不能据此声称规则有稳定增益。

机器结果见 [`results/eval-v2/audit/artifact-scores.json`](results/eval-v2/audit/artifact-scores.json)，配对结果见 [`results/eval-v2/audit/comparisons.md`](results/eval-v2/audit/comparisons.md)。

## 提示词

```text
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

## v2 机器复核

| 配置 | 语法 | runtime | 合同 | full pass | 主要原因 |
|---|---:|---:|---:|---:|---|
| Claude 带规则 | ✅ | ✅ | 7/7 | ✅ | — |
| Claude 无规则 | ✅ | ❌ | 7/7 | ❌ | 调用了不存在的 SVG `beginList()` |
| Codex 带规则 | ✅ | ✅ | 7/7 | ✅ | — |
| Codex 无规则 | ✅ | ❌ | 7/7 | ❌ | 多个 SVG 属性保留了未求值的字符串表达式 |
| DSH router-standard | ✅ | ✅ | 7/7 | ✅ | — |
| DSH minimal | ✅ | ✅ | 7/7 | ✅ | — |
| OpenCode 带规则 | ✅ | ✅ | 7/7 | ✅ | — |
| OpenCode 无规则 | ✅ | ❌ | 4/7 | ❌ | 对未定义对象调用 `setAttribute`，且缺 3 项合同 |

汇总：语法 8/8、runtime 5/8、合同满分 7/8、full pass 5/8。

## 配对观察

- Claude：0 → 1 full pass。
- Codex：0 → 1 full pass。
- OpenCode：0 → 1 full pass。
- DSH：minimal 与 router-standard 都 full pass。

这组历史样本给出了值得重复验证的正向信号，但不足以区分规则影响与单次采样波动。文件大小和角色词频也不能替代 runtime：例如 Codex 无规则文件有完整角色词频，却仍产生无效 SVG 属性。

## 旧 token/thinking 表为何撤回

旧报告的部分 token 数值与其他任务报告完全相同，不能唯一归属到本任务；各客户端对 reasoning/thinking 的记录方式也不同。旧表因此不再用于“无规则想得更多”“某客户端最省”或 token 与耗时相关的结论。v2 受控实验仅使用时间窗、运行目录与 session 唯一匹配的数据，无法唯一匹配则保留 `null`。

## 可以保留的描述性观察

- DSH router-standard 的原始文件更大、角色关键词更多；这只说明实现展开程度，不等于视觉质量或正确性。
- 三个 CLI 的带规则版本在本次 N=1 历史样本中都通过，而无规则版本都发生 runtime 或合同失败；需要重复 A/B 才能判断是否可复现。
- 8 份固定 viewport 的 v2 截图均通过基本像素 sanity，但截图非空不等于动画自然或人物主观质量更高。

## 产物与复现

- 原始 HTML：`docs/results/race/`
- v2 截图：`docs/results/eval-v2/audit/screenshots/race__*.png`
- 复核命令：`node eval/audit-existing.mjs && node eval/report-audit.mjs`
- 方法：[`tests-method.md`](tests-method.md)
