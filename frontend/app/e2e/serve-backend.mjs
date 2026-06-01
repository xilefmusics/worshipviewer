/**
 * Playwright webServer entry: boots the real backend with in-memory DB and admin test session.
 * Requires `pnpm build` (frontend/app/dist) and a backend binary (debug preferred, or cargo run).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appDir, '../..')
const distDir = path.join(appDir, 'dist')
const backendDir = path.join(repoRoot, 'backend')
const debugBin = path.join(backendDir, 'target/debug/backend')
const releaseBin = path.join(backendDir, 'target/release/backend')

const PORT = Number(process.env.E2E_PORT ?? 8788)
const HOST = process.env.E2E_HOST ?? '127.0.0.1'
const blobDir = mkdtempSync(path.join(tmpdir(), 'wv-e2e-blobs-'))

if (!existsSync(path.join(distDir, 'index.html'))) {
  console.error('[e2e] frontend/app/dist not found — run `pnpm build` from frontend/ first')
  process.exit(1)
}

const env = {
  ...process.env,
  PORT: String(PORT),
  HOST,
  STATIC_DIR: distDir,
  BLOB_DIR: blobDir,
  INITIAL_ADMIN_USER_EMAIL: 'admin@wv.test',
  INITIAL_ADMIN_USER_TEST_SESSION: 'true',
  COOKIE_SECURE: 'false',
  OTP_PEPPER: 'e2e-test-pepper',
  AUTH_RATE_LIMIT_RPS: '100',
  AUTH_RATE_LIMIT_BURST: '200',
  API_RATE_LIMIT_RPS: '200',
  API_RATE_LIMIT_BURST: '500',
  DB_ADDRESS: 'mem://',
}

const prebuiltBin = existsSync(debugBin)
  ? debugBin
  : existsSync(releaseBin)
    ? releaseBin
    : null
const cmd = prebuiltBin ?? 'cargo'
const args = prebuiltBin ? [] : ['run', '--bin', 'backend']

console.log(
  `[e2e] starting backend (${prebuiltBin ? 'prebuilt binary' : 'cargo run'}) on ${HOST}:${PORT}`,
)

const child = spawn(cmd, args, {
  cwd: backendDir,
  env,
  stdio: 'inherit',
})

function shutdown(signal) {
  child.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})

async function waitForReady() {
  const url = `http://${HOST}:${PORT}/api/v1/about`
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        console.log(`[e2e] backend ready at http://${HOST}:${PORT}`)
        return
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.error('[e2e] backend failed to become ready within 120s')
  shutdown('SIGTERM')
  process.exit(1)
}

await waitForReady()
