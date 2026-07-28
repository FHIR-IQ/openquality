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
 */
export async function listPackageFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  await collect(dir, dir, files)
  files.sort()
  return files
}

async function collect(root: string, dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await collect(root, full, out)
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'))
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
