#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { acquireLock } from './lib/lock.mjs'
import { evaluateGenericArtifact } from './lib/evaluate-generic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ROOT = join(REPO, 'docs/results/eval-v3')
const RUNS = join(ROOT, 'runs')
const LOCK = join(REPO, '.eval-v3-lock')
const ACTIVE_OPENCODE_RULE = join(process.env.HOME || '/home/ubuntu', '.config/opencode/AGENTS.md')
const OPENCODE_CURRENT_RULE = join(HERE, 'rules/current/AGENTS.md')
const DSH_SETTINGS = join(process.env.HOME || '/home/ubuntu', '.dsh/settings.yaml')
const OPENCODE_DB = join(process.env.HOME || '/home/ubuntu', '.local/share/opencode/opencode.db')
const DSH_ROOT = '/home/ubuntu/code/deepseek-harness'

const CASES = ['blackhole', 'helicopter', 'race', 'game', 'music', 'dashboard']
const CONFIGURATIONS = ['opencode-no-rules', 'opencode-current', 'dsh-minimal', 'dsh-router-standard']

const options = parseArgs(process.argv.slice(2))

function plan() {
  const runs = []
  const tasks = options.tasks.length ? options.tasks : CASES
  const configs = options.configs.length ? options.configs : CONFIGURATIONS
  for (const task of tasks) {
    for (const config of configs) {
      runs.push({ task, config })
    }
  }
  return runs
}

const scheduled = plan()
const jobNames = scheduled.map((run) => `${run.config}/${run.task}`)
const usage = scheduler(jobNames)

if (options.dryRun) {
  console.log(JSON.stringify({ jobs: jobNames, usage }, null, 2))
  process.exit(0)
}

await mkdir(RUNS, { recursive: true })
const results = {}
const startedAt = new Date().toISOString()

async function runCase(run) {
  const runDir = join(RUNS, run.config, run.task)
  const release = await acquireLock(join(LOCK, run.config))
  try {
    await mkdir(runDir, { recursive: true })
    const stdoutPath = join(runDir, 'stdout.log')
    const stderrPath = join(runDir, 'stderr.log')
    const meta = {}
    const started = Date.now()
    let child
    try {
      if (run.config === 'dsh-minimal' || run.config === 'dsh-router-standard') {
        const preset = run.config === 'dsh-minimal' ? 'minimal' : 'router-standard'
        const settings = await readFile(DSH_SETTINGS, 'utf8')
        const patched = settings.replace(/agent-presets:\n\s+default:\s*\S+/, `agent-presets:\n  default: ${preset}`)
        await writeFile(DSH_SETTINGS, patched)
        meta.rules = `dsh-${preset}`
        meta.ruleState = 'dsh-preset'
      } else if (run.config === 'opencode-current') {
        await copyFile(OPENCODE_CURRENT_RULE, ACTIVE_OPENCODE_RULE)
        meta.rules = 'current'
        meta.ruleState = sha256(await readFile(OPENCODE_CURRENT_RULE))
      } else {
        await rm(ACTIVE_OPENCODE_RULE, { force: true })
        meta.rules = 'no-rules'
        meta.ruleState = 'absent'
      }
      child = spawn('node', [join(HERE, 'runner-inner.mjs'), run.config, run.task, runDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout.on('data', async (chunk) => {
        await writeFile(stdoutPath, chunk, { flag: 'a' })
      })
      child.stderr.on('data', async (chunk) => {
        await writeFile(stderrPath, chunk, { flag: 'a' })
      })
      const timeoutMs = options.timeoutMs
      const timeout = setTimeout(() => {
        try { child.kill('SIGTERM') } catch {}
      }, timeoutMs)
      const exit = await new Promise((resolveExit, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolveExit({ code, signal }))
      })
      clearTimeout(timeout)
      meta.durationMs = Date.now() - started
      meta.exitCode = exit.code
      meta.signal = exit.signal
      meta.timedOut = exit.code === null && exit.signal === 'SIGTERM' && Date.now() - started >= timeoutMs - 5_000
      if (exit.code !== 0) {
        meta.generationFailure = `runner exited ${exit.code}${exit.signal ? ` signal=${exit.signal}` : ''}`
      }
    } catch (error) {
      meta.generationFailure = String(error.message || error)
    } finally {
      if (run.config.startsWith('dsh-')) {
        const original = await readFile(join(REPO, 'eval-v3-backup-dsh-settings.yaml'))
        await writeFile(DSH_SETTINGS, original)
      } else {
        await restoreOpenCodeRule()
      }
    }
    const evaluation = JSON.parse(await readFile(join(runDir, 'evaluation.json'), 'utf8'))
    const vision = await readVision(runDir)
    const final = {
      runId: `${run.config}-${run.task}`,
      task: run.task,
      config: run.config,
      rules: meta.rules,
      ruleState: meta.ruleState,
      startedAt,
      durationMs: meta.durationMs,
      exitCode: meta.exitCode ?? null,
      signal: meta.signal ?? null,
      timedOut: meta.timedOut ?? false,
      generationFailure: meta.generationFailure ?? null,
      evaluation,
      vision,
    }
    await writeFile(join(runDir, 'meta.json'), `${JSON.stringify(final, null, 2)}\n`)
    return final
  } finally {
    release()
  }
}

async function restoreOpenCodeRule() {
  const backup = join(REPO, 'eval-v3-backup-opencode-AGENTS.md')
  try {
    const original = await readFile(backup)
    await writeFile(ACTIVE_OPENCODE_RULE, original)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      await rm(ACTIVE_OPENCODE_RULE, { force: true })
    } else throw error
  }
}

