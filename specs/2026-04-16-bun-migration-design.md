# Bun Migration Design

**Date:** 2026-04-16
**Status:** Draft — awaiting review
**Scope:** Replace mocha + npm with `bun test` + `bun install`. Keep `tsc` for build. Rewrite the test suite to idiomatic Bun. Published artifacts and consumers are unaffected.

## Context

`fetch-soap` is a TypeScript SOAP client published as an ESM library for Node, browsers, and edge runtimes. Today:

- `src/` is TypeScript, compiled by `tsc` to `lib/` (ESM + `.d.ts`).
- `package.json` has `"type": "module"` and a multi-entry `exports` map.
- `test/` contains 19 CJS-style `.js` files (102 `require()` calls, zero `import`s) using mocha + `should` + sinon + timekeeper. These tests have been **non-functional since the initial fetch-soap commit (`96cc6bf`)** — the TS/ESM conversion never updated the test files. This was recently surfaced because PR #9 ([fetch-soap#34](https://github.com/evans-sam/fetch-soap/pull/34)) is adding CI test execution, which exposed the breakage.

The migration has two motivations:

1. Collapse the mismatched CJS/ESM split between `src/` and `test/` by moving the test suite to a single idiomatic runtime.
2. Adopt Bun as the dev toolchain — faster installs, faster tests, one tool for runtime + test + package manager.

Consumers continue to use Node/browsers/edge as before. Nothing about the published package changes.

## Non-goals

- **No changes to `src/`, `lib/`, or `package.json exports`.** Consumer-visible artifacts are identical pre- and post-migration.
- **No `tsc` → `bun build` swap.** That's a separate future migration ("Option B"). Declarations and JS output continue to come from `tsc`.
- **No `done`-callback → `async/await` rewrite.** Tests currently use mocha's `done` style heavily; Bun supports it. Converting ~100+ test cases to async is out of scope.
- **No eslint coverage of `test/`.** `test/` is in the eslint ignore list; stays that way.
- **No changes to `src/` browser/edge targeting.** `eslint-plugin-compat` config unchanged.

## Decisions

### D1. Scope: tests + package manager. Keep `tsc`.

- `bun test` replaces mocha.
- `bun install` + `bun.lock` replace `npm install` + `package-lock.json`.
- `tsc -p .` unchanged — still builds `src/` → `lib/`.

**Why:** Build isn't the messy part. Keeping `tsc` preserves per-file `lib/` output (tree-shake-friendly for consumers) and declarations. Future migration to `bun build` is straightforward if desired.

### D2. Test rewrite style: full idiomatic Bun.

- File rename: `test/*-test.js` → `test/*.test.ts`. Bun's auto-discovery matches `*.test.{ts,js}` / `*_test.{ts,js}` — current hyphen-prefix names don't match. Dot-prefix is Bun's modern convention.
- Directory layout unchanged. Fixtures in `test/wsdl/`, `test/request-response-samples/`, `test/platform/`, `test/certs/`, `test/static/` are untouched.
- Helper files: `test-helpers.js` → `test-helpers.ts`. Keeps its non-`.test` name so the runner skips it.
- `test/_socketStream.js` is unused dead code (grep confirms zero importers) and gets **deleted** rather than rewritten. This also retires three transitive devDeps: `duplexer`, `semver`, `readable-stream`. (Factual correction discovered during plan writing.)
- Single tsconfig — no test-specific tsconfig needed. Bun runs `.ts` natively.
- Tests import from source: `import * as soap from "../src/soap.js"` (not from `lib/`). No build step required before running tests. `.js` extension per TS ESM convention.

### D3. Assertion + mocking: move off `should`, `sinon`, `timekeeper`.

