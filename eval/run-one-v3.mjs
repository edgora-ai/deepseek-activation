#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireLock } from './lib/lock.mjs'
import { evaluateGenericArtifact } from './lib/evaluate-generic.mjs'
import { spawnSync as spawnVision } from 'node:child_process'

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
const CLI_PATHS = {
  opencode: 'opencode',
  dsh: '/usr/bin/pnpm',
}

const options = parseArgs(process.argv.slice(2))
const runDir = join(RUNS, options.config, options.task)
// Refuse to overwrite a run that already reached completion: a meta.json
// written by an earlier process (e.g. a killed launcher round) must never be
// mixed with fresh model output in the same directory.
try {
  await readFile(join(runDir, 'meta.json'))
  throw new Error(`run directory already contains meta.json; refusing to overwrite: ${runDir}`)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
await mkdir(LOCK, { recursive: true })
const release = await acquireLock(join(LOCK, options.config))
const startedAt = new Date().toISOString()
const startedEpochMs = Date.now()
const meta = {
  runId: `${options.config}-${options.task}`,
  task: options.task,
  config: options.config,
  startedAt,
}
const stdoutPath = join(runDir, 'stdout.log')
const stderrPath = join(runDir, 'stderr.log')
const artifactPath = join(runDir, 'artifact.html')
const promptPath = join(runDir, 'prompt.txt')
let stdinPayload = null
let executable
let args
let ruleInfo

let releases = []
try {
  await mkdir(runDir, { recursive: true })
  const prompt = promptFor(options.task)
  await writeFile(promptPath, `${prompt}\n`)

  if (options.config.startsWith('dsh-')) {
    const preset = options.config === 'dsh-minimal' ? 'minimal' : 'router-standard'
    const original = await readFile(DSH_SETTINGS, 'utf8')
    await writeFile(join(REPO, '.eval-v3-dsh-settings-backup'), original)
    const patched = original.replace(
      /(agent-presets:\n\s+default:)\s*\S+/,
      `$1 ${preset}`,
    )
    await writeFile(DSH_SETTINGS, patched)
    meta.rules = `dsh-${preset}`
    meta.ruleState = 'dsh-preset'
    meta.settings = { original: sha256(original), patched: sha256(patched) }
    executable = CLI_PATHS.dsh
    args = ['dsh', '--profile', 'headless', prompt]
    stdinPayload = null
  } else {
    if (options.config === 'opencode-current') {
      await copyFile(OPENCODE_CURRENT_RULE, ACTIVE_OPENCODE_RULE)
      meta.rules = 'current'
      meta.ruleState = sha256(await readFile(OPENCODE_CURRENT_RULE))
    } else {
      await rm(ACTIVE_OPENCODE_RULE, { force: true })
      meta.rules = 'no-rules'
      meta.ruleState = 'absent'
    }
    executable = 'opencode'
    args = [
      'run', '--model', options.model, '--format', 'json',
      '--title', `${options.config.replace('opencode-', '')}-${options.task}`,
      '--dir', runDir,
      prompt,
    ]
    stdinPayload = null
  }
} catch (error) {
  for (const release of releases) await release()
  throw error
} finally {
  release()
}

const cleanup = async () => {
  // Restore OpenCode rule state or DSH settings if this process is interrupted.
  if (options.config === 'opencode-current') {
    await copyFile(OPENCODE_CURRENT_RULE, ACTIVE_OPENCODE_RULE)
  } else if (options.config === 'opencode-no-rules') {
    await rm(ACTIVE_OPENCODE_RULE, { force: true })
  } else if (options.config.startsWith('dsh-')) {
    try {
      const backup = await readFile(join(REPO, '.eval-v3-dsh-settings-backup'))
      await writeFile(DSH_SETTINGS, backup)
    } catch {}
  }
}
process.on('exit', async () => { await cleanup() })
process.on('SIGINT', async () => { await cleanup(); process.exit(1) })
process.on('SIGTERM', async () => { await cleanup(); process.exit(1) })

const generation = await spawnClient({ executable, args, stdinPayload, runDir, stdoutPath, stderrPath, timeoutMs: options.timeoutMs, artifactPath })
meta.generation = generation
meta.durationMs = generation.durationMs
const startedEpoch = startedEpochMs
const finishedEpoch = Date.now()

const usage = options.config.startsWith('opencode-')
  ? attributeOpenCodeUsage(runDir, startedEpoch, finishedEpoch)
  : unavailableUsage('dsh does not expose an implemented run-attribution source')

const artifact = await readArtifact(artifactPath)
const evaluation = await evaluateGenericArtifact({ runDir, outputPath: artifactPath, caseId: options.task === 'dashboard' ? 'dashboard' : options.task })

let vision = null
if (options.vision && evaluation.screenshot) {
  const visionResult = spawnVision('node', [join(HERE, 'vision.mjs'), runDir, options.task], { encoding: 'utf8', env: { ...process.env } })
  if (visionResult.status === 0) {
    try { vision = JSON.parse(await readFile(join(runDir, 'vision.json'), 'utf8')) } catch {}
  } else {
    vision = { status: 'unavailable', reason: `vision process ${visionResult.status}: ${String(visionResult.stderr || '').slice(0, 200)}` }
  }
}

const finishedAt = new Date().toISOString()
const output = {
  ...meta,
  finishedAt,
  rules: meta.rules,
  ruleState: meta.ruleState,
  exitCode: generation.exitCode,
  signal: generation.signal,
  timedOut: generation.timedOut,
  usage,
  artifact: artifact ? { bytes: artifact.bytes, hash: artifact.hash } : null,
  evaluation,
  vision,
}
await writeFile(join(runDir, 'meta.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  runId: output.runId,
  exitCode: output.exitCode,
  timedOut: output.timedOut,
  durationMs: output.durationMs,
  fullPass: evaluation.fullPass,
  contract: `${evaluation.contractPassed}/${evaluation.contractTotal}`,
  runtimePass: evaluation.runtimePass,
  interactionPass: evaluation.interactionPass,
  visualSanity: evaluation.visualSanity,
  vision: vision?.status ?? 'not-run',
  usage: usage.status,
}, null, 2))

