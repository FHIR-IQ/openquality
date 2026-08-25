import { parse as parseYaml } from 'yaml'
import type { Finding } from './report.js'
import { stripComments } from './cql.js'

export interface CodeSystemPolicy {
  /** Human readable name, used in messages. */
  name: string
  /** Matches the code system URL as written in a CQL codesystem declaration. */
  match: RegExp
  /** Whether display text for this system can be redistributed. */
  displayAllowed: boolean
}

// The negative lookahead matters: without it the CPT arc also matches
// urn:oid:2.16.840.1.113883.6.120, a different code system entirely.
//
// Exported so scanner.ts's any-CPT-reference warning and this module's
// display-text error agree on what counts as CPT: one source of truth for the
// pattern, kept even though the two checks fire on different conditions.
export const CPT_SYSTEM = /ama-assn\.org\/go\/cpt|urn:oid:2\.16\.840\.1\.113883\.6\.12(?!\d)/i

/**
 * Per code system, because the licences differ and one blanket rule is either
 * too strict or too loose. Only systems that restrict something need an entry:
 * an unlisted system defaults to allowed, since this is a licensing filter and
 * not an allowlist of terminologies a package may use.
 */
export const CODE_SYSTEM_POLICY: CodeSystemPolicy[] = [
  {
    name: 'CPT',
    match: CPT_SYSTEM,
    displayAllowed: false,
  },
]

export function policyFor(url: string): CodeSystemPolicy | undefined {
  return CODE_SYSTEM_POLICY.find((p) => p.match.test(url))
}

export function displayAllowed(url: string): boolean {
  return policyFor(url)?.displayAllowed ?? true
}

/**
 * A comment between two tokens of a declaration is valid CQL and changes
 * nothing about the bytes being redistributed, so it must not hide a licensed
 * descriptor. That was once handled by allowing comments inside these patterns,
 * which made them ambiguous and exponential; see `stripComments`.
 *
 * The patterns are therefore plain again, and `matchesIn` below runs them twice:
 * once over the file as written, and once over the file with comments blanked.
 * The first pass keeps the long-standing behaviour of flagging a declaration
 * that sits inside a comment, because those bytes ship either way. The second
 * catches a comment wedged between tokens.
 */
const CODESYSTEM_DECL = /^[ \t]*codesystem\s+"((?:[^"\\]|\\.)*)"\s*:\s*'((?:[^'\\]|\\.)*)'/gim

/**
 * A CQL code declaration that carries display text:
 *   code "Name": '97804' from "CPT" display 'text'
 * Group 1 is the code, group 2 the code system alias. The alias capture uses
 * the same escape-tolerant pattern as CODESYSTEM_DECL above, so an alias
 * containing an escaped quote is captured identically in both places; if the
 * two disagreed, the alias recorded for a codesystem and the alias read off a
 * code declaration would not match as the same string, and the lookup this
 * module does between them would silently fail.
 *
 * Case-insensitive (the `i` flag), but not because CQL keywords are
 * case-insensitive: they are not. `codesystem`, `code`, `from`, and `display`
 * are fixed lowercase keywords in the grammar, and a file that spells them
 * otherwise is invalid CQL that a translator will reject. But this is a
 * licensing filter, not a CQL parser, and Level 1 does not require
 * translation, so an invalid-but-close file can still sit in a package.
 * Matching case-insensitively costs nothing and keeps such a file from
 * carrying a licensed descriptor past this check.
 */
const CODE_WITH_DISPLAY =
  /^[ \t]*code\s+"(?:[^"\\]|\\.)*"\s*:\s*'((?:[^'\\]|\\.)*)'\s+from\s+"((?:[^"\\]|\\.)*)"\s+display\s+'(?:[^'\\]|\\.)*'/gim

/**
 * Every match of `pattern` in the file as written and in the file with comments
 * blanked, with duplicates removed. Both passes are needed: see the note above
 * the patterns.
 */
function matchesIn(pattern: RegExp, cql: string): RegExpMatchArray[] {
  const seen = new Set<string>()
  const found: RegExpMatchArray[] = []
  for (const source of [cql, stripComments(cql)]) {
    for (const match of source.matchAll(pattern)) {
      const key = match.slice(1).join('\u0000')
      if (seen.has(key)) continue
      seen.add(key)
      found.push(match)
    }
  }
  return found
}

/** Code system aliases declared in this CQL file, mapped to their URLs. */
export function codeSystemAliases(cql: string): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const match of matchesIn(CODESYSTEM_DECL, cql)) aliases.set(match[1], match[2])
  return aliases
}

/**
 * Reports display text carried from a code system whose licence does not permit
 * redistributing it. Only the display string is the problem: a code plus a
 * system URL is a reference, which is the same rule Open Quality already
 * applies to value sets, and the same convention FHIR itself follows by
 * publishing large terminologies with content=not-present.
 *
 * The same descriptor can reach a package two ways, so there are two checks.
 * A CQL `code` declaration is one. A FHIR resource is the other, and for a
 * `Measure` those are the same twelve licensed codes in a second place: its
 * contained effective-data-requirements Library records each directly
 * referenced code with the descriptor in `valueCoding.display`.
 */
