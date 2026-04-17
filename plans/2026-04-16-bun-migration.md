# Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `fetch-soap`'s test suite and dev toolchain from mocha + npm to `bun test` + `bun install`. Keep `tsc` for build. Consumer-facing artifacts unchanged.

**Architecture:** Rewrite 17 test files + 2 helper files from CJS/JS mocha style to ESM/TS `bun:test` style. Switch package manager to Bun with `bun.lock`. Replace `should`/`sinon`/`timekeeper` with `bun:test`'s `expect`/`spyOn`/`setSystemTime`. Keep `node:assert` calls and `done`-callback async style as-is. `src/`, `lib/`, `tsconfig.json`, and `package.json exports` are untouched.

**Tech Stack:** Bun (runtime, test runner, package manager), TypeScript (via `tsc` for `lib/` build), GitHub Actions (`oven-sh/setup-bun@v2`), Dependabot.

**Spec:** [specs/2026-04-16-bun-migration-design.md](../specs/2026-04-16-bun-migration-design.md)

**Assumptions at plan execution time:**

- PR #9 / [fetch-soap#34](https://github.com/evans-sam/fetch-soap/pull/34) has landed, adding a mocha-based test job to `.github/workflows/pr.yml`. Additionally [fetch-soap#36](https://github.com/evans-sam/fetch-soap/pull/36) landed adding an `npm audit` security job.
- The mocha test suite has **never actually run** on this codebase (since `96cc6bf`, the initial fetch-soap commit). The compiled `lib/` has extensionless ESM imports that Node's resolver rejects at runtime. This is tracked separately as [fetch-soap#43](https://github.com/evans-sam/fetch-soap/issues/43) and is out of scope for this migration. Consequence for this plan: there is no "mocha baseline" to capture in Task 1; we use static per-file `it(` counts instead.
- No unblock PR is being landed first. Under the originally-considered Q5 option A, an unblock would precede this migration; we pivoted to Q5 option B (this Bun migration supersedes both the unblock and the existing mocha-based test job).
- Working from a clean branch off master, inside a git worktree.
- Bun is installed locally. If not: `curl -fsSL https://bun.sh/install | bash`.

---

## Reference: Transformation Patterns

Every test-file rewrite task applies these. The patterns are mechanical; exceptions are called out in the task that uses them.

**Imports:** replace the top-of-file `var x = require(...)` block with ESM imports:

```typescript
import { describe, it, expect } from 'bun:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as soap from '../src/soap.js';
// Additional src imports as needed:
//   import { WSDL } from '../src/wsdl/index.js';
//   import { HttpClient } from '../src/http.js';
//   import { BasicAuthSecurity, BearerSecurity, WSSecurity } from '../src/security/index.js';
// Helpers (from tests-next-to-each-other):
//   import * as testHelpers from './test-helpers.js';
```

Notes:

- Import from `../src/...` with `.js` extension (TS ESM convention).
- Never import from `../lib/...` or `../..`; the lib build isn't relied on in tests anymore.
- Drop `require('should')` — no replacement; `should` behavior is replaced by `expect`.
- Drop `require('source-map-support/register')` — Bun handles TS sourcemaps natively.

**Mocha → bun:test hooks:**

- `before(fn)` → `beforeAll(fn)`
- `after(fn)` → `afterAll(fn)`
- `beforeEach`, `afterEach` → same names from `bun:test`

**Assertion conversions (`should` → `expect`):**

- `x.should.equal(y)` → `expect(x).toBe(y)`
- `x.should.deepEqual(y)` → `expect(x).toEqual(y)`
- `x.should.be.type('string')` / `.be.a.String` → `expect(typeof x).toBe('string')`
- `x.should.have.property('foo')` → `expect(x).toHaveProperty('foo')`
- `x.should.have.property('foo', v)` → `expect(x).toHaveProperty('foo', v)`
- `x.should.match(regex)` → `expect(x).toMatch(regex)`
- `x.should.be.ok` → `expect(x).toBeTruthy()`
- `x.should.not.be.ok` → `expect(x).toBeFalsy()`
- `x.should.have.lengthOf(n)` → `expect(x).toHaveLength(n)`
- `x.should.containEql(y)` → `expect(x).toContainEqual(y)` (objects/arrays) or `expect(x).toContain(y)` (primitives)

**Keep `node:assert` as-is.** Calls like `assert.ok`, `assert.equal`, `assert.strictEqual`, `assert.deepEqual`, `assert.deepStrictEqual` all work in Bun. Don't rewrite them to `expect` — that's extra diff for no gain.

**Sinon → bun:test:**

- `sinon.spy(obj, 'method')` → `spyOn(obj, 'method')` (from `bun:test`)
- Spy assertions:
  - `spy.calledOnce` → `expect(spy).toHaveBeenCalledTimes(1)`
  - `spy.calledWith(x, y)` → `expect(spy).toHaveBeenCalledWith(x, y)`
  - `spy.callCount` → `spy.mock.calls.length` (or `expect(spy).toHaveBeenCalledTimes(n)`)
  - `spy.restore()` → `spy.mockRestore()`
- `sinon.useFakeTimers(ts)` → `setSystemTime(new Date(ts))`; `clock.restore()` → `setSystemTime()` (no arg resets)
- `sinon.createSandbox()` + `sandbox.stub(obj, 'method').returns(x)` → `spyOn(obj, 'method').mockReturnValue(x)`; `sandbox.restore()` → individual `.mockRestore()` calls or rely on Bun's automatic per-test cleanup.
- Module-level stubbing (rare): `mock.module('../src/foo.js', () => ({ bar: ... }))`

