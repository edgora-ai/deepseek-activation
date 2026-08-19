# 调用 DeepSeek-free 的教训总结（2026-08-19）

本次黑洞+直升机测试踩了大量坑，全部是**操作层错误**而非模型/工具本身问题。记录如下供复现时规避。

## 1. timeout 是最大的错误源（4 次误判"失败"）

**症状**：codex/claude/DSH 12 分钟内无文件 → 误判"卡死/失败"。

**真相**：这些通道正常完成任务要 **15 分钟-1.5 小时**（deepseek-free 响应慢 + 多轮工具循环）：

| 通道 | 真实耗时 |
|---|---|
| codex | 1-1.5 小时 |
| DSH | 1 小时 |
| claude 无规则 | 15 分钟（首输出 10 分钟）|
| opencode | 5 分钟（自有中转快）|

**教训**：
- **判断"失败"必须看进程活性**（`ps stat` R/S + CPU + `ss` 网络连接 ESTAB），**不是看"过了多久没输出"**
- **timeout 要按任务给足**：复杂任务给 1-2 小时，别用 600s 默认
- 文件可能已经写出（在别的路径），先 `find` 再下结论

**修正过程**：6 个"失败"被逐一翻案，最终直升机 8/8 成功。

## 2. 命令 / 传参错误

| 错误 | 真相 |
|---|---|
| `cd /tmp/xxx && pnpm dsh ...` | DSH 的 deps check 在 cwd 跑 pnpm，无 package.json 就挂。**必须在 repo 根跑** |
| `claude -p --debug "prompt"` | **--debug 模式要求 stdin 传 prompt**，参数传会 `Error: Input must be provided through stdin` 并悬空。**用 `echo "..." \| claude -p --debug`** |
| 移规则后忘恢复 | 多次冲突（AGENTS.md.bak 换名错乱）。**用变量在 bash -c 里自动恢复** |
| 提示词 {DIR} 替换 | DSH 写绝对路径不受 sed 影响，文件落在 /tmp/helo 而非 helo2 |

**教训**：命令要验证（先 `--help`、先小样本试跑），用完必须恢复现场（规则文件）。

## 3. 并发 vs 串行

- **并行跑多通道（codex+opencode+claude 同时）→ gateway 排队 → 全部变慢**（各通道请求互相挤占）
- **成功案例都是串行/轻并行**（opencode 用自己的中转不受 gateway 挤占）
- **教训**：多通道对比测试**串行跑**，别贪并行。

## 4. 诊断顺序（正确的做法）

1. 看 stdout/stderr 完整内容（不是 tail 尾巴）
2. 看进程存活：`ps -o stat,pcpu,wchan`（R=在跑, S=睡等IO, 结合 wchan 判断等什么）
3. 看网络：`ss -tnp | grep pid`（ESTAB = 在发请求）
4. 找文件：`find /tmp -name 'helicopter.html'`（可能写到奇怪路径）
5. **确认前**不叫"失败"，最多叫"未完成"——只有进程真的 dead 且无文件才算失败

## 5. 结论

- **工具本身都能完成**（直升机 8/8、黑洞 7/7）
- 差异只在速度和细节：codex 最慢最细（632KB）、opencode 最快、claude 需规则保速
- **deepseek-free 可用但慢**——给它时间，别用默认 timeout 误杀