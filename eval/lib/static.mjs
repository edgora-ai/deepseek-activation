import { spawnSync } from 'node:child_process'

/** Check executable inline JavaScript without writing temporary files. */
export function checkInlineJavaScript(source) {
  const scripts = extractScripts(source)
  const classic = scripts.filter((script) => script.type !== 'module').map((script) => script.code).join('\n;\n')
  const modules = scripts.filter((script) => script.type === 'module')
  const checks = []
  if (classic.trim()) checks.push(runCheck(classic, 'classic'))
  for (const [index, script] of modules.entries()) checks.push(runCheck(script.code, `module-${index + 1}`, true))
  const failures = checks.filter((item) => !item.pass)
  return {
    pass: failures.length === 0,
    failures,
    scriptCount: scripts.length,
  }
}

export function sourceSignals(source) {
  const external = [...source.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["'](https?:\/\/[^"']+)/gi)].map((match) => match[1])
  const placeholders = [...source.matchAll(/\b(?:TODO|FIXME|placeholder)\b/gi)].map((match) => match[0])
  return {
    externalResources: [...new Set(external)],
    placeholderCount: placeholders.length,
  }
}

function extractScripts(source) {
  const scripts = []
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1]
    if (/\bsrc\s*=/i.test(attrs)) continue
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase() || 'classic'
    if (type === 'importmap' || type === 'application/json' || type === 'application/ld+json') continue
    scripts.push({ type, code: match[2] })
  }
  return scripts
}

function runCheck(code, label, module = false) {
  const args = ['--check']
  if (module) args.push('--input-type=module')
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    input: code,
    maxBuffer: 1024 * 1024,
  })
  return {
    label,
    pass: result.status === 0,
    error: result.status === 0 ? null : summarizeSyntaxError(result.stderr),
  }
}

function summarizeSyntaxError(stderr) {
  const lines = String(stderr || '').split('\n').map((line) => line.trimEnd()).filter(Boolean)
  const syntaxLine = lines.find((line) => /SyntaxError:/.test(line))
  const locationLine = lines.find((line) => /^\[stdin\]:\d+/.test(line))
  const sourceLineIndex = locationLine ? lines.indexOf(locationLine) + 1 : -1
  const sourceLine = sourceLineIndex >= 0 ? lines[sourceLineIndex] : null
  return [locationLine, sourceLine, syntaxLine].filter(Boolean).join(' | ') || lines.slice(0, 4).join(' | ')
}
