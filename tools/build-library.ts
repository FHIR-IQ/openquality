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
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'

const MEASURE_ROOTS = ['measures/cms-fhir-2026', 'measures/community']
const KNOWLEDGE_ROOT = 'knowledge'
const OUT = 'site/library.html'
/**
 * The page script lives in its own file rather than inline. The site ships a
 * Content-Security-Policy of `script-src 'self'`, which blocks inline script,
 * so an inline block would render an empty list in production while working
 * perfectly from a local file server. Keep them separate.
 */
const OUT_JS = 'site/library.js'
const REPO = 'https://github.com/FHIR-IQ/openquality'

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
  id: string
  type: string
  measure: string
  measureVersion: string
  status: string
  categories: string[]
  reporter: string
  summary: string
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
      entries.push({
        file: path,
        id: str(fm.id, item.name.replace(/\.md$/, '')),
        type: str(fm.type, 'note'),
        measure: str(fm.measure),
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

function render(packages: Pkg[], entries: Entry[]): string {
  const stewards = [...new Set(packages.map((p) => p.steward))].sort()
  const orphanCount = entries.filter((e) => !packages.some((p) => p.id === e.measure)).length

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Library — Open Quality</title>
<meta name="description" content="Browse every measure package in the Open Quality corpus, the questions and interpretation issues recorded against each one, and how to add your own.">
<link rel="canonical" href="https://openquality.us/library">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8F8F8">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Open Quality">
<meta property="og:url" content="https://openquality.us/library">
<meta property="og:title" content="Library — Open Quality">
<meta property="og:description" content="Browse every measure package in the corpus and what implementers have recorded about each one.">
<meta property="og:image" content="https://openquality.us/og.png">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23222'/><text x='16' y='23' font-family='Helvetica,Arial,sans-serif' font-size='17' font-weight='600' fill='%23fff' text-anchor='middle'>oq</text><circle cx='25' cy='23' r='2.4' fill='%23FF6B35'/></svg>">
<link rel="preload" href="/fonts/inter-tight-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>
  @font-face{font-family:"Inter Tight";font-style:normal;font-weight:300 600;font-display:swap;
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
  .none{font-size:14px; color:var(--muted); margin:0 0 20px}
  .acts{display:flex; gap:10px; flex-wrap:wrap; margin-top:6px}
  .acts a{font-size:13px; font-weight:500; text-decoration:none; padding:8px 13px;
    border:1px solid var(--hairline); border-radius:var(--radius)}
  .acts a:hover{border-color:var(--accent); color:var(--accent)}
  .acts a.primary{background:var(--ink); color:var(--bg); border-color:var(--ink)}
  .acts a.primary:hover{opacity:.85; color:var(--bg)}

  .empty{padding:60px 0; text-align:center; color:var(--muted)}
  footer{border-top:1px solid var(--hairline); margin-top:40px; padding:34px 0 60px;
    font-size:13px; color:var(--muted)}
  footer a{color:var(--ink)}
</style>
</head>
<body>

<nav>
  <div class="wrap nav-in">
    <a class="mark" href="/">oq<span>.</span></a>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/library">Library</a>
      <a href="${REPO}/blob/main/DEMO.md">Demo</a>
      <a href="${REPO}/blob/main/CONTRIBUTING.md">Contribute</a>
    </div>
    <a class="btn" href="${REPO}">GitHub</a>
  </div>
</nav>

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

function renderScript(packages: Pkg[], entries: Entry[]): string {
  const data = JSON.stringify({ packages, entries })

  return `// Generated by tools/build-library.ts. Do not edit; run \`pnpm build-library\`.
const DATA = ${data};
const byMeasure = new Map();
for (const e of DATA.entries) {
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

function askUrl(p){
  const title = encodeURIComponent('Question: ' + p.title);
  const body = encodeURIComponent(
    'Measure: ' + p.id + '\\n' +
    'Measure version: ' + p.version + '\\n\\n' +
    '## What is ambiguous\\n\\n' +
    '<!-- What are you trying to work out? Which reading of the spec are you unsure about? -->\\n'
  );
  return REPO + '/issues/new?labels=question&title=' + title + '&body=' + body;
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
                '<p>' + esc(e.summary) + '</p>' +
              '</div>').join('')
          : '<p class="none">Nothing recorded yet. If you have implemented this measure, you know something this corpus does not.</p>') +
        '<h3>Artifacts</h3>' +
        '<div class="files">' + p.artifacts.map(a => '<span class="file">' + esc(a) + '</span>').join('') + '</div>' +
        '<div class="acts">' +
          '<a class="primary" href="' + askUrl(p) + '" target="_blank" rel="noopener">Ask about this measure</a>' +
          '<a href="' + dirUrl + '" target="_blank" rel="noopener">Browse the package</a>' +
          '<a href="' + REPO + '/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Add what you know</a>' +
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
`
}

const packages = await readPackages()
const entries = await readKnowledge()
await writeFile(OUT, render(packages, entries).replace(/\r\n/g, '\n'))
await writeFile(OUT_JS, renderScript(packages, entries).replace(/\r\n/g, '\n'))
console.log(`wrote ${OUT} and ${OUT_JS}: ${packages.length} packages, ${entries.length} knowledge entries`)
