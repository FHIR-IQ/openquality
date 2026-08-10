import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listPackageFiles, listPackageSymlinks, packPackage } from '../src/pack.js'

let dir: string

async function write(rel: string, content: string) {
  const full = join(dir, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf8')
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oq-pack-'))
  await write('openquality.yaml', 'id: a/b\nversion: 1.0.0\nlicense: MIT\nartifacts: []\n')
  await write('README.md', '# x\n')
  await write('cql/M.cql', 'library M\n')
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('packPackage', () => {
  it('produces a byte identical tarball on repeated runs', async () => {
    const a = await packPackage(dir)
    const b = await packPackage(dir)
    expect(a.digest).toBe(b.digest)
    expect(a.tarball.equals(b.tarball)).toBe(true)
  })

  it('returns a sha256 digest as 64 lowercase hex characters', async () => {
    const { digest } = await packPackage(dir)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('includes every package file', async () => {
    const { files } = await packPackage(dir)
    expect(files.sort()).toEqual(['README.md', 'cql/M.cql', 'openquality.yaml'])
  })

  it('excludes .git and node_modules', async () => {
    await write('.git/config', 'x')
    await write('node_modules/dep/index.js', 'x')
    const { files } = await packPackage(dir)
    expect(files.some((f) => f.startsWith('.git/'))).toBe(false)
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false)
  })

  it('changes the digest when a file changes', async () => {
    const before = await packPackage(dir)
    await write('cql/M.cql', 'library M version \'2\'\n')
    const after = await packPackage(dir)
    expect(after.digest).not.toBe(before.digest)
  })

  it('rejects a directory with no openquality.yaml', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'oq-empty-'))
    await expect(packPackage(empty)).rejects.toThrow(/openquality\.yaml/)
    await rm(empty, { recursive: true, force: true })
  })
})

describe('symlinks in a package', () => {
  // An undeclared symlink used to be invisible: readdir reports it as neither a
  // file nor a directory, so the walk skipped it. A file the content scanner
  // rejects could sit in a package behind one and validate clean at Level 1.
  it('lists a symlink instead of silently dropping it', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'oq-outside-'))
    await writeFile(join(outside, 'licensed.cql'), 'library X\n', 'utf8')
    await symlink(join(outside, 'licensed.cql'), join(dir, 'cql', 'hidden.cql'))

    expect(await listPackageSymlinks(dir)).toEqual(['cql/hidden.cql'])
    // Still not a file, so the two lists stay disjoint and the tarball is not
    // asked to carry something it cannot represent.
    expect(await listPackageFiles(dir)).not.toContain('cql/hidden.cql')

    await rm(outside, { recursive: true, force: true })
  })

  it('finds a symlink nested below the package root', async () => {
    await mkdir(join(dir, 'cql', 'sub'), { recursive: true })
    await symlink(join(dir, 'README.md'), join(dir, 'cql', 'sub', 'link.md'))
    expect(await listPackageSymlinks(dir)).toEqual(['cql/sub/link.md'])
  })

  it('reports no symlinks for an ordinary package', async () => {
    expect(await listPackageSymlinks(dir)).toEqual([])
  })

  it('refuses to pack a package containing one', async () => {
    await symlink(join(dir, 'README.md'), join(dir, 'cql', 'link.md'))
    await expect(packPackage(dir)).rejects.toThrow(/symlink/)
    // The message has to name the offender, or an author cannot act on it.
    await expect(packPackage(dir)).rejects.toThrow(/cql\/link\.md/)
  })
})
