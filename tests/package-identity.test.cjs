const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

test('application identity and documented artifact use the project namespace', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'))
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  assert.equal(manifest.package, 'org.bandmetronome.app')
  assert.equal(manifest.versionName, pkg.version)
  assert.ok(readme.includes(`dist/${manifest.package}.debug.${pkg.version}.rpk`))
})

test('public delivery instructions use a portable home directory, not an author username', () => {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  for (const text of [agents, readme]) {
    assert.doesNotMatch(text, /\/(?:Users|home)\/[^\s/]+\//)
    assert.doesNotMatch(text, /[A-Z]:\\Users\\/i)
  }
  assert.ok(agents.includes('~/Library/Mobile Documents/com~apple~CloudDocs/TempHub/'))
})
