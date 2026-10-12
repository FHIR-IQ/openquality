import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { FsSource, HttpSource, RAW_BASE, type CorpusSource } from './source.js'

const USAGE = `openquality-mcp: the Open Quality corpus over MCP, on stdio.

  --ref <sha|branch>  read the corpus from GitHub at this ref (default: main)
  --root <dir>        read a local clone instead, for offline use
`

const { values } = parseArgs({
  options: { ref: { type: 'string' }, root: { type: 'string' }, help: { type: 'boolean' } },
})

if (values.help) {
  process.stderr.write(USAGE)
  process.exit(0)
}

const source: CorpusSource = values.root
  ? new FsSource(resolve(values.root))
  : new HttpSource(RAW_BASE, values.ref ?? 'main')

await createServer(source).connect(new StdioServerTransport())
