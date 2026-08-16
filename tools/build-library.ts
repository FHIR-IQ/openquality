/**
 * Generates site/library.html from the repository itself: every package manifest
 * under measures/, and every knowledge entry under knowledge/.
 *
 * The page is the browsable front door to the corpus. It exists so that finding
 * a measure, and finding what people already learned about it, does not require
 * cloning the repository and reading YAML.
 *
 * Determinism is a hard requirement, for the same reason it is in the importer:
 * CI re-runs this and fails on any diff, which is what stops the published page
 * from drifting away from the corpus it claims to describe. Sort everything that
 * comes from a directory read, and write LF.
 *
 * Run with: pnpm build-library
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { Marked, Renderer } from 'marked'
import { validatePackage } from '@openquality/core'

const MEASURE_ROOTS = ['measures/cms-fhir-2026', 'measures/community']
const KNOWLEDGE_ROOT = 'knowledge'
const OUT = 'site/library.html'
/**
 * One page per knowledge entry. The library page can only ever show a summary,
 * and an entry whose body is unreachable is a citation nobody can follow: the
 * corpus claims that what implementers learned is queryable, and a first
 * paragraph is not the thing they learned.
 *
 * A stable URL per entry also makes an entry citable on its own, which is what
 * a researcher needs in a methods section.
 */
const OUT_ENTRIES = 'site/knowledge'
/**
 * The page script lives in its own file rather than inline. The site ships a
 * Content-Security-Policy of `script-src 'self'`, which blocks inline script,
 * so an inline block would render an empty list in production while working
 * perfectly from a local file server. Keep them separate.
 */
const OUT_JS = 'site/library.js'
/**
 * Generated rather than hand-written, because it has to list a URL per
 * knowledge entry and a hand-maintained list would silently fall behind. An
 * entry nobody can find by searching is the archaeology problem this corpus
 * exists to remove.
 */
const OUT_SITEMAP = 'site/sitemap.xml'
/**
 * A machine-readable catalogue of the corpus, served as a static file.
 *
 * There is no registry server, and a tool that wants to list or fetch packages
 * should not need one. This is the whole of the read API: one JSON document
 * over HTTPS, no credentials, no OAuth, no host for anyone to run. A client
 * reads it to decide what it wants, then fetches those files from the raw
 * content URL it names.
 */
const OUT_INDEX = 'site/index.json'
const SITE = 'https://openquality.us'
const REPO = 'https://github.com/FHIR-IQ/openquality'
/** Where the files a package declares can actually be fetched from. */
const RAW = 'https://raw.githubusercontent.com/FHIR-IQ/openquality'

interface Pkg {
  slug: string
  dir: string
  collection: string
  id: string
  version: string
  license: string
  title: string
  steward: string
  identifiers: string[]
  dataModel: string
  artifacts: string[]
  valueSets: number
  relationship: string
  modifications: string[]
}

interface Entry {
  file: string
  /** Filename without the extension. What a [[wikilink]] in another entry names. */
  slug: string
  id: string
  /** From front matter when present, otherwise derived from the slug. */
  title: string
  type: string
  /** Set when the entry is about one measure. Mutually exclusive with scope. */
  measure: string
  /**
   * Set when the entry is not about any single measure: a fact about how CQL is
   * evaluated, or how this repository packages things. Filing that under
   * whichever measure happened to expose it buries knowledge that applies to
   * all of them, so it gets its own section on the page instead.
   */
  scope: string
  measureVersion: string
  status: string
  categories: string[]
  reporter: string
  summary: string
  /** The Markdown after the front matter, rendered onto the entry's own page. */
  body: string
}

/** Splits YAML front matter from the Markdown body. */
function splitFrontMatter(text: string): { fm: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { fm: {}, body: text }
  const fm = (parse(m[1]) ?? {}) as Record<string, unknown>
  return { fm, body: m[2] }
}

/**
 * Takes the first real paragraph of the entry body as the summary. Entries
 * follow a "## Summary" convention but nothing enforces it, so fall back to the
 * first prose paragraph rather than emitting an empty card.
 */
