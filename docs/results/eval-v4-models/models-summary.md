# DSH × 免费模型 对比评测

DSH headless 标准模式（DSH headless standard × 5 free models × 6 tasks）· 9/30 完成 · full pass 0

## 模型级汇总

| 模型 | Full | Runtime | 合同(平均) | 交互 | 视觉 | 视觉OK | 时长中位 | 产物KB | provider失败 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nv3 | 0/0 | 0 | 0% | 0 | 0 | 0 | — | 0 | 0 |
| hy3 | 0/1 | 0 | 0% | 0 | 0 | 0 | 9m3s | 0 | 0 |
| mino-free | 0/4 | 0 | 0% | 0 | 0 | 0 | 5m17s | 0 | 0 |
| muse-free | 0/0 | 0 | 0% | 0 | 0 | 0 | — | 0 | 0 |
| opencode-free | 0/4 | 0 | 0% | 0 | 0 | 0 | 5m46s | 0 | 0 |

## 任务级 PK（每任务各模型表现）

| 任务 | 结果 | 最佳 | 合同(各模型) | 视觉(各模型) |
|---|---|---|---|---|
| blackhole | hy3:❌ mino-free:❌ opencode-free:❌ | — | nv3:— hy3:0/0 mino:0/0 muse:— opencode:0/0 | nv3:— hy3:— mino:— muse:— opencode:— |
| helicopter | mino-free:❌ opencode-free:❌ | — | nv3:— hy3:— mino:0/0 muse:— opencode:0/0 | nv3:— hy3:— mino:— muse:— opencode:— |
| race | mino-free:❌ opencode-free:❌ | — | nv3:— hy3:— mino:0/0 muse:— opencode:0/0 | nv3:— hy3:— mino:— muse:— opencode:— |
| game | mino-free:❌ opencode-free:❌ | — | nv3:— hy3:— mino:0/0 muse:— opencode:0/0 | nv3:— hy3:— mino:— muse:— opencode:— |
| music |  | — | nv3:— hy3:— mino:— muse:— opencode:— | nv3:— hy3:— mino:— muse:— opencode:— |
| dashboard |  | — | nv3:— hy3:— mino:— muse:— opencode:— | nv3:— hy3:— mino:— muse:— opencode:— |

## 逐 run

| 模型 | 任务 | Full | Runtime | 合同 | 交互 | 视觉 | 时长 | 视觉判定 | 错误 |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| hy3 | blackhole | ❌ | ❌ | — | ❌ | ❌ | 9m3s | — |  |
| mino-free | blackhole | ❌ | ❌ | — | ❌ | ❌ | 5m9s | — |  |
| mino-free | helicopter | ❌ | ❌ | — | ❌ | ❌ | 5m25s | — |  |
| mino-free | race | ❌ | ❌ | — | ❌ | ❌ | 7m10s | — |  |
| mino-free | game | ❌ | ❌ | — | ❌ | ❌ | 1m1s | — |  |
| opencode-free | blackhole | ❌ | ❌ | — | ❌ | ❌ | 5m29s | — |  |
| opencode-free | helicopter | ❌ | ❌ | — | ❌ | ❌ | 6m11s | — |  |
| opencode-free | race | ❌ | ❌ | — | ❌ | ❌ | 4m2s | — |  |
| opencode-free | game | ❌ | ❌ | — | ❌ | ❌ | 3m57s | — |  |