async function spawnClient({ executable, args, stdinPayload, runDir, stdoutPath, stderrPath, timeoutMs, artifactPath }) {
  return new Promise((resolveExit, reject) => {
    const started = Date.now()
    const child = spawn(executable, args, {
      cwd: options.config.startsWith('dsh-') ? DSH_ROOT : runDir,
      env: process.env,
      stdio: [
        stdinPayload == null ? 'ignore' : 'pipe',
        'pipe', 'pipe',
      ],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    if (stdinPayload != null) child.stdin.end(stdinPayload)
    const timeout = setTimeout(() => {
      try { child.kill('SIGTERM') } catch {}
    }, timeoutMs)
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timeout)
      writeFile(stdoutPath, stdout).catch(() => {})
      writeFile(stderrPath, stderr).catch(() => {})
      resolveExit({
        exitCode,
        signal,
        timedOut: signal === 'SIGTERM' && Date.now() - started >= timeoutMs - 3_000,
        durationMs: Date.now() - started,
        startedEpochMs: started,
        stdout,
        stderr,
      })
    })
  })
}

function promptFor(task) {
  const prompts = {
    blackhole: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild an interactive 3D black hole render with Three.js: an accretion disk of glowing particles, bloom postprocessing, a starfield, and an orbiting or draggable camera. The page must start animating immediately and show the scene on load. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    helicopter: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild an interactive 3D helicopter with Three.js: accurate model (fuselage, tail boom, tail rotor, 4-blade main rotor, skids, cockpit), physics (RPM, torque counteraction, hover bobbing, banking), controls (W/S pitch, A/D roll, Q/E yaw, Space collective, arrow keys), a HUD (altitude, speed, RPM, throttle), and a terrain/ground. The scene must render immediately. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    race: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild a lively SVG animation race on a Martian ring road: a rabbit riding a bicycle, a turtle riding a motorcycle, and a bald eagle riding a human-pedaled tricycle, racing from a start line to a finish line. Characters and vehicles must be detailed, movement must look natural, and a leaderboard or ranking must update. The animation must run immediately on load. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    game: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild a playable space shooter game on a canvas: player ship that moves with arrow keys or WASD and shoots with Space, enemy ships that spawn and move, collision handling with explosions, a score display, and a start screen. The game must render and be controllable immediately. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    music: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild a browser music visualizer using WebAudio: an analyser with at least 60 frequency bins, at least three visual modes (e.g. bars, rings, particles) switchable by buttons, support for a file input and microphone, playback controls, and smooth animated rendering. The canvas must draw visible animation immediately. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    dashboard: `Create artifact.html as one self-contained HTML file with no external assets or libraries. Do not modify files outside that path.\n\nBuild a working sales analytics dashboard with these exact acceptance requirements:\n1. Generate a deterministic, non-empty sample dataset in the browser for at least 2 regions, 3 categories, and 6 monthly periods.\n2. Show exactly four populated KPI cards: revenue, orders, average order value, and profit or margin.\n3. Render four populated charts: line trend, category bars, regional share donut/pie, and spend-vs-revenue scatter. Use inline SVG or canvas.\n4. Provide region and category filters plus a period range control; changing them must update KPIs and charts.\n5. Provide a Refresh data button that generates a different dataset and updates every KPI and chart.\n6. Provide hover details/tooltips on chart marks.\n7. Load with no JavaScript errors and with meaningful data already visible.\n\nWrite the file, open or execute an appropriate verification, fix any failed requirement, and stop once the acceptance requirements pass.`,
  }
  return prompts[task] || prompts.dashboard
}

async function readArtifact(path) {
  try {
    const buffer = await readFile(path)
    return { bytes: buffer.length, hash: sha256(buffer.toString('utf8')) }
  } catch { return null }
}

function attributeOpenCodeUsage(directory, started, finished) {
  const title = `${options.config.replace('opencode-', '')}-${options.task}`
  const query = `SELECT id,title,directory,model,cost,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_created,time_updated FROM session WHERE title=${sqlString(title)} AND time_created>=${started - 2_000} AND time_created<=${finished + 5_000} ORDER BY time_created ASC;`
  const result = spawnSync('sqlite3', ['-json', OPENCODE_DB, query], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (result.status !== 0) return unavailableUsage(`sqlite query failed: ${String(result.stderr || '').trim()}`)
  let rows
  try { rows = JSON.parse(result.stdout || '[]') } catch (error) { return unavailableUsage(`sqlite returned invalid JSON: ${error.message}`) }
  if (rows.length !== 1) return unavailableUsage(`expected one session matched by title and time; found=${rows.length}`, rows.map((item) => item.id))
  const row = rows[0]
  if (row.directory !== directory) return unavailableUsage('session directory did not match the neutral run directory', [row.id])
  const model = parseJSON(row.model)
  if (!openCodeModelMatches(model, options.model)) return unavailableUsage('session model did not match the requested model', [row.id])
  const tokenValues = [row.tokens_input, row.tokens_output, row.tokens_reasoning, row.tokens_cache_read, row.tokens_cache_write]
  if (!tokenValues.every(Number.isFinite) || tokenValues.reduce((sum, value) => sum + value, 0) <= 0) return unavailableUsage('session usage was missing or all zero', [row.id])
  return {
    status: 'attributed',
    sessionId: row.id,
    sessionDirectory: row.directory,
    inputTokens: row.tokens_input,
    outputTokens: row.tokens_output,
    thinkingTokens: row.tokens_reasoning,
    cacheReadTokens: row.tokens_cache_read,
    cacheWriteTokens: row.tokens_cache_write,
    totalTokens: tokenValues.reduce((sum, value) => sum + value, 0),
    cost: row.cost,
    model,
  }
}

function openCodeModelMatches(model, requestedModel) {
  if (!model || typeof model !== 'object') return false
  const separator = requestedModel.indexOf('/')
  if (separator < 1) return false
  return model.providerID === requestedModel.slice(0, separator) && model.id === requestedModel.slice(separator + 1)
}

function unavailableUsage(reason, candidateSessionIds = []) {
  return { status: 'unavailable', reason, candidateSessionIds }
}

function parseJSON(value) { try { return JSON.parse(value) } catch { return value } }
function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'` }
function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function parseArgs(argv) {
  const result = { model: 'hroze-sp/deepseek-v4-flash', timeoutMs: 45 * 60 * 1000, vision: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--config') result.config = argv[++index]
    else if (argument === '--task') result.task = argv[++index]
    else if (argument === '--model') result.model = argv[++index]
    else if (argument === '--timeout-ms') result.timeoutMs = Number(argv[++index])
    else if (argument === '--vision') result.vision = true
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (!result.config || !result.task) throw new Error('--config and --task are required')
  return result
}