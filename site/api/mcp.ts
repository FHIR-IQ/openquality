import { createHandler } from '../../packages/mcp/src/http.js'
import { HttpSource, RAW_BASE } from '../../packages/mcp/src/source.js'

/**
 * The hosted MCP endpoint, served at https://openquality.us/mcp.
 *
 * It reads the corpus at the commit this deployment was built from, so every
 * answer names a fixed set of bytes. Outside a git deployment the commit is
 * unknown and it falls back to main.
 */
const handle = createHandler(new HttpSource(RAW_BASE, process.env.VERCEL_GIT_COMMIT_SHA || 'main'))

export const POST = handle
export const GET = handle
export const DELETE = handle
export const OPTIONS = handle
