# eval-v3 汇总

生成时间：2026-08-20T19:40:04.049Z

完成：24/24，full pass：4

## 任务级（谁在每个任务上 full pass）

| 任务 | Full pass | 通过配置 | 各配置 Tokens |
|---|---:|---|---|
| blackhole | 1/4 | opencode-no-rules | opencode-no-rules:1113054，opencode-current:1478713，dsh-minimal:—，dsh-router-standard:— |
| helicopter | 0/4 | — | opencode-no-rules:2619429，opencode-current:40329，dsh-minimal:—，dsh-router-standard:— |
| race | 0/4 | — | opencode-no-rules:44129，opencode-current:721648，dsh-minimal:—，dsh-router-standard:— |
| game | 0/4 | — | opencode-no-rules:148116，opencode-current:219269，dsh-minimal:—，dsh-router-standard:— |
| music | 2/4 | opencode-no-rules、opencode-current | opencode-no-rules:192601，opencode-current:298682，dsh-minimal:—，dsh-router-standard:— |
| dashboard | 1/4 | opencode-current | opencode-no-rules:327580，opencode-current:382554，dsh-minimal:—，dsh-router-standard:— |

## 配置级汇总

| 配置 | 完成 | Full | Runtime | 交互 | 视觉 | 合同中位数 | 时长中位数 | Token中位数 | Token总和 | 视觉OK |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| opencode-no-rules | 6 | 2 | 5 | 5 | 5 | 0.9 | 11m10s | 260,090.5 | 4,444,909 | 5 |
| opencode-current | 6 | 2 | 3 | 4 | 4 | 0.8 | 11m26s | 340,618 | 3,141,195 | 3 |
| dsh-minimal | 6 | 0 | 0 | 0 | 0 | 0 | 13m2s | — | 0 | 0 |
| dsh-router-standard | 6 | 0 | 0 | 0 | 0 | 0 | 13m26s | — | 0 | 0 |

## 逐 run

| 配置 | 任务 | Full | Runtime | 合同 | 交互 | 视觉 | 时长 | Tokens | 视觉 | 失败信息 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| opencode-no-rules | blackhole | ✅ | ✅ | 6/6 | ✅ | ✅ | 30m7s | 1,113,054 | 👁️ok |  |
| opencode-no-rules | helicopter | ❌ | ✅ | 6/7 | ✅ | ✅ | 30m37s | 2,619,429 | 👁️ok |  |
| opencode-no-rules | race | ❌ | ❌ | — | ❌ | ❌ | 16m39s | 44,129 | — |  |
| opencode-no-rules | game | ❌ | ✅ | 7/8 | ✅ | ✅ | 4m45s | 148,116 | 👁️ok |  |
| opencode-no-rules | music | ✅ | ✅ | 7/7 | ✅ | ✅ | 4m57s | 192,601 | 👁️ok |  |
| opencode-no-rules | dashboard | ❌ | ✅ | 5/7 | ✅ | ✅ | 7m40s | 327,580 | 👁️ok |  |
| opencode-current | blackhole | ❌ | ❌ | — | ❌ | ❌ | 40m0s | 1,478,713 | — |  |
| opencode-current | helicopter | ❌ | ❌ | — | ❌ | ❌ | 21m31s | 40,329 | — |  |
| opencode-current | race | ❌ | ❌ | 7/7 | ✅ | ✅ | 11m20s | 721,648 | 👁️invalid |  |
| opencode-current | game | ❌ | ✅ | 5/8 | ✅ | ✅ | 4m56s | 219,269 | 👁️ok |  |
| opencode-current | music | ✅ | ✅ | 7/7 | ✅ | ✅ | 12m33s | 298,682 | 👁️ok |  |
| opencode-current | dashboard | ✅ | ✅ | 7/7 | ✅ | ✅ | 5m19s | 382,554 | 👁️ok |  |
| dsh-minimal | blackhole | ❌ | ❌ | — | ❌ | ❌ | 12m30s | — | — |  |
| dsh-minimal | helicopter | ❌ | ❌ | — | ❌ | ❌ | 10m32s | — | — |  |
| dsh-minimal | race | ❌ | ❌ | — | ❌ | ❌ | 29m14s | — | — |  |
| dsh-minimal | game | ❌ | ❌ | — | ❌ | ❌ | 24m3s | — | — |  |
| dsh-minimal | music | ❌ | ❌ | — | ❌ | ❌ | 13m27s | — | — |  |
| dsh-minimal | dashboard | ❌ | ❌ | — | ❌ | ❌ | 13m38s | — | — |  |
| dsh-router-standard | blackhole | ❌ | ❌ | — | ❌ | ❌ | 22m58s | — | — |  |
| dsh-router-standard | helicopter | ❌ | ❌ | — | ❌ | ❌ | 24m34s | — | — |  |
| dsh-router-standard | race | ❌ | ❌ | — | ❌ | ❌ | 5m2s | — | — |  |
| dsh-router-standard | game | ❌ | ❌ | — | ❌ | ❌ | 6m5s | — | — |  |
| dsh-router-standard | music | ❌ | ❌ | — | ❌ | ❌ | 15m55s | — | — |  |
| dsh-router-standard | dashboard | ❌ | ❌ | — | ❌ | ❌ | 12m58s | — | — |  |