| Current                                                                   | Bun equivalent                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| mocha globals (`describe`/`it`/`before`/`after`/`beforeEach`/`afterEach`) | `import { ... } from "bun:test"` (`before`→`beforeAll`, `after`→`afterAll`) |
| `x.should.equal(y)`                                                       | `expect(x).toBe(y)`                                                         |
| `x.should.be.type('function')`                                            | `expect(typeof x).toBe('function')`                                         |
| `x.should.have.property('foo')`                                           | `expect(x).toHaveProperty('foo')`                                           |
| `sinon.spy(obj, 'method')`                                                | `spyOn(obj, 'method')` (from `bun:test`)                                    |
| `sinon.createSandbox()`                                                   | Not needed — Bun resets spies between tests, or `mock.restore()`            |
| `sinon.useFakeTimers(ts)`                                                 | `setSystemTime(new Date(ts))`                                               |
| `timekeeper.freeze(d)` / `.reset()`                                       | `setSystemTime(d)` / `setSystemTime()` (no arg resets)                      |

**Keep `node:assert`.** 50+ call sites use `assert.ok` / `assert.equal` / `assert.deepEqual`. Bun runs `node:assert` fine. Only rewrite `should`-style assertions. This halves the diff.

**ESM globals:** Replace `__dirname` with `import.meta.dir` (Bun-native).

### D4. Package manager: full switch to `bun.lock`.

- Delete `package-lock.json`.
- `bun install` generates `bun.lock`. Commit it.
- Add `"packageManager": "bun@<version>"` to `package.json` for tooling. Version captured by running `bun --version` during plan execution and pinned to that exact version.

### D5. Dependabot: switch ecosystem to `bun`.

- Update `.github/dependabot.yml`: `package-ecosystem: "npm"` → `"bun"`.
- Keep `github-actions` ecosystem entry unchanged.
- Fallback: if Bun ecosystem support has gaps (e.g., advisory coverage), revert to `npm` ecosystem pointing at `bun.lock` (Dependabot can read it). **Verify during plan execution** before deleting `package-lock.json`.

### D6. CI: single workflow, Bun-native.

Replace the CI test job added by PR #9:

```yaml
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: <pinned> # match the version in package.json's "packageManager" field
- run: bun install --frozen-lockfile
- run: bun test
- run: bun run build # sanity-check tsc still passes
- run: bun run lint
- run: bun run format:check
```

### D7. Sequence with PR #9.

