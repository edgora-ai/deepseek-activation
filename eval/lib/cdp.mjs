import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const CHROMIUM = process.env.CHROMIUM_PATH || '/snap/bin/chromium'

const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wav', 'audio/wav'],
])

/** Start a loopback-only static server rooted at rootDir. */
export async function startStaticServer(rootDir) {
  const root = resolve(rootDir)
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      const decoded = decodeURIComponent(url.pathname)
      const requested = resolve(root, `.${normalize(decoded)}`)
      const rel = relative(root, requested)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        response.writeHead(403).end('forbidden')
        return
      }
      const info = await stat(requested)
      const path = info.isDirectory() ? join(requested, 'index.html') : requested
      const body = await readFile(path)
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': MIME.get(extname(path).toLowerCase()) || 'application/octet-stream',
      })
      response.end(body)
    } catch (error) {
      response.writeHead(error?.code === 'ENOENT' ? 404 : 500).end('not found')
    }
  })
  await new Promise((resolveReady, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveReady)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('static server did not expose a TCP port')
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  }
}

class CdpClient {
  #id = 0
  #pending = new Map()
  #listeners = new Map()

  constructor(webSocketURL) {
    this.socket = new WebSocket(webSocketURL)
  }

  async connect(timeoutMs = 10_000) {
    await Promise.race([
      new Promise((resolveOpen, reject) => {
        this.socket.addEventListener('open', resolveOpen, { once: true })
        this.socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed to open')), { once: true })
      }),
      delay(timeoutMs).then(() => { throw new Error('timed out opening CDP WebSocket') }),
    ])
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.#pending.get(message.id)
        if (!pending) return
        this.#pending.delete(message.id)
        if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`))
        else pending.resolve(message.result)
        return
      }
      const listeners = this.#listeners.get(message.method) || []
      for (const listener of listeners) listener(message.params || {})
    })
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) || []
    listeners.push(listener)
    this.#listeners.set(method, listeners)
    return () => this.#listeners.set(method, listeners.filter((item) => item !== listener))
  }

  send(method, params = {}) {
    const id = ++this.#id
    return new Promise((resolveResult, reject) => {
      this.#pending.set(id, { resolve: resolveResult, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

/** Launch one isolated headless Chromium process and connect to its first page. */
export async function launchBrowser({ width = 1280, height = 800 } = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'deepseek-eval-chromium-'))
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ]
  const process = spawn(CHROMIUM, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  const webSocketURL = await Promise.race([
    new Promise((resolveURL, reject) => {
      process.once('error', reject)
      process.once('exit', (code) => reject(new Error(`Chromium exited before CDP was ready (${code})\n${stderr}`)))
      process.stderr.setEncoding('utf8')
      process.stderr.on('data', (chunk) => {
        stderr += chunk
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) resolveURL(match[1])
      })
    }),
    delay(15_000).then(() => { throw new Error(`timed out launching Chromium\n${stderr}`) }),
  ])

  const endpoint = new URL(webSocketURL)
  const targets = await pollJSON(`http://${endpoint.host}/json/list`, (items) => items.find((item) => item.type === 'page'))
  const client = new CdpClient(targets.webSocketDebuggerUrl)
  await client.connect()
  await Promise.all([
    client.send('Page.enable'),
    client.send('Runtime.enable'),
    client.send('Log.enable'),
  ])
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  return {
    client,
    stderr: () => stderr,
    async close() {
      client.close()
      process.kill('SIGTERM')
      await Promise.race([
        new Promise((resolveExit) => process.once('exit', resolveExit)),
        delay(2_000).then(() => process.kill('SIGKILL')),
      ])
      await rm(userDataDir, { force: true, recursive: true })
    },
  }
}

/** Navigate, collect runtime diagnostics, and return an interaction-ready page result. */
export async function inspectPage(browser, url, { settleMs = 2_500 } = {}) {
  const { client } = browser
  const exceptions = []
  const consoleErrors = []
  const logErrors = []
  const disposers = [
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      exceptions.push(formatException(exceptionDetails))
    }),
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error' && type !== 'assert') return
      consoleErrors.push(args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
    }),
    client.on('Log.entryAdded', ({ entry }) => {
      if (entry.level !== 'error') return
      if (/favicon\.ico/i.test(entry.url || '') || /favicon\.ico/i.test(entry.text || '')) return
      logErrors.push(`${entry.source}: ${entry.text}`)
    }),
  ]

  await client.send('Page.navigate', { url })
  await waitForReadyState(client, 15_000)
  await delay(settleMs)
  const before = await captureScreenshot(client)
  const [runtime, visual] = await Promise.all([
    evaluate(client, runtimeSnapshotExpression()),
    analyzeScreenshot(client, before),
  ])
  return {
    before,
    visual,
    consoleErrors,
    exceptions,
    logErrors,
    runtime,
    async after(waitMs = 750) {
      await delay(waitMs)
      return captureScreenshot(client)
    },
    dispose() {
      for (const dispose of disposers) dispose()
    },
  }
}