export function checkTerminology(path: string, content: string): Finding[] {
  // Both checks run on every file. Neither gates on the extension, for the
  // reason scanner.ts already learned the hard way: gating on `.json` let an
  // author bypass a check by renaming the file. Each returns nothing when it
  // does not apply, so running both is cheap and closes that door.
  return [...checkCqlDisplays(path, content), ...checkCodingDisplays(path, content)]
}

/**
 * Heuristic by design, same as scanContent: a regex over CQL text, not a parse
 * of it, so it does not know about comments and will flag a declaration sitting
 * inside a block comment too. That is intentional - the licensed descriptor
 * bytes are present in the redistributed file whether or not the declaration is
 * live code - but it does mean this check will miss things a parser would not,
 * and could in principle misread a declaration it should not flag. That caveat
 * matters more here than for the CPT reference warning in scanner.ts, because
 * this check reports errors and blocks Level 1 rather than surfacing a warning.
 */
function checkCqlDisplays(path: string, content: string): Finding[] {
  const restricted = new Map<string, CodeSystemPolicy>()
  for (const [alias, url] of codeSystemAliases(content)) {
    const policy = policyFor(url)
    if (policy && !policy.displayAllowed) restricted.set(alias, policy)
  }
  if (restricted.size === 0) return []

  const findings: Finding[] = []
  for (const match of matchesIn(CODE_WITH_DISPLAY, content)) {
    const [, code, alias] = match
    const policy = restricted.get(alias)
    if (!policy) continue
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        `code '${code}' from "${alias}" carries display text. ${policy.name} descriptors are ` +
        `licensed and cannot be redistributed. Keep the code and the code system, remove the ` +
        `display string.`,
      path,
    })
  }
  return findings
}

/** A FHIR Coding carrying display text, wherever it sits in a resource. */
interface FoundCoding {
  system: string
  code: string
  display: string
}

/**
 * Every Coding-shaped object in a parsed document that names a code system and
 * carries display text. Walks the whole tree, because FHIR puts Codings in
 * `coding` arrays, in `valueCoding` extensions, and inside `contained`
 * resources, and a check that knew only one of those shapes would be a check
 * that mostly does not run.
 */
function walkCodings(doc: unknown): FoundCoding[] {
  const found: FoundCoding[] = []
  const stack: unknown[] = [doc]
  const seen = new Set<object>()
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      stack.push(...node)
    } else if (node && typeof node === 'object') {
      if (seen.has(node)) continue
      seen.add(node)
      const obj = node as Record<string, unknown>
      if (
        typeof obj.system === 'string' &&
        typeof obj.display === 'string' &&
        obj.display.length > 0
      ) {
        found.push({
          system: obj.system,
          code: typeof obj.code === 'string' ? obj.code : '',
          display: obj.display,
        })
      }
      stack.push(...Object.values(obj))
    }
  }
  return found
}

/**
 * The same licensing rule as the CQL check, applied to structured resources.
 *
 * A FHIR `Measure` carries its effective data requirements as a contained
 * `Library`, and that Library records every directly referenced code as a
 * `cqf-directReferenceCode` extension with the descriptor in `valueCoding.display`.
 * For the six upstream measures that reference CPT, those are the same twelve
 * licensed descriptors the CQL check already strips, in a second location that
 * the CQL check cannot see and the CI grep for `from "CPT"` does not look at.
 *
 * Parsed as YAML because YAML is a superset of JSON, matching scanner.ts, so
 * detection does not depend on the file extension.
 */
function checkCodingDisplays(path: string, content: string): Finding[] {
  // Cheap reject before parsing. Every FHIR resource serialised as JSON or YAML
  // spells the key `system`; CQL never does. This keeps the parse off the 302
  // CQL files in the corpus without gating on the extension.
  if (!/["']?system["']?\s*:/.test(content)) return []

  let doc: unknown
  try {
    doc = parseYaml(content)
  } catch {
    // Fail closed, the lesson of knowledge/corpus/2026-005. A document this
    // check could not read is not a document known to be clean, so if the raw
    // text names a restricted code system at all, say so and let a person look.
    const policy = CODE_SYSTEM_POLICY.find((p) => !p.displayAllowed && p.match.test(content))
    if (!policy) return []
    return [
      {
        check: 'content.forbidden',
        severity: 'error',
        message:
          `references the ${policy.name} code system but could not be parsed, so its display ` +
          `text cannot be checked. ${policy.name} descriptors are licensed and cannot be ` +
          `redistributed. Fix the file so it parses, or remove the reference.`,
        path,
      },
    ]
  }

  const findings: Finding[] = []
  const reported = new Set<string>()
  for (const coding of walkCodings(doc)) {
    const policy = policyFor(coding.system)
    if (!policy || policy.displayAllowed) continue
    // One finding per code, not per occurrence: the twelve CPT codes appear
    // twenty times across the six affected measures, and twenty findings for
    // twelve problems reads as twenty problems.
    if (reported.has(coding.code)) continue
    reported.add(coding.code)
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        `code '${coding.code}' from ${policy.name} carries display text. ${policy.name} ` +
        `descriptors are licensed and cannot be redistributed. Keep the code and the code ` +
        `system, remove the display string.`,
      path,
    })
  }
  return findings
}
