import type { Finding } from './report.js'
import { stripComments } from './cql.js'

/**
 * CMS QMD authoring patterns that can be read from CQL text.
 *
 * Source: the CMS FHIR Quality Measure Development IG,
 * https://build.fhir.org/ig/cqframework/cms-qmd/pattern_fhir.html. Only rules
 * a text match can find are here; the rest need a translator.
 *
 * Never an error. The patterns are guidance an author is asked to apply, the IG
 * is a continuous build, and the seed corpus predates it, so these inform a
 * contributor without blocking a pull request or a level.
 */
const PATTERNS_URL = 'https://build.fhir.org/ig/cqframework/cms-qmd/pattern_fhir.html'

const USING_NO_VERSION = /^using\s+([A-Za-z0-9_]+)\s*$/gm
const STRING_MEMBERSHIP = /'[^'\n]*'\s+in\s+"/g
const TERMINOLOGY_CONTAINS = /\.(code|category|type|class|reasonCode)\s+contains\b/g
const UNQUALIFIED_RETRIEVE = /\[[A-Z][A-Za-z0-9_]*\s*[:\]]/g

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

export function checkCqlPatterns(path: string, source: string): Finding[] {
  const cql = stripComments(source)
  const findings: Finding[] = []
  const warn = (index: number, message: string) =>
    findings.push({ check: 'cql.patterns', severity: 'warning', path, message: `line ${lineOf(cql, index)}: ${message}` })

  for (const m of cql.matchAll(USING_NO_VERSION)) {
    warn(m.index!, `\`using ${m[1]}\` has no version. The CMS QMD patterns require one: the model declaration "SHALL include a version". ${PATTERNS_URL}`)
  }
  for (const m of cql.matchAll(STRING_MEMBERSHIP)) {
    warn(m.index!, `string-based membership testing. The CMS QMD patterns say it "SHOULD NOT be used"; compare a code with \`~\` or \`in\`. ${PATTERNS_URL}`)
  }
  for (const m of cql.matchAll(TERMINOLOGY_CONTAINS)) {
    warn(m.index!, `\`contains\` on the terminology-valued element \`${m[1]}\`. The CMS QMD patterns say not to; use \`includesCode()\` or \`in\`. ${PATTERNS_URL}`)
  }

  const unqualified = [...cql.matchAll(UNQUALIFIED_RETRIEVE)].length
  if (unqualified > 0) {
    findings.push({
      check: 'cql.patterns',
      severity: 'info',
      path,
      message:
        `${unqualified} ${unqualified === 1 ? 'retrieve is' : 'retrieves are'} not qualified with the model name ` +
        `(for example \`[QICore.Encounter]\`). The CMS QMD patterns call qualifying a best practice. ${PATTERNS_URL}`,
    })
  }
  return findings
}
