# 已知限制

诚实记录本仓库**不能**做什么（以及为什么）。

## 1. anchored 工具面锚定不可移植

dsh-anchored-standard 的"首轮 minimal 工具面 → We need 轨迹"依赖 DSH 的**按会话预设控制工具 schema**。三客户端：

| 客户端 | 限制工具方式 | 是否隐藏 schema |
|---|---|---|
| Claude Code | `--allowedTools` / `disabledTools` | ❌ 只拦执行，**schema 仍可见** |
| Codex | 无 | ❌ |
| OpenCode | 无 | ❌ |

实测（Claude Code `--allowedTools "Bash,Edit"`）：轨迹仍是 "Let me"，**无 We need 锚定**。

## 2. let's/let me 分布不可稳定控制

历史少量会话中“先深度规划”提示词曾伴随更多 thinking 文本，但 token 归属和客户端记账口径不足以证明稳定放大；let's/let me 分布也明显漂移：

| 实验 | let's | let me |
|---|---|---|
| opencode + 规划提示 | 7 | 28 |
| Claude Code + 规划提示 | 1 | 33 |

**不是提示词可控**——受客户端系统提示/协议影响。

## 3. OpenCode 自带 free 模型限流

`opencode/deepseek-v4-flash-free`（opencode 免费中转）有**速率限制**（实测 "Rate limit exceeded"），时好时坏。这是 opencode 服务端配额，不是本仓库问题。等待几分钟通常恢复。

## 4. Claude Code 复杂任务超时

deepseek-free 生成超长输出（如完整 3D 游戏单文件）时，`claude -p` 可能 "Execution error"（流中断）。**建议拆分任务**。

## 5. 跨客户端绝对排名不可归因

即使模型标签相同，Claude Code、Codex、OpenCode 和 DSH 仍有不同的系统提示词、工具 schema、循环实现、上下文压缩、网关与传输路径。跨客户端耗时、token 和成功率只能描述“模型 + 客户端 + 网关”的组合，不能把差异单独归因到规则。可信度更高的比较是同一客户端内的带规则/无规则重复 A/B；DSH minimal/router-standard 作为独立的原生 preset 对照报告。

## 6. 历史产物是 N=1 探索样本

`docs/results/round2/`、`helo/`、`race/` 和 `n2/` 中每个配置通常只有一个产物，且运行顺序、时段和部分提示词记录不完整。它们适合发现失败模式和设计新探针，不足以证明规则带来可重复优化。`eval/` 的受控测试使用独立 session、三次重复和轮换顺序，但样本量仍只支持方向性判断。

## 7. token 与 reasoning 指标不完全可比

不同客户端对输入重放、缓存、工具结果和 thinking/reasoning 的记账方式不同。只有能按新 session ID、运行目录和启动时间唯一归属的 usage 才进入 v2 报告；无法唯一归属时记为 `null`。reasoning token 缺失不代表模型没有推理，跨客户端也不能直接用该字段排名。

## 8. Headless Chromium 是机器验收，不是最终审美评审

无头浏览器可以稳定发现 JavaScript 异常、WebGL shader 错误、空画面、控件无响应和 DOM 合同缺失，但软件渲染与桌面 GPU 可能不同。主观视觉质量应在固定 viewport、隐藏客户端名称的截图上另行盲评，不能由文件大小或关键词次数替代。

## 9. 混合执行模式下 wall time 不能作严格因果比较

正式 OpenCode 矩阵前八个样本串行执行；第九个 build 在末段与一个后来排除的 companion 重叠；恢复后的单个缺失 fix 独立运行；其余处理组在同一规则哈希下并行执行 build/fix。并发减少了总等待时间，但共享 gateway、CPU 和网络竞争改变了单次 wall time。每个 `meta.json` 因此记录 `executionMode` 和中性 concurrency group；混合模式下耗时只作描述，推广门槛使用能够唯一归属到独立 SQLite session 的 token 与相同 method-5 质量检查。并发本身仍可能改变 provider 排队和 cache 行为，所以本次 token 结论只支持当前客户端、模型别名和网关组合下的方向性判断。

## 10. 本仓库不涵盖

- 模型权重/微调（纯推理时配置）
- 工具 schema 级控制（DSH 专属）
- OpenAI 官方 / Codex 订阅专用提示词（那是另一模型系）