**Timekeeper → bun:test:**

- `timekeeper.freeze(d)` → `setSystemTime(d instanceof Date ? d : new Date(d))`
- `timekeeper.reset()` → `setSystemTime()` (no arg)

**Variable/syntax:**

- Drop `'use strict';` (ESM is strict by default)
- `var` → `const` (or `let` if reassigned)
- `__dirname` → `import.meta.dir`
- `__filename` → `import.meta.path` (Bun-native; equivalent to `fileURLToPath(import.meta.url)`)

**Async tests:** keep `done`-callback style as-is. `it('...', function(done) { ...; done(); })` runs unchanged in Bun. Do not convert to `async/await` as part of this migration.

---

## File Structure

**Files created:**

- `bun.lock` — Bun's lockfile, generated by `bun install`

**Files modified:**

- `package.json` — remove mocha-era devDeps, add `@types/bun`, add `packageManager` field, change `test` script
- `.github/workflows/pr.yml` — swap node/npm for setup-bun/bun
- `.github/dependabot.yml` — swap `npm` ecosystem for `bun`
- `CONTRIBUTING.md` — update install/test instructions

**Files renamed (pure rename commit, then content rewrite):**

- `test/client-customHttp-test.js` → `test/client-customHttp.test.ts`
- `test/client-customHttp-xsdinclude-test.js` → `test/client-customHttp-xsdinclude.test.ts`
- `test/client-options-test.js` → `test/client-options.test.ts`
- `test/client-options-wsdlcache-test.js` → `test/client-options-wsdlcache.test.ts`
- `test/client-schema-does-not-change-on-request-test.js` → `test/client-schema-does-not-change-on-request.test.ts`
- `test/client-test.js` → `test/client.test.ts`
- `test/header-rely-on-xml-test.js` → `test/header-rely-on-xml.test.ts`
- `test/request-response-samples-test.js` → `test/request-response-samples.test.ts`
- `test/response-encoding-test.js` → `test/response-encoding.test.ts`
- `test/response-preserve-whitespace-test.js` → `test/response-preserve-whitespace.test.ts`
- `test/trim-test.js` → `test/trim.test.ts`
- `test/wsdl-parse-test.js` → `test/wsdl-parse.test.ts`
- `test/wsdl-test.js` → `test/wsdl.test.ts`
- `test/security/BasicAuthSecurity.js` → `test/security/BasicAuthSecurity.test.ts`
- `test/security/BearerSecurity.js` → `test/security/BearerSecurity.test.ts`
- `test/security/PasswordDigest.js` → `test/security/PasswordDigest.test.ts`
- `test/security/WSSecurity.js` → `test/security/WSSecurity.test.ts`
- `test/test-helpers.js` → `test/test-helpers.ts`

**Files deleted:**

- `test/_socketStream.js` — unused dead code (grep confirms zero importers); removing it also retires three transitive devDeps (`duplexer`, `semver`, `readable-stream`). This is a factual correction to spec Section D2.
- `test/mocha.opts`
- `package-lock.json`

---

## Task 1: Capture pre-migration baseline

**Files:** none (captures data to `/tmp/bun-migration-baseline/`)

- [ ] **Step 1: Create baseline directory**

```bash
mkdir -p /tmp/bun-migration-baseline
```

- [ ] **Step 2: Capture static per-file `it(` counts from master**

