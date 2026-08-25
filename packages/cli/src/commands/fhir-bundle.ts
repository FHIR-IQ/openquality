import { writeFile } from 'node:fs/promises'
import { buildPackageBundle } from '@openquality/core'
import type { Writer } from './validate.js'
import { collectPackageResources, readPackageManifest } from './fhir-package.js'

/**
 * Emits the package as a CRMI artifact Bundle: the shape CRMI's `$package`
 * operation returns, written as a file.
 *
 * Asked for by Bryn Rhodes on Zulip, and the right question. Open Quality has
 * no server, so it cannot offer `$package` as an operation, and that was taken
 * to mean it could not produce the output either. It can: the Bundle is a file.
 * CRMI-aware tooling gets the artifact it already understands with nothing to
 * stand up, which is the same argument the npm tarball makes to a different
 * set of tools.
 */
export async function runFhirBundle(dir: string, outPath: string | undefined, write: Writer): Promise<number> {
  const manifest = await readPackageManifest(dir, write)
  if (!manifest) return 1

  const { cql, resources } = await collectPackageResources(dir)
  if (cql.length === 0 && resources.length === 0) {
    write(`error  ${dir} holds no CQL and no FHIR resource, so there is nothing to package`)
    return 1
  }

  const bundle = buildPackageBundle(manifest, cql, resources, { license: manifest.license })
  const target = outPath ?? `${manifest.id.split('/').join('-')}-${manifest.version}.bundle.json`
  await writeFile(target, `${JSON.stringify(bundle, null, 2)}\n`)

  const entries = (bundle.entry as unknown[]).length
  write(`wrote ${target}`)
  write(`  bundle   collection, ${entries} entries`)
  write(`  first    asset-collection Library describing the other ${entries - 1}`)
  write(`  contents ${cql.length} from CQL, ${resources.length} already FHIR`)
  write('')
  write('The `$package` shape from CRMI, emitted statically. Library resources are')
  write('marked experimental and their canonical URLs point at openquality.us rather')
  write('than at the steward, because this is not an authoritative publication.')
  return 0
}
