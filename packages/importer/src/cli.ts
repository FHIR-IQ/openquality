#!/usr/bin/env node
import { runImport } from './run.js'

/**
 * The retrieval date is passed in rather than read from the clock, so a re-run
 * of the same pinned commit produces byte-identical output. The drift check
 * depends on that.
 */
const retrieved = process.argv[2] ?? process.env.OQ_IMPORT_DATE

if (!retrieved || !/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) {
  console.error('usage: pnpm oq-import <YYYY-MM-DD>')
  console.error('The date is the retrieval date recorded in every package provenance block.')
  console.error('Pass the same date on a re-import, or the drift check will fail on the date alone.')
  process.exit(2)
}

const summary = await runImport(retrieved)
console.log(`imported ${summary.imported.length} measures`)
console.log(`skipped ${summary.skipped.length}`)
for (const skip of summary.skipped) console.log(`  ${skip.measure}: ${skip.reason}`)
