#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { constants, createWriteStream } from 'node:fs'
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { finished } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evaluateAbArtifact } from './lib/evaluate-ab.mjs'
import {
  detectOpenCodeInfrastructureFailure,
  OPENCODE_INFRASTRUCTURE_METHOD_VERSION,
} from './lib/opencode-infrastructure.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const RUNS = join(REPO, 'docs/results/eval-v2/runs')
const ACTIVE_RULE = join(process.env.HOME || '/home/ubuntu', '.config/opencode/AGENTS.md')
const CURRENT_RULE = join(HERE, 'rules/current/AGENTS.md')
const CANDIDATE_RULE = join(HERE, 'rules/candidate-v2/AGENTS.md')
const OPENCODE_DB = join(process.env.HOME || '/home/ubuntu', '.local/share/opencode/opencode.db')
const options = parseArgs(process.argv.slice(2))
options.rules = rulesFor(options.repeat, options.slot)
const caseModule = await loadCase(options.caseId)
const runId = `${options.client}-${caseModule.id}-r${options.repeat}-${options.rules}`
const slot = options.slot
const sessionTitle = `${options.client}-${caseModule.id}-r${options.repeat}-slot-${slot}`
const runDir = join(RUNS, options.client, `repeat-${options.repeat}`, `slot-${slot}`, caseModule.id)
const outputPath = join(runDir, caseModule.outputName)
const prompt = caseModule.prompt(caseModule.outputName)
const activeRuleHash = await fileHashOrAbsent(ACTIVE_RULE)
const expectedRuleHash = await expectedRuleHashFor(options.rules)

if (!options.dryRun && activeRuleHash !== expectedRuleHash) {
  throw new Error(`active OpenCode rule hash mismatch for slot ${slot}`)
}

if (options.dryRun) {
  console.log(JSON.stringify({
    runId,
    runDir,
    outputPath,
    client: options.client,
    model: options.model,
    rules: options.rules,
    slot,
    executionMode: options.executionMode,
    concurrencyGroup: options.concurrencyGroup,
    sessionTitle,
    promptHash: sha256(prompt),
    activeRuleHash,
    fixture: caseModule.fixture ? fileURLToPath(caseModule.fixture) : null,
    command: commandFor(options.client, options.model, prompt, sessionTitle, runDir).display,
  }, null, 2))
  process.exit(0)
}

await assertFreshRun(runDir)
await mkdir(runDir, { recursive: true })
let initialArtifactHash = null
if (caseModule.fixture) {
  await copyFile(fileURLToPath(caseModule.fixture), outputPath)
  initialArtifactHash = sha256(await readFile(outputPath))
}
await writeFile(join(runDir, 'prompt.txt'), `${prompt}\n`)

const startedEpochMs = Date.now()
const startedAt = new Date(startedEpochMs).toISOString()
const stdoutPath = join(runDir, 'stdout.log')
const stderrPath = join(runDir, 'stderr.log')
const command = commandFor(options.client, options.model, prompt, sessionTitle, runDir)
const generation = await runClient(command, {
  cwd: runDir,
  stdoutPath,
  stderrPath,
  timeoutMs: options.timeoutMs,
  artifactPath: outputPath,
})
if (generation.interruptedSignal) {
  throw new Error(`run interrupted by ${generation.interruptedSignal}`)
}
const finishedEpochMs = Date.now()
const finishedAt = new Date(finishedEpochMs).toISOString()
const infrastructureFailure = await detectInfrastructureFailure(options.client, stdoutPath, stderrPath)
const usage = options.client === 'opencode'
  ? attributeOpenCodeUsage(runDir, sessionTitle, options.model, startedEpochMs, finishedEpochMs)
  : unavailableUsage('client does not expose an implemented run-attribution source')
const evaluationStarted = Date.now()
const evaluation = await evaluateAbArtifact({
  runDir,
  outputPath,
  probeCaseId: caseModule.probeCaseId,
  requireSelfContained: caseModule.id === 'build-dashboard',
  initialArtifactHash,
})
const evaluationDurationMs = Date.now() - evaluationStarted

const meta = {
  schemaVersion: 1,
  runId,
  sessionTitle,
  client: options.client,
  model: options.model,
  rules: options.rules,
  slot,
  executionMode: options.executionMode,
  concurrencyGroup: options.concurrencyGroup,
  ruleHash: activeRuleHash === 'absent' ? null : activeRuleHash,
  ruleState: activeRuleHash,
  promptHash: sha256(prompt),
  fixtureHash: initialArtifactHash,
  caseId: caseModule.id,
  repeat: options.repeat,
  startedAt,
  finishedAt,
  startedEpochMs,
  finishedEpochMs,
  durationMs: generation.durationMs,
  evaluationDurationMs,
  totalDurationMs: generation.durationMs + evaluationDurationMs,
  exitCode: generation.exitCode,
  signal: generation.signal,
  timedOut: generation.timedOut,
  infrastructureMethodVersion: OPENCODE_INFRASTRUCTURE_METHOD_VERSION,
  infrastructureFailure,
  command: command.display,
  stdout: relative(runDir, stdoutPath),
  stderr: relative(runDir, stderrPath),
  artifact: evaluation.generated ? relative(runDir, outputPath) : null,
  usage,
  evaluation,
}
await writeFile(join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, { flag: 'wx' })
console.log(JSON.stringify({
  runId,
  exitCode: meta.exitCode,
  timedOut: meta.timedOut,
  infrastructureFailure: meta.infrastructureFailure,
  durationMs: meta.durationMs,
  usage: meta.usage.status,
  evaluation: {
    generated: evaluation.generated,
    artifactChanged: evaluation.artifactChanged,
    syntaxPass: evaluation.syntaxPass,
    runtimePass: evaluation.runtimePass,
    contract: `${evaluation.contractPassed}/${evaluation.contractTotal}`,
    interactionPass: evaluation.interactionPass,
    fullPass: evaluation.fullPass,
  },
  meta: relative(REPO, join(runDir, 'meta.json')),
}, null, 2))
if (infrastructureFailure) {
  console.error(`[invalid] provider infrastructure failure status=${infrastructureFailure.statusCode ?? 'unknown'} retryable=${infrastructureFailure.retryable}`)
  process.exitCode = 75
}

async function runClient(command, { cwd, stdoutPath, stderrPath, timeoutMs, artifactPath }) {
  const stdout = createWriteStream(stdoutPath, { flags: 'wx' })
  const stderr = createWriteStream(stderrPath, { flags: 'wx' })
  const started = Date.now()
  const child = spawn(command.executable, command.args, {
    cwd,
    detached: true,
    env: { ...process.env, PWD: cwd },
    stdio: [command.stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  })
  if (command.stdin != null) {
    child.stdin.end(command.stdin)
  }
  let stdoutBytes = 0
  let stderrBytes = 0
  child.stdout.on('data', (chunk) => { stdoutBytes += chunk.length; stdout.write(chunk) })
  child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; stderr.write(chunk) })
  let timedOut = false
  let escalation = null
  let interruptedSignal = null
  const signalHandlers = new Map()
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => {
      if (interruptedSignal) return
      interruptedSignal = signal
      console.error(`[interrupt] pid=${child.pid} received ${signal}; sending SIGTERM to its process group`)
      terminateProcessGroup(child.pid, 'SIGTERM')
      escalation = setTimeout(() => terminateProcessGroup(child.pid, 'SIGKILL'), 10_000)
      escalation.unref()
    }
    signalHandlers.set(signal, handler)
    process.once(signal, handler)
  }
  const heartbeat = setInterval(async () => {
    const artifactBytes = await fileSize(artifactPath)
    const health = processHealth(child.pid)
    console.log(`[heartbeat] pid=${child.pid} elapsed=${Math.round((Date.now() - started) / 1000)}s state=${health.state} cpu=${health.cpu} net=${health.established} stdout=${stdoutBytes} stderr=${stderrBytes} artifact=${artifactBytes}`)
  }, 60_000)
  heartbeat.unref()
  const timeout = setTimeout(() => {
    timedOut = true
    console.error(`[timeout] pid=${child.pid} exceeded ${timeoutMs}ms; sending SIGTERM to its process group`)
    terminateProcessGroup(child.pid, 'SIGTERM')
    escalation = setTimeout(() => terminateProcessGroup(child.pid, 'SIGKILL'), 10_000)
    escalation.unref()
  }, timeoutMs)
  timeout.unref()
  const result = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolveExit({ exitCode, signal }))
  })
  clearInterval(heartbeat)
  clearTimeout(timeout)
  if (escalation) clearTimeout(escalation)
  for (const [signal, handler] of signalHandlers) {
    process.removeListener(signal, handler)
  }
  stdout.end()
  stderr.end()
  await Promise.all([finished(stdout), finished(stderr)])
  return {
    ...result,
    timedOut,
    interruptedSignal,
    durationMs: Date.now() - started,
  }
}

