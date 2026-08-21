#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { evaluate, inspectPage, launchBrowser, startStaticServer } from './lib/cdp.mjs'
import { checkInlineJavaScript, sourceSignals } from './lib/static.mjs'

const path = resolve(process.argv[2] || '')
if (!process.argv[2]) throw new Error('usage: node eval/verify-counter.mjs /absolute/path/counter.html')
const source = await readFile(path, 'utf8')
const syntax = checkInlineJavaScript(source)
const signals = sourceSignals(source)
const server = await startStaticServer(dirname(path))
const browser = await launchBrowser({ width: 800, height: 600 })
let page
let initial = null
let after = null
let interactionError = null
try {
  page = await inspectPage(browser, `${server.baseURL}/${encodeURIComponent(basename(path))}`, { settleMs: 500 })
  initial = await counterValue(browser.client)
  after = await evaluate(browser.client, `(async () => {
    const button=document.querySelector('#increment');
    if(!button)return null;
    button.click();
    await new Promise((resolve)=>setTimeout(resolve,100));
    const value=document.querySelector('#count')?.textContent?.trim();
    return value == null ? null : Number(value);
  })()`)
} catch (error) {
  interactionError = error.stack || error.message
} finally {
  page?.dispose()
  await browser.close()
  await server.close()
}
const runtimeErrors = page ? [...page.exceptions, ...page.consoleErrors, ...page.logErrors] : []
const result = {
  file: path,
  syntaxPass: syntax.pass,
  syntaxFailures: syntax.failures,
  runtimePass: !interactionError && runtimeErrors.length === 0,
  runtimeErrors,
  interactionError,
  initial,
  after,
  interactionPass: initial === 0 && after === 1,
  selfContained: signals.externalResources.length === 0,
}
result.fullPass = result.syntaxPass && result.runtimePass && result.interactionPass && result.selfContained
console.log(JSON.stringify(result, null, 2))
if (!result.fullPass) process.exitCode = 1

function counterValue(client) {
  return evaluate(client, `(() => {
    const value=document.querySelector('#count')?.textContent?.trim();
    return value == null ? null : Number(value);
  })()`)
}
