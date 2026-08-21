# v7: 免费模型 × max 推理强度（对照 v5 默认强度）

生成：2026-08-21T16:21:38.850Z

| 模型 | Full | 文件 | KB | 合同均值 |
|---|---:|---:|---:|---:|
| hy3 | 4/6 | 6 | 1344 | 96% |
| mino-free | 3/6 | 6 | 98 | 93% |
| opencode-free | 2/6 | 3 | 654 | 48% |
| muse-free | 0/0 | 0 | 0 | 0% |

**v5 vs v7**

| 模型 | v5 默认 | v7 max |
|---|---|---|
| hy3 | 4/6 | 4/6 |
| mino-free | 2/6 | 3/6 |
| opencode-free | 4/6 | 2/6 |
| muse-free | 6/6 | 0/6 (empty-argument tool_use) |

muse-free under max emits Write calls with EMPTY arguments (broken tool_use); its v5 default-effort result was 6/6. nv3 was offline (gateway 400) for this round.
