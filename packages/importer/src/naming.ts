/**
 * Normalizes an upstream version to canonical semver. Upstream writes
 * zero-padded parts, "0.5.000", which the manifest's semver regex accepts but
 * which is not canonical and sorts badly. Returns undefined when the input is
 * not a dotted numeric version, which is a skip condition for the importer.
 */
export function normalizeVersion(version: string | undefined): string | undefined {
  if (!version) return undefined
  const parts = version.trim().split('.')
  if (parts.length < 2 || parts.length > 3) return undefined
  if (!parts.every((p) => /^\d+$/.test(p))) return undefined
  const [major, minor, patch = '0'] = parts
  return `${Number(major)}.${Number(minor)}.${Number(patch)}`
}

/**
 * A package name slug. Must satisfy the manifest id pattern, which allows
 * lowercase alphanumerics and hyphens and must start with an alphanumeric.
 */
export function slugFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function packageId(namespace: string, slug: string): string {
  return `${namespace}/${slug}`
}
