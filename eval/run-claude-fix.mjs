#!/usr/bin/env node
// Optimization-round runner: model reads its existing artifact.html, fixes a
// given problem list, rewrites the file, and the same evaluator re-checks it.
// usage: node run-claude-fix.mjs --model <id> --task <case> [--timeout-ms N]
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateGenericArtifact } from './lib/evaluate-generic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const RUNS = join(REPO, 'docs/results/eval-v6-fix-round')
const PROBLEMS = {
  helicopter: `The existing artifact.html does NOT render the 3D scene: the page shows only a HUD/background. Find the rendering bug (likely the Three.js renderer, camera, scene setup, or a missing render loop) and fix it so a visible helicopter with terrain actually renders. Keep HUD/controls working.`,
  game: `The existing artifact.html is missing these requirements: (1) collision handling between player and enemies, (2) explosion particles when enemies are destroyed, (3) a power-up system, (4) a working Start button/screen so the game actually starts. Fix all four.`,
  blackhole: `The existing artifact.html already passes requirements. Optimize the visual quality: richer accretion disk detail, smoother bloom, more visible starfield, or better camera motion. Do not break anything that already works.`,
}

const options = parseArgs(process.argv.slice(2))
const runDir = join(RUNS, options.model, options.task)
try {
  await readFile(join(runDir, 'meta.json'))
  throw new Error(`run directory already contains meta.json; refusing to overwrite: ${runDir}`)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
await mkdir(runDir, { recursive: true })

const baseArtifact = `/home/ubuntu/deepseek-activation/docs/results/eval-v5-claude-models/runs/${options.model}/${options.task}/artifact.html`
const problem = PROBLEMS[options.task]
if (!problem) throw new Error(`no problem list for task ${options.task}`)
const prompt = `Open the existing file ${baseArtifact} and fix it in place (do not create other files).\n\n${problem}\n\nAfter fixing, verify it loads without errors and stop. Write the fixed file to the SAME path ${baseArtifact}.`

const baseMeta = `/home/ubuntu/deepseek-activation/docs/results/eval-v5-claude-models/runs/${options.model}/${options.task}/meta.json`
let baseline = null
try { baseline = JSON.parse(await readFile(baseMeta, 'utf8')) } catch {}

const startedAt = new Date().toISOString()
await writeFile(join(runDir, 'prompt.txt'), `${prompt}\n`)
const generation = await spawnClient({
  executable: 'claude',
  args: ['-p', '--model', options.model, prompt],
  cwd: runDir,
  env: { ...process.env },
  timeoutMs: options.timeoutMs,
})
await writeFile(join(runDir, 'stdout.log'), generation.stdout)
await writeFile(join(runDir, 'stderr.log'), generation.stderr)

const artifactPath = join(runDir, 'artifact.html')
const artifact = await readArtifact(artifactPath)
const evaluation = await evaluateGenericArtifact({ runDir, outputPath: artifactPath, caseId: options.task })

let vision = null
if (evaluation.screenshot) {
  const visionResult = spawnSync('node', [join(HERE, 'vision.mjs'), runDir, options.task], { encoding: 'utf8', env: { ...process.env } })
  if (visionResult.status === 0) {
    try { vision = JSON.parse(await readFile(join(runDir, 'vision.json'), 'utf8')) } catch {}
  }
}

const output = {
  runId: `${options.model}-${options.task}-fix`,
  model: options.model,
  task: options.task,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: generation.durationMs,
  exitCode: generation.exitCode,
  signal: generation.signal,
  timedOut: generation.timedOut,
  baseline: baseline ? {
    fullPass: baseline.evaluation?.fullPass ?? null,
    contract: `${baseline.evaluation?.contractPassed ?? 0}/${baseline.evaluation?.contractTotal ?? 0}`,
    runtimeErrors: (baseline.evaluation?.runtimeErrors ?? []).length,
  } : null,
  artifact,
  evaluation,
  vision,
  usage: { status: 'unavailable', reason: 'claude does not expose a run-attribution source' },
}
await writeFile(join(runDir, 'meta.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  runId: output.runId,
  fullPass: evaluation.fullPass,
  contract: `${evaluation.contractPassed}/${evaluation.contractTotal}`,
  runtimePass: evaluation.runtimePass,
  interaction: evaluation.interactionPass,
  visual: evaluation.visualSanity,
  vision: vision?.status === 'ok' ? vision.valid : vision?.status,
}, null, 2))

async function spawnClient({ executable, args, cwd, env, timeoutMs }) {
  return new Promise((resolveExit, reject) => {
    const started = Date.now()
    const child = spawn(executable, args, { cwd, env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timeout = setTimeout(() => { try { child.kill('SIGTERM') } catch {} }, timeoutMs)
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timeout)
      resolveExit({ exitCode, signal, durationMs: Date.now() - started, stdout, stderr })
    })
  })
}

async function readArtifact(path) {
  try {
    const buffer = await readFile(path)
    return { bytes: buffer.length, hash: createHash('sha256').update(buffer.toString('utf8')).digest('hex') }
  } catch { return null }
}

function parseArgs(argv) {
  const result = { timeoutMs: 30 * 60 * 1000 }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--model') result.model = argv[++index]
    else if (argument === '--task') result.task = argv[++index]
    else if (argument === '--timeout-ms') result.timeoutMs = Number(argv[++index])
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (!result.model || !result.task) throw new Error('--model and --task are required')
  return result
}