#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OPENCODE_INFRASTRUCTURE_METHOD_VERSION } from './lib/opencode-infrastructure.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const options = parseArgs(process.argv.slice(2))
const metaPath = resolve(options.meta)
const meta = JSON.parse(await readFile(metaPath, 'utf8'))
const rules = rulesFor(options.repeat, options.slot)
const caseModule = await import(
  pathToFileURL(resolve(HERE, `cases/${options.caseId}.mjs`))
)
const promptHash = sha256(caseModule.prompt(caseModule.outputName))
const ruleState = await expectedRuleState(rules)
const expectedRunId = `opencode-${options.caseId}-r${options.repeat}-${rules}`
const expectedTitle = `opencode-${options.caseId}-r${options.repeat}-slot-${options.slot}`
const expectedDirectory = dirname(metaPath)
const tokens = [
  meta.usage?.inputTokens,
  meta.usage?.outputTokens,
  meta.usage?.thinkingTokens,
  meta.usage?.cacheReadTokens,
  meta.usage?.cacheWriteTokens,
]

assertEqual(meta.runId, expectedRunId, 'runId')
assertEqual(meta.sessionTitle, expectedTitle, 'sessionTitle')
assertEqual(meta.client, 'opencode', 'client')
assertEqual(meta.model, options.model, 'model')
assertEqual(meta.rules, rules, 'rules')
assertEqual(meta.caseId, options.caseId, 'caseId')
assertEqual(meta.repeat, options.repeat, 'repeat')
assertEqual(meta.slot, options.slot, 'slot')
const executionMode = meta.executionMode ?? 'serial-cases'
if (![
  'serial-cases',
  'parallel-cases',
  'resume-single',
  'serial-cases-overlapped',
].includes(executionMode)) {
  throw new Error(`unknown execution mode: ${executionMode}`)
}
if (executionMode === 'serial-cases') {
  if (meta.concurrencyGroup !== undefined && meta.concurrencyGroup !== null) {
    throw new Error('serial execution must not name a concurrency group')
  }
} else {
  assertEqual(
    meta.concurrencyGroup,
    `r${options.repeat}-slot-${options.slot}`,
    'concurrency group',
  )
}
assertEqual(meta.ruleState, ruleState, 'ruleState')
assertEqual(meta.promptHash, promptHash, 'promptHash')
assertEqual(meta.evaluation?.methodVersion, 5, 'evaluation method')
assertEqual(
  meta.infrastructureMethodVersion,
  OPENCODE_INFRASTRUCTURE_METHOD_VERSION,
  'infrastructure method',
)
assertEqual(meta.infrastructureFailure, null, 'infrastructure failure')
assertEqual(meta.usage?.status, 'attributed', 'usage status')
assertEqual(meta.usage?.sessionDirectory, expectedDirectory, 'usage directory')
if (!meta.usage?.sessionId) throw new Error('usage sessionId is missing')
if (!tokens.every(Number.isFinite) || tokens.reduce((sum, value) => sum + value, 0) <= 0) {
  throw new Error('usage token fields are missing or non-positive')
}
if (!Array.isArray(meta.command) || !meta.command.includes('<RUN_DIR>')) {
  throw new Error('command does not contain the neutral run-directory placeholder')
}
if (/no-rules|current|candidate-v2/.test(JSON.stringify(meta.command))) {
  throw new Error('command exposes a treatment name')
}
await access(resolve(expectedDirectory, meta.stdout))
await access(resolve(expectedDirectory, meta.stderr))
await access(resolve(expectedDirectory, 'meta.json'))
if (meta.evaluation?.generated) {
  await access(resolve(expectedDirectory, meta.artifact))
  await access(resolve(expectedDirectory, meta.evaluation.screenshot))
}

console.log(`[existing-valid] run=${meta.runId}`)

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!value) throw new Error(`${name} requires a value`)
    if (name === '--meta') options.meta = value
    else if (name === '--model') options.model = value
    else if (name === '--case') options.caseId = value
    else if (name === '--repeat') options.repeat = Number(value)
    else if (name === '--slot') options.slot = Number(value)
    else throw new Error(`unknown argument: ${name}`)
  }
  if (
    !options.meta
    || !options.model
    || !options.caseId
    || !Number.isInteger(options.repeat)
    || !Number.isInteger(options.slot)
  ) {
    throw new Error(
      'usage: node eval/validate-existing-run.mjs --meta PATH --model MODEL --case CASE --repeat N --slot N',
    )
  }
  return options
}

function rulesFor(repeat, slot) {
  const orders = {
    1: ['no-rules', 'current', 'candidate-v2'],
    2: ['current', 'candidate-v2', 'no-rules'],
    3: ['candidate-v2', 'no-rules', 'current'],
  }
  const rules = orders[repeat]?.[slot - 1]
  if (!rules) throw new Error(`no treatment mapping for repeat ${repeat} slot ${slot}`)
  return rules
}

async function expectedRuleState(rules) {
  if (rules === 'no-rules') return 'absent'
  const path = rules === 'current'
    ? resolve(HERE, 'rules/current/AGENTS.md')
    : resolve(HERE, 'rules/candidate-v2/AGENTS.md')
  return sha256(await readFile(path))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
    )
  }
}