export async function evaluate(client, expression, { awaitPromise = true } = {}) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails) throw new Error(formatException(result.exceptionDetails))
  return result.result?.value
}

export async function clickMatching(client, labels) {
  return evaluate(client, `(() => {
    const labels = ${JSON.stringify(labels.map((label) => label.toLowerCase()))};
    const items = [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')];
    const target = items.find((item) => labels.some((label) => (item.textContent || item.value || '').toLowerCase().includes(label)));
    if (!target) return false;
    target.click();
    return true;
  })()`)
}

export async function dispatchKey(client, key, code = key) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code })
}

export async function dispatchWheel(client, deltaY = -240, x = 640, y = 400) {
  await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
}

export async function writeScreenshot(path, base64) {
  await writeFile(path, Buffer.from(base64, 'base64'))
}

export function screenshotDigest(base64) {
  return createHash('sha256').update(base64).digest('hex')
}

export function screenshotBytes(base64) {
  return Buffer.byteLength(base64, 'base64')
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function captureScreenshot(client) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  return result.data
}

async function analyzeScreenshot(client, base64) {
  return evaluate(client, `(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/png;base64,${base64}`)};
    await image.decode();
    const width = 96, height = 60;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let total = 0, totalSquared = 0, nonDark = 0, centerNonDark = 0, centerPixels = 0, colorful = 0;
    const buckets = new Set();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
        const luma = red * .2126 + green * .7152 + blue * .0722;
        total += luma;
        totalSquared += luma * luma;
        if (luma > 12) nonDark += 1;
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 18) colorful += 1;
        if (x >= width * .15 && x < width * .85 && y >= height * .1 && y < height * .85) {
          centerPixels += 1;
          if (luma > 12) centerNonDark += 1;
        }
        buckets.add((red >> 4) + ',' + (green >> 4) + ',' + (blue >> 4));
      }
    }
    const count = width * height;
    const meanLuma = total / count;
    return {
      meanLuma,
      lumaVariance: totalSquared / count - meanLuma * meanLuma,
      nonDarkRatio: nonDark / count,
      centerNonDarkRatio: centerNonDark / centerPixels,
      colorfulRatio: colorful / count,
      colorBuckets: buckets.size,
    };
  })()`)
}

async function waitForReadyState(client, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const state = await evaluate(client, 'document.readyState')
    if (state === 'complete' || state === 'interactive') return
    await delay(100)
  }
  throw new Error('timed out waiting for document readiness')
}

async function pollJSON(url, select, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        const value = select(await response.json())
        if (value) return value
      }
    } catch (error) {
      // The endpoint starts a few milliseconds after Chromium prints its socket.
    }
    await delay(100)
  }
  throw new Error(`timed out polling ${url}`)
}

function formatException(details = {}) {
  const exception = details.exception
  const headline = exception?.description || details.text || 'unknown page exception'
  const location = details.url ? `${details.url}:${(details.lineNumber ?? 0) + 1}` : ''
  return location ? `${headline} (${location})` : headline
}

function runtimeSnapshotExpression() {
  return `(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 1 && rect.height > 1;
    };
    const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    const svgs = [...document.querySelectorAll('svg')];
    const canvases = [...document.querySelectorAll('canvas')];
    const chartSvgs = svgs.filter((svg) => svg.querySelectorAll('path,line,rect,circle,polyline,polygon').length >= 3 && visible(svg));
    return {
      title: document.title,
      text,
      textLength: text.length,
      buttons: [...document.querySelectorAll('button,[role="button"]')].filter(visible).map((item) => (item.textContent || '').trim()),
      inputs: [...document.querySelectorAll('input,select')].filter(visible).map((item) => ({ type: item.type || item.tagName.toLowerCase(), value: item.value })),
      canvasCount: canvases.filter(visible).length,
      svgCount: svgs.filter(visible).length,
      nonEmptySvgCount: chartSvgs.length,
      kpiLikeCount: [...document.querySelectorAll('body *')].filter((item) => visible(item) && /^[$€£]?[-+]?\\d[\\d,.]*(?:\\.\\d+)?[KMB%×x]?$/i.test((item.textContent || '').trim())).length,
      bodyWidth: document.body?.scrollWidth || 0,
      bodyHeight: document.body?.scrollHeight || 0,
    };
  })()`
}
