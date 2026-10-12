import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { FsSource, HttpSource } from '../src/source.js'
import { createServer } from '../src/server.js'
import { createHandler } from '../src/http.js'

const ROOT = join(import.meta.dirname, '../../..')
const TOOLS = ['get_artifact', 'get_bundle', 'get_measure', 'known_issues', 'search_measures']

describe('protocol', () => {
  it('lists five read-only tools and answers a call', async () => {
    const server = createServer(new FsSource(ROOT))
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(b)

    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS)
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true)

    const result = await client.callTool({ name: 'search_measures', arguments: { query: 'CMS122FHIR' } })
    expect(result.isError).toBeFalsy()
    await client.close()
  })

  it('rejects an oversized query through the schema', async () => {
    const server = createServer(new FsSource(ROOT))
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(b)
    const result = await client.callTool({ name: 'search_measures', arguments: { query: 'x'.repeat(201) } })
    expect(result.isError).toBe(true)
    await client.close()
  })
})

describe('http handler', () => {
  const handler = createHandler(new FsSource(ROOT))
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  const post = (body: unknown) =>
    handler(new Request('https://openquality.us/mcp', { method: 'POST', headers, body: JSON.stringify(body) }))

  it('initializes, lists tools and calls one, statelessly', async () => {
    const init = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    })
    expect(init.status).toBe(200)
    expect(init.headers.get('access-control-allow-origin')).toBe('*')
    expect((await init.json()).result.serverInfo.name).toBe('openquality')

    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect((await list.json()).result.tools).toHaveLength(5)

    const call = await post({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'get_measure', arguments: { id: 'cms/appropriate-testing-for-pharyngitis' } },
    })
    const text = (await call.json()).result.content[0].text
    expect(JSON.parse(text).provenance.relationship).toBe('derived')
  })

  it('answers GET with 405 instead of opening a stream that never closes', async () => {
    const res = await handler(new Request('https://openquality.us/mcp', { method: 'GET', headers: { accept: 'text/event-stream' } }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST, OPTIONS')
    expect(await res.text()).toMatch(/openquality\.us\/mcp-setup/)
  })

  it('answers a CORS preflight', async () => {
    const res = await handler(new Request('https://openquality.us/mcp', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-headers')).toMatch(/mcp-protocol-version/)
  })
})

describe('HttpSource', () => {
  it('reads at a pinned ref and fetches each path once', async () => {
    const seen: string[] = []
    const fetchStub = async (url: string | URL | Request) => {
      seen.push(String(url))
      return new Response('hello')
    }
    const source = new HttpSource('https://raw.example/repo/', 'abc123', fetchStub as typeof fetch)
    expect(await source.readText('a/b.cql')).toBe('hello')
    expect(await source.readText('a/b.cql')).toBe('hello')
    expect(seen).toEqual(['https://raw.example/repo/abc123/a/b.cql'])
    expect(source.ref).toBe('abc123')
  })

  it('does not cache a failure', async () => {
    let calls = 0
    const fetchStub = async () => (++calls === 1 ? new Response('nope', { status: 503 }) : new Response('ok'))
    const source = new HttpSource('https://raw.example/repo/', 'main', fetchStub as typeof fetch)
    await expect(source.readText('x')).rejects.toThrow(/503/)
    expect(await source.readText('x')).toBe('ok')
  })
})

describe('stdio', () => {
  it('starts over a local clone and lists the tools', async () => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(import.meta.dirname, '../src/stdio.ts'), '--root', ROOT],
      { stdio: ['pipe', 'pipe', 'inherit'] },
    )
    const reply = new Promise<string>((resolve) => {
      let buffer = ''
      child.stdout.on('data', (chunk) => {
        buffer += chunk
        const line = buffer.split('\n').find((l) => l.includes('"id":2'))
        if (line) resolve(line)
      })
    })
    const send = (m: unknown) => child.stdin.write(`${JSON.stringify(m)}\n`)
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } })
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const names = JSON.parse(await reply).result.tools.map((t: { name: string }) => t.name).sort()
    child.kill()
    expect(names).toEqual(TOOLS)
  }, 20_000)
})