Tests have never run on master (see [fetch-soap#43](https://github.com/evans-sam/fetch-soap/issues/43)), so there's no runtime baseline to capture. Instead, record the number of `it(` call sites per file — a rough upper bound on test count. Parameterized patterns like `[...].forEach(meta => describe(...))` undercount against this metric, so it's a floor check, not equality.

```bash
git fetch origin
git worktree add /tmp/bun-migration-baseline/master-repo origin/master
cd /tmp/bun-migration-baseline/master-repo
for f in test/*-test.js test/security/*.js; do
  count=$(grep -cE '^\s*(it|it\.only|it\.skip)\(' "$f")
  echo "$f $count"
done | tee /tmp/bun-migration-baseline/it-counts.txt
awk '{sum += $2} END {print "TOTAL:", sum}' /tmp/bun-migration-baseline/it-counts.txt | tee -a /tmp/bun-migration-baseline/it-counts.txt
```

Expected: prints per-file counts and a TOTAL line. Record the TOTAL as `<N_STATIC>`. Also note per-file counts — they become the per-file check during rewrite tasks (6-11).

- [ ] **Step 3: Capture the lib/ build output as baseline**

```bash
cd /tmp/bun-migration-baseline/master-repo
npm run build
(cd lib && find . -type f \( -name '*.js' -o -name '*.d.ts' \) | sort | xargs shasum -a 256) > /tmp/bun-migration-baseline/lib-checksums.txt
wc -l /tmp/bun-migration-baseline/lib-checksums.txt
```

Expected: a non-empty checksum file listing every file under `lib/`.

- [ ] **Step 4: Return to the migration worktree**

```bash
cd -   # back to the bun-migration worktree
git worktree remove /tmp/bun-migration-baseline/master-repo --force || true
```

No commit — this task only captures baseline data.

---

## Task 2: Install Bun, generate bun.lock, add packageManager field

**Files:**

- Modify: `package.json` (add `packageManager` field)
- Create: `bun.lock`

- [ ] **Step 1: Capture Bun version**

```bash
bun --version
```

Expected: prints a version like `1.1.34`. Record it as `<BUN_VERSION>` for use in later steps. If Bun isn't installed, install it first with `curl -fsSL https://bun.sh/install | bash`.

- [ ] **Step 2: Add `packageManager` field to `package.json`**

Edit `package.json`. After the `"version"` field (line 3), add a new `"packageManager"` field:

```json
  "version": "1.0.1",
  "packageManager": "bun@<BUN_VERSION>",
  "description": "...",
```

Replace `<BUN_VERSION>` with the value from Step 1.

- [ ] **Step 3: Generate bun.lock**

```bash
rm -rf node_modules
bun install
ls bun.lock
```

Expected: `bun.lock` exists. `node_modules/` is populated.

- [ ] **Step 4: Verify install is reproducible**

```bash
rm -rf node_modules
bun install --frozen-lockfile
```

Expected: completes without errors, no lockfile changes.

- [ ] **Step 5: Verify build still works under Bun**

```bash
bun run build
```

Expected: `tsc` runs successfully, produces `lib/`.

- [ ] **Step 6: Diff lib/ against baseline**

```bash
(cd lib && find . -type f \( -name '*.js' -o -name '*.d.ts' \) | sort | xargs shasum -a 256) > /tmp/bun-migration-baseline/lib-checksums-after-bun-install.txt
diff /tmp/bun-migration-baseline/lib-checksums.txt /tmp/bun-migration-baseline/lib-checksums-after-bun-install.txt
```

Expected: no diff output (or exit code 0). If there's a diff, investigate before proceeding.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(bun): add bun.lock and packageManager field

Installs match package-lock.json (tsc output byte-identical).
package-lock.json retained for now; removed after CI flips to Bun."
```

---

## Task 3: Pure-rename commit (preserve git history)

**Files:** all 19 test files renamed per File Structure section above.

- [ ] **Step 1: Rename top-level test files**

```bash
git mv test/client-customHttp-test.js test/client-customHttp.test.ts
git mv test/client-customHttp-xsdinclude-test.js test/client-customHttp-xsdinclude.test.ts
git mv test/client-options-test.js test/client-options.test.ts
git mv test/client-options-wsdlcache-test.js test/client-options-wsdlcache.test.ts
git mv test/client-schema-does-not-change-on-request-test.js test/client-schema-does-not-change-on-request.test.ts
git mv test/client-test.js test/client.test.ts
git mv test/header-rely-on-xml-test.js test/header-rely-on-xml.test.ts
git mv test/request-response-samples-test.js test/request-response-samples.test.ts
git mv test/response-encoding-test.js test/response-encoding.test.ts
git mv test/response-preserve-whitespace-test.js test/response-preserve-whitespace.test.ts
git mv test/trim-test.js test/trim.test.ts
git mv test/wsdl-parse-test.js test/wsdl-parse.test.ts
git mv test/wsdl-test.js test/wsdl.test.ts
```

- [ ] **Step 2: Rename security test files**

```bash
git mv test/security/BasicAuthSecurity.js test/security/BasicAuthSecurity.test.ts
git mv test/security/BearerSecurity.js test/security/BearerSecurity.test.ts
git mv test/security/PasswordDigest.js test/security/PasswordDigest.test.ts
git mv test/security/WSSecurity.js test/security/WSSecurity.test.ts
```

- [ ] **Step 3: Rename test-helpers, delete \_socketStream**

```bash
git mv test/test-helpers.js test/test-helpers.ts
git rm test/_socketStream.js
```

`_socketStream.js` is dead code (verified via grep: zero importers). Deleting it here keeps the pure-rename commit clean — one single deletion of a file that won't be referenced again is uncomplicated for git's rename detection.

- [ ] **Step 4: Verify git sees pure renames**

```bash
git status
git diff --staged --stat | tail -5
```

Expected: `git status` shows 18 `renamed:` entries and 1 `deleted:` entry (`test/_socketStream.js`). The renames each should show similarity 100%.

- [ ] **Step 5: Commit the pure renames**

```bash
git commit -m "refactor(test): rename *-test.js to *.test.ts (pure rename)

Pure rename commit with no content changes. Files are temporarily
non-functional (.ts extension on CJS content); content rewrite
follows in subsequent commits. This commit exists to preserve git
blame/log --follow across the rename.

Also deletes test/_socketStream.js which is dead code (zero importers)."
```

- [ ] **Step 6: Verify rename was detected**

```bash
git log --follow --oneline -2 test/trim.test.ts
```

Expected: shows the rename commit AND at least one earlier commit (the file's history pre-rename). If only one commit shows, rename detection failed — check for content drift.

---

## Task 4: Add @types/bun and install

**Files:**

- Modify: `package.json` (add `@types/bun` to devDependencies)
- Modify: `bun.lock`

- [ ] **Step 1: Add @types/bun**

```bash
bun add -d @types/bun
```

Expected: `package.json` updated with `"@types/bun": "^<version>"` under devDependencies; `bun.lock` updated.

- [ ] **Step 2: Verify Bun can parse a test file (sanity check)**

```bash
bun test test/trim.test.ts 2>&1 | head -20
```

Expected: fails with a syntax/parse error because the file is CJS content in a `.ts` file. This is expected and confirms Bun is attempting to run. Any "command not found" or similar is a setup problem.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(bun): add @types/bun"
```

---

## Task 5: Rewrite test-helpers.ts

**Files:**

- Modify: `test/test-helpers.ts` (full rewrite)

`_socketStream.js` was deleted in Task 3; no rewrite needed. `test-helpers.ts` is rewritten first because the other test files import it. No tests run yet.

- [ ] **Step 1: Rewrite `test/test-helpers.ts`**

Replace the entire contents of `test/test-helpers.ts` with:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HttpClient } from '../src/http.js';

interface MockResponse {
  status: number;
  statusCode: number;
  headers: Record<string, string>;
  data: string;
}

type RequestCallback = (err: NodeJS.ErrnoException | null, response?: MockResponse, body?: string) => void;

interface MockHttpClient {
  request(
    rurl: string,
    data: unknown,
    callback: RequestCallback,
    exheaders?: Record<string, string>,
    exoptions?: Record<string, unknown>,
  ): { then(resolve: (r: MockResponse) => void, reject?: (e: unknown) => void): unknown; catch(reject: (e: unknown) => void): unknown };
}

export function createMockHttpClient(baseDir?: string, realHttpClient?: HttpClient): MockHttpClient {
  baseDir = baseDir || import.meta.dir;
  const _realClient = realHttpClient || new HttpClient();

  return {
    request(rurl, data, callback, exheaders, exoptions) {
      if (!rurl.startsWith('http://test-files/') && !rurl.startsWith('https://test-files/')) {
        return _realClient.request(rurl, data, callback, exheaders, exoptions);
      }

      let filePath = rurl.replace(/^https?:\/\/test-files/, '');
      filePath = path.normalize(filePath);

      fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
          return callback(err);
        }
        const response: MockResponse = {
          status: 200,
          statusCode: 200,
          headers: { 'content-type': 'application/xml' },
          data: content,
        };
        callback(null, response, content);
      });

      return {
        then(resolve, reject) {
          fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
              if (reject) reject(err);
              return;
            }
            const response: MockResponse = {
              status: 200,
              statusCode: 200,
              headers: { 'content-type': 'application/xml' },
              data: content,
            };
            if (resolve) resolve(response);
          });
          return this;
        },
        catch(_reject) {
          return this;
        },
      };
    },
  };
}