function firstParagraph(body: string): string {
  const afterHeading = /##\s+Summary\s*\r?\n([\s\S]*?)(?:\r?\n##\s|$)/.exec(body)
  const source = afterHeading ? afterHeading[1] : body
  for (const block of source.split(/\r?\n\r?\n/)) {
    const text = block.trim().replace(/^#+\s.*$/gm, '').trim()
    if (!text) continue
    return text.replace(/\s+/g, ' ').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1')
  }
  return ''
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []
}

/**
 * Words a title case pass would otherwise mangle. Deliberately short: it covers
 * what actually appears in this corpus rather than trying to be a dictionary,
 * and an entry that wants an exact title can set `title:` in its front matter.
 */
const ACRONYMS = new Map(
  [
    'cql', 'sql', 'oid', 'oids', 'cms', 'ncqa', 'fhir', 'elm', 'vsac', 'umls',
    'cpt', 'snomed', 'loinc', 'yaml', 'json', 'api', 'ci', 'qi', 'hedis',
  ].map((w) => [w, w.toUpperCase()]),
)
ACRONYMS.set('hba1c', 'HbA1c')
ACRONYMS.set('sql-on-fhir', 'SQL-on-FHIR')
ACRONYMS.set('qi-core', 'QI-Core')

/** `2026-004-undeclared-symlink-hid-content` -> `Undeclared symlink hid content`. */
function deriveTitle(slug: string): string {
  const words = slug.replace(/^\d{4}-\d+-/, '').split('-')
  const text = words.map((w) => ACRONYMS.get(w.toLowerCase()) ?? w).join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * The entry's id reduced to characters that are safe in both a path and a URL.
 *
 * The id comes from front matter that a contributor wrote, and it is used here
 * to name a file. An id of `../../etc/whatever` would otherwise write outside
 * site/, and one carrying a slash would produce a URL that does not resolve.
 * Everything outside the allowed set becomes a hyphen rather than being
 * dropped, so two different ids cannot collapse onto one page.
 */
function pageSlug(entry: Entry): string {
  const cleaned = entry.id.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '')
  return cleaned || 'entry'
}

function entryUrl(entry: Entry): string {
  return `/knowledge/${pageSlug(entry)}`
}

/**
 * Renders an entry body to HTML at build time.
 *
 * Raw HTML in the Markdown is escaped rather than emitted. Entries arrive by
 * pull request from people we do not know, and while the site's CSP of
 * `script-src 'self'` would stop an injected script from running, a check that
 * relies on a second control to be safe is the pattern this project already
 * had to fix twice. Escaping here means the page cannot carry markup an author
 * did not intend, regardless of what the CSP does.
 *
 * `[[slug]]` links between entries are resolved to their pages. An unresolved
 * one renders as plain text: knowledge/README invites authors to link to
 * entries that do not exist yet, so a dangling link is a note to a future
 * writer rather than a mistake to shout about.
 */
function makeMarkdown(entries: Entry[]): (body: string) => string {
  const bySlug = new Map(entries.map((e) => [e.slug, e]))
  const renderer = new Renderer()
  renderer.html = ({ text }: { text: string }) => esc(text)
  const marked = new Marked({ renderer, gfm: true })

  return (body: string) => {
    const linked = body.replace(/\[\[([^\]]+)\]\]/g, (whole, slug: string) => {
      const target = bySlug.get(slug)
      return target ? `[${target.title}](${entryUrl(target)})` : esc(slug)
    })
    return marked.parse(linked) as string
  }
}