function processHealth(pid) {
  const ps = spawnSync('ps', ['-o', 'stat=,pcpu=,wchan=', '-p', String(pid)], { encoding: 'utf8' })
  const fields = String(ps.stdout || '').trim().split(/\s+/)
  const sockets = spawnSync('ss', ['-H', '-tnp', 'state', 'established'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
  const established = String(sockets.stdout || '').split('\n').filter((line) => line.includes(`pid=${pid},`)).length
  return {
    state: fields[0] || 'gone',
    cpu: fields[1] || '0',
    wait: fields.slice(2).join(' ') || 'none',
    established,
  }
}

function terminateProcessGroup(pid, signal) {
  try { process.kill(-pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error }
}

function commandFor(client, model, prompt, sessionTitle, directory) {
  switch (client) {
    case 'opencode':
      return {
        executable: 'opencode',
        args: ['run', '--model', model, '--format', 'json', '--title', sessionTitle, '--dir', directory, prompt],
        stdin: null,
        display: ['opencode', 'run', '--model', model, '--format', 'json', '--title', sessionTitle, '--dir', '<RUN_DIR>', '<PROMPT>'],
      }
    case 'claude':
      return {
        executable: 'claude',
        args: ['-p', '--model', model],
        stdin: prompt,
        display: ['claude', '-p', '--model', model, '<PROMPT via stdin>'],
      }
    case 'codex':
      return {
        executable: 'codex',
        args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '--model', model, '-'],
        stdin: prompt,
        display: ['codex', 'exec', '--dangerously-bypass-approvals-and-sandbox', '--model', model, '-'],
      }
    default:
      throw new Error(`unsupported client: ${client}`)
  }
}

async function detectInfrastructureFailure(client, stdoutPath, stderrPath) {
  if (client !== 'opencode') return null
  const [stdout, stderr] = await Promise.all([
    readFile(stdoutPath, 'utf8'),
    readFile(stderrPath, 'utf8'),
  ])
  return detectOpenCodeInfrastructureFailure(stdout, stderr)
}

function attributeOpenCodeUsage(directory, sessionTitle, requestedModel, started, finished) {
  const query = `SELECT id,title,directory,model,cost,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_created,time_updated FROM session WHERE title=${sqlString(sessionTitle)} AND time_created>=${started - 2_000} AND time_created<=${finished + 5_000} ORDER BY time_created ASC;`
  const result = spawnSync('sqlite3', ['-json', OPENCODE_DB, query], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (result.status !== 0) return unavailableUsage(`sqlite query failed: ${String(result.stderr || '').trim()}`)
  let rows
  try {
    rows = JSON.parse(result.stdout || '[]')
  } catch (error) {
    return unavailableUsage(`sqlite returned invalid JSON: ${error.message}`)
  }
  if (rows.length !== 1) return unavailableUsage(`expected one session matched by title and time; found=${rows.length}`, rows.map((item) => item.id))
  const row = rows[0]
  if (row.directory !== directory) return unavailableUsage('session directory did not match the neutral run directory', [row.id])
  const model = parseJSON(row.model)
  if (!openCodeModelMatches(model, requestedModel)) return unavailableUsage('session model did not match the requested model', [row.id])
  const tokenValues = [row.tokens_input, row.tokens_output, row.tokens_reasoning, row.tokens_cache_read, row.tokens_cache_write]
  if (!tokenValues.every(Number.isFinite) || tokenValues.reduce((sum, value) => sum + value, 0) <= 0) {
    return unavailableUsage('session usage was missing or all zero', [row.id])
  }
  return {
    status: 'attributed',
    match: 'title-directory-model-and-time',
    source: relative(process.env.HOME || '/home/ubuntu', OPENCODE_DB),
    sessionId: row.id,
    sessionDirectory: row.directory,
    inputTokens: row.tokens_input,
    outputTokens: row.tokens_output,
    thinkingTokens: row.tokens_reasoning,
    cacheReadTokens: row.tokens_cache_read,
    cacheWriteTokens: row.tokens_cache_write,
    cost: row.cost,
    model,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

function openCodeModelMatches(model, requestedModel) {
  if (!model || typeof model !== 'object') return false
  const separator = requestedModel.indexOf('/')
  if (separator < 1) return false
  return model.providerID === requestedModel.slice(0, separator) && model.id === requestedModel.slice(separator + 1)
}

function unavailableUsage(reason, candidateSessionIds = []) {
  return {
    status: 'unavailable',
    reason,
    candidateSessionIds,
    sessionId: null,
    inputTokens: null,
    outputTokens: null,
    thinkingTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    cost: null,
    model: null,
    timeCreated: null,
    timeUpdated: null,
  }
}

async function loadCase(caseId) {
  if (!['build-dashboard', 'fix-dashboard'].includes(caseId)) throw new Error(`unknown case: ${caseId}`)
  return import(pathToFileURL(join(HERE, 'cases', `${caseId}.mjs`)))
}

async function assertFreshRun(runDir) {
  if (await exists(runDir)) throw new Error(`run directory already exists; refusing to overwrite: ${runDir}`)
}

async function fileHashOrAbsent(path) {
  try { return sha256(await readFile(path)) } catch (error) { if (error.code === 'ENOENT') return 'absent'; throw error }
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true } catch { return false }
}

async function fileSize(path) {
  try { return (await stat(path)).size } catch { return 0 }
}

function sha256(value) { return createHash('sha256').update(value).digest('hex') }
function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'` }
function parseJSON(value) { try { return JSON.parse(value) } catch { return value } }

function rulesFor(repeat, slot) {
  const orders = {
    1: ['no-rules', 'current', 'candidate-v2'],
    2: ['current', 'candidate-v2', 'no-rules'],
    3: ['candidate-v2', 'no-rules', 'current'],
  }
  const rules = orders[repeat]?.[slot - 1]
  if (!rules) throw new Error(`no treatment mapping for repeat ${repeat} and slot ${slot}`)
  return rules
}

async function expectedRuleHashFor(rules) {
  if (rules === 'no-rules') return 'absent'
  if (rules === 'current') return fileHashOrAbsent(CURRENT_RULE)
  if (rules === 'candidate-v2') return fileHashOrAbsent(CANDIDATE_RULE)
  throw new Error('unknown treatment mapping')
}

function parseArgs(argv) {
  const result = {
    client: 'opencode',
    model: 'hroze-sp/deepseek-v4-flash',
    timeoutMs: 2 * 60 * 60 * 1000,
    dryRun: false,
    executionMode: 'serial-cases',
    concurrencyGroup: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--client') result.client = argv[++index]
    else if (argument === '--model') result.model = argv[++index]
    else if (argument === '--case') result.caseId = argv[++index]
    else if (argument === '--repeat') result.repeat = Number(argv[++index])
    else if (argument === '--slot') result.slot = Number(argv[++index])
    else if (argument === '--timeout-ms') result.timeoutMs = Number(argv[++index])
    else if (argument === '--execution-mode') result.executionMode = argv[++index]
    else if (argument === '--concurrency-group') result.concurrencyGroup = argv[++index]
    else if (argument === '--dry-run') result.dryRun = true
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (!['opencode', 'claude', 'codex'].includes(result.client)) throw new Error(`invalid client: ${result.client}`)
  if (!['build-dashboard', 'fix-dashboard'].includes(result.caseId)) throw new Error(`invalid case: ${result.caseId}`)
  if (!Number.isInteger(result.repeat) || result.repeat < 1 || result.repeat > 3) throw new Error('repeat must be 1, 2, or 3')
  if (!Number.isInteger(result.slot) || result.slot < 1 || result.slot > 3) throw new Error('slot must be 1, 2, or 3')
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 1_000) throw new Error('timeout must be at least 1000ms')
  if (!['serial-cases', 'parallel-cases', 'resume-single'].includes(result.executionMode)) {
    throw new Error('execution mode must be serial-cases, parallel-cases, or resume-single')
  }
  if (
    result.concurrencyGroup !== null
    && !/^r[1-3]-slot-[1-3]$/.test(result.concurrencyGroup)
  ) {
    throw new Error('concurrency group must use the neutral rN-slot-N form')
  }
  if (result.executionMode !== 'serial-cases' && result.concurrencyGroup === null) {
    throw new Error('parallel and resume-single execution require a concurrency group')
  }
  return result
}