export function toTestUrl(filePath: string): string {
  const normalized = path.normalize(filePath);
  let urlPath = normalized.split(path.sep).join('/');
  if (/^[a-zA-Z]:/.test(urlPath)) {
    urlPath = '/' + urlPath;
  }
  return 'http://test-files' + urlPath;
}

export function getTestOptions(baseDir: string, additionalOptions?: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {
    httpClient: createMockHttpClient(baseDir),
  };
  if (additionalOptions) {
    for (const key of Object.keys(additionalOptions)) {
      options[key] = additionalOptions[key];
    }
  }
  return options;
}
```

Notes:

- `__dirname` → `import.meta.dir` (Bun-native).
- `require('../lib/http').HttpClient` → `import { HttpClient } from '../src/http.js'` (import from source, not `lib/`; `.js` extension per TS ESM convention).
- `module.exports` → named exports.
- Types added; `HttpClient` import sourced from `src/`.

- [ ] **Step 2: Sanity-check test-helpers.ts parses under Bun**

```bash
bun -e "import('./test/test-helpers.ts').then(m => console.log(Object.keys(m)))"
```

Expected: prints `[ 'createMockHttpClient', 'toTestUrl', 'getTestOptions' ]`. Any parse error or missing export needs fixing before proceeding.

- [ ] **Step 3: Commit**

```bash
git add test/test-helpers.ts
git commit -m "refactor(test): rewrite test-helpers as ESM TypeScript

Add types, import HttpClient from src/, replace __dirname with
import.meta.dir, convert require/module.exports to ESM."
```

---

## Task 6: Pilot rewrite — trim.test.ts

**Files:**

- Modify: `test/trim.test.ts` (full rewrite)

This is the smallest test file. Use it to validate the rewrite patterns before scaling.

- [ ] **Step 1: Rewrite `test/trim.test.ts`**

Replace the entire contents with:

```typescript
import { describe, it } from 'bun:test';
import * as assert from 'node:assert';
import { trim } from '../src/wsdl/index.js';

function verify(input: string, expected: string) {
  const actual = trim(input);
  assert.strictEqual(actual, expected, `${actual} != ${expected}`);
}

describe('trim', () => {
  it('removes whitespace', () => {
    verify(' \n <> \n  ', '<>');
  });

  it('removes non breaking space', () => {
    verify('\xA0<>', '<>');
  });

  it('removes all', () => {
    verify('\xA0\n \t<\n\t\xA0>\t \n \xA0', '<\n\t\xA0>');
  });
});
```

Notes on transformation:

- The original file was malformed (top-level `describe`s nested inside a single `it`). The rewrite corrects this to idiomatic `describe` → `it` structure.
- `require('../lib/wsdl/index.js').trim` → `import { trim } from '../src/wsdl/index.js'`.
- `require('assert')` → `import * as assert from 'node:assert'`.
- `assert(x === y, msg)` (truthy check) → `assert.strictEqual(x, y, msg)` (more precise).

- [ ] **Step 2: Run the test**

```bash
bun test test/trim.test.ts
```

Expected: 3 tests pass, 0 fail. If tests fail, check the transformation — most likely an import path issue.

- [ ] **Step 3: Commit**

```bash
git add test/trim.test.ts
git commit -m "refactor(test): migrate trim-test to bun:test (pilot)

