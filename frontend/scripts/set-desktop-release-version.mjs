import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2] ?? process.env.GITHUB_REF_NAME
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Expected a plain semantic version such as 0.17.0')
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packagePath = path.resolve(scriptDir, '../app/package.json')
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
packageJson.version = version
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
