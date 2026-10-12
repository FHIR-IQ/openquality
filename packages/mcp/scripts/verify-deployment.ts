/**
 * Checks a deployed MCP endpoint with a real MCP client, not curl: five tools,
 * one call per tool, every footer naming the expected commit, and GET answered
 * with 405 rather than a stream that never closes.
 *
 * Run with: node --import tsx packages/mcp/scripts/verify-deployment.ts https://openquality.us/mcp [expected-sha]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] ?? 'https://openquality.us/mcp'
const expectedSha = process.argv[3]
const failures: string[] = []
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) failures.push(what)
}

const client = new Client({ name: 'openquality-verify', version: '0' })
await client.connect(new StreamableHTTPClientTransport(new URL(url)))

const { tools } = await client.listTools()
check(tools.length === 5, `five tools (got ${tools.map((t) => t.name).join(', ')})`)

const calls: [string, Record<string, unknown>][] = [
  ['search_measures', { query: 'CMS122FHIR' }],
  ['get_measure', { id: 'cms/appropriate-testing-for-pharyngitis' }],
  ['get_artifact', { path: 'measures/cms-fhir-2026/lib-status/cql/Status.cql' }],
  ['get_bundle', { id: 'cms/appropriate-testing-for-pharyngitis' }],
  ['known_issues', { measure: 'cms/diabetes-glycemic-status-assessment-greater-than-9', limit: 1 }],
]
for (const [name, args] of calls) {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
  const foot = result.content[result.content.length - 1]!.text
  const served = /^served-from: (\S+)/.exec(foot)?.[1]
  check(!result.isError, `${name} succeeds`)
  if (expectedSha) check(served === expectedSha, `${name} served from ${served}`)
}
await client.close()

const get = await fetch(url)
check(get.status === 405, `GET answers 405 (got ${get.status})`)

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
