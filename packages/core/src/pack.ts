import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { create } from 'tar'

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.DS_Store', 'dist'])

export interface PackResult {
  tarball: Buffer
  /** SHA-256 of the tarball, lowercase hex. The registry's content address. */
  digest: string
  /** Package-relative POSIX paths included, sorted. */
  files: string[]
}

/**
 * Every file the package contains, as sorted package-relative POSIX paths.
 * Shared with the validator on purpose: the set of files scanned for forbidden
 * content must be the same set that ends up in the tarball, or an author can
 * ship content the scanner never looked at.
 *
 * Symlinks are not files for this purpose and are reported separately by
 * `listPackageSymlinks`. See the note there: this function used to drop them
 * silently, which broke the guarantee in the paragraph above.
 */
export async function listPackageFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  await collect(dir, dir, files, [])
  files.sort()
  return files
}

/**
 * Every symlink the package contains, as sorted package-relative POSIX paths.
 *
 * A symlink dirent is neither `isFile()` nor `isDirectory()`, so the walk below
 * skipped it entirely and the package appeared to contain nothing. A file whose
 * content the scanner rejects could therefore sit in a package as a symlink and
 * validate clean, which defeated the one error-severity content check there is.
 * `packPackage` dropped it from the tarball at the same time, so `oq pack`
 * produced an archive that did not match the directory it was given.
 *
 * Reported rather than followed. Following would mean deciding what a link
 * pointing outside the package means, and there is no answer to that which is
 * both safe and useful: a package is a self-contained unit of exchange, and a
 * tarball cannot carry a link to a file the recipient does not have.
 */
export async function listPackageSymlinks(dir: string): Promise<string[]> {
  const links: string[] = []
  await collect(dir, dir, [], links)
  links.sort()
  return links
}

async function collect(root: string, dir: string, files: string[], links: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    const rel = relative(root, full).split(sep).join('/')
    // Tested before isDirectory and isFile. readdir does not follow links, so a
    // symlink reports as neither, but ordering this first keeps the intent
    // obvious to the next reader and survives a change to that behaviour.
    if (entry.isSymbolicLink()) links.push(rel)
    else if (entry.isDirectory()) await collect(root, full, files, links)
    else if (entry.isFile()) files.push(rel)
  }
}

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/**
 * Packs a package directory into a deterministic tarball. Entries are sorted,
 * mtime is fixed, and ownership metadata is stripped, so the same content
 * always yields the same digest regardless of machine or checkout time.
 */
export async function packPackage(dir: string): Promise<PackResult> {
  try {
    await stat(join(dir, 'openquality.yaml'))
  } catch {
    throw new Error(`cannot pack ${dir}: openquality.yaml not found at the package root`)
  }

  // Refused rather than skipped. A tarball that quietly omits something the
  // directory contains is not a faithful copy of it, and the digest below is
  // meant to be the content address of the package as submitted.
  const symlinks = await listPackageSymlinks(dir)
  if (symlinks.length > 0) {
    throw new Error(
      `cannot pack ${dir}: package contains ${symlinks.length} symlink` +
        `${symlinks.length === 1 ? '' : 's'} (${symlinks.join(', ')}). ` +
        `Replace each one with the file it points to.`,
    )
  }

  const files = await listPackageFiles(dir)

  const stream = create(
    {
      cwd: dir,
      gzip: { level: 9 },
      portable: true,
      noMtime: true,
      preservePaths: false,
    },
    files,
  ) as unknown as NodeJS.ReadableStream

  const tarball = await toBuffer(stream)
  const digest = createHash('sha256').update(tarball).digest('hex')
  return { tarball, digest, files }
}
