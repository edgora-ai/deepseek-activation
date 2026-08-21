#!/usr/bin/env node
// Claude Code × free-model comparison runner. One run = one model × one task.
// Runs `claude -p --model <model>` from the run dir, then evaluates the
// produced artifact in a browser and asks gpt-5.6 for a visual verdict.
// Concurrency is handled by the launcher; this process is single-run.
// usage: node run-claude-models.mjs --model <id> --task <case> [--timeout-ms N] [--vision]
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateGenericArtifact } from './lib/evaluate-generic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ROOT = join(REPO, 'docs/results/eval-v5-claude-models')
const RUNS = join(ROOT, 'runs')

const options = parseArgs(process.argv.slice(2))
const runDir = join(RUNS, options.model, options.task)
try {
  await readFile(join(runDir, 'meta.json'))
  throw new Error(`run directory already contains meta.json; refusing to overwrite: ${runDir}`)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
await mkdir(runDir, { recursive: true })

const prompt = promptFor(options.task)
const startedAt = new Date().toISOString()
const startedEpoch = Date.now()
await writeFile(join(runDir, 'prompt.txt'), `${prompt}\n`)
const stdoutPath = join(runDir, 'stdout.log')
const stderrPath = join(runDir, 'stderr.log')

const generation = await spawnClient({
  executable: 'claude',
  args: ['-p', '--model', options.model, prompt],
  cwd: runDir,
  env: { ...process.env },
  timeoutMs: options.timeoutMs,
})
const meta = {}
meta.generation = generation
meta.startedAt = startedAt
meta.finishedAt = new Date().toISOString()
meta.durationMs = generation.durationMs
meta.exitCode = generation.exitCode
meta.signal = generation.signal
meta.timedOut = generation.timedOut
meta.model = options.model
meta.task = options.task
meta.runId = `${options.model}-${options.task}`

await writeFile(stdoutPath, generation.stdout)
await writeFile(stderrPath, generation.stderr)

const artifactPath = join(runDir, 'artifact.html')
const artifact = await readArtifact(artifactPath)
const evaluation = await evaluateGenericArtifact({ runDir, outputPath: artifactPath, caseId: options.task })

let vision = null
if (options.vision && evaluation.screenshot) {
  const visionResult = spawnSync('node', [join(HERE, 'vision.mjs'), runDir, options.task], { encoding: 'utf8', env: { ...process.env } })
  if (visionResult.status === 0) {
    try { vision = JSON.parse(await readFile(join(runDir, 'vision.json'), 'utf8')) } catch {}
  } else {
    vision = { status: 'unavailable', reason: `vision process ${visionResult.status}` }
  }
}

const output = {
  ...meta,
  artifact: artifact ? { bytes: artifact.bytes, hash: artifact.hash } : null,
  evaluation,
  vision,
  usage: unavailableUsage('claude does not expose an implemented run-attribution source'),
}
await writeFile(join(runDir, 'meta.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  runId: output.runId,
  model: options.model,
  task: options.task,
  exitCode: output.exitCode,
  timedOut: output.timedOut,
  durationMs: output.durationMs,
  fullPass: evaluation.fullPass,
  contract: `${evaluation.contractPassed}/${evaluation.contractTotal}`,
  runtimePass: evaluation.runtimePass,
  vision: vision?.status ?? 'not-run',
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
      resolveExit({
        exitCode,
        signal,
        timedOut: signal === 'SIGTERM' && Date.now() - started >= timeoutMs - 3_000,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      })
    })
  })
}

async function readArtifact(path) {
  try {
    const buffer = await readFile(path)
    return { bytes: buffer.length, hash: sha256(buffer.toString('utf8')) }
  } catch { return null }
}

function unavailableUsage(reason) { return { status: 'unavailable', reason } }
function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function promptFor(task) {
  const prompts = {
    blackhole: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild an interactive 3D black hole render with Three.js: an accretion disk of glowing particles, bloom postprocessing, a starfield, and an orbiting or draggable camera. The page must start animating immediately and show the scene on load. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    helicopter: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild an interactive 3D helicopter with Three.js: accurate model (fuselage, tail boom, tail rotor, 4-blade main rotor, skids, cockpit), physics (RPM, torque counteraction, hover bobbing, banking), controls (W/S pitch, A/D roll, Q/E yaw, Space collective, arrow keys), a HUD (altitude, speed, RPM, throttle), and a terrain/ground. The scene must render immediately. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    race: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild a lively SVG animation race on a Martian ring road: a rabbit riding a bicycle, a turtle riding a motorcycle, and a bald eagle riding a human-pedaled tricycle, racing from a start line to a finish line. Characters and vehicles must be detailed, movement must look natural, and a leaderboard or ranking must update. The animation must run immediately on load. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    game: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild a playable space shooter game on a canvas: player ship that moves with arrow keys or WASD and shoots with Space, enemy ships that spawn and move, collision handling with explosions, a score display, and a start screen. The game must render and be controllable immediately. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    music: `Create artifact.html as one self-contained HTML file with no external assets or libraries (all JavaScript and CSS inline). Do not modify any files outside artifact.html.\n\nBuild a browser music visualizer using WebAudio: an analyser with at least 60 frequency bins, at least three visual modes (e.g. bars, rings, particles) switchable by buttons, support for a file input and microphone, playback controls, and smooth animated rendering. The canvas must draw visible animation immediately. Write the file, verify it loads without errors, fix any failed requirement, and stop.`,
    dashboard: `Create artifact.html as one self-contained HTML file with no external assets or libraries. Do not modify files outside that path.\n\nBuild a working sales analytics dashboard with these exact acceptance requirements:\n1. Generate a deterministic, non-empty sample dataset in the browser for at least 2 regions, 3 categories, and 6 monthly periods.\n2. Show exactly four populated KPI cards: revenue, orders, average order value, and profit or margin.\n3. Render four populated charts: line trend, category bars, regional share donut/pie, and spend-vs-revenue scatter. Use inline SVG or canvas.\n4. Provide region and category filters plus a period range control; changing them must update KPIs and charts.\n5. Provide a Refresh data button that generates a different dataset and updates every KPI and chart.\n6. Provide hover details/tooltips on chart marks.\n7. Load with no JavaScript errors and with meaningful data already visible.\n\nWrite the file, open or execute an appropriate verification, fix any failed requirement, and stop once the acceptance requirements pass.`,
  }
  return prompts[task] || prompts.blackhole
}

function parseArgs(argv) {
  const result = { timeoutMs: 50 * 60 * 1000, vision: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--model') result.model = argv[++index]
    else if (argument === '--task') result.task = argv[++index]
    else if (argument === '--timeout-ms') result.timeoutMs = Number(argv[++index])
    else if (argument === '--vision') result.vision = true
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (!result.model || !result.task) throw new Error('--model and --task are required')
  return result
}