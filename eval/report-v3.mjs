#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ROOT = join(REPO, 'docs/results/eval-v3')
const RUNS = join(ROOT, 'runs')
const CONFIGS = ['opencode-no-rules', 'opencode-current', 'dsh-minimal', 'dsh-router-standard']
const TASKS = ['blackhole', 'helicopter', 'race', 'game', 'music', 'dashboard']

const rows = []
for (const config of CONFIGS) {
  for (const task of TASKS) {
    const metaPath = join(RUNS, config, task, 'meta.json')
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8'))
      rows.push(flatten(meta))
    } catch {
      rows.push({
        runId: `${config}-${task}`,
        config,
        task,
        status: 'missing',
        completed: false,
      })
    }
  }
}

const completed = rows.filter((row) => row.completed)
const summary = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  completed: completed.length,
  fullPass: completed.filter((row) => row.fullPass).length,
  rows,
  configs: aggregateByConfig(completed),
  tasks: aggregateByTask(completed),
}

const md = toMarkdown(summary)
const html = toHTML(summary)
await writeFile(join(ROOT, 'eval-v3-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
await writeFile(join(ROOT, 'eval-v3-summary.csv'), toCSV(rows))
await writeFile(join(ROOT, 'eval-v3-summary.md'), md)
await writeFile(join(ROOT, 'eval-v3-summary.html'), html)
console.log(JSON.stringify({
  total: rows.length,
  completed: completed.length,
  fullPass: summary.fullPass,
  configOrder: CONFIGS,
  taskBest: summary.tasks.map((row) => ({ task: row.task, fullPass: `${row.fullPass}/${row.completed}`, best: row.bestConfig.join('|') || '—' })),
}, null, 2))

function flatten(meta) {
  const ev = meta.evaluation || {}
  const vis = meta.vision || {}
  const usage = meta.usage || {}
  return {
    runId: meta.runId,
    config: meta.config,
    task: meta.task,
    rules: meta.rules ?? null,
    ruleState: typeof meta.ruleState === 'string' ? meta.ruleState.slice(0, 12) : meta.ruleState,
    completed: Boolean(ev && typeof ev === 'object'),
    status: 'completed',
    startedAt: meta.startedAt ?? null,
    finishedAt: meta.finishedAt ?? null,
    durationMs: meta.durationMs ?? null,
    exitCode: meta.exitCode ?? null,
    timedOut: Boolean(meta.timedOut),
    generationFailure: meta.generationFailure ?? null,
    artifactBytes: meta.artifact?.bytes ?? null,
    fullPass: ev.fullPass ?? false,
    syntaxPass: ev.syntaxPass ?? false,
    runtimePass: ev.runtimePass ?? false,
    runtimeErrors: (ev.runtimeErrors ?? []).length,
    contractPassed: ev.contractPassed ?? 0,
    contractTotal: ev.contractTotal ?? 0,
    interactionPass: ev.interactionPass ?? false,
    visualSanity: ev.visualSanity ?? false,
    visionStatus: vis?.status ?? 'not-run',
    visionValid: vis?.valid ?? null,
    visionSummary: vis?.summary ?? null,
    usageStatus: usage?.status ?? 'unavailable',
    totalTokens: usage?.totalTokens ?? null,
  }
}

function aggregateByTask(rows) {
  return TASKS.map((task) => {
    const items = rows.filter((row) => row.task === task)
    return {
      task,
      completed: items.length,
      fullPass: items.filter((row) => row.fullPass).length,
      bestConfig: items.filter((row) => row.fullPass).map((row) => row.config),
      tokensByConfig: Object.fromEntries(CONFIGS.map((config) => {
        const value = items.find((row) => row.config === config && Number.isFinite(row.totalTokens))?.totalTokens ?? null
        return [config, value]
      })),
      visionValidByConfig: Object.fromEntries(CONFIGS.map((config) => {
        const row = items.find((item) => item.config === config)
        return [config, row?.visionStatus === 'ok' ? row.visionValid : null]
      })),
    }
  })
}

function aggregateByConfig(rows) {
  return CONFIGS.map((config) => {
    const items = rows.filter((row) => row.config === config)
    const tokens = items.map((row) => row.totalTokens).filter(Number.isFinite)
    return {
      config,
      completed: items.length,
      fullPass: items.filter((row) => row.fullPass).length,
      runtimePass: items.filter((row) => row.runtimePass).length,
      syntaxPass: items.filter((row) => row.syntaxPass).length,
      interactionPass: items.filter((row) => row.interactionPass).length,
      visualSanity: items.filter((row) => row.visualSanity).length,
      medianDurationMs: median(items.map((row) => row.durationMs).filter(Number.isFinite)),
      medianTokens: median(tokens),
      sumTokens: tokens.reduce((sum, value) => sum + value, 0),
      medianContract: median(items.map((row) => row.contractTotal ? row.contractPassed / row.contractTotal : 0)),
      visionOk: items.filter((row) => row.visionStatus === 'ok' && row.visionValid === true).length,
    }
  })
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function toCSV(rows) {
  const header = ['runId', 'config', 'task', 'rules', 'fullPass', 'runtimePass', 'contract', 'interactionPass', 'visualSanity', 'durationMs', 'timedOut', 'exitCode', 'totalTokens', 'usageStatus', 'visionStatus', 'visionValid', 'generationFailure']
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => {
      const value = row[key]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') return `"${value.replaceAll('"', '""')}"`
      return String(value)
    }).join(','))
  }
  return `${lines.join('\n')}\n`
}

function toMarkdown(summary) {
  const out = []
  out.push('# eval-v3 汇总')
  out.push('')
  out.push(`生成时间：${summary.generatedAt}`)
  out.push('')
  out.push(`完成：${summary.completed}/${summary.total}，full pass：${summary.fullPass}`)
  out.push('')
  out.push('## 任务级（谁在每个任务上 full pass）')
  out.push('')
  out.push('| 任务 | Full pass | 通过配置 | 各配置 Tokens |')
  out.push('|---|---:|---|---|')
  for (const task of summary.tasks) {
    const tokens = CONFIGS.map((config) => `${config}:${task.tokensByConfig[config] ?? '—'}`).join('，')
    out.push(`| ${task.task} | ${task.fullPass}/${task.completed} | ${task.bestConfig.join('、') || '—'} | ${tokens} |`)
  }
  out.push('')
  out.push('## 配置级汇总')
  out.push('')
  out.push('| 配置 | 完成 | Full | Runtime | 交互 | 视觉 | 合同中位数 | 时长中位数 | Token中位数 | Token总和 | 视觉OK |')
  out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const config of summary.configs) {
    out.push(`| ${config.config} | ${config.completed} | ${config.fullPass} | ${config.runtimePass} | ${config.interactionPass} | ${config.visualSanity} | ${fmt(config.medianContract)} | ${fmtMs(config.medianDurationMs)} | ${fmt(config.medianTokens)} | ${fmt(config.sumTokens)} | ${config.visionOk} |`)
  }
  out.push('')
  out.push('## 逐 run')
  out.push('')
  out.push('| 配置 | 任务 | Full | Runtime | 合同 | 交互 | 视觉 | 时长 | Tokens | 视觉 | 失败信息 |')
  out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|')
  for (const row of summary.rows) {
    const contract = row.contractTotal ? `${row.contractPassed}/${row.contractTotal}` : '—'
    out.push(`| ${row.config} | ${row.task} | ${row.fullPass ? '✅' : '❌'} | ${row.runtimePass ? '✅' : '❌'} | ${contract} | ${row.interactionPass ? '✅' : '❌'} | ${row.visualSanity ? '✅' : '❌'} | ${fmtMs(row.durationMs)} | ${fmt(row.totalTokens)} | ${row.visionStatus === 'ok' ? (row.visionValid ? '👁️ok' : '👁️invalid') : '—'} | ${row.generationFailure ?? ''} |`)
  }
  return `${out.join('\n')}\n`
}

function toHTML(summary) {
  const rowsHtml = summary.rows.map((row) => {
    const status = row.completed ? (row.fullPass ? '✅' : '❌') : '⏳'
    const contract = row.contractTotal ? `${row.contractPassed}/${row.contractTotal}` : '—'
    const vision = row.visionStatus === 'ok' ? (row.visionValid ? 'ok' : 'invalid') : (row.visionStatus === 'not-run' ? '—' : 'n/a')
    return `<tr><td>${row.config.replaceAll('-', ' ')}</td><td>${row.task}</td><td>${status}</td><td>${row.runtimePass ? '✅' : (row.completed ? '❌' : '—')}</td><td>${contract}</td><td>${row.interactionPass ? '✅' : (row.completed ? '❌' : '—')}</td><td>${row.visualSanity ? '✅' : (row.completed ? '❌' : '—')}</td><td>${fmtMs(row.durationMs)}</td><td>${fmt(row.totalTokens)}</td><td>${vision}</td><td>${row.generationFailure ?? ''}</td></tr>`
  }).join('')
  const configsHtml = summary.configs.map((config) => `
  <tr><td><b>${config.config.replaceAll('-', ' ')}</b></td><td>${config.completed}</td><td>${config.fullPass}</td><td>${config.runtimePass}</td><td>${fmt(config.medianContract)}</td><td>${fmtMs(config.medianDurationMs)}</td><td>${fmt(config.medianTokens)}</td><td>${fmt(config.sumTokens)}</td><td>${config.visionOk}</td></tr>`).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>eval-v3 汇总</title>
<style>
:root{color-scheme:light;--bg:#f7f7f5;--card:#fff;--text:#1a1a1a;--muted:#666;--border:#e3e3df;--ok:#1a7f37;--bad:#b42318;}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#141414;--card:#1e1e1e;--text:#e8e8e6;--muted:#9c9c94;--border:#333;--ok:#3fb950;--bad:#f85149;}}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.wrap{max-width:1100px;margin:0 auto;padding:32px 20px 64px}.ovf{overflow-x:auto}
h1{font-size:1.6em;margin:0 0 4px}.sub{color:var(--muted);margin-bottom:20px}
h2{font-size:1.2em;margin:30px 0 10px;border-bottom:1px solid var(--border);padding-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:.9em}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
th{font-weight:600}.ok{color:var(--ok)}.bad{color:var(--bad)}
.meta{color:var(--muted);font-size:.85em;margin-top:30px}
</style></head><body><div class="wrap">
<h1>eval-v3 大范围评测汇总</h1>
<div class="sub">${summary.completed}/${summary.total} 完成 · full pass ${summary.fullPass} · 生成于 ${summary.generatedAt}</div>
<h2>配置级</h2>
<div class="ovf"><table><tr><th>配置</th><th>完成</th><th>Full</th><th>Runtime</th><th>合同质量</th><th>时长中位数</th><th>Token中位数</th><th>Token总和</th><th>视觉OK</th></tr>${configsHtml}</table></div>
<h2>逐 run</h2>
<div class="ovf"><table><tr><th>配置</th><th>任务</th><th>Full</th><th>Runtime</th><th>合同</th><th>交互</th><th>视觉</th><th>时长</th><th>Tokens</th><th>视觉判定</th><th>失败信息</th></tr>${rowsHtml}</table></div>
<div class="meta">方法 v6：语法 + 浏览器 runtime + 合同 + 交互 + 像素 sanity + gpt-5.6 视觉判定。OpenCode token 来自 SQLite 归属；DSH 无 attribution 源。</div>
</div></body></html>
`
}

function fmt(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return String(value)
}
function fmtMs(value) {
  if (value === null || value === undefined) return '—'
  if (value < 60_000) return `${Math.round(value / 1000)}s`
  return `${Math.round(value / 60_000)}m${Math.round((value % 60_000) / 1000)}s`
}