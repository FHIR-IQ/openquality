import { codeSystemAliases, policyFor } from '@openquality/core'

export interface CqlHeader {
  name: string
  version: string
  model?: string
  modelVersion?: string
}

export interface CqlInclude {
  library: string
  version: string
  alias?: string
}

export interface CqlValueSet {
  name: string
  url?: string
  oid?: string
}

const LIBRARY = /^library\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'/m
const USING = /^using\s+([A-Za-z0-9_]+)(?:\s+version\s+'([^']+)')?/m
const INCLUDE = /^include\s+([A-Za-z0-9_]+)\s+version\s+'([^']+)'(?:\s+called\s+([A-Za-z0-9_]+))?/gm
const VALUESET = /^valueset\s+"([^"]+)"\s*:\s*'([^']+)'/gm

/** Dotted decimal OID, matching the rule in @openquality/core valuesets.ts. */
const OID = /^\d+(\.\d+)+$/
const URN_OID = 'urn:oid:'

export function parseHeader(cql: string): CqlHeader | undefined {
  const library = cql.match(LIBRARY)
  if (!library) return undefined
  const using = cql.match(USING)
  return { name: library[1], version: library[2], model: using?.[1], modelVersion: using?.[2] }
}

export function parseIncludes(cql: string): CqlInclude[] {
  return [...cql.matchAll(INCLUDE)].map((m) => ({ library: m[1], version: m[2], alias: m[3] }))
}

/**
 * Derives the OID from a value set reference. Upstream writes canonical URLs
 * ending in the OID; hand-written CQL in this repository writes urn:oid.
 * Both forms appear, so both are handled here rather than at the call site.
 */
export function oidFrom(reference: string): string | undefined {
  if (reference.startsWith(URN_OID)) {
    const candidate = reference.slice(URN_OID.length)
    return OID.test(candidate) ? candidate : undefined
  }
  const last = reference.split('/').pop() ?? ''
  return OID.test(last) ? last : undefined
}

export function parseValueSets(cql: string): CqlValueSet[] {
  return [...cql.matchAll(VALUESET)].map((m) => {
    const reference = m[2]
    return {
      name: m[1],
      // A urn:oid reference is not a URL, and the manifest's valuesets.referenced
      // check rejects a url that is not http or https.
      url: reference.startsWith(URN_OID) ? undefined : reference,
      oid: oidFrom(reference),
    }
  })
}

export interface StripResult {
  cql: string
  /** One entry per removed display, as "<system name> <code>". */
  removed: string[]
}

/**
 * A code declaration carrying display text. Group 1 is everything up to and
 * including the code system alias, so a replacement can keep it and drop only
 * the display clause. Group 2 is the code, group 3 the alias.
 */
const CODE_WITH_DISPLAY =
  /^(\s*code\s+"(?:[^"\\]|\\.)*"\s*:\s*'((?:[^'\\]|\\.)*)'\s+from\s+"((?:[^"\\]|\\.)*)")\s+display\s+'(?:[^'\\]|\\.)*'/gim

/**
 * Removes display text for code systems whose licence does not permit
 * redistributing it, keeping the code and the code system. Metadata only, so
 * the CQL stays valid. Removing the code declaration outright would break every
 * definition that references it.
 */
export function stripRestrictedDisplays(cql: string): StripResult {
  const restricted = new Map<string, string>()
  for (const [alias, url] of codeSystemAliases(cql)) {
    const policy = policyFor(url)
    if (policy && !policy.displayAllowed) restricted.set(alias, policy.name)
  }
  if (restricted.size === 0) return { cql, removed: [] }

  const removed: string[] = []
  const rewritten = cql.replace(CODE_WITH_DISPLAY, (match, head: string, code: string, alias: string) => {
    const system = restricted.get(alias)
    if (!system) return match
    removed.push(`${system} ${code}`)
    return head
  })

  return { cql: rewritten, removed }
}