async function readPackages(): Promise<Pkg[]> {
  const packages: Pkg[] = []
  for (const root of MEASURE_ROOTS) {
    let dirs: string[]
    try {
      dirs = (await readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    } catch {
      continue
    }
    for (const slug of dirs) {
      const dir = join(root, slug)
      let raw: string
      try {
        raw = await readFile(join(dir, 'openquality.yaml'), 'utf8')
      } catch {
        // A directory without a manifest is a reserved slot, not a package.
        // measures/community/hospital-at-home-eligibility is one today.
        continue
      }
      const m = (parse(raw) ?? {}) as Record<string, any>
      const measure = (m.measure ?? {}) as Record<string, unknown>
      const provenance = (m.provenance ?? {}) as Record<string, unknown>
      packages.push({
        slug,
        dir,
        collection: root.split('/').pop() ?? root,
        id: str(m.id, slug),
        version: str(m.version),
        license: str(m.license),
        title: str(measure.title, slug),
        steward: str(measure.steward, 'Not stated'),
        identifiers: strArray(measure.identifiers),
        dataModel: str(m.dataModel),
        artifacts: Array.isArray(m.artifacts)
          ? m.artifacts.map((a: any) => str(a?.path)).filter(Boolean).sort()
          : [],
        valueSets: Array.isArray(m.valueSets) ? m.valueSets.length : 0,
        relationship: str(provenance.relationship),
        modifications: strArray(provenance.modifications),
      })
    }
  }
  return packages.sort((a, b) => a.id.localeCompare(b.id))
}

async function readKnowledge(): Promise<Entry[]> {
  const entries: Entry[] = []
  async function walk(dir: string): Promise<void> {
    let items
    try {
      items = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return
    }
    for (const item of items) {
      const path = join(dir, item.name)
      if (item.isDirectory()) {
        await walk(path)
        continue
      }
      if (!item.name.endsWith('.md') || item.name === 'README.md') continue
      const { fm, body } = splitFrontMatter(await readFile(path, 'utf8'))
      const slug = item.name.replace(/\.md$/, '')
      entries.push({
        file: path,
        slug,
        id: str(fm.id, slug),
        title: str(fm.title) || deriveTitle(slug),
        body,
        type: str(fm.type, 'note'),
        measure: str(fm.measure),
        scope: str(fm.scope),
        measureVersion: str(fm.measureVersion),
        status: str(fm.status, 'open'),
        categories: strArray(fm.categories),
        reporter: str(fm.reporter),
        summary: firstParagraph(body),
      })
    }
  }
  await walk(KNOWLEDGE_ROOT)
  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Shared by the library page and every knowledge entry page, so the two cannot
 * drift apart visually. Inlined into each page rather than served as a file:
 * it is small, and one request beats two on a page this size.
 */
const STYLE = `  @font-face{font-family:"Inter Tight";font-style:normal;font-weight:300 600;font-display:swap;
    src:url(/fonts/inter-tight-latin.woff2) format("woff2");
    unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}
  @font-face{font-family:"Inter Tight";font-style:normal;font-weight:300 600;font-display:swap;
    src:url(/fonts/inter-tight-latin-ext.woff2) format("woff2");
    unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}
  @font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:400;font-display:swap;
    src:url(/fonts/jetbrains-mono-latin.woff2) format("woff2");
    unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}

  :root{
    --bg:#F8F8F8; --ink:#222222; --surface:#FFFFFF; --panel:#222222;
    --hairline:#E6E6E6; --accent:#FF6B35; --muted:#6B6B6B; --panel-ink:#EDEDED;
    --radius:8px;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --bg:#111111; --ink:#F0F0F0; --surface:#1A1A1A; --panel:#000000;
      --hairline:#2E2E2E; --muted:#9A9A9A; --panel-ink:#EDEDED;
    }
  }
  *,*::before,*::after{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--ink);
    font-family:"Inter Tight",sans-serif; font-weight:300; font-size:15px; line-height:1.72;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:1240px; margin:0 auto; padding:0 24px}
  a{color:inherit}
  code,.mono{font-family:"JetBrains Mono",monospace; font-size:13px}

  nav{position:sticky; top:0; z-index:20; background:var(--bg); border-bottom:1px solid var(--hairline)}
  .nav-in{display:flex; align-items:center; gap:28px; height:64px}
  .mark{font-weight:600; font-size:20px; letter-spacing:-.02em; text-decoration:none}
  .mark span{color:var(--accent)}
  .nav-links{margin-left:auto; display:flex; gap:22px; font-weight:500; font-size:14px}
  .nav-links a{text-decoration:none; color:var(--muted)}
  .nav-links a:hover{color:var(--ink)}
  .btn{display:inline-block; background:var(--ink); color:var(--bg); border-radius:var(--radius);
    padding:11px 18px; font-weight:500; font-size:14px; text-decoration:none; border:1px solid var(--ink)}
  .btn:hover{opacity:.85}
  .btn-ghost{background:transparent; color:var(--ink); border:1px solid var(--hairline)}

  header{padding:52px 0 26px}
  h1{font-weight:600; font-size:40px; letter-spacing:-.03em; margin:0 0 12px; line-height:1.1}
  .lede{max-width:680px; font-size:17px; color:var(--ink); margin:0}
  .counts{display:flex; gap:26px; flex-wrap:wrap; margin-top:26px; font-size:14px; color:var(--muted)}
  .counts b{color:var(--ink); font-weight:600; font-size:20px; display:block; line-height:1.2}

  .controls{display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin:30px 0 8px;
    position:sticky; top:64px; background:var(--bg); padding:14px 0; z-index:10; border-bottom:1px solid var(--hairline)}
  #q{flex:1; min-width:260px; font:inherit; font-size:15px; color:var(--ink); background:var(--surface);
    border:1px solid var(--hairline); border-radius:var(--radius); padding:11px 14px}
  #q:focus{outline:2px solid var(--accent); outline-offset:-1px}
  select{font:inherit; font-size:14px; color:var(--ink); background:var(--surface);
    border:1px solid var(--hairline); border-radius:var(--radius); padding:11px 12px}
  .hits{font-size:13px; color:var(--muted); margin-left:auto; white-space:nowrap}

  .row{border-bottom:1px solid var(--hairline); padding:18px 0}
  .row-head{display:flex; align-items:baseline; gap:14px; cursor:pointer; flex-wrap:wrap}
  .row-head:hover .t{color:var(--accent)}
  .t{font-size:17px; font-weight:500; letter-spacing:-.01em}
  .ids{color:var(--muted); font-size:13px}
  .tags{margin-left:auto; display:flex; gap:8px; align-items:center; flex-wrap:wrap}
  .tag{font-size:12px; font-weight:500; padding:3px 9px; border-radius:999px;
    border:1px solid var(--hairline); color:var(--muted); white-space:nowrap}
  .tag.k{border-color:var(--accent); color:var(--accent)}
  .tag.d{border-color:var(--muted)}
  .meta{display:flex; gap:22px; flex-wrap:wrap; margin-top:8px; font-size:13px; color:var(--muted)}

  .detail{display:none; padding:18px 0 4px}
  .row.open .detail{display:block}
  .detail h3{font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:.08em;
    color:var(--muted); margin:0 0 10px}
  .files{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px}
  .file{font-family:"JetBrains Mono",monospace; font-size:12px; padding:5px 10px;
    background:var(--surface); border:1px solid var(--hairline); border-radius:6px}
  .entry{border-left:2px solid var(--accent); padding:2px 0 2px 16px; margin-bottom:16px}
  .entry .eh{display:flex; gap:10px; align-items:baseline; flex-wrap:wrap}
  .entry .et{font-size:12px; font-weight:600; color:var(--accent); text-transform:uppercase; letter-spacing:.06em}
  .entry .es{font-size:12px; color:var(--muted)}
  .entry p{margin:6px 0 0; font-size:14px; line-height:1.6}
  .entry .elink{font-weight:500; text-decoration:none; border-bottom:1px solid var(--hairline)}
  .entry .elink:hover{color:var(--accent); border-bottom-color:var(--accent)}

  .who{border-top:1px solid var(--hairline); margin-top:30px; padding:26px 0 0}
  .who h2{font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:.08em;
    color:var(--muted); margin:0 0 10px}
  .who p{margin:0 0 14px; max-width:680px; font-size:14px; color:var(--muted)}
  .people{display:flex; gap:8px; flex-wrap:wrap}
  .person{font-size:13px; padding:5px 12px; border-radius:999px; background:var(--surface);
    border:1px solid var(--hairline)}
  .person b{font-weight:600}
  .person span{color:var(--muted)}
  .none{font-size:14px; color:var(--muted); margin:0 0 20px}
  .acts{display:flex; gap:10px; flex-wrap:wrap; margin-top:6px}
  .acts a{font-size:13px; font-weight:500; text-decoration:none; padding:8px 13px;
    border:1px solid var(--hairline); border-radius:var(--radius)}
  .acts a:hover{border-color:var(--accent); color:var(--accent)}
  .acts a.primary{background:var(--ink); color:var(--bg); border-color:var(--ink)}
  .acts a.primary:hover{opacity:.85; color:var(--bg)}

  .cross{border-top:1px solid var(--hairline); padding:28px 0 6px; margin-top:8px}
  .cross-head h2{font-size:22px; font-weight:600; letter-spacing:-.02em; margin:0 0 8px}
  .cross-head p{margin:0 0 22px; max-width:680px; font-size:14px; color:var(--muted)}
  .scope{margin-bottom:22px}
  .scope-name{display:inline-block; font-size:12px; padding:3px 10px; border-radius:999px;
    border:1px solid var(--accent); color:var(--accent); margin-bottom:12px}

  .empty{padding:60px 0; text-align:center; color:var(--muted)}
  footer{border-top:1px solid var(--hairline); margin-top:40px; padding:34px 0 60px;
    font-size:13px; color:var(--muted)}
  footer a{color:var(--ink)}
`

function render(packages: Pkg[], entries: Entry[]): string {
  const stewards = [...new Set(packages.map((p) => p.steward))].sort()
  const scoped = entries.filter((e) => e.scope)
  const measureScoped = entries.filter((e) => !e.scope)
  const orphanCount = measureScoped.filter((e) => !packages.some((p) => p.id === e.measure)).length
  const scopes = [...new Set(scoped.map((e) => e.scope))].sort()

  // Sorted by count then name, so the order is stable across runs and does not
  // depend on which directory a walk happened to reach first.
  const tally = new Map<string, number>()
  for (const e of entries) {
    const who = e.reporter || 'unattributed'
    tally.set(who, (tally.get(who) ?? 0) + 1)
  }
  const reporters = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  return `${pageOpen({
    title: 'Library — Open Quality',
    description:
      'Browse every measure package in the Open Quality corpus, the questions and ' +
      'interpretation issues recorded against each one, and how to add your own.',
    canonical: 'https://openquality.us/library',
  })}
<div class="wrap">
  <header>
    <h1>The library</h1>
    <p class="lede">
      Every measure package in the corpus, and every question, interpretation issue,
      and test case recorded against it. Open a measure to read what implementers
      already found, or ask something nobody has answered yet.
    </p>
    <div class="counts">
      <div><b>${packages.length}</b> packages</div>
      <div><b>${entries.length}</b> knowledge entries</div>
      <div><b>${stewards.length}</b> stewards</div>
      <div><b>${packages.filter((p) => p.relationship === 'unmodified').length}</b> verified unmodified</div>
    </div>
  </header>

  ${
    scoped.length === 0
      ? ''
      : `<section class="cross">
    <div class="cross-head">
      <h2>Applies to every measure</h2>
      <p>
        Knowledge that is not about one measure: how CQL is evaluated, how this
        corpus packages things. Filed under a scope rather than a measure, because
        burying it under whichever measure exposed it is how it gets lost.
      </p>
    </div>
    ${scopes
      .map(
        (s) => `<div class="scope">
      <div class="scope-name mono">${esc(s)}</div>
      ${scoped
        .filter((e) => e.scope === s)
        .map(
          (e) => `<div class="entry">
        <div class="eh"><span class="et">${esc(e.type.replace(/-/g, ' '))}</span>
        <span class="es mono">${esc(e.id)}</span>
        <span class="es">${esc(e.status)}</span></div>
        <p><a class="elink" href="${entryUrl(e)}">${esc(e.title)}</a></p>
        <p>${esc(e.summary)}</p>
      </div>`,
        )
        .join('\n      ')}
    </div>`,
      )
      .join('\n    ')}
  </section>`
  }

  <div class="controls">
    <input id="q" type="search" placeholder="Search measures, stewards, CMS identifiers, known issues" autocomplete="off">
    <select id="steward">
      <option value="">All stewards</option>
      ${stewards.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('\n      ')}
    </select>
    <select id="only">
      <option value="">All packages</option>
      <option value="knowledge">Has knowledge entries</option>
      <option value="none">No entries yet</option>
    </select>
    <div class="hits" id="hits"></div>
  </div>

  <div id="list"></div>
  <div class="empty" id="empty" hidden>Nothing matches that. Try a measure name, a steward, or a CMS identifier.</div>

  <section class="who">
    <h2>Who recorded this</h2>
    <p>
      Everyone who has put something into the knowledge corpus, by the handle on their
      entries. Some asked not to be named and appear as anonymous, which is a choice
      the corpus supports: the finding is what has to be public, not the finder.
    </p>
    <div class="people">
      ${reporters
        .map(
          ([name, count]) =>
            `<span class="person"><b>${esc(name)}</b> <span>${count} ${count === 1 ? 'entry' : 'entries'}</span></span>`,
        )
        .join('\n      ')}
    </div>
  </section>

  <footer>
    This page is generated from the repository by <code>pnpm build-library</code>, and CI
    fails if it drifts from the manifests it describes.
    ${orphanCount > 0 ? `${orphanCount} knowledge ${orphanCount === 1 ? 'entry references a measure' : 'entries reference measures'} with no package in this corpus.` : ''}
    Open Quality is not a measure steward and is not affiliated with or endorsed by CMS, NCQA, or HL7.
  </footer>
</div>

<script src="/library.js" defer></script>

</body>
</html>
`
}

/**
 * Styles used only by an entry page. Kept separate from STYLE so the library
 * page does not carry rules for prose it never renders.
 */
const ENTRY_STYLE = `
  .crumbs{font-size:13px; color:var(--muted); padding-top:34px}
  .crumbs a{color:var(--muted); text-decoration:none}
  .crumbs a:hover{color:var(--accent)}
  .entry-head{padding:10px 0 22px; border-bottom:1px solid var(--hairline)}
  .entry-head h1{font-size:34px; margin:0 0 14px; max-width:760px}
  .facts{display:flex; gap:8px; flex-wrap:wrap; align-items:center}
  .fact{font-size:12px; font-weight:500; padding:3px 9px; border-radius:999px;
    border:1px solid var(--hairline); color:var(--muted); white-space:nowrap}
  .fact.on{border-color:var(--accent); color:var(--accent)}
  .prose{max-width:760px; padding:30px 0 10px; font-size:16px}
  .prose h2{font-size:21px; font-weight:600; letter-spacing:-.02em; margin:34px 0 10px}
  .prose h3{font-size:16px; font-weight:600; margin:26px 0 8px}
  .prose p{margin:0 0 16px}
  .prose ul,.prose ol{margin:0 0 16px; padding-left:22px}
  .prose li{margin:0 0 6px}
  .prose a{color:var(--accent); text-decoration:none; border-bottom:1px solid var(--hairline)}
  .prose a:hover{border-bottom-color:var(--accent)}
  .prose code{background:var(--surface); border:1px solid var(--hairline);
    border-radius:4px; padding:1px 5px}
  .prose pre{background:var(--surface); border:1px solid var(--hairline);
    border-radius:var(--radius); padding:14px 16px; overflow-x:auto; margin:0 0 18px}
  .prose pre code{background:none; border:0; padding:0; font-size:12.5px; line-height:1.7}
  .prose blockquote{margin:0 0 18px; padding:2px 0 2px 18px; border-left:2px solid var(--accent);
    color:var(--ink)}
  .prose table{border-collapse:collapse; width:100%; margin:0 0 18px; font-size:14px; display:block;
    overflow-x:auto}
  .prose th,.prose td{border:1px solid var(--hairline); padding:7px 10px; text-align:left}
  .prose th{font-weight:600}
  .prose hr{border:0; border-top:1px solid var(--hairline); margin:26px 0}
  .prose strong{font-weight:600}
  .after{border-top:1px solid var(--hairline); margin-top:30px; padding-top:24px; max-width:760px}
  .after h2{font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:.08em;
    color:var(--muted); margin:0 0 12px}
  .after p{font-size:14px; color:var(--muted); margin:0 0 16px}
`

/** The head, style block and nav that every page on this site shares. */
function pageOpen(opts: { title: string; description: string; canonical: string; extraStyle?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8F8F8">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Open Quality">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:image" content="https://openquality.us/og.png">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23222'/><text x='16' y='23' font-family='Helvetica,Arial,sans-serif' font-size='17' font-weight='600' fill='%23fff' text-anchor='middle'>oq</text><circle cx='25' cy='23' r='2.4' fill='%23FF6B35'/></svg>">
<link rel="preload" href="/fonts/inter-tight-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>
${STYLE}${opts.extraStyle ?? ''}</style>
</head>
<body>

<nav>
  <div class="wrap nav-in">
    <a class="mark" href="/">oq<span>.</span></a>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/library">Library</a>
      <a href="${REPO}/discussions">Discuss</a>
      <a href="${REPO}/blob/main/CONTRIBUTING.md">Contribute</a>
    </div>
    <a class="btn" href="${REPO}">GitHub</a>
  </div>
</nav>
`
}

/**
 * One entry, in full. The library page can only show a first paragraph, and an
 * entry whose reasoning is unreachable cannot be argued with or cited.
 */
function renderEntryPage(
  entry: Entry,
  packages: Pkg[],
  md: (body: string) => string,
): string {
  const pkg = entry.measure ? packages.find((p) => p.id === entry.measure) : undefined
  const context = entry.scope
    ? `Applies to every measure &middot; scope <span class="mono">${esc(entry.scope)}</span>`
    : pkg
      ? `<a href="/library#${esc(pkg.id)}">${esc(pkg.title)}</a>`
      : `<span class="mono">${esc(entry.measure)}</span>`

  return `${pageOpen({
    title: `${entry.title} — Open Quality`,
    description: entry.summary.slice(0, 300),
    canonical: `https://openquality.us${entryUrl(entry)}`,
    extraStyle: ENTRY_STYLE,
  })}
<div class="wrap">
  <div class="crumbs"><a href="/library">Library</a> &nbsp;/&nbsp; ${context}</div>

  <div class="entry-head">
    <h1>${esc(entry.title)}</h1>
    <div class="facts">
      <span class="fact on">${esc(entry.type.replace(/-/g, ' '))}</span>
      <span class="fact">${esc(entry.status)}</span>
      <span class="fact mono">${esc(entry.id)}</span>
      ${entry.measureVersion ? `<span class="fact mono">v${esc(entry.measureVersion)}</span>` : ''}
      ${entry.reporter ? `<span class="fact">reported by ${esc(entry.reporter)}</span>` : ''}
      ${entry.categories.map((c) => `<span class="fact">${esc(c)}</span>`).join('\n      ')}
    </div>
  </div>

  <article class="prose">
${md(entry.body)}
  </article>

  <div class="after">
    <h2>About this entry</h2>
    <p>
      Written by a person, reviewed in a pull request, and kept in the repository as
      Markdown with machine-readable front matter. Cite it by its id,
      <span class="mono">${esc(entry.id)}</span>, which does not change.
      If you think it is wrong, saying so is a contribution.
    </p>
    <div class="acts">
      <a class="primary" href="${REPO}/discussions/new?category=q-a&title=${encodeURIComponent(
        `About ${entry.id}: `,
      )}" target="_blank" rel="noopener">Discuss this entry</a>
      <a href="${REPO}/blob/main/${esc(entry.file)}" target="_blank" rel="noopener">Read the source</a>
      <a href="${REPO}/edit/main/${esc(entry.file)}" target="_blank" rel="noopener">Suggest an edit</a>
      ${pkg ? `<a href="/library#${esc(pkg.id)}">Back to the measure</a>` : `<a href="/library">Back to the library</a>`}
    </div>
  </div>

  <footer>
    Generated from the repository by <code>pnpm build-library</code>. CI fails if this
    page drifts from the entry it renders.
    Open Quality is not a measure steward and is not affiliated with or endorsed by CMS, NCQA, or HL7.
  </footer>
</div>

</body>
</html>
`
}

function renderScript(packages: Pkg[], entries: Entry[]): string {
  // Projected field by field rather than serialised whole. The entry body is
  // rendered into its own page at build time, so shipping it here too would be
  // downloaded by every visitor and read by none of them: it grew this file by
  // 68% before the projection existed. Listing the fields also means adding one
  // to Entry cannot silently enlarge the payload.
  const data = JSON.stringify({
    packages,
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      url: entryUrl(e),
      type: e.type,
      measure: e.measure,
      scope: e.scope,
      measureVersion: e.measureVersion,
      status: e.status,
      reporter: e.reporter,
      summary: e.summary,
    })),
  })

  return `// Generated by tools/build-library.ts. Do not edit; run \`pnpm build-library\`.
const DATA = ${data};
// Only measure-scoped entries attach to a package row. Scope-level entries are
// rendered once, above the list, because they apply to all of them.
const byMeasure = new Map();
for (const e of DATA.entries) {
  if (e.scope || !e.measure) continue;
  if (!byMeasure.has(e.measure)) byMeasure.set(e.measure, []);
  byMeasure.get(e.measure).push(e);
}

const REPO = ${JSON.stringify(REPO)};
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const hits = document.getElementById('hits');
const q = document.getElementById('q');
const steward = document.getElementById('steward');
const only = document.getElementById('only');

function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Links into the issue forms rather than a blank issue with a label. The forms
// are what make an entry typed, and typed is the whole difference between this
// corpus and a comment thread. Prefilling measure and version also removes the
// two fields a reader is most likely to get wrong or leave blank.
//
// Unknown query parameters are ignored by GitHub, so passing version to the
// defect form, which has no version field, is harmless and keeps this one call
// shape for every template.
function issueUrl(template, p, extra){
  const q = new URLSearchParams({ template: template, measure: p.id });
  if (p.version) q.set('version', p.version);
  for (const k in (extra || {})) q.set(k, extra[k]);
  return REPO + '/issues/new?' + q.toString();
}

// Four ways in, ordered by how much they ask of the reader. A question needs
// nothing but confusion; a test case needs work already done. Offering only the
// question form, which is what this used to do, quietly told the person who had
// found a defect that this was not the place for it.
function contributeLinks(p){
  return [
    ['Ask a question', issueUrl('question.yml', p, { scope: 'One specific measure' }), true],
    ['Found an ambiguity', issueUrl('interpretation-issue.yml', p), false],
    ['Report a defect', issueUrl('defect.yml', p), false],
    ['Add a test case', issueUrl('test-case.yml', p), false],
  ];
}

function render(){
  const term = q.value.trim().toLowerCase();
  const st = steward.value;
  const mode = only.value;

  const rows = DATA.packages.filter(p => {
    if (st && p.steward !== st) return false;
    const entries = byMeasure.get(p.id) || [];
    if (mode === 'knowledge' && entries.length === 0) return false;
    if (mode === 'none' && entries.length > 0) return false;
    if (!term) return true;
    const hay = [p.title, p.id, p.steward, p.dataModel, p.identifiers.join(' '),
      entries.map(e => e.summary + ' ' + e.type + ' ' + e.categories.join(' ')).join(' ')]
      .join(' ').toLowerCase();
    return hay.includes(term);
  });

  hits.textContent = rows.length + ' of ' + DATA.packages.length;
  empty.hidden = rows.length > 0;

  list.innerHTML = rows.map(p => {
    const entries = byMeasure.get(p.id) || [];
    const dirUrl = REPO + '/tree/main/' + p.dir;
    return '<div class="row" data-id="' + esc(p.id) + '">' +
      '<div class="row-head">' +
        '<span class="t">' + esc(p.title) + '</span>' +
        '<span class="ids mono">' + esc(p.identifiers.join(', ') || p.slug) + '</span>' +
        '<span class="tags">' +
          (entries.length ? '<span class="tag k">' + entries.length + ' known ' + (entries.length === 1 ? 'entry' : 'entries') + '</span>' : '') +
          '<span class="tag">' + esc(p.dataModel || 'n/a') + '</span>' +
          (p.relationship ? '<span class="tag d">' + esc(p.relationship) + '</span>' : '') +
        '</span>' +
      '</div>' +
      '<div class="meta">' +
        '<span>' + esc(p.steward) + '</span>' +
        '<span class="mono">v' + esc(p.version) + '</span>' +
        '<span>' + esc(p.license) + '</span>' +
        '<span>' + p.artifacts.length + ' artifacts</span>' +
        '<span>' + p.valueSets + ' value sets</span>' +
      '</div>' +
      '<div class="detail">' +
        '<h3>What implementers recorded</h3>' +
        (entries.length
          ? entries.map(e =>
              '<div class="entry">' +
                '<div class="eh"><span class="et">' + esc(e.type.replace(/-/g, ' ')) + '</span>' +
                '<span class="es mono">' + esc(e.id) + '</span>' +
                '<span class="es">' + esc(e.status) + (e.measureVersion ? ' &middot; v' + esc(e.measureVersion) : '') + '</span></div>' +
                '<p><a class="elink" href="' + e.url + '">' + esc(e.title) + '</a></p>' +
                '<p>' + esc(e.summary) + '</p>' +
              '</div>').join('')
          : '<p class="none">Nothing recorded yet. If you have implemented this measure, you know something this corpus does not.</p>') +
        '<h3>Artifacts</h3>' +
        '<div class="files">' + p.artifacts.map(a => '<span class="file">' + esc(a) + '</span>').join('') + '</div>' +
        '<div class="acts">' +
          contributeLinks(p).map(([label, href, primary]) =>
            '<a' + (primary ? ' class="primary"' : '') + ' href="' + href + '" target="_blank" rel="noopener">' + esc(label) + '</a>'
          ).join('') +
          '<a href="' + dirUrl + '" target="_blank" rel="noopener">Browse the package</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

list.addEventListener('click', ev => {
  const head = ev.target.closest('.row-head');
  if (head) head.parentElement.classList.toggle('open');
});
q.addEventListener('input', render);
steward.addEventListener('change', render);
only.addEventListener('change', render);
render();

// An entry page links back as /library#<package id>. Open that row and scroll
// to it, so returning from an entry lands on the measure rather than at the top
// of a list of 53. Runs after the first render, because the row must exist.
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const row = list.querySelector('[data-id="' + id.replace(/"/g, '\\\\"') + '"]');
  if (!row) return;
  row.classList.add('open');
  row.scrollIntoView({ block: 'center' });
}
openFromHash();
window.addEventListener('hashchange', openFromHash);
`
}

/**
 * The catalogue a tool reads instead of cloning the repository.
 *
 * The conformance level is computed here by running the real validator rather
 * than asserted, so the number in this file means the same thing as the number
 * `oq validate` prints. Publishing a level nobody checked would be the exact
 * failure this project treats as a defect.
 *
 * No timestamp and no commit SHA. Both would change on every build and break
 * the CI check that this file still matches the corpus, and a document that
 * cannot be regenerated identically cannot be verified at all. A consumer that
 * needs to pin should pin the ref it fetches, which is why `ref` is named.
 */
async function renderIndex(packages: Pkg[], entries: Entry[]): Promise<string> {
  const byMeasure = new Map<string, string[]>()
  for (const e of entries) {
    if (e.scope || !e.measure) continue
    byMeasure.set(e.measure, [...(byMeasure.get(e.measure) ?? []), e.id])
  }

  const catalogue = []
  for (const p of packages) {
    const { level } = await validatePackage(p.dir)
    catalogue.push({
      id: p.id,
      version: p.version,
      title: p.title,
      steward: p.steward,
      identifiers: p.identifiers,
      dataModel: p.dataModel,
      license: p.license,
      level,
      collection: p.collection,
      path: p.dir,
      manifest: `${p.dir}/openquality.yaml`,
      artifacts: p.artifacts.map((a) => `${p.dir}/${a}`),
      valueSets: p.valueSets,
      relationship: p.relationship,
      knowledge: byMeasure.get(p.id) ?? [],
    })
  }

  return `${JSON.stringify(
    {
      openquality: '1',
      about:
        'A static catalogue of the Open Quality corpus. There is no registry server: ' +
        'read this document, then fetch the paths it names from `raw`. Paths are ' +
        'relative to the repository root.',
      repository: REPO,
      ref: 'main',
      raw: `${RAW}/main/`,
      pinning:
        '`ref` is a moving branch. Pin a commit or tag and substitute it into `raw` if ' +
        'you need the same bytes twice.',
      levels: {
        '0': 'Shared: valid manifest, open licence, at least one artifact.',
        '1': 'Described: adds data model, measure identity, typed artifacts, value set references, and a README stating intent, known limitations and provenance.',
        '2': 'Verified: not reachable today. CQL translation, FHIR profile validation and SQL parsing are unimplemented, so every package tops out at Level 1.',
      },
      counts: { packages: packages.length, knowledgeEntries: entries.length },
      packages: catalogue,
      knowledge: entries.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        status: e.status,
        ...(e.scope ? { scope: e.scope } : { measure: e.measure }),
        ...(e.measureVersion ? { measureVersion: e.measureVersion } : {}),
        categories: e.categories,
        summary: e.summary,
        // Who found it. The entry pages have always said so; the catalogue did
        // not, which made the corpus readable by a tool but not attributable by
        // one. Credit is most of what a contributor gets back from this.
        ...(e.reporter ? { reporter: e.reporter } : {}),
        page: `${SITE}${entryUrl(e)}`,
        source: e.file,
      })),
    },
    null,
    2,
  )}\n`
}

function renderSitemap(entries: Entry[]): string {
  const urls = [
    { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/library`, changefreq: 'weekly', priority: '0.9' },
    // Entries change rarely once written; a resolution or a status change is the
    // usual reason, and neither is weekly.
    ...entries.map((e) => ({ loc: `${SITE}${entryUrl(e)}`, changefreq: 'monthly', priority: '0.7' })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${esc(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`
}

const packages = await readPackages()
const entries = await readKnowledge()
const md = makeMarkdown(entries)

await writeFile(OUT, render(packages, entries).replace(/\r\n/g, '\n'))
await writeFile(OUT_JS, renderScript(packages, entries).replace(/\r\n/g, '\n'))

// Cleared and rewritten, so an entry that is renamed or deleted does not leave
// a page behind claiming the corpus still holds it. `recursive` on both calls
// because the directory may not exist on a fresh checkout.
await rm(OUT_ENTRIES, { recursive: true, force: true })
await mkdir(OUT_ENTRIES, { recursive: true })
const written = new Set<string>()
for (const entry of entries) {
  const slug = pageSlug(entry)
  if (written.has(slug)) {
    // Two entries claiming one page means one of them is unreachable, and
    // which one you got would depend on directory order. Say so rather than
    // publishing a page that silently drops an entry.
    throw new Error(
      `two knowledge entries resolve to /knowledge/${slug}. Give ${entry.file} a distinct id.`,
    )
  }
  written.add(slug)
  await writeFile(
    join(OUT_ENTRIES, `${slug}.html`),
    renderEntryPage(entry, packages, md).replace(/\r\n/g, '\n'),
  )
}

await writeFile(OUT_SITEMAP, renderSitemap(entries).replace(/\r\n/g, '\n'))
await writeFile(OUT_INDEX, (await renderIndex(packages, entries)).replace(/\r\n/g, '\n'))

console.log(
  `wrote ${OUT}, ${OUT_JS}, ${OUT_SITEMAP}, ${OUT_INDEX} and ${entries.length} pages under ` +
    `${OUT_ENTRIES}/: ${packages.length} packages, ${entries.length} knowledge entries`,
)
