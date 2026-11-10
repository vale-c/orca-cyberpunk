// Copies the three Cyberpunk VS Code themes from upstream into scripts/cyberpunk-palette.json.
// Usage: node scripts/vendor-palette.mjs /path/to/cyberpunk
// The checkout must be at COMMIT. Upstream's theme files are JSONC (comments, trailing commas),
// which VS Code reads, so this script reads them the same way. Duplicate keys keep the last value,
// as VS Code does. Run it only to move to a newer upstream commit.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPOSITORY = 'https://github.com/prometheux-ar/cyberpunk'
const COMMIT = '632f187e343fafc499d89f5ddaa6895ebc10ab94'
// Orca theme id: the label in upstream's package.json.
const STYLES = {
  cyberpunk: 'Cyberpunk',
  'cyberpunk-umbra': 'Activate UMBRA protocol',
  'cyberpunk-scarlet': 'Activate SCARLET protocol (beta)'
}

const upstream = process.argv[2] && path.resolve(process.argv[2])
if (!upstream) {
  console.error('Pass the path of a prometheux-ar/cyberpunk checkout.')
  process.exit(2)
}
const git = (...args) => execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim()
if (git('rev-parse', 'HEAD') !== COMMIT) {
  throw new Error(`${upstream} is not at ${COMMIT}. Check it out first.`)
}
if (git('status', '--porcelain', '--', 'themes', 'package.json')) {
  throw new Error(`${upstream} has local changes under themes/ or package.json.`)
}

/** JSON with // and block comments and trailing commas removed, outside of strings. */
function parseJsonc(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      const start = i
      for (i++; text[i] !== '"'; i++) {
        if (text[i] === '\\') i++
      }
      out += text.slice(start, i + 1)
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (char === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
    } else {
      out += char
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const manifest = parseJsonc(readFileSync(path.join(upstream, 'package.json'), 'utf8'))
const styles = {}
for (const [id, label] of Object.entries(STYLES)) {
  const entry = manifest.contributes.themes.find((theme) => theme.label === label)
  if (!entry) {
    throw new Error(`package.json lists no theme labelled "${label}"`)
  }
  const file = path.posix.normalize(entry.path)
  const { name, type, colors, tokenColors } = parseJsonc(readFileSync(path.join(upstream, file), 'utf8'))
  if (type !== 'dark' || entry.uiTheme !== 'vs-dark') {
    throw new Error(`${file} is not a dark theme; this plugin ships it as dark`)
  }
  styles[id] = { label, file, name, colors, tokenColors }
}

const out = { repository: REPOSITORY, commit: COMMIT, version: manifest.version, styles }
writeFileSync(path.join(import.meta.dirname, 'cyberpunk-palette.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(`Vendored ${Object.keys(styles).length} styles of ${manifest.displayName} ${manifest.version} from ${COMMIT}.`)
