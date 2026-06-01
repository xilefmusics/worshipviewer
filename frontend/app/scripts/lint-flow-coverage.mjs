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

if (missing.length || extra.length) {
  if (missing.length) console.error('Missing flow coverage:', missing.join(', '))
  if (extra.length) console.error('Unknown flow ids referenced:', extra.join(', '))
  process.exit(1)
}

console.log(`Flow coverage OK: ${expected.size} flows (${[...expected].sort().join(', ')})`)
