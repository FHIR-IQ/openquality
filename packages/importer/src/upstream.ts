import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { x as extract } from 'tar'

/** The upstream content this corpus is seeded from. Pinned, never floating. */
export const UPSTREAM = {
  repo: 'cqframework/ecqm-content-qicore-2025',
  url: 'https://github.com/cqframework/ecqm-content-qicore-2025',
  ref: 'd4e0edd01b7da2a3b43d5360156b43761438190a',
  license: 'CC0-1.0',
} as const

const CACHE_DIR = '.cache/upstream'

function tarballUrl(ref: string): string {
  return `https://codeload.github.com/${UPSTREAM.repo}/tar.gz/${ref}`
}

/**
 * Downloads and extracts the pinned upstream tree, once, into .cache. Cached
 * because the archive is about 450 MB and the importer is re-run on every CI
 * drift check. Returns the extracted root.
 */
export async function fetchUpstream(ref: string = UPSTREAM.ref): Promise<string> {
  const root = join(CACHE_DIR, ref)
  if (await exists(join(root, 'input'))) return root

  await mkdir(CACHE_DIR, { recursive: true })
  const tarballPath = join(CACHE_DIR, `${ref}.tar.gz`)

  if (!(await exists(tarballPath))) {
    await downloadTarball(ref, tarballPath)
  }

  await extractCached(tarballPath, root)
  return root
}

/**
 * Downloads to a `.partial` sibling and renames into place only once the
 * stream completes successfully. A partial download therefore never
 * occupies `tarballPath`, so a plain existence check on it is safe to treat
 * as "fully downloaded" rather than a trap for a future run. The partial
 * file is removed on failure so a retry starts clean.
 */
async function downloadTarball(ref: string, tarballPath: string): Promise<void> {
  const url = tarballUrl(ref)
  const partialPath = `${tarballPath}.partial`
  try {
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new Error(`cannot download ${url}: HTTP ${response.status}`)
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partialPath))
    await rename(partialPath, tarballPath)
  } catch (err) {
    await rm(partialPath, { force: true })
    throw err
  }
}

/**
 * Extracts `tarballPath` into `root`, creating `root` if needed. Extraction
 * failure is treated as proof the cached archive is corrupt (for example a
 * stalled download that finished writing a truncated file before the atomic
 * rename above existed). On failure both the tarball and any partially
 * extracted directory are discarded, so the next run retries from scratch
 * instead of failing identically forever.
 */
export async function extractCached(tarballPath: string, root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  try {
    // strip: 1 removes the `<repo>-<sha>/` prefix GitHub adds.
    await extract({ file: tarballPath, cwd: root, strip: 1 })
  } catch (err) {
    await rm(tarballPath, { force: true })
    await rm(root, { recursive: true, force: true })
    throw new Error(
      `cached archive at ${tarballPath} was corrupt and has been discarded; re-run to re-download`,
      { cause: err },
    )
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Absolute paths of every .cql file in the upstream tree, sorted. */
export async function listCqlFiles(root: string): Promise<string[]> {
  const dir = join(root, 'input', 'cql')
  const names = (await readdir(dir)).filter((n) => n.endsWith('.cql')).sort()
  return names.map((n) => join(dir, n))
}

/** Absolute paths of every Measure resource in the upstream tree, sorted. */
export async function listMeasureFiles(root: string): Promise<string[]> {
  const dir = join(root, 'input', 'resources', 'measure')
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()
  return names.map((n) => join(dir, n))
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8')
}
