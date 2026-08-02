import { validatePackage } from '@openquality/core'

export type Writer = (line: string) => void

const LEVEL_NAMES = ['Shared', 'Described', 'Verified'] as const

/** Validates a package directory. Returns the process exit code. */
export async function runValidate(dir: string, write: Writer): Promise<number> {
  const { report, level, blockers } = await validatePackage(dir)

  const errors = report.findings.filter((f) => f.severity === 'error')
  const warnings = report.findings.filter((f) => f.severity === 'warning')
  const infos = report.findings.filter((f) => f.severity === 'info')

  for (const finding of errors) {
    write(`error  ${finding.path ?? ''} ${finding.message}`)
  }
  for (const finding of warnings) {
    write(`warn   ${finding.path ?? ''} ${finding.message}`)
  }
  // Printed rather than dropped: Severity includes 'info' because the deep
  // validators in the next plan need it (an unreachable VSAC reports the value
  // set as unverified rather than failing the package). A severity the CLI
  // silently swallows is a latent bug, so every finding gets printed.
  for (const finding of infos) {
    write(`info   ${finding.path ?? ''} ${finding.message}`)
  }

  write('')
  write(`Level ${level} (${LEVEL_NAMES[level]})`)

  if (blockers.length > 0) {
    write('')
    write('To reach the next level:')
    for (const blocker of blockers) write(`  - ${blocker}`)
    write('')
    // Future tense on purpose: these validators do not exist yet, so every
    // package tops out at Level 1. Saying they "run on publish" would promise a
    // check nothing performs.
    write('Note: cql.translate, fhir.validate, and sql.parse will run on publish once')
    write('the deep validators exist. Until then Level 1 is the ceiling.')
  }

  return errors.length > 0 ? 1 : 0
}