async function readVision(runDir) {
  try { return JSON.parse(await readFile(join(runDir, 'vision.json'), 'utf8')) } catch { return null }
}

function sha256(value) { return createHash(value) }

await runAll()

async function runAll() {
  const active = new Map()
  let index = 0
  for (const run of scheduled) {
    if (active.has(run.config)) {
      await active.get(run.config)
      active.delete(run.config)
    }
    const p = runCase(run).then((result) => {
      results[result.runId] = result
      writeFed()
      return result
    })
    active.set(run.config, p)
    index += 1
    if (active.size >= options.concurrency) {
      await Promise.race([...active.values()])
    }
  }
  if (active.size) await Promise.all([...active.values()])
  writeFed()
}

function writeFed() {
  const sorted = Object.values(results).sort((a, b) => {
    const ca = CONFIGURATIONS.indexOf(a.config)
    const cb = CONFIGURATIONS.indexOf(b.config)
    if (ca !== cb) return ca - cb
    return CASES.indexOf(a.task) - CASES.indexOf(b.task)
  })
  const summary = {
    generatedAt: new Date().toISOString(),
    total: sorted.length,
    fullPass: sorted.filter((r) => r.evaluation?.fullPass).length,
    rows: sorted,
  }
  writeFile(join(ROOT, 'fed.json'), `${JSON.stringify(summary, null, 2)}\n`)
  writeHtml(summary)
}

function writeHtml(summary) {
  const rows = summary.rows.map((r) => {
    const ev = r.evaluation || {}
    const vis = r.vision || {}
    const status = ev.fullPass ? '✅' : '❌'
    const visionBadge = vis.status === 'ok' ? (vis.valid ? '👁️ok' : '👁️invalid') : '👁️n/a'
    return `<tr><td>${r.config}</td><td>${r.task}</td><td>${status}</td><td>${isFinite(r.durationMs) ? Math.round(r.durationMs / 1000) + 's' : '—'}</td><td>${ev.contractPassed ?? '-'}/${ev.contractTotal ?? '-'}</td><td>${visionBadge}</td><td>${(ev.runtimeErrors || []).length}</td></tr>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>eval-v3 live</title><style>body{font-family:monospace;background:#111;color:#eee;padding:20px}table{border-collapse:collapse}td,th{border:1px solid #444;padding:4px 8px}</style></head><body><h1>eval-v3 (${summary.total} runs, ${summary.fullPass} full pass)</h1><table><tr><th>config</th><th>task</th><th>full</th><th>time</th><th>contract</th><th>vision</th><th>errors</th></tr>${rows}</table></body></html>`
  writeFile(join(ROOT, 'index.html'), html)
}

function scheduler(names) {
  return { planned: names.length, uniqueConfigs: [...new Set(names.map((n) => n.split('/')[0]))].length, usage: 'config-serial, multi-config parallel' }
}

function createHash(value) {
  return require('node:crypto').createHash('sha256').update(value).digest('hex')
}