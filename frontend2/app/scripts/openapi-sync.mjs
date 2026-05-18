import { copyFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..')
const repoRoot = join(__dirname, '../..')
const canonical = join(repoRoot, 'docs/openapi.json')
const apiDir = join(appRoot, 'src/api')
const snapshot = join(apiDir, 'openapi.json')
const outTypes = join(apiDir, 'schema.d.ts')

mkdirSync(apiDir, { recursive: true })
copyFileSync(canonical, snapshot)

execSync(
  `pnpm exec openapi-typescript "${snapshot}" --properties-default-optional -o "${outTypes}"`,
  { stdio: 'inherit', cwd: appRoot },
)

console.log('openapi:sync OK →', outTypes)
