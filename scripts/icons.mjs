// Renders public/icon.svg into the PNG and ICO sizes the app ships: `npm run icons`.
// The artwork is full-bleed with everything important inside the central 80%, so the same
// image works as the regular, maskable and Apple touch icon.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import ico from 'sharp-ico'

const svg = readFileSync('public/icon.svg')
const png = (size) => sharp(svg, { density: 300 }).resize(size, size).png()

const sizes = {
  'pwa-64x64': 64,
  'pwa-192x192': 192,
  'pwa-512x512': 512,
  'maskable-icon-512x512': 512,
  'apple-touch-icon-180x180': 180,
}
for (const [name, size] of Object.entries(sizes)) await png(size).toFile(`public/${name}.png`)
await ico.sharpsToIco([png(48)], 'public/favicon.ico')
console.log('Icons written to public/')
