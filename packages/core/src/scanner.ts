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

function hasEmbeddedExpansion(content: string): boolean {
  let doc: unknown
  try {
    // Parsed as YAML rather than JSON, because YAML is a superset of JSON and
    // detection must not depend on the file extension. Gating on `.json` let an
    // author bypass the one error-severity check in this scanner by renaming
    // the file, which is the licensing risk the registry cannot host.
    doc = parseYaml(content)
  } catch {
    return false
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
        return true
      }
      stack.push(...Object.values(obj))
    }
  }
  return false
}

/**
 * Scans one file for content the registry cannot host. Heuristic by design:
 * it will miss things and produce false positives, so errors block a publish
 * and warnings surface for human review.
 */
export function scanContent(path: string, content: string): Finding[] {
  const findings: Finding[] = []

  if (hasEmbeddedExpansion(content)) {
    findings.push({
      check: 'content.forbidden',
      severity: 'error',
      message:
        'file contains an embedded ValueSet expansion. Reference value sets by OID or ' +
        'canonical URL instead, since redistributing expansions requires a UMLS license.',
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
