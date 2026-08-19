# 黑洞渲染对比测试 · 方法 & 提示词

重现本次"不同预设 × 不同工具"测试的完整步骤。

## 测试目标

对比四种通道（DSH / Codex / OpenCode / Claude Code）在**不同规则/preset 下**对同一复杂任务的输出质量差异。任务选 3D 黑洞：长输出（300+ 行 HTML）、多特效，是 free 模型的压力测试。

## 提示词（原始版，笼统）

```text
Create blackhole.html: a 3D black hole render with Three.js:
accretion disk (particles with glow), bloom postprocessing,
starfield, orbiting camera. Write the file and verify.
```

**局限**：未指定粒子数/物理规律/交互，各通道输出规模接近，差异主要体现在实现特征组合（见报告第 5 节特征矩阵）。

## 严格提示词（曾尝试，free 模型超时）

```text
Create /tmp/bh-strict/blackhole.html: a complete 3D black hole simulation with EXACT specifications:

1. Accretion disk: EXACTLY 30000 particles, Keplerian orbits (v = sqrt(GM/r), G=1, M=10),
   inner radius 2.0, outer radius 10.0, differential rotation, tilt 0.3 rad.
2. Doppler beaming: approaching side brighter (1/(1-v_r/c), c=3).
3. Gravitational lensing: rays within 3 units of horizon (r=1) deflected.
4. Starfield: exactly 5000 stars.
5. Controls: OrbitControls (drag/zoom), spacebar pause, 'r' reset.
6. UnrealBloomPass strength 1.2, radius 0.6, threshold 0.1.
7. FPS counter + simulation speed indicator.
8. Fixed timestep physics (dt=1/120), accumulator pattern.
```

→ deepseek-free 生成过长，10 分钟超时未写文件。**改用特征分析**替代定量对比。

## 各通道运行命令

### DSH headless（原生 / router-standard）

```bash
# pi-ai adapter patch（hroze gateway → deepseek-free）
cat > /tmp/pi-ai-patch.yml <<'EOF'
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      hroze-gateway:
        apiKeyEnv: ANTHROPIC_AUTH_TOKEN
        api: anthropic-messages
        baseURL: https://cli.hroze.org
        models:
          - id: deepseek-free
            name: deepseek-free
            contextWindow: 1000000
            maxTokens: 32768
EOF

# 原生 minimal（默认 preset）
cd /home/ubuntu/code/deepseek-harness   # 必须在有 package.json 的目录（deps check）
pnpm dsh --profile headless --patch /tmp/pi-ai-patch.yml "<任务>"

# router-standard（临时 DSH_HOME 切 preset）
mkdir -p /tmp/dsh-router-home
cp ~/.dsh/settings.yaml /tmp/dsh-router-home/
cp -r ~/.dsh/.agent-presets /tmp/dsh-router-home/
sed -i 's/  default: minimal/  default: router-standard/' /tmp/dsh-router-home/settings.yaml
DSH_HOME=/tmp/dsh-router-home pnpm dsh --profile headless --patch /tmp/pi-ai-patch.yml "<任务>"
```

### Codex CLI

```bash
codex exec -s workspace-write --dangerously-bypass-approvals-and-sandbox "<任务>" # stdin
# 规则：~/.codex/AGENTS.md；无规则 = 临时 mv 走
```

### OpenCode

```bash
opencode run --model opencode/deepseek-v4-flash-free "<任务>"
# 规则：~/.config/opencode/AGENTS.md；无规则 = 临时 mv 走
```

### Claude Code

```bash
claude -p "<任务>"
# 注意：deepseek-free 会"假失败"（文件写出 + Execution error + exit 124）
# 判定成功：检查文件是否写出，别看退出码
```

## 产物分析

```bash
# 特征分析（Kepler/Doppler/lensing/控件）
grep -oE 'Kepler|Doppler|OrbitControls|lensing|UnrealBloomPass' <file> | sort | uniq -c
```

## 截图（无头 chromium）

```bash
cd docs/results
python3 -m http.server 8844 &   # file:// 打开会空白（ES module 跨域拦截）
chromium --headless --no-sandbox --disable-gpu \
  --virtual-time-budget=8000 --screenshot=x.png --window-size=1280,800 \
  http://127.0.0.1:8844/<path>.html
# 注意：heavy bloom 文件在无头软件 WebGL 下可能黑帧（文件本身有效，浏览器打开正常）
```

## 结果文件

`docs/results/` 按通道存放原始 HTML，`docs/results/screenshots/` 为无头浏览器截图。