Import trim from src/ directly, use bun:test's describe/it,
use node:assert for strict equality. Fixed a pre-existing
structural bug where describe blocks were nested inside an it."
```

---

## Task 7: Rewrite security tests (batch)

**Files:**

- Modify: `test/security/BasicAuthSecurity.test.ts`
- Modify: `test/security/BearerSecurity.test.ts`
- Modify: `test/security/PasswordDigest.test.ts`
- Modify: `test/security/WSSecurity.test.ts`

Security tests share a common pattern: import a class from the package root, exercise its API with `should`-style assertions. `WSSecurity.test.ts` additionally uses `sinon.useFakeTimers`.

- [ ] **Step 1: Rewrite `test/security/BasicAuthSecurity.test.ts`**

Replace the entire contents with:

```typescript
import { describe, it, expect } from 'bun:test';
import { BasicAuthSecurity } from '../../src/security/index.js';

describe('BasicAuthSecurity', () => {
  const username = 'admin';
  const password = 'password1234';

  it('is a function', () => {
    expect(typeof BasicAuthSecurity).toBe('function');
  });

  describe('defaultOption param', () => {
    it('is accepted as the third param', () => {
      new BasicAuthSecurity(username, password, {});
    });

    it('Should have Authorization header when addHeaders is invoked', () => {
      const security = new BasicAuthSecurity(username, password, {});
      const headers: Record<string, string> = {};
      security.addHeaders(headers);
      expect(headers).toHaveProperty('Authorization');
    });

    it('is used in addOptions', () => {
      const options: Record<string, unknown> = {};
      const defaultOptions = { foo: 3 };
      const instance = new BasicAuthSecurity(username, password, defaultOptions);
      instance.addOptions(options);
      expect(options).toHaveProperty('foo', 3);
    });
  });
});
```

- [ ] **Step 2: Read and rewrite `test/security/BearerSecurity.test.ts`**

Read the current file (`cat test/security/BearerSecurity.test.ts`) and apply the same transformation pattern: `require('../../').X` → `import { X } from '../../src/security/index.js'`, `x.should.be.type('y')` → `expect(typeof x).toBe('y')`, `x.should.have.property('y')` → `expect(x).toHaveProperty('y')`, `x.should.have.property('y', z)` → `expect(x).toHaveProperty('y', z)`, `x.should.equal(y)` → `expect(x).toBe(y)`.

Keep `describe`/`it` structure. Add basic types where obvious.

- [ ] **Step 3: Read and rewrite `test/security/PasswordDigest.test.ts`**

Same pattern as Step 2. Check which symbol is imported (`require('should')` is assertion lib — just drop it; `should` usage is replaced by `expect`).

- [ ] **Step 4: Rewrite `test/security/WSSecurity.test.ts` (fake timers)**

Key transformation: `sinon.useFakeTimers(fixedDate.getTime())` + `clock.restore()` → `setSystemTime(fixedDate)` + `setSystemTime()`.

Structure (full rewrite, with fake timers):

```typescript
import { describe, it, expect, beforeAll, afterAll, setSystemTime } from 'bun:test';
import { WSSecurity } from '../../src/security/index.js';

describe('WSSecurity', () => {
  beforeAll(() => {
    setSystemTime(new Date('2025-10-06T00:00:00Z'));
  });

  afterAll(() => {
    setSystemTime(); // reset to real time
  });

  it('is a function', () => {
    expect(typeof WSSecurity).toBe('function');
  });

  // ... remaining tests rewritten from the original file,
  //     applying the same should→expect transformations
});
```

Read `cat test/security/WSSecurity.test.ts` first to pull the remaining test bodies; translate them using the same patterns as Steps 1-3.

- [ ] **Step 5: Run security tests**

```bash
bun test test/security/
```

Expected: all security tests pass. If `WSSecurity.test.ts` tests related to PasswordDigest fail with nonce/created timestamp mismatches, `setSystemTime` may behave subtly differently from sinon on specific `Date` internals — investigate timestamp values in the failure output.

- [ ] **Step 6: Commit**

```bash
git add test/security/
git commit -m "refactor(test): migrate security tests to bun:test

- Replace should with expect
- Replace sinon.useFakeTimers with setSystemTime (WSSecurity)
- Import from src/security/index.js instead of package root
- Convert var to const"
```

---

## Task 8: Rewrite simple tests (batch)

**Files:**

- Modify: `test/response-encoding.test.ts`
- Modify: `test/response-preserve-whitespace.test.ts`
- Modify: `test/client-options.test.ts`
- Modify: `test/client-schema-does-not-change-on-request.test.ts`
- Modify: `test/header-rely-on-xml.test.ts`
- Modify: `test/wsdl-parse.test.ts`

(Note: `trim.test.ts` was rewritten in Task 6 and is excluded here.)

These tests use `soap`, `assert`, `fs`, and possibly `should`. No sinon. Similar shape: create client, exercise an API, assert behavior.

- [ ] **Step 1: Rewrite each file**

For each file, apply the rules in the **Reference: Transformation Patterns** section at the top of this plan. The typical change shape per file:

1. Replace the top `var x = require(...)` block with ESM imports (see the Transformation Reference's "Imports" subsection).
2. Drop `'use strict';`.
3. Rewrite every `should`-style assertion via the conversion table.
4. Keep every `node:assert` call as-is.
5. Swap `var` → `const`/`let`.
6. Swap `__dirname` → `import.meta.dir` if used.
7. Do not convert `done`-callback tests.

Do one file at a time. After each file:

```bash
bun test test/<filename>.test.ts
```

Expected: all tests in that file pass. Fix any translation errors before moving to the next file.

- [ ] **Step 2: Run all simple tests together**

```bash
bun test test/response-encoding.test.ts test/response-preserve-whitespace.test.ts test/client-options.test.ts test/client-schema-does-not-change-on-request.test.ts test/header-rely-on-xml.test.ts test/wsdl-parse.test.ts
```

Expected: all pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add test/response-encoding.test.ts test/response-preserve-whitespace.test.ts test/client-options.test.ts test/client-schema-does-not-change-on-request.test.ts test/header-rely-on-xml.test.ts test/wsdl-parse.test.ts
git commit -m "refactor(test): migrate simple tests to bun:test

Mechanical rewrite: require → import, should → expect,
var → const. node:assert calls kept as-is."
```

---

## Task 9: Rewrite medium tests (client-customHttp + client-options-wsdlcache)

**Files:**

- Modify: `test/client-customHttp.test.ts`
- Modify: `test/client-customHttp-xsdinclude.test.ts`
- Modify: `test/client-options-wsdlcache.test.ts`

These files use `test-helpers` and `client-options-wsdlcache` uses `sinon.createSandbox`.

- [ ] **Step 1: Rewrite `test/client-customHttp.test.ts`**

Apply the **Reference: Transformation Patterns** at the top of this plan. The helpers import is:

```typescript
import * as testHelpers from './test-helpers.js';
// then: testHelpers.createMockHttpClient(import.meta.dir)
```

Run: `bun test test/client-customHttp.test.ts` → expect pass.

- [ ] **Step 2: Rewrite `test/client-customHttp-xsdinclude.test.ts`**

Same pattern. Run: `bun test test/client-customHttp-xsdinclude.test.ts` → expect pass.

- [ ] **Step 3: Rewrite `test/client-options-wsdlcache.test.ts` (sinon sandbox)**

Apply the Transformation Reference. For the sandbox-specific pattern, first inspect usage:

```bash
grep -n -E 'sandbox\.|sinon\.' test/client-options-wsdlcache.test.ts
```

Each `sandbox.stub(obj, 'method').returns(x)` becomes `spyOn(obj, 'method').mockReturnValue(x)`. Each `sandbox.spy(obj, 'method')` becomes `spyOn(obj, 'method')`. Replace `sandbox.restore()` in `afterEach` with per-spy `.mockRestore()` calls (or rely on Bun's automatic cleanup between tests). If a `sandbox.stub` targets a module's exports (rather than an object method), use `mock.module('../src/...', () => ({ ... }))` instead.

Run: `bun test test/client-options-wsdlcache.test.ts` → expect pass.

- [ ] **Step 4: Commit**

```bash
git add test/client-customHttp.test.ts test/client-customHttp-xsdinclude.test.ts test/client-options-wsdlcache.test.ts
git commit -m "refactor(test): migrate custom-http and wsdl-cache tests

- Replace sinon.createSandbox with spyOn + mockRestore
- Use test-helpers via ESM import
- import.meta.dir in place of __dirname"
```

---

## Task 10: Rewrite request-response-samples.test.ts (timekeeper)

**Files:**

- Modify: `test/request-response-samples.test.ts`

This file uses `timekeeper` for frozen-time testing. Replace with `setSystemTime`.

- [ ] **Step 1: Rewrite**

Apply the **Reference: Transformation Patterns** at the top of this plan, including the Timekeeper → bun:test subsection. Concretely:

```typescript
// Before:
const timekeeper = require('timekeeper');
timekeeper.freeze(Date.parse('2014-10-12T01:02:03Z'));
// ... tests ...
timekeeper.reset();

// After:
import { setSystemTime } from 'bun:test';
setSystemTime(new Date('2014-10-12T01:02:03Z'));
// ... tests ...
setSystemTime(); // reset
```

Note: `Date.parse(...)` returns a number; `new Date(...)` is cleaner and `setSystemTime` accepts Date objects.

- [ ] **Step 2: Run the test**

```bash
bun test test/request-response-samples.test.ts
```

Expected: all tests pass. Timestamps in any generated SOAP headers should match pre-migration output; if not, the frozen-time conversion missed a call site.

- [ ] **Step 3: Commit**

```bash
git add test/request-response-samples.test.ts
git commit -m "refactor(test): migrate request-response-samples, replace timekeeper with setSystemTime"
```

---

## Task 11: Rewrite complex tests (client-test, wsdl-test)

**Files:**

- Modify: `test/client.test.ts`
- Modify: `test/wsdl.test.ts`

Largest files. Both use `sinon.spy(obj, 'method')`.

- [ ] **Step 1: Rewrite `test/client.test.ts`**

Apply the **Reference: Transformation Patterns** at the top of this plan. The `sinon.spy` replacement path is:

```typescript
// Before:
const sinon = require('sinon');
const spy = sinon.spy(obj, 'method');
// ...
spy.restore(); // if called

// After:
import { spyOn } from 'bun:test';
const spy = spyOn(obj, 'method');
// ...
spy.mockRestore();
```

Run: `bun test test/client.test.ts` → expect pass. Fix any translation errors file-locally.

- [ ] **Step 2: Rewrite `test/wsdl.test.ts`**

Same pattern as Step 1. Run: `bun test test/wsdl.test.ts` → expect pass.

- [ ] **Step 3: Commit**

```bash
git add test/client.test.ts test/wsdl.test.ts
git commit -m "refactor(test): migrate client and wsdl tests, replace sinon.spy with spyOn"
```

---

## Task 12: Run full suite, verify test count

**Files:** none (verification only).

- [ ] **Step 1: Run full suite**

```bash
bun test
```

Expected: auto-discovers all `*.test.ts` files in `test/`. All tests pass.

- [ ] **Step 2: Count tests and compare to static baseline**

```bash
bun test 2>&1 | tail -5
```

Expected summary line like `<N> pass, 0 fail`. Compare `<N>` to the `TOTAL` recorded in Task 1 Step 2 (the static `it(` count floor).

`<N>` should be **≥ TOTAL**. Parameterized tests (`[...].forEach(meta => describe(...))`) can legitimately multiply the runtime count beyond the static count, so `>` is fine. `<` means a test was dropped during migration — audit before proceeding by comparing per-file counts against `/tmp/bun-migration-baseline/it-counts.txt`.

- [ ] **Step 3: Verify lib/ build still matches baseline**

```bash
bun run build
(cd lib && find . -type f \( -name '*.js' -o -name '*.d.ts' \) | sort | xargs shasum -a 256) > /tmp/bun-migration-baseline/lib-checksums-after-tests.txt
diff /tmp/bun-migration-baseline/lib-checksums.txt /tmp/bun-migration-baseline/lib-checksums-after-tests.txt
```

Expected: no diff.

No commit — this task is verification only.

---

## Task 13: Remove mocha-era devDependencies

**Files:**

- Modify: `package.json` (remove deps, update `test` script)
- Delete: `test/mocha.opts`
- Modify: `bun.lock`

- [ ] **Step 1: Remove devDependencies**

```bash
bun remove mocha should sinon timekeeper source-map-support duplexer semver readable-stream
```

Expected: `package.json` no longer lists these under `devDependencies`. `bun.lock` updated. `duplexer`, `semver`, and `readable-stream` were only used by the deleted `_socketStream.js` — safe to remove.

- [ ] **Step 2: Update the `test` script**

Edit `package.json`:

```json
  "scripts": {
    "build": "tsc -p .",
    "watch": "tsc -w -p .",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "toc": "./node_modules/.bin/doctoc Readme.md --github --maxlevel 3",
    "docs": "typedoc --out docs",
    "test": "bun test"
  },
```

The change is the `"test"` line only.

- [ ] **Step 3: Delete `test/mocha.opts`**

```bash
git rm test/mocha.opts
```

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
bun install --frozen-lockfile
bun test
```

Expected: same pass count as Task 12.

- [ ] **Step 5: Run lint and format check**

```bash
bun run lint
bun run format:check
```

Expected: both pass. If lint picks up newly-visible issues in `src/` (unlikely — no `src/` changes), fix in a separate commit.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock test/mocha.opts
git commit -m "chore(test): remove mocha, should, sinon, timekeeper, source-map-support

All replaced by bun:test primitives. Test script is now 'bun test'."
```

---

## Task 14: Delete package-lock.json

**Files:**

- Delete: `package-lock.json`

- [ ] **Step 1: Verify bun.lock is authoritative**

```bash
rm -rf node_modules
bun install --frozen-lockfile
bun test
```

Expected: install succeeds, all tests pass. `bun.lock` alone is sufficient.

- [ ] **Step 2: Delete package-lock.json**

```bash
git rm package-lock.json
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove package-lock.json, bun.lock is authoritative"
```

---

## Task 15: Update CI workflow

**Files:**

- Modify: `.github/workflows/pr.yml`

Assumption: by the time this plan runs, `pr.yml` has been updated by PR #9 to include a test job using `npm ci` + `npm test`. Replace both the existing `code-quality` job and any `test` job with a single Bun-based job.

- [ ] **Step 1: Read current pr.yml**

```bash
cat .github/workflows/pr.yml
```

Record current jobs and steps.

- [ ] **Step 2: Rewrite pr.yml**

Replace the entire contents of `.github/workflows/pr.yml` with:

```yaml
name: PR Build
on: pull_request
jobs:
  build-test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: <BUN_VERSION> # match packageManager field in package.json
      - run: bun ci
      - run: bun test
      - run: bun run build # sanity-check tsc still passes
      - run: bun run lint
      - run: bun run format:check

  # Fails the PR on high/critical CVEs in production dependencies.
  # Replaces the npm audit job added in #36.
  security:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: <BUN_VERSION>
      - run: bun audit --prod --audit-level=high
```

Substitute `<BUN_VERSION>` with the exact version recorded in Task 2 Step 1 (the same value pinned in the `packageManager` field). Pinning explicitly keeps CI deterministic and independent of setup-bun version-file parsing.

`bun ci` is equivalent to `bun install --frozen-lockfile` but fails with a clearer error if `package.json` is out of sync with `bun.lock`. Idiomatic for CI.

`bun audit --prod --audit-level=high` replaces the `npm audit --omit=dev --audit-level=high` job added by [fetch-soap#36](https://github.com/evans-sam/fetch-soap/pull/36) — same posture (production-only, high severity floor), now reading from `bun.lock`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr.yml
git commit -m "ci: migrate PR workflow to Bun

Replaces setup-node + npm ci + mocha with setup-bun + bun test.
Bun version pinned via package.json's packageManager field."
```

- [ ] **Step 4: (Optional) Push to a branch and verify CI green**

```bash
git push -u origin HEAD
```

Watch the PR workflow in GitHub Actions. If it fails, fix on this branch before merging.

---

## Task 16: Update Dependabot configuration

**Files:**

- Modify: `.github/dependabot.yml`

- [ ] **Step 1: Edit dependabot.yml**

Change `package-ecosystem: "npm"` to `package-ecosystem: "bun"`. Full file:

```yaml
version: 2
updates:
  - package-ecosystem: 'bun'
    directory: '/'
    schedule:
      interval: 'weekly'
    ignore:
      - dependency-name: '@types/node'
      - dependency-name: 'typedoc'
    cooldown:
      default-days: 14

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
    cooldown:
      default-days: 14
```

- [ ] **Step 2: Visual review**

Read the full file and confirm the only changes are the `package-ecosystem` value on the first updates entry. GitHub Actions validates the YAML on push; a syntax error there will surface as a workflow-parse warning on the next cron tick, so catching it locally is nice-to-have, not required.

- [ ] **Step 3: Verify Dependabot bun ecosystem support**

Open the GitHub docs for Dependabot supported ecosystems: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference#package-ecosystem-

Confirm `bun` is listed as a supported `package-ecosystem`. If not listed (e.g., still in beta), fall back: revert to `package-ecosystem: "npm"` — Dependabot will still read `bun.lock` because it falls back to reading `package.json` dependencies.

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml
git commit -m "chore(ci): switch dependabot ecosystem to bun"
```

---

## Task 17: Update CONTRIBUTING.md

**Files:**

- Modify: `CONTRIBUTING.md`

Current file references `npm run lint` and `npm run format` in the Code Style section. Update those references and add a short Bun-install prerequisite note.

- [ ] **Step 1: Replace the `npm run lint` reference**

Edit `CONTRIBUTING.md`. Change:

```markdown
- Run `npm run lint` before submitting
- Run `npm run format` to format code with Prettier
```

to:

```markdown
- Run `bun run lint` before submitting
- Run `bun run format` to format code with Prettier
```

- [ ] **Step 2: Add a Bun prerequisite section**

Just above the `### Testing` subheading (inside the `## Making Changes` section), insert:

````markdown
### Toolchain

This project uses [Bun](https://bun.sh) as its test runner and package manager. Install Bun before running any commands below:

```bash
curl -fsSL https://bun.sh/install | bash
```
````

Then:

```bash
bun install       # install dependencies
bun test          # run the test suite
bun run build     # build lib/ via tsc
```

````

(Note: the fenced code block inside the markdown block is shown with escaped backticks — produce real triple-backtick fences in the file.)

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: update CONTRIBUTING for Bun toolchain"
````

---

## Task 18: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Clean install and full test run**

```bash
rm -rf node_modules
bun install --frozen-lockfile
bun test
```

Expected: all tests pass. Record the final pass count and confirm it matches the mocha baseline from Task 1.

- [ ] **Step 2: Full build and lib/ diff**

```bash
bun run build
(cd lib && find . -type f \( -name '*.js' -o -name '*.d.ts' \) | sort | xargs shasum -a 256) > /tmp/bun-migration-baseline/lib-checksums-final.txt
diff /tmp/bun-migration-baseline/lib-checksums.txt /tmp/bun-migration-baseline/lib-checksums-final.txt
```

Expected: empty diff.

- [ ] **Step 3: Lint and format check**

```bash
bun run lint
bun run format:check
```

Expected: both pass.

- [ ] **Step 4: Packaged-artifact smoke test**

```bash
npm pack --dry-run 2>&1 | tee /tmp/bun-migration-baseline/pack-contents.txt
```

Expected: the file list under `Tarball Contents` includes all `lib/*.js`, `lib/*.d.ts`, `LICENSE`, `README.md`, and `package.json`. No `test/`, `src/`, `node_modules/`, `bun.lock`, or `.github/` entries. If the file list differs from what was published pre-migration (check the npm page at https://www.npmjs.com/package/fetch-soap for the latest published tarball contents if needed), investigate the `"files"` field in `package.json`.

- [ ] **Step 5: Optional — Node consumer smoke test**

```bash
cd /tmp && mkdir bun-migration-smoke && cd bun-migration-smoke
npm init -y
npm install /path/to/fetch-soap    # use the migration worktree path
node --input-type=module -e "import * as soap from 'fetch-soap'; console.log(Object.keys(soap));"
```

Expected: prints the exported keys (`createClient`, etc.) without errors. Confirms that a plain Node consumer (no Bun) can still import and use the package. Clean up the temp dir after.

- [ ] **Step 6: Push branch and watch CI**

```bash
git push -u origin HEAD
```

Open the resulting PR. All checks must be green before requesting review.

No commit — verification only.

---

## Summary of commits (end state)

```
<hash> docs: update CONTRIBUTING for Bun toolchain
<hash> chore(ci): switch dependabot ecosystem to bun
<hash> ci: migrate PR workflow to Bun
<hash> chore: remove package-lock.json, bun.lock is authoritative
<hash> chore(test): remove mocha, should, sinon, timekeeper, source-map-support
<hash> refactor(test): migrate client and wsdl tests, replace sinon.spy with spyOn
<hash> refactor(test): migrate request-response-samples, replace timekeeper with setSystemTime
<hash> refactor(test): migrate custom-http and wsdl-cache tests
<hash> refactor(test): migrate simple tests to bun:test
<hash> refactor(test): migrate security tests to bun:test
<hash> refactor(test): migrate trim-test to bun:test (pilot)
<hash> refactor(test): rewrite helpers as ESM TypeScript
<hash> chore(bun): add @types/bun
<hash> refactor(test): rename *-test.js to *.test.ts (pure rename)
<hash> chore(bun): add bun.lock and packageManager field
```

Per design D8, the pure-rename commit comes before the content rewrites, keeping `git log --follow` intact.
