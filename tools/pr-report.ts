/**
 * Renders `oq validate` output as Markdown, for posting on a pull request.
 *
 * The point is a contribution path that needs no terminal. Someone can fork in
 * the browser, add files through github.com, open a pull request, and read what
 * the validator said in plain language without installing Node.
 *
 * Kept out of the CLI on purpose. `oq validate` prints for a person watching a
 * terminal; this prints for a person reading a web page, and the two want
 * different things. Sharing `validatePackage` is what matters, not the
 * formatting.
 */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validatePackage } from '@openquality/core'
import type { Finding } from '@openquality/core'

const LEVEL_NAMES = ['Shared', 'Described', 'Verified'] as const

/** Package directories among the given changed paths, deduplicated and sorted. */
export async function packageDirsFor(changedPaths: string[]): Promise<string[]> {
  const candidates = new Set<string>()
  for (const path of changedPaths) {
    const parts = path.split('/')
    // measures/<collection>/<package>/... and measures/<package>/... both count.
    // Walking up from the file rather than assuming a depth, because a package
    // can hold nested directories such as cql/.
    for (let depth = parts.length - 1; depth >= 2; depth--) {
      candidates.add(parts.slice(0, depth).join('/'))
    }
  }

  const dirs: string[] = []
  for (const dir of candidates) {
    if (!dir.startsWith('measures/')) continue
    try {
      await stat(join(dir, 'openquality.yaml'))
      dirs.push(dir)
    } catch {
      // Not a package root. Expected for every intermediate directory.
    }
  }
  return dirs.sort()
}

function icon(severity: Finding['severity']): string {
  if (severity === 'error') return '🔴'
  return severity === 'warning' ? '🟡' : 'ℹ️'
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|')
}

function renderPackage(dir: string, result: Awaited<ReturnType<typeof validatePackage>>): string[] {
  const { level, report } = result
  const errors = report.findings.filter((f) => f.severity === 'error')
  const lines: string[] = []

  const verdict = errors.length === 0 ? '✅' : '❌'
  lines.push(`### ${verdict} \`${dir}\``)
  lines.push('')
  lines.push(`**Level ${level} (${LEVEL_NAMES[level]})**` + (errors.length ? ', because of the errors below.' : '.'))
  lines.push('')

  if (report.findings.length === 0) {
    lines.push('No findings.')
    lines.push('')
    return lines
  }

  lines.push('| | Where | What |')
  lines.push('|---|---|---|')
  for (const finding of report.findings) {
    lines.push(`| ${icon(finding.severity)} | \`${escapePipes(finding.path ?? '')}\` | ${escapePipes(finding.message)} |`)
  }
  lines.push('')

  if (errors.length === 0 && report.findings.length > 0) {
    lines.push('Warnings do not block a level. Nothing here needs fixing before merge.')
    lines.push('')
  }
  return lines
}

export async function renderReport(dirs: string[]): Promise<{ markdown: string; ok: boolean }> {
  if (dirs.length === 0) {
    return {
      markdown: '## Package validation\n\nNo package changed in this pull request, so there was nothing to validate.\n',
      ok: true,
    }
  }

  const lines = ['## Package validation', '']
  let ok = true

  for (const dir of dirs) {
    const result = await validatePackage(dir)
    if (result.report.findings.some((f) => f.severity === 'error')) ok = false
    lines.push(...renderPackage(dir, result))
  }

  if (!ok) {
    lines.push('---')
    lines.push('')
    lines.push(
      'Every error above has to clear before this can merge. You can fix them in the browser: ' +
        'open the file on your branch, press the pencil, commit, and this comment updates itself.',
    )
    lines.push('')
    lines.push(
      'If a finding looks wrong, say so in the pull request. The validator has been wrong before, ' +
        'and a rule that misfires is a defect worth more than a package.',
    )
  } else {
    lines.push('---')
    lines.push('')
    lines.push(
      'Level 1 is the ceiling today. `cql.translate`, `fhir.validate` and `sql.parse` are not ' +
        'implemented, so no package reaches Level 2, including the seeded ones.',
    )
  }
  lines.push('')
  return { markdown: lines.join('\n'), ok }
}

/** Newline-delimited paths on stdin, or an empty list if nothing is piped in. */
async function readStdin(): Promise<string[]> {
  if (process.stdin.isTTY) return []
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

// Entry point. Changed paths arrive on stdin, one per line, rather than as
// arguments. A pull request can touch more files than a command line holds, and
// xargs would then split them across several invocations and print several
// reports. Reading the list whole makes one report by construction.
//
// Guarded so the tests can import the two functions above without the module
// reading stdin and writing to stdout as a side effect of being imported.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const changed = process.argv.length > 2 ? process.argv.slice(2) : await readStdin()
  const { markdown, ok } = await renderReport(await packageDirsFor(changed))
  process.stdout.write(markdown)
  process.exitCode = ok ? 0 : 1
}
