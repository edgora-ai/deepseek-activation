#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ROOT = join(REPO, 'docs/results/eval-v7-max-effort')
const RUNS = join(ROOT, 'runs')
const MODELS = ['hy3', 'mino-free', 'opencode-free', 'muse-free']
const TASKS = ['blackhole', 'helicopter', 'race', 'game', 'music', 'dashboard']

const rows = []
for (const model of MODELS) {
  for (const task of TASKS) {
    const dir = join(RUNS, model, task)
    const metaPath = join(dir, 'meta.json')
    if (!await exists(metaPath)) {
      rows.push({ runId: `${model}-${task}`, model, task, completed: false })
      continue
    }
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    const ev = meta.evaluation || {}
    const vis = meta.vision || {}
    const artPath = join(dir, 'artifact.html')
    const hasArt = await exists(artPath)
    rows.push({
      runId: `${model}-${task}`, model, task, completed: true,
      effort: meta.effort || 'max',
      fullPass: ev.fullPass ?? false,
      runtimePass: ev.runtimePass ?? false,
      contract: `${ev.contractPassed ?? 0}/${ev.contractTotal ?? 0}`,
      interactionPass: ev.interactionPass ?? false,
      visualSanity: ev.visualSanity ?? false,
      hasArtifact: hasArt,
      artifactKB: hasArt ? Math.round((await statSize(artPath)) / 1024) : 0,
      visionStatus: vis?.status ?? 'not-run',
      visionValid: vis?.valid ?? null,
      durationMs: meta.durationMs ?? null,
    })
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  experiment: 'Claude Code × free models × 6 tasks @ max reasoning effort (env CLAUDE_CODE_EFFORT_LEVEL)',
  note: 'muse-free under max emits Write calls with EMPTY arguments (broken tool_use); its v5 default-effort result was 6/6. nv3 was offline (gateway 400) for this round.',
  models: MODELS.map((model) => {
    const items = rows.filter((r) => r.model === model && r.completed)
    return {
      model,
      completed: items.length,
      fullPass: items.filter((r) => r.fullPass).length,
      artifacts: items.filter((r) => r.hasArtifact).length,
      totalKB: items.reduce((s, r) => s + r.artifactKB, 0),
      meanContract: mean(items.map((r) => { const [a, b] = String(r.contract).split('/').map(Number); return b ? a / b : 0 })),
    }
  }),
  comparisonV5: {
    hy3: { v5: '4/6', v7max: '4/6' },
    'mino-free': { v5: '2/6', v7max: '3/6' },
    'opencode-free': { v5: '4/6', v7max: '2/6' },
    'muse-free': { v5: '6/6', v7max: '0/6 (empty-argument tool_use)' },
  },
  rows,
}
await writeFile(join(ROOT, 'models-summary-maxeffort.json'), `${JSON.stringify(summary, null, 2)}\n`)
await writeFile(join(ROOT, 'models-summary-maxeffort.md'), toMarkdown(summary))
console.log(JSON.stringify({ models: summary.models, comparisonV5: summary.comparisonV5 }, null, 2))

function toMarkdown(s) {
  const out = ['# v7: 免费模型 × max 推理强度（对照 v5 默认强度）', '', `生成：${s.generatedAt}`, '', '| 模型 | Full | 文件 | KB | 合同均值 |', '|---|---:|---:|---:|---:|']
  for (const m of s.models) out.push(`| ${m.model} | ${m.fullPass}/${m.completed} | ${m.artifacts} | ${m.totalKB} | ${(m.meanContract * 100).toFixed(0)}% |`)
  out.push('', '**v5 vs v7**', '', '| 模型 | v5 默认 | v7 max |', '|---|---|---|')
  for (const [k, v] of Object.entries(s.comparisonV5)) out.push(`| ${k} | ${v.v5} | ${v.v7max} |`)
  out.push('', s.note)
  return `${out.join('\n')}\n`
}
async function exists(p) { try { await readFile(p); return true } catch { return false } }
async function statSize(p) { const s = await readFile(p); return s.length }
function mean(v) { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }