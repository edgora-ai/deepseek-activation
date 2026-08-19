# 常见问题

## Q1: 安装后规则不生效？
1. 确认文件在正确位置：
   - Claude Code: `~/.claude/AGENTS.md`
   - Codex: `~/.codex/AGENTS.md`
   - OpenCode: `~/.config/opencode/AGENTS.md`
2. **开新会话**（规则在会话开始时加载，旧会话不刷新）
3. 跑 `./scripts/verify-injection.sh` 确认注入
4. 若未注入：检查是否有别的 AGENTS.md/CLAUDE.md 冲突（opencode 优先级：项目 AGENTS.md > 全局 AGENTS.md > ~/.claude/CLAUDE.md）

## Q2: OpenCode free 模型报 "Rate limit exceeded"？
- opencode 免费中转有速率限制，**等待几分钟**重试
- 或用你自己的 provider（如 gateway）——见仓库外配置

## Q3: Codex 需要什么环境？
- 本仓库规则文件本身无依赖
- 验证脚本需要 `codex` CLI + 你的 provider 配置（如 HROZE_TOKEN 或 OpenAI 官方）

## Q4: 规则会不会干扰正常使用？
- 规则是**引导性**的（分类/验证/恢复），不限制工具、不改变权限
- "不跑环境检查"只影响无效命令（echo/whoami），不影响实际工作
- 若不适应可随时删除对应行

## Q5: 这个仓库和 DSH 的关系？
- 方法论来自 DSH 社区研究（routing-suite / J-Space / anchored-standard）
- 但**独立于 DSH**——目标是通用 CLI（Claude Code/Codex/OpenCode）
- DSH 中已有内置 preset（router-standard 等）实现同样机制

## Q6: 只用其中一条规则可以吗？
可以。规则互相独立，按需删减。最有用的是：
1. **规则 3（每步验证）**——单条收益最大
2. **规则 1（build/fix 分类）**——flash 模型显著提升
3. **规则 4（失败重试）**——长任务不卡死