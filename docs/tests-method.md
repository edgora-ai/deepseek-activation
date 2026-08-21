# 黑洞渲染对比测试 · 方法 & 提示词

重现本次"不同预设 × 不同工具"测试的完整步骤。

> 本文第 2 节以后记录 2026-08-19 的探索轮次。该轮次主要使用单次生成、文件大小和源码特征，不再作为优化已被证明的证据。当前机器验收与重复 A/B 以 [`eval/README.md`](../eval/README.md) 和 `docs/results/eval-v2/` 为准。

## v2 客观评测

```bash
node eval/audit-existing.mjs     # 48 个历史 HTML：语法、浏览器、合同、交互、像素统计
node eval/report-audit.mjs       # 同客户端/同任务的历史配对描述
scripts/eval.sh --dry-run        # 展示 2 任务 × 3 规则 × 3 重复的轮换顺序
scripts/eval.sh --parallel-cases # 同一处理组内并行 build/fix，处理组间设 barrier
node eval/recheck-infrastructure.mjs --expect 18
node eval/recheck-execution.mjs --expect 18
node eval/verify-usage.mjs --expect 18 # 直接读 SQLite 并验证可检索性与 token 完整性
node eval/report.mjs             # 从每个 meta.json 生成 JSON/CSV/Markdown/HTML
```

每个产物分别记录目标文件、inline JavaScript 语法、浏览器异常与 console error、提示词要求通过数、交互是否改变状态、截图像素统计和 full pass。`full_pass` 要求这些必需项全部通过；文件存在、CLI 退出码为 0、输出中出现 `verify` 或文件更大都不构成成功。

受控 A/B 使用 build-dashboard 和带确定性缺陷的 fix-dashboard，在固定模型别名 `hroze-sp/deepseek-v4-flash` 上分别运行 no-rules、current 和 candidate-v2，每组 3 个独立 session。三轮顺序为 `no-rules → current → candidate`、`current → candidate → no-rules`、`candidate → no-rules → current`。prompt 只写相对目标 `dashboard.html`，runner 通过 OpenCode `--dir` 显式指定中性的 `repeat-N/slot-N/case`，避免后台服务沿用其他项目目录；18 次运行只能出现两个 prompt 哈希，处理组名称也不得出现在 session title 或父进程参数中。每次运行保存 prompt、规则哈希、起止时间、stdout/stderr、HTML、截图、浏览器断言和唯一 session usage；只有 title、时间、目录和模型全部匹配且 token 合计大于 0 时才接受 usage，否则保持 `null`。provider API 错误单独标记为运行环境失败并立即停止批次，不计入任一处理组的质量结果。

仪表盘探针按标签和属性识别地区、类别和时间段控件，不限定 HTML 控件类型；时间范围可以是 range input、起止 select 或其他有明确 period/date/month 标签的控件。method 3 识别由可见 wrapping label 操作的隐藏 checkbox/radio，因此 pill/chip 筛选器不会被误判为缺失。method 4 再把每个元素按最近且只命中一个语义组的局部 label/ancestor 唯一分类，禁止共享筛选容器中的 region、category、period 文本把同一个控件归入三组。三组控件分别在重载后的隔离页面中改变并验证 KPI 更新。method 5 通过真实指针事件依次探测最多 80 个可见 SVG mark 或 canvas 坐标，只有原生详情、新出现的 tooltip 或 hover 状态才通过，不能用第一个任意 SVG primitive 代替实际数据 mark。评测代码变化后执行 `node eval/recheck-runs.mjs --expect 18`，保证所有 run 使用同一 method version。最初三个 pilot 被停止并排除：第一轮绝对路径含规则变体名，第二轮路径已中性化但 OpenCode session title 仍含变体名，第三轮 prompt、cwd 和 title 均已中性化但父进程参数仍暴露 `--rules` 和预期规则哈希；它们分别归档到 `pilot-runs-path-confounded/`、`pilot-runs-title-confounded/` 和 `pilot-runs-parent-args-confounded/`。正式轮仅向 runner 传递 repeat 与中性 slot，runner 内部映射处理组，因此 prompt、cwd、session title 和模型可观察的父进程参数都不含处理组名称。随后一次已完全中性化的 `opencode/deepseek-v4-flash-free` 尝试在首个 session 遇到可重试的 provider HTTP 429，第二个 session 启动后即停止；冷却后的 canary 仍返回 429，因此该尝试归档到 `pilot-runs-rate-limited/`，只作为运行环境证据，不进入 A/B 汇总。`hroze-sp/deepseek-v4-flash` 的显式目录 canary 成功且 SQLite 目录、模型、usage 均匹配，正式矩阵改用该固定别名。另一个 hroze 部分运行因最初宿主后台任务存在有限截止时间而在 180 秒、尚未产生 `meta.json` 时主动停止，归档到 `pilot-runs-background-task-timeout-risk/`；正式矩阵由无短截止时间的持久 supervisor 管理，并在终止信号下继续触发规则恢复。首个持久运行的截图显示 region/category pill 实际存在且可工作，但 method 2 因 input 使用 `display:none` 而误判为缺失；该轮仅完成一个样本后停止并归档到 `pilot-runs-control-discovery-false-negative/`，修正后的 method 3 对同一 HTML 得到 11/11，并保持此前 build/fix 校准样本分别 11/11、10/10。下一轮 method 3 虽找到真实控件，却把共同 filter card 的全部文本加入每个描述，三个 interaction 实际都点击同一个 region 按钮；相同 descriptor 和相同 KPI 结果暴露该假阳性，批次在第二个 session 中停止并归档到 `pilot-runs-semantic-control-cross-contamination/`。method 4 对未修改 HTML 分别定位 `North`、`Electronics` 和 `rFrom`，得到 region/category/period 控件数 3/3/2 以及三组不同的 KPI 结果。随后 method 4 在另一个真实产物上只把指针移到第一个 SVG primitive；该元素是无 listener 的装饰节点，尽管数据点 hover 实际能显示 tooltip，仍被误判为 10/11。批次再次在第二个 session 中停止并归档到 `pilot-runs-hover-target-false-negative/`。method 5 在同一 HTML 上尝试到第三个候选 data-point circle 时观察到 tooltip，从而得到 11/11，同时无 hover 的损坏 fixture 仍失败。正式矩阵第八个 session 完成并通过 10/10 后，基础设施分类器 method 1 因模型工具输出复述本文档中的历史 `HTTP 429` 文字而误停；stdout 没有结构化 error event、stderr 为空。基础设施分类器 method 2 只接受结构化 stdout error event，并把普通文本 fallback 限于进程 stderr；已知 429 pilot 仍被检出，八个正式样本全部重新分类为无基础设施失败，原始判定与首段 supervisor 日志保存在 `operational-incidents/provider-classifier-stdout-false-positive/`，随后通过严格 existing-run 校验恢复剩余矩阵。为缩短剩余执行时间，第一次人工 companion 尝试与串行父批次使用了同一中性 run directory；父批次在 build 完成后正确拒绝覆盖 companion 已创建但尚无 `meta.json` 的 fix 目录并退出。SQLite 和 stdout 时间表明模型 stream 在规则恢复前已经结束，因此未观察到模型会话中途切规则；但 companion 的外层 runner 在独立评测和 metadata 完成前被停止，不能进入正式矩阵。原始目录完整归档到 `operational-incidents/parallel-companion-collision/`。修正后的 `--parallel-cases` 在激活一个处理组后先同时 preflight 两个 case，再并行启动、等待两者 barrier、复核规则哈希，任一失败会先停止并 join sibling，之后才允许切换处理组。每个新 run 记录 `executionMode` 和不含处理组名称的 `rN-slot-N` concurrency group；并发后的 wall time 受共享 gateway 竞争影响，仅作描述，独立 SQLite token 和质量门槛仍可比较。

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