import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath   = resolve(__dirname, '../public/icon.svg')
const svg       = readFileSync(svgPath)

const icons = [
  { file: 'public/icon-192.png',       size: 192 },
  { file: 'public/icon-512.png',       size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
]

for (const { file, size } of icons) {
  const out = resolve(__dirname, '..', file)
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log(`✓ ${file} (${size}x${size})`)
}
