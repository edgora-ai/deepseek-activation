import {
  clickMatching,
  delay,
  dispatchKey,
  dispatchWheel,
  evaluate,
  screenshotDigest,
} from '../lib/cdp.mjs'
import { verifyDashboardBenchmark } from './benchmark-dashboard.mjs'

const word = (source, pattern) => pattern.test(source)
const check = (id, label, pass, detail = null) => ({ id, label, pass: Boolean(pass), detail })

export function caseIdForPath(path) {
  const name = path.toLowerCase()
  if (name.includes('blackhole') || name.includes('/round2/')) return 'blackhole'
  if (name.includes('helicopter') || name.includes('/helo/')) return 'helicopter'
  if (name.includes('race')) return 'race'
  if (name.includes('/dash-')) return 'dashboard'
  if (name.includes('/game-')) return 'game'
  if (name.includes('/music-')) return 'music'
  throw new Error(`no evaluation case for ${path}`)
}

export async function evaluateCase({ caseId, source, page, client }) {
  const staticSource = source.toLowerCase()
  const checks = await contractChecks(caseId, staticSource, page.runtime, client)
  const interaction = await exercise(caseId, page, client)
  return {
    checks,
    contractPassed: checks.filter((item) => item.pass).length,
    contractTotal: checks.length,
    interaction,
  }
}

async function contractChecks(caseId, source, runtime, client) {
  switch (caseId) {
    case 'blackhole':
      return [
        check('three', 'Three.js implementation', word(source, /three(?:\.|\/|\.module|\.min)/)),
        check('disk', 'particle accretion disk', word(source, /accretion/) && word(source, /particle|points/)),
        check('bloom', 'bloom or glow postprocessing', word(source, /unrealbloompass|effectcomposer|bloom/) && word(source, /glow|emissive|additiveblending/)),
        check('stars', 'starfield', word(source, /starfield|star count|stars/)),
        check('camera', 'orbiting or interactive camera', word(source, /orbitcontrols|camera.*(?:orbit|rotate)|auto.?orbit/)),
        check('surface', 'visible render surface', runtime.canvasCount > 0 || runtime.svgCount > 0),
      ]
    case 'helicopter':
      return [
        check('body', 'fuselage/cockpit body', word(source, /fuselage|cockpit/)),
        check('rotors', 'main and tail rotors', word(source, /main.?rotor/) && word(source, /tail.?rotor/)),
        check('skids', 'landing skids', word(source, /skid/)),
        check('controls', 'W/S/A/D/Q/E/Space controls', ['keyw', 'keys', 'keya', 'keyd', 'keyq', 'keye', 'space'].filter((token) => source.includes(token)).length >= 5 || word(source, /w\/?s/) && word(source, /a\/?d/) && word(source, /q\/?e/) && word(source, /space/)),
        check('physics', 'RPM/torque/hover/banking behavior', ['rpm', 'torque', 'hover', 'bank'].filter((token) => source.includes(token)).length >= 3),
        check('hud', 'altitude/speed/RPM HUD', ['altitude', 'speed', 'rpm'].every((token) => source.includes(token))),
        check('surface', 'visible render surface', runtime.canvasCount > 0 || runtime.svgCount > 0),
      ]
    case 'race':
      return [
        check('rabbit', 'rabbit on bicycle', word(source, /rabbit|hare|bunny/) && word(source, /bicycle|bike/)),
        check('turtle', 'turtle on motorcycle', word(source, /turtle/) && word(source, /motorcycle|motorbike|motor/)),
        check('eagle', 'bald eagle on tricycle', word(source, /eagle/) && word(source, /tricycle|trike/)),
        check('svg', 'inline SVG scene', runtime.svgCount > 0 && word(source, /<svg/)),
        check('animation', 'animated movement', word(source, /requestanimationframe|@keyframes|animate(?:transform|motion)?/)),
        check('race-course', 'start and finish course markers', word(source, /start/) && word(source, /finish/)),
        check('leaderboard', 'leaderboard or ranking', word(source, /leaderboard|scoreboard|position|rank|lap/)),
      ]
    case 'dashboard': {
      const benchmark = await verifyDashboardBenchmark(client, { profile: 'legacy' })
      return benchmark.checks.map((item) => check(
        item.id,
        item.id.replaceAll('-', ' '),
        item.pass,
        item.observed,
      ))
    }
    case 'game':
      return [
        check('ship', 'player ship', word(source, /ship|player/)),
        check('enemies', 'enemy entities', word(source, /enem/)),
        check('collision', 'collision handling', word(source, /collid|collision|intersect/)),
        check('score', 'score tracking', word(source, /score/)),
        check('particles', 'explosion particles', word(source, /particle/) && word(source, /explosion|explode/)),
        check('powerups', 'power-up system', word(source, /power.?up|pickup|shield/)),
        check('controls', 'movement and shooting controls', word(source, /keydown|keyup/) && word(source, /space|shoot|fire/)),
        check('surface', 'visible game canvas', runtime.canvasCount > 0),
      ]
    case 'music': {
      const modeLabels = await evaluate(client, `[...document.querySelectorAll('button,[role="button"]')].map((e)=>(e.textContent||'').trim().toLowerCase())`)
      const modeCount = ['bars', 'rings', 'particles', 'neon', 'ocean', 'sunset', 'theme', 'palette'].filter((needle) => modeLabels.some((label) => label.includes(needle))).length
      return [
        check('audio', 'WebAudio analyser', word(source, /audiocontext|webkitaudiocontext/) && word(source, /createanalyser/)),
        check('spectrum', '60+ spectrum representation', word(source, /\b(?:60|64|72|80|96|128)\b/) || word(source, /frequencybincount/)),
        check('modes', 'three visual modes or themes', modeCount >= 3, `mode labels=${modeCount}`),
        check('sources', 'file and microphone sources', word(source, /type=["']file["']/) && word(source, /getusermedia/)),
        check('controls', 'playback controls', word(source, /play/) && word(source, /pause|stop/)),
        check('smoothing', 'smoothed analyser response', word(source, /smoothingtimeconstant|lerp|smooth/)),
        check('surface', 'visible visualizer canvas', runtime.canvasCount > 0),
      ]
    }
    default:
      throw new Error(`unknown evaluation case ${caseId}`)
  }
}

async function exercise(caseId, page, client) {
  const beforeDigest = screenshotDigest(page.before)
  let action = 'wait'
  let actionFound = true
  switch (caseId) {
    case 'dashboard':
      action = 'click refresh'
      actionFound = await clickMatching(client, ['refresh', '刷新'])
      break
    case 'game':
      action = 'start, move, shoot'
      actionFound = await clickMatching(client, ['start', 'mission', 'play'])
      await dispatchKey(client, 'w', 'KeyW')
      await dispatchKey(client, ' ', 'Space')
      break
    case 'music':
      action = 'switch visual mode'
      actionFound = await clickMatching(client, ['rings', 'particles', 'palette', 'theme'])
      break
    case 'helicopter':
      action = 'throttle and pitch'
      await dispatchKey(client, ' ', 'Space')
      await dispatchKey(client, 'w', 'KeyW')
      await dispatchKey(client, 'a', 'KeyA')
      break
    case 'blackhole':
      action = 'zoom camera'
      await dispatchWheel(client)
      break
    case 'race':
      action = 'observe animation'
      break
  }
  await delay(caseId === 'race' ? 1_500 : 900)
  const after = await page.after(0)
  const afterDigest = screenshotDigest(after)
  return {
    action,
    actionFound,
    changed: beforeDigest !== afterDigest,
    after,
  }
}
