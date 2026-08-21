#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Visual verdict for one artifact screenshot, run through a vision-capable
 * gpt-5.6 alias on the configured hroze gateway. The request reads the model
 * key only from ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL environment
 * variables; no credential value is ever logged. A failure here (missing key,
 * gateway error, invalid response) is recorded as `unavailable` and never
 * flips any gate.
 */
const GATEWAY_BASE = process.env.ANTHROPIC_BASE_URL || 'https://cli.hroze.org'
const MODEL = process.env.VISION_EVAL_MODEL || 'gpt-5.6-terra'
const RESULTS = process.env.VISION_RESULTS_DIR || '.'
const taskDetails = {
  blackhole: 'single-file 3D black hole webpage (Three.js accretion disk, starfield, glow). Verdict for "画面是否真实展现了黑洞场景（吸积盘、星场、辉光）且没有明显视觉破损（黑屏、花屏、元素重叠爆炸、全空白）".',
  helicopter: 'single-file 3D helicopter webpage (fuselage, rotors, skids, terrain, HUD). Verdict for "是否真实渲染出一架可辨识的直升机及其场景，无黑屏/花屏/布局崩溃".',
  race: 'single-file SVG animation: rabbit on bicycle, turtle on motorcycle, bald eagle on tricycle racing on a Martian ring road. Verdict for "是否绘制出三个角色与载具、赛道与起终点，动画在跑（画面看起来在移动），无明显破损/重叠爆炸".',
  game: 'single-file space shooter game canvas. Verdict for "是否渲染出可辨识的游戏画面（飞船、敌人、星空或爆炸粒子），而非黑屏或空白".',
  music: 'single-file browser music visualizer canvas. Verdict for "是否渲染出可视化画面（音频条形/环形/粒子等非空白图形），而非黑屏或纯色面板".',
  dashboard: 'single-file analytics dashboard with KPI cards and charts. Verdict for "是否渲染出仪表盘布局（指标卡与图表可见）且无明显布局破损".',
}

const CODE = await new Response('').text().catch(() => '')
async function evaluate() {
  const runDir = process.argv[2]
  const caseId = process.argv[3]
  if (!runDir || !caseId) throw new Error('usage: vision.mjs <runDir> <caseId>')
  const screenshotPath = join(runDir, 'screenshot.png')
  const outputPath = join(runDir, 'vision.json')
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    await writeResult(outputPath, unavailable('ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is not set'))
    return
  }
  let image
  try {
    image = await readFile(screenshotPath)
  } catch (error) {
    await writeResult(outputPath, unavailable(`no screenshot: ${error.code ?? error.message}`))
    return
  }
  const base64 = image.toString('base64')
  if (base64.length > 60_000_000) {
    await writeResult(outputPath, unavailable('screenshot too large to send'))
    return
  }
  const userText = taskDetails[caseId] ?? taskDetails[basename(runDir)] ?? 'Is this a visually valid, non-empty rendering of the requested task?'
  const body = {
    model: MODEL,
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: userText + ' Answer with ONLY a JSON object: {"valid": true|false, "summary": "<one sentence>"}. valid=false means blank, black, corrupted, or broken layout.' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
      ],
    }],
  }
  const started = Date.now()
  let response
  try {
    response = await fetch(`${GATEWAY_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    await writeResult(outputPath, unavailable(`vision request failed: ${error.message}`))
    return
  }
  const durationMs = Date.now() - started
  if (response.status !== 200) {
    await writeResult(outputPath, unavailable(`vision gateway status ${response.status}`))
    return
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    await writeResult(outputPath, unavailable('vision gateway returned non-JSON'))
    return
  }
  const text = (payload.content || []).map((block) => block.text ?? '').join(' ').trim()
  if (!text) {
    await writeResult(outputPath, unavailable('vision gateway returned empty text'))
    return
  }
  const parsed = parseJsonish(text)
  if (!parsed) {
    await writeResult(outputPath, unavailable('vision response did not contain JSON'))
    return
  }
  await writeResult(outputPath, {
    status: 'ok',
    valid: parsed.valid === true,
    summary: String(parsed.summary ?? '').slice(0, 500),
    model: MODEL,
    durationMs,
  })
}

function parseJsonish(text) {
  try { return JSON.parse(text) } catch {}
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

async function writeResult(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
  console.log(JSON.stringify({ path, status: value.status }))
}

function unavailable(reason) {
  return { status: 'unavailable', reason, valid: null, summary: null, model: null, durationMs: null }
}

await evaluate()