Originally designed as option A (small unblock PR → PR #9 with node+mocha CI → Bun migration PR). Pivoted during plan execution to **option B** after discovering (a) the mocha suite has never actually run since commit `96cc6bf` due to extensionless ESM imports in `lib/` (tracked as [fetch-soap#43](https://github.com/evans-sam/fetch-soap/issues/43), now fixed by #44), and (b) no unblock commit had been authored. The realized sequence:

1. PR #9 / [fetch-soap#34](https://github.com/evans-sam/fetch-soap/pull/34) lands with CI using node + mocha — the test job fails on every PR because the suite is broken.
2. [fetch-soap#43](https://github.com/evans-sam/fetch-soap/issues/43) is filed; the fix lands as PR #44 on master (`fix(esm): emit Node-resolvable ESM by switching to nodenext`).
3. This Bun migration PR lands, superseding the mocha-based `test` job with `bun test`. No unblock PR was authored — the Bun migration's CI rewrite is the effective fix.

Consequence for verification: there is no "mocha baseline" test count to capture (the mocha suite never ran green). We use static per-file `it(` counts as a floor check instead.

### D8. Commit structure: preserve git rename history.

The full rewrite would exceed git's 50% content-similarity threshold for rename detection, breaking `git log --follow` and `git blame`. To preserve history:

1. **Commit 1: pure renames.** `git mv` every `test/*-test.js` → `test/*.test.ts` and `test/test-helpers.js` → `test/test-helpers.ts`. Additionally `git rm test/_socketStream.js` (dead code; see above). Zero content change in renamed files. Files are temporarily non-running (`.ts` extension on CJS content) — acceptable because no test command runs against this commit.
2. **Commit 2+: content rewrite.** Per-file or small batches of rewrites (require→import, should→expect, sinon→bun mocks). Each commit should leave `bun test` passing on the files it touches.

This keeps git's rename detection at 100% on commit 1, so history traversal works cleanly across the migration.

## Architecture

### Before

```
src/*.ts  --tsc-->  lib/*.js + lib/*.d.ts         (published)
test/*.js  --mocha-->  test output                 (broken; CJS vs ESM)
package-lock.json (npm)
.github/workflows/ ... (node + mocha once PR #9 lands)
```

### After

```
src/*.ts  --tsc-->  lib/*.js + lib/*.d.ts          (unchanged, published)
test/*.test.ts  --bun test-->  test output          (runs against src/ directly)
bun.lock (bun install)
.github/workflows/ ... (setup-bun@v2 + bun install + bun test)
```

The `src/ → lib/` pipeline is untouched. The `test/` pipeline is replaced wholesale.

## Verification

"Done" means all of:

1. **`bun test` passes locally.** Test count pre- and post-migration must match (catches silent skips). Mocha test count captured from a one-off run of the small unblock branch.
2. **`bun run build` produces byte-identical `lib/` output** compared to pre-migration `tsc` output. `src/` and `tsconfig.json` are untouched, so this should hold. Diff `lib/` against a baseline built from master; any deviation is a bug.
3. **`bun install --frozen-lockfile` on a clean `node_modules` reproduces the install.**
4. **Published-package smoke test.** `npm pack` and inspect tarball contents — must match the pre-migration tarball (same `lib/` files, same `package.json` fields affecting publishing). Optional stretch: install the packed tarball into a scratch Node project and `node -e "import('fetch-soap')"` to confirm consumers aren't affected.
5. **Dependabot config validates.** Either confirmed by a first cron tick post-merge, or by running Dependabot's config validator if accessible.
6. **CI green on a throwaway branch** before merging to master.

## Risks & mitigations

- **`should` chain translation errors.** Some chains (`.should.have.lengthOf(3).and.containEql(x)`) don't map 1:1. Mitigation: pilot on the smallest file (`trim-test.js`, 2 `require` lines) to shake out patterns before scaling. Rewrite file-by-file with `bun test <file>` after each; a post-rewrite failure is almost always a translation miss.
- **Sinon fake-timer edge cases.** `test/security/WSSecurity.js` depends on time-pinned PasswordDigest nonces. `setSystemTime` should be equivalent, but verify the generated digest matches pre-migration output.
- **Dependabot Bun-ecosystem maturity.** If post-merge Dependabot doesn't open PRs as expected, fall back to `npm` ecosystem on `bun.lock`.
- **Consumer breakage.** Low risk given `src/`/`lib/`/`exports` are untouched. The pack/install smoke test catches anything that slips through.
- **CI runner availability for Bun.** `oven-sh/setup-bun@v2` is stable on GitHub-hosted runners; no known issues.
- **Intermediate commit state during the rewrite.** After D8 Commit 1 (pure renames), `.ts` files contain CJS-style content and won't parse. `bun test` would fail during this window. `tsc` is unaffected because `tsconfig.json` only includes `src/`. Mitigation: intermediate commits aren't run by CI (CI runs the tip of the PR branch only); the sequence of content-rewrite commits must leave the PR tip with `bun test` green.

## Deletions

- `test/mocha.opts`
- `package-lock.json`
- Dev deps: `mocha`, `should`, `sinon`, `timekeeper`, `source-map-support`, `duplexer`, `semver`, `readable-stream`, plus any `@types/*` packages tied to the above. (`duplexer`/`semver`/`readable-stream` were only used by the deleted `_socketStream.js`.)
- Any mocha-specific scripts / config comments

## Additions

- Dev dep: `@types/bun`
- File: `bun.lock`
- Field in `package.json`: `"packageManager": "bun@<version>"`

## Out of scope (followups)

- `tsc` → `bun build` migration (future "Option B"): swap the build tool, decide bundled-per-entry vs per-file output, keep `tsc --emitDeclarationOnly` for `.d.ts`.
- Convert mocha-style `done` callbacks to `async/await`.
- Extend eslint coverage to `test/`.
