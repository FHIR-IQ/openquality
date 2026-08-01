#!/usr/bin/env node
import { Command } from 'commander'
import { runValidate } from './commands/validate.js'
import { runValidateAll } from './commands/validate-all.js'
import { runPack } from './commands/pack.js'

const write = (line: string) => console.log(line)

const program = new Command()
program.name('oq').description('Open Quality package tools').version('0.1.0')

program
  .command('validate')
  .description('Validate a package directory and report its conformance level')
  .argument('[dir]', 'package directory', '.')
  .action(async (dir: string) => {
    process.exitCode = await runValidate(dir, write)
  })

program
  .command('validate-all')
  .description('Validate every package under one or more collection roots')
  .argument('<roots...>', 'collection directories')
  .option('--floor <level>', 'minimum acceptable conformance level', '1')
  .action(async (roots: string[], opts: { floor: string }) => {
    process.exitCode = await runValidateAll(roots, Number(opts.floor), write)
  })

program
  .command('pack')
  .description('Pack a package directory into a deterministic tarball')
  .argument('[dir]', 'package directory', '.')
  .option('-o, --out <path>', 'output path')
  .action(async (dir: string, opts: { out?: string }) => {
    process.exitCode = await runPack(dir, opts.out, write)
  })

await program.parseAsync()
