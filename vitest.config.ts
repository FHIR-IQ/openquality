import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tools/ is included as well as the workspace packages. The library
    // generator is guarded by the CI drift check, which re-runs it and diffs
    // the output, but pr-report.ts has no such guard: nothing downstream
    // reproduces its result, and it only runs on pull requests from people who
    // are not us. Its path walking and its fork behaviour need real tests.
    include: ['packages/*/test/**/*.test.ts', 'tools/test/**/*.test.ts'],
  },
})
