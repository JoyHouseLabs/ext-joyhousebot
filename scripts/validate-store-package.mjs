import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const version = manifest.version
const zipPath = path.join(root, 'dist', `joyhousebot-${version}-chrome-web-store.zip`)

function fail(message) {
  throw new Error(message)
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

const expected = {
  manifest_version: 3,
  version: '0.4.1',
  homepage_url: 'https://joyhousebot.com/',
  minimum_chrome_version: '114',
  default_locale: 'zh_CN',
}
for (const [key, value] of Object.entries(expected)) {
  if (manifest[key] !== value) fail(`manifest.${key} must be ${value}`)
}
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(['https://*/*', 'http://*/*'])) {
  fail('host_permissions must be limited to HTTP and HTTPS pages')
}

for (const locale of ['zh_CN', 'en']) {
  const messages = JSON.parse(read(`_locales/${locale}/messages.json`))
  for (const key of ['extensionName', 'extensionDescription', 'actionTitle']) {
    if (!messages[key]?.message) fail(`Missing ${locale} message: ${key}`)
  }
}

const runtimeFiles = [
  'background.js',
  'auth_bridge.js',
  'popup/popup.js',
  'popup/popup.html',
  'popup/popup.css',
  'content/content.js',
  'content/content.css',
  'content/extractors.js',
  'manifest.json',
]
const runtimeText = runtimeFiles.map((file) => `${file}\n${read(file)}`).join('\n')
const banned = [
  [/localhost|127\.0\.0\.1/i, 'development endpoint'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/importScripts\s*\(\s*['"]https?:\/\//i, 'remote importScripts'],
  [/<script[^>]+src=['"]https?:\/\//i, 'remote script tag'],
  [/WebAssembly\.(compile|instantiate)/, 'runtime WebAssembly'],
]
for (const [pattern, label] of banned) {
  if (pattern.test(runtimeText)) fail(`Runtime contains prohibited ${label}`)
}

for (const file of ['background.js', 'auth_bridge.js', 'popup/popup.js', 'content/content.js', 'content/extractors.js']) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' })
}

const html = read('popup/popup.html')
const popupJs = read('popup/popup.js')
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
const referencedIds = new Set([...popupJs.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]))
const missingIds = [...referencedIds].filter((id) => !htmlIds.has(id))
if (missingIds.length) fail(`Popup references missing DOM IDs: ${missingIds.join(', ')}`)

function imageSize(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath))
  if (buffer.toString('ascii', 1, 4) === 'PNG') {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue }
      const marker = buffer[offset + 1]
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)]
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue }
      const length = buffer.readUInt16BE(offset + 2)
      if (length < 2) break
      offset += length + 2
    }
  }
  fail(`${relativePath} is not a supported PNG or JPEG`)
}
const images = {
  'store/assets/screenshot-1-capture-1280x800.jpg': [1280, 800],
  'store/assets/screenshot-2-translate-1280x800.jpg': [1280, 800],
  'store/assets/promo-small-440x280.png': [440, 280],
  'store/assets/promo-marquee-1400x560.png': [1400, 560],
  'icons/icon128.png': [128, 128],
}
for (const [file, expectedSize] of Object.entries(images)) {
  const actual = imageSize(file)
  if (actual[0] !== expectedSize[0] || actual[1] !== expectedSize[1]) {
    fail(`${file} is ${actual.join('x')}, expected ${expectedSize.join('x')}`)
  }
}

if (!fs.existsSync(zipPath)) fail(`Missing package: ${zipPath}`)
const zipEntries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n')
if (!zipEntries.includes('manifest.json')) fail('manifest.json is not at the ZIP root')
if (zipEntries.some((entry) => /(^|\/)(README|store|scripts|dist|\.DS_Store|\._)/.test(entry))) {
  fail('ZIP contains non-runtime or metadata files')
}

console.log(`Store validation passed: ${version}`)
console.log(`Popup DOM references: ${referencedIds.size}`)
console.log(`Runtime files: ${runtimeFiles.length}`)
console.log(`Store images: ${Object.keys(images).length}`)
console.log(`ZIP entries: ${zipEntries.length}`)
