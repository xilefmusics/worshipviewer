#!/usr/bin/env node
/**
 * Ensures every flow id in docs/architecture/frontend-user-flows.md is referenced
 * by at least one `// Flow:` annotation or test title prefix under frontend/app/{e2e,src}.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appRoot, '../..')
const flowsDoc = path.join(repoRoot, 'docs/architecture/frontend-user-flows.md')

const FLOW_HEADING = /^### ([A-L]\d+)\./gm
const FLOW_COMMENT = /\/\/ Flow:\s*([A-L]\d+(?:\s*,\s*[A-L]\d+)*)/g
const FLOW_TITLE = /(?:test|it)\(\s*['"`]([A-L]\d+)(?:\+[A-L]\d+)?[:]/g

/** @param {string} dir @param {string[]} acc */
function readAllFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      readAllFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

const doc = readFileSync(flowsDoc, 'utf8')
/** @type {Set<string>} */
const expected = new Set()
let m
while ((m = FLOW_HEADING.exec(doc)) !== null) {
  expected.add(m[1])
}

/** @type {Set<string>} */
const covered = new Set()
const scanRoots = [path.join(appRoot, 'e2e'), path.join(appRoot, 'src')]
for (const root of scanRoots) {
  for (const file of readAllFiles(root)) {
    const text = readFileSync(file, 'utf8')
    FLOW_COMMENT.lastIndex = 0
    while ((m = FLOW_COMMENT.exec(text)) !== null) {
      for (const id of m[1].split(',').map((s) => s.trim())) covered.add(id)
    }
    FLOW_TITLE.lastIndex = 0
    while ((m = FLOW_TITLE.exec(text)) !== null) {
      covered.add(m[1])
    }
  }
}

const missing = [...expected].filter((id) => !covered.has(id)).sort()
const extra = [...covered].filter((id) => !expected.has(id)).sort()

/** Flows that must have a Playwright/Vitest title prefix, not only a comment reference. */
const E2E_TITLE_REQUIRED = ['E4', 'E5', 'L1']
/** @type {Set<string>} */
const titled = new Set()
for (const root of scanRoots) {
  for (const file of readAllFiles(root)) {
    const text = readFileSync(file, 'utf8')
    FLOW_TITLE.lastIndex = 0
    while ((m = FLOW_TITLE.exec(text)) !== null) {
      titled.add(m[1])
    }
  }
}
const missingE2eTitles = E2E_TITLE_REQUIRED.filter((id) => !titled.has(id)).sort()

if (missing.length || extra.length || missingE2eTitles.length) {
  if (missing.length) console.error('Missing flow coverage:', missing.join(', '))
  if (extra.length) console.error('Unknown flow ids referenced:', extra.join(', '))
  if (missingE2eTitles.length) {
    console.error('Missing e2e test title for flows:', missingE2eTitles.join(', '))
  }
  process.exit(1)
}

console.log(`Flow coverage OK: ${expected.size} flows (${[...expected].sort().join(', ')})`)
