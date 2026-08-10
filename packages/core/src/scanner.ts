import { parse as parseYaml } from 'yaml'
import type { Finding } from './report.js'
import { CPT_SYSTEM, checkTerminology } from './terminology.js'

/** Phrases that assert ownership, as opposed to merely naming a program. */
const COPYRIGHT_CLAIMS = [
  /copyright\s+\d{4}\s+ncqa/i,
  /©\s*\d{4}\s*ncqa/i,
  /hedis\s+is\s+a\s+registered\s+trademark/i,
  /ncqa\s+all\s+rights\s+reserved/i,
]

/**
 * `found` when the parsed document carries an expansion, `absent` when it
 * parsed and did not, `unparseable` when the parser rejected the file.
 *
 * The three states are kept apart because they are not equally informative.
 * `absent` is an answer. `unparseable` is the absence of one, and treating it
 * as `absent` is what let a real expansion through: see the text-level check
 * below.
 */
type ExpansionScan = 'found' | 'absent' | 'unparseable'

function scanForExpansion(content: string): ExpansionScan {
  let doc: unknown
  try {
    // Parsed as YAML rather than JSON, because YAML is a superset of JSON and
    // detection must not depend on the file extension. Gating on `.json` let an
    // author bypass the one error-severity check in this scanner by renaming
    // the file, which is the licensing risk the registry cannot host.
    doc = parseYaml(content)
  } catch {
    return 'unparseable'
  }
  const stack: unknown[] = [doc]
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      stack.push(...node)
    } else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      const expansion = obj.expansion as Record<string, unknown> | undefined
      if (obj.resourceType === 'ValueSet' && expansion && Array.isArray(expansion.contains)) {
        return 'found'
      }
      stack.push(...Object.values(obj))
    }
  }
  return 'absent'
}

/**
 * The same thing recognised in raw text, without parsing.
 *
 * Reported by an outside reviewer: a genuine expansion, with SNOMED codes and
 * display text, carrying one duplicated key. YAML forbids duplicate keys, so
 * the parser threw where a JSON parser would have taken the last one and
 * carried on. `scanForExpansion` answered "nothing here", and the package
 * validated clean at Level 1 with the licensed expansion sitting in it.
 *
 * The reviewer's suggested fix was to make any parse failure a finding. That
 * cannot be done as stated: 360 of the 415 files in the corpus today do not
 * parse as YAML, because CQL and Markdown are not YAML. So this fails closed on
 * the signal rather than on the parse, and only contradicts the structural
 * check, never replaces it.
 *
 * Matched on key syntax rather than bare words, so prose about value sets does
 * not trip it. TERMINOLOGY.md discusses expansions at length and must not match.
 */
const VALUESET_RESOURCE = /["']?resourceType["']?\s*:\s*["']?ValueSet["']?/
const EXPANSION_KEY = /["']?expansion["']?\s*:/

function looksLikeExpansion(content: string): boolean {
  return VALUESET_RESOURCE.test(content) && EXPANSION_KEY.test(content)
}

/**
 * Scans one file for content the registry cannot host. Heuristic by design:
 * it will miss things and produce false positives, so errors block a publish
 * and warnings surface for human review.
 */
export function scanContent(path: string, content: string): Finding[] {
  const findings: Finding[] = []

  const expansion = scanForExpansion(content)
  if (expansion === 'found') {
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        'file contains an embedded ValueSet expansion. Reference value sets by OID or ' +
        'canonical URL instead, since redistributing expansions requires a UMLS license.',
      path,
    })
  } else if (looksLikeExpansion(content)) {
    // Reached when the structural check said no and the text says otherwise:
    // either the file did not parse, or it parsed into a shape the walk above
    // does not recognise. Both mean the scanner could not confirm what is in
    // the file, and an unconfirmed expansion is exactly the thing that cannot
    // be redistributed. Erring towards the error is the point.
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        `file declares a ValueSet resourceType and an expansion element, but the scanner ` +
        `could not confirm its contents${expansion === 'unparseable' ? ' because the file did not parse' : ''}. ` +
        'Reference value sets by OID or canonical URL instead, since redistributing ' +
        'expansions requires a UMLS license.',
      path,
    })
  }

  if (CPT_SYSTEM.test(content)) {
    findings.push({
      check: 'content.forbidden',
      severity: 'warning',
      message: 'file references the CPT code system, which is AMA licensed and cannot be redistributed',
      path,
    })
  }

  for (const pattern of COPYRIGHT_CLAIMS) {
    if (pattern.test(content)) {
      findings.push({
        check: 'content.forbidden',
        severity: 'warning',
        message: 'file contains a third party copyright claim and may include licensed content',
        path,
      })
      break
    }
  }

  findings.push(...checkTerminology(path, content))

  return findings
}
