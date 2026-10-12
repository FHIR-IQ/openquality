import { parseHeader } from './cql.js'
import type { Manifest } from './manifest.js'
import type { Finding } from './report.js'

/**
 * Rules for a package that publishes one shared CQL library rather than a
 * measure. Such a package exists so that measures can depend on FHIRHelpers or
 * QICoreCommon instead of each carrying its own copy.
 *
 * Its identity is the CQL library header, because that is what an `include`
 * statement resolves against: `library.name` and `library.version` must equal
 * the header of the one CQL file the package holds. A package without a
 * `library` block is a measure package, and nothing here applies to it.
 *
 * `readCql` returns the source of a package-relative path, or undefined when it
 * cannot be read. Findings, not exceptions.
 */
export function checkLibraryIdentity(
  manifest: Manifest,
  readCql: (path: string) => string | undefined,
): Finding[] {
  const library = manifest.library
  if (!library) return []

  const error = (message: string, path = 'openquality.yaml'): Finding[] => [
    { check: 'manifest.library', severity: 'error', message, path },
  ]

  if (manifest.measure) {
    return error('manifest declares both measure and library. A package is one or the other.')
  }
  if (!library.name || !library.version) {
    return error('a library package must declare library.name and library.version, as its CQL header states them')
  }

  const cql = manifest.artifacts.filter((a) => a.type === 'cql')
  if (cql.length !== 1) {
    return error(`a library package must hold exactly one CQL artifact, and this one declares ${cql.length}`)
  }

  const path = cql[0]!.path
  const source = readCql(path)
  if (source === undefined) return error(`${path} could not be read to check its library header`, path)

  const header = parseHeader(source)
  if (header?.name !== library.name || header?.version !== library.version) {
    const found = header ? `${header.name} version '${header.version ?? ''}'` : 'no library header'
    return error(
      `library is declared as ${library.name} version '${library.version}', but ${path} has ${found}`,
      path,
    )
  }
  return []
}
