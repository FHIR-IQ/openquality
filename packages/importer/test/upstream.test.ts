import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create } from 'tar'
import { extractCached } from '../src/upstream.js'

let dir: string

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('extractCached', () => {
  it('discards a corrupt cached tarball instead of leaving it cached', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oq-importer-'))
    const tarballPath = join(dir, 'upstream.tar.gz')
    const root = join(dir, 'root')
    await writeFile(tarballPath, 'not a real tarball')

    await expect(extractCached(tarballPath, root)).rejects.toThrow(/corrupt/)

    await expect(stat(tarballPath)).rejects.toThrow()
    await expect(stat(root)).rejects.toThrow()
  })

  it('extracts a valid tarball without error', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oq-importer-'))
    const root = join(dir, 'root')

    // Build a minimal, valid gzip'd tarball containing one file nested one
    // level deep, mirroring the `<repo>-<sha>/...` prefix GitHub's archives
    // have, so the "happy path" of extractCached (including its strip: 1)
    // is exercised alongside the corrupt one.
    const srcDir = join(dir, 'src')
    await mkdir(join(srcDir, 'repo-sha'), { recursive: true })
    await writeFile(join(srcDir, 'repo-sha', 'hello.txt'), 'hello')
    const tarballPath = join(dir, 'good.tar.gz')
    await create({ gzip: true, file: tarballPath, cwd: srcDir }, ['repo-sha'])

    await expect(extractCached(tarballPath, root)).resolves.toBeUndefined()
    const extracted = await readFile(join(root, 'hello.txt'), 'utf8')
    expect(extracted).toBe('hello')
  })
})
