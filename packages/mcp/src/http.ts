import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createServer } from './server.js'
import type { CorpusSource } from './source.js'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'mcp-session-id',
}

/**
 * A stateless Streamable HTTP handler on web-standard Request and Response.
 *
 * One server and one transport per request, with no sessions: every tool is a
 * read of fixed content, so there is nothing to keep between calls.
 *
 * GET and DELETE are answered here and never reach the transport. In stateless
 * mode the transport answers a GET by opening an SSE stream that never closes,
 * which would hold a serverless function open until its timeout.
 */
export function createHandler(source: CorpusSource): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') {
      return new Response(
        'This is the Open Quality MCP endpoint. Connect an MCP client to it over Streamable HTTP (POST).\n' +
          'Setup for Claude Code, Cursor and VS Code: https://openquality.us/mcp-setup\n',
        { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS', 'content-type': 'text/plain; charset=utf-8' } },
      )
    }
    const server = createServer(source)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
    return new Response(response.body, { status: response.status, headers })
  }
}
