import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Where the server reads the corpus from: text by repository-relative path.
 *
 * Every tool is written against this and nothing else, so the same handlers
 * serve a local clone (tests, offline use) and a pinned commit on GitHub (the
 * hosted endpoint, the default npx install) without knowing which.
 */
export interface CorpusSource {
  /** The commit, branch or label every answer is served from. */
  readonly ref: string
  readText(path: string): Promise<string>
}

export class FsSource implements CorpusSource {
  constructor(
    private readonly root: string,
    readonly ref: string = 'local working tree',
  ) {}

  readText(path: string): Promise<string> {
    return readFile(join(this.root, path), 'utf8')
  }
}

export const RAW_BASE = 'https://raw.githubusercontent.com/FHIR-IQ/openquality/'

/**
 * Raw files at a ref. At a commit the bytes never change, so a successful read
 * is cached for the life of the process. Fluid Compute reuses instances, so the
 * hosted endpoint fetches each file once per instance, not once per call.
 * A failure is not cached: the next call tries again.
 */
export class HttpSource implements CorpusSource {
  private readonly cache = new Map<string, Promise<string>>()

  constructor(
    private readonly base: string,
    readonly ref: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  readText(path: string): Promise<string> {
    const hit = this.cache.get(path)
    if (hit) return hit
    const pending = this.fetchText(path)
    this.cache.set(path, pending)
    pending.catch(() => this.cache.delete(path))
    return pending
  }

  private async fetchText(path: string): Promise<string> {
    const url = `${this.base}${this.ref}/${path.split('/').map(encodeURIComponent).join('/')}`
    const res = await this.fetchImpl(url)
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
    return res.text()
  }
}
