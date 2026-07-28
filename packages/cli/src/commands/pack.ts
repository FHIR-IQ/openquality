import { writeFile } from 'node:fs/promises'
import { packPackage } from '@openquality/core'
import type { Writer } from './validate.js'

/** Packs a package directory into a tarball. Returns the process exit code. */
export async function runPack(dir: string, outPath: string | undefined, write: Writer): Promise<number> {
  try {
    const { tarball, digest, files } = await packPackage(dir)
    const target = outPath ?? `package-${digest.slice(0, 12)}.tgz`
    await writeFile(target, tarball)
    write(`packed ${files.length} files`)
    write(`sha256 ${digest}`)
    write(`wrote  ${target}`)
    return 0
  } catch (err) {
    write(`error  ${(err as Error).message}`)
    return 1
  }
}
