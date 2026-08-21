# DSH × 免费模型 对比评测

DSH headless 标准模式（DSH headless standard × 5 free models × 6 tasks）· 30/30 完成 · full pass 18

## 模型级汇总

| 模型 | Full | Runtime | 合同(平均) | 交互 | 视觉 | 视觉OK | 时长中位 | 产物KB | provider失败 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nv3 | 1/6 | 2 | 31% | 2 | 2 | 2 | 5m9s | 37 | 0 |
| hy3 | 4/6 | 6 | 95% | 5 | 6 | 5 | 5m44s | 789 | 0 |
| mino-free | 3/6 | 4 | 93% | 3 | 5 | 4 | 2m23s | 107 | 0 |
| muse-free | 6/6 | 6 | 100% | 6 | 6 | 4 | 5m39s | 1456 | 0 |
| opencode-free | 4/6 | 6 | 91% | 5 | 6 | 5 | 7m31s | 1374 | 0 |

## 任务级 PK（每任务各模型表现）

| 任务 | 结果 | 最佳 | 合同(各模型) | 视觉(各模型) |
|---|---|---|---|---|
| blackhole | nv3:✅ hy3:❌ mino-free:❌ muse-free:✅ opencode-free:✅ | nv3|muse-free|opencode-free | nv3:6/6 hy3:5/6 mino:6/6 muse:6/6 opencode:6/6 | nv3:ok hy3:invalid mino:invalid muse:ok opencode:ok |
| helicopter | nv3:❌ hy3:✅ mino-free:❌ muse-free:✅ opencode-free:❌ | hy3|muse-free | nv3:0/0 hy3:7/7 mino:5/7 muse:7/7 opencode:6/7 | nv3:— hy3:ok mino:invalid muse:ok opencode:invalid |
| race | nv3:❌ hy3:✅ mino-free:✅ muse-free:✅ opencode-free:✅ | hy3|mino-free|muse-free|opencode-free | nv3:0/0 hy3:7/7 mino:7/7 muse:7/7 opencode:7/7 | nv3:— hy3:ok mino:ok muse:— opencode:ok |
| game | nv3:❌ hy3:❌ mino-free:❌ muse-free:✅ opencode-free:❌ | muse-free | nv3:7/8 hy3:7/8 mino:7/8 muse:8/8 opencode:5/8 | nv3:ok hy3:ok mino:ok muse:ok opencode:ok |
| music | nv3:❌ hy3:✅ mino-free:✅ muse-free:✅ opencode-free:✅ | hy3|mino-free|muse-free|opencode-free | nv3:0/0 hy3:7/7 mino:7/7 muse:7/7 opencode:7/7 | nv3:— hy3:ok mino:ok muse:— opencode:ok |
| dashboard | nv3:❌ hy3:✅ mino-free:✅ muse-free:✅ opencode-free:✅ | hy3|mino-free|muse-free|opencode-free | nv3:0/0 hy3:7/7 mino:7/7 muse:7/7 opencode:7/7 | nv3:— hy3:ok mino:ok muse:ok opencode:ok |

## 逐 run

| 模型 | 任务 | Full | Runtime | 合同 | 交互 | 视觉 | 时长 | 视觉判定 | 错误 |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| nv3 | blackhole | ✅ | ✅ | 6/6 | ✅ | ✅ | 9m2s | ok |  |
| nv3 | helicopter | ❌ | ❌ | — | ❌ | ❌ | 2m33s | — |  |
| nv3 | race | ❌ | ❌ | — | ❌ | ❌ | 5m43s | — |  |
| nv3 | game | ❌ | ✅ | 7/8 | ✅ | ✅ | 30m1s | ok |  |
| nv3 | music | ❌ | ❌ | — | ❌ | ❌ | 1m27s | — |  |
| nv3 | dashboard | ❌ | ❌ | — | ❌ | ❌ | 6m36s | — |  |
| hy3 | blackhole | ❌ | ✅ | 5/6 | ❌ | ✅ | 15m38s | invalid |  |
| hy3 | helicopter | ✅ | ✅ | 7/7 | ✅ | ✅ | 12m46s | ok |  |
| hy3 | race | ✅ | ✅ | 7/7 | ✅ | ✅ | 7m48s | ok |  |
| hy3 | game | ❌ | ✅ | 7/8 | ✅ | ✅ | 2m44s | ok |  |
| hy3 | music | ✅ | ✅ | 7/7 | ✅ | ✅ | 3m39s | ok |  |
| hy3 | dashboard | ✅ | ✅ | 7/7 | ✅ | ✅ | 3m40s | ok |  |
| mino-free | blackhole | ❌ | ❌ | 6/6 | ❌ | ❌ | 2m27s | invalid |  |
| mino-free | helicopter | ❌ | ❌ | 5/7 | ❌ | ✅ | 2m19s | invalid |  |
| mino-free | race | ✅ | ✅ | 7/7 | ✅ | ✅ | 4m42s | ok |  |
| mino-free | game | ❌ | ✅ | 7/8 | ❌ | ✅ | 1m25s | ok |  |
| mino-free | music | ✅ | ✅ | 7/7 | ✅ | ✅ | 1m14s | ok |  |
| mino-free | dashboard | ✅ | ✅ | 7/7 | ✅ | ✅ | 6m5s | ok |  |
| muse-free | blackhole | ✅ | ✅ | 6/6 | ✅ | ✅ | 6m46s | ok |  |
| muse-free | helicopter | ✅ | ✅ | 7/7 | ✅ | ✅ | 22m42s | ok |  |
| muse-free | race | ✅ | ✅ | 7/7 | ✅ | ✅ | — | — |  |
| muse-free | game | ✅ | ✅ | 8/8 | ✅ | ✅ | 4m33s | ok |  |
| muse-free | music | ✅ | ✅ | 7/7 | ✅ | ✅ | — | — |  |
| muse-free | dashboard | ✅ | ✅ | 7/7 | ✅ | ✅ | 2m45s | ok |  |
| opencode-free | blackhole | ✅ | ✅ | 6/6 | ✅ | ✅ | 4m42s | ok |  |
| opencode-free | helicopter | ❌ | ✅ | 6/7 | ❌ | ✅ | 9m20s | invalid |  |
| opencode-free | race | ✅ | ✅ | 7/7 | ✅ | ✅ | 30m0s | ok |  |
| opencode-free | game | ❌ | ✅ | 5/8 | ✅ | ✅ | 3m46s | ok |  |
| opencode-free | music | ✅ | ✅ | 7/7 | ✅ | ✅ | 3m35s | ok |  |
| opencode-free | dashboard | ✅ | ✅ | 7/7 | ✅ | ✅ | 14m30s | ok |  |
