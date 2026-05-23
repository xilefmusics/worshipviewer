import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..')
const repoRoot = join(__dirname, '../..')
const brandDir = join(appRoot, 'public', 'brand')
const resourcesDir = join(repoRoot, 'resources')

const primary = { r: 208, g: 29, b: 33 }

async function writeSquarePng(size, pathOut) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="rgb(${primary.r},${primary.g},${primary.b})"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="700" font-size="${Math.floor(size * 0.16)}">WV</text>
</svg>`
  await sharp(Buffer.from(svg)).png().toFile(pathOut)
}

async function main() {
  mkdirSync(brandDir, { recursive: true })
  mkdirSync(resourcesDir, { recursive: true })

  const appicon512 = join(resourcesDir, 'appicon.png')
  if (!existsSync(appicon512)) {
    await writeSquarePng(512, appicon512)
  }

  const src = appicon512
  await sharp(src)
    .resize(192, 192)
    .png()
    .toFile(join(brandDir, 'icon-192.png'))
  await sharp(src)
    .resize(512, 512)
    .png()
    .toFile(join(brandDir, 'icon-512.png'))

  await sharp(src)
    .resize(512, 512)
    .png()
    .toFile(join(brandDir, 'icon-maskable-512.png'))

  const faviconSrc = join(resourcesDir, 'favicon.png')
  if (!existsSync(faviconSrc)) {
    await sharp(src).resize(32, 32).png().toFile(faviconSrc)
  }
  await sharp(faviconSrc).png().toFile(join(appRoot, 'public', 'favicon.png'))

  await sharp(src)
    .resize(180, 180)
    .png()
    .toFile(join(appRoot, 'public', 'apple-touch-icon.png'))

  console.log('Brand icons written to public/brand and resources/')
}

await main()
