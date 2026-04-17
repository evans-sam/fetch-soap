# Design: unblock 7 skipped integration tests in `test/client.test.ts`

- **Date:** 2026-04-16
- **Issue:** [#46](https://github.com/evans-sam/fetch-soap/issues/46)
- **Branch:** `46-7-integration-tests-in-clienttestts-skipped-during-bun-migration-hangstimeouts`
- **Related:** #43 (extensionless lib imports, fixed in 79b58e2); #45 (`err.root` on non-Fault parse errors)

## Summary

Seven integration tests in `test/client.test.ts` were marked `it.skip` in commit 00b0b6b during the Bun migration because they hung past the 5 s timeout without calling `done()`. This design fixes the real root causes and unskips all of them. Empirical investigation identified three distinct causes, one of which is a production-affecting bug in `src/http.ts`. The work ships as a single bundled PR with commits organized by concern.

**Terminology note.** Issue #46 counts seven tests by unique name. The codebase has eight `it.skip` sites, because `should allow passing in XML strings` appears twice — once as a callback-style test (line 163) and once as a promise-style test (line 1910). Each `it.skip` site runs twice at runtime (streaming and non-streaming variants), so eight sites produce sixteen skipped test runs. This document uses "seven tests" when referencing the issue framing and "eight sites" when describing implementation work.

## Root causes

### 1. `src/http.ts` double-callback on user-callback throw (real src bug)

In `HttpClient.request()`, the fetch promise chain is:

```ts
const responsePromise = fetchFn(options.url, fetchOptions)
  .then(async (response) => {
    // ... handleBody eventually calls callback(null, res, data) ...
  })
  .catch((err) => {
    if (timeoutId) clearTimeout(timeoutId);
    callback(err);
    throw err;
  });
```

The `.catch()` is attached after `.then()`, so it catches:

1. fetch-level rejections (network errors) — correct
2. explicit `callback(err); throw err;` from the boundary / `parseMTOMResp` paths — correct
3. exceptions thrown inside the user-supplied callback when invoked at the `handleBody` call site (src/http.ts:271) — **incorrect**

Case 3 causes `callback` to be invoked a second time with the user's own thrown error repackaged as a transport error. In tests this masks one real failure (a test assertion) as a double-fire that leaves `done()` never called, producing a 5 s timeout hang. In production it means user exceptions leak back through the callback API.

### 2. Test bug: bare `assert(x)` under ESM (test-only)

`test/client.test.ts` imports with `import * as assert from 'node:assert'`. The namespace object returned by that import is not callable in Bun's ESM — `assert(x)` throws `TypeError: assert is not a function`. Under CJS/Mocha the equivalent `require('assert')` returned a callable function, so the pattern worked there.

When the throw occurs synchronously at the test body (lines 74, 1864), the test fails fast with the TypeError. When it occurs inside an async callback (lines 301, 308, 387, 421, 790), `done()` never fires and the test times out — matching the "hangs for 5000 ms" symptom in the issue.

Seven call sites use bare `assert(...)` in this file.

### 3. Broken-by-design XML-strings tests (test-only)

The two `should allow passing in XML strings` tests (lines 163 sync, 1910 async) assert that:

- `err` is truthy, and
- `raw.indexOf('html') !== -1`.

Their test server always returns a valid empty SOAP envelope regardless of request body, so both assertions can never hold. The upstream node-soap test (verbatim identical code) has an extra `.close(() => { done(); })` chained after `.listen(...)`, which closed the server immediately and fired `done()` from the close handler before the SOAP callback could run. Under Mocha's default bail-on-first-error, that was enough for the test to appear green; the body assertions never actually executed. Under Bun without that bail behavior, the test can't pass and there is no original intent worth porting — the test was always a phantom.

## Fix plan

### 1. `src/http.ts` — restructure the fetch promise chain

Switch from `.then(...).catch(...)` to `.then(onFulfilled, onRejected)`:

```ts
const responsePromise = fetchFn(options.url, fetchOptions).then(
  async (response) => {
    // ... unchanged success path ...
  },
  (err) => {
    if (timeoutId) clearTimeout(timeoutId);
    callback(err);
    throw err;
  },
);
```

`onRejected` only fires for rejection of the fetch promise itself. Exceptions thrown inside `onFulfilled` propagate as rejection of the returned `responsePromise`, which the existing tail `responsePromise.catch(() => {})` swallows. Behavior preserved for the three legitimate cases:

- Fetch failure: callback fires once with the error; promise rejects for awaiters.
- Explicit boundary / `parseMTOMResp` errors: inline `callback(err); throw err;` still calls callback once, then rejects the promise.
- User callback throws: promise rejects and is swallowed by the tail no-op. Callback is not re-invoked. This matches normal Node and browser semantics — the user owns errors thrown from their own callback.

No other call sites need changes.

### 2. `test/client.test.ts` — replace bare `assert(x)` with `assert.ok(x)`

Seven call sites, all converted to `assert.ok(...)`:

| Line | Before | Context |
|------|--------|---------|
| 74   | `assert(!called)`                                                             | cached-wsdl callback test, top-level |
| 301  | `assert(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1)`     | binary-attachments MTOM callback |
| 308  | `assert(attachmentHeaders['Content-Disposition'].indexOf(attachment.name) > -1)` | binary-attachments MTOM callback |
| 387  | `assert(body.contentType.indexOf('action') > -1)`                             | SOAP 1.2 action-header MTOM callback |
| 421  | `assert(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1)`     | MTOM-without-attachment callback |
| 790  | `assert(!client.lastRequestHeaders.SOAPAction)`                               | soap12 headers callback |
| 1864 | `assert(!called)`                                                             | cached-wsdl async-promise test, top-level |

The `assert.ok(body.includes(...), 'message')` call at line 266 already uses `assert.ok` and needs no change.

Rationale for targeted replacement over switching the import: 150+ existing call sites use `assert.ok` / `assert.equal` / `assert.ifError` via the namespace form. Changing the import to `import assert from 'node:assert'` would require auditing every site for property-resolution equivalence and is higher-risk for no functional gain.

### 3. `test/client.test.ts` — rewrite the XML-strings tests

Delete the two existing tests and replace with tests that verify what `_xml` actually does: substitute the raw string into the outgoing SOAP request body. Assertions target `client.lastRequest` rather than response contents.

Sync form:

```ts
it('should allow passing in XML strings', function (done) {
  const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
  const port = testHelpers.nextTestPort();
  const baseUrl = 'http://127.0.0.1:' + port;

  const server = http
    .createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/xml');
        res.end(
          "<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'>" +
            '<soapenv:Body/></soapenv:Envelope>',
        );
      });
    })
    .listen(port, '127.0.0.1', () => {
      soap.createClient(
        testHelpers.toTestUrl(import.meta.dir + '/wsdl/default_namespace.wsdl'),
        Object.assign({ envelopeKey: 'soapenv' }, meta.options),
        (err, client) => {
          assert.ifError(err);
          client.MyOperation({ _xml: xmlStr }, (err2) => {
            assert.ifError(err2);
            assert.ok(
              client.lastRequest.includes(xmlStr),
              'lastRequest should contain the raw _xml content',
            );
            server.close();
            done();
          });
        },
        baseUrl,
      );
    });
});
```

Async variant mirrors this using `createClientAsync` + `MyOperationAsync`, asserting on `client.lastRequest` after the promise resolves.

### 4. Unskip the eight tests

The eight skipped tests under the `forEach` wrapper (lines 66, 163, 254, 376, 397, 774, 1857, 1910) each run twice — once under `SOAP Client` and once under `SOAP Client (with streaming)` — so unskipping them adds 16 passing tests.

Step 3 writes the new XML-strings tests but leaves them `it.skip` so the rewrite commit is review-scoped to content changes only. Step 4 flips all eight sites to `it(...)` in one pass.

The two remaining `it.skip` sites (lines 2150 and 2231) are outside the `forEach` wrapper and unrelated to #46 — left skipped.

### 5. MTOM trio — diagnose after steps 1–4 land

The three MTOM tests (`should send binary attachments using XOP + MTOM`, `Should preserve SOAP 1.2 "action" header when sending MTOM request`, `Should send MTOM request even without attachment`) should pass once the bare-assert sites are fixed and src/http.ts no longer double-fires. None of them set `parseReponseAttachments: true`, so the response-side `parseMTOMResp` path is never entered — the test server responds with JSON that `parseSync` tolerates. The tests exercise request-side MTOM construction, not response parsing.

If the binary-attachments test still fails, the most likely cause is `textEncoder.encode(part.body)` at src/http.ts:167 treating an attachment `Buffer` as a string, which truncates binary data at null bytes. Conditional fix: detect `Uint8Array` / `Buffer` inputs and push them into the `dataParts` array directly; only `encode()` when the body is a string. This would land as an additional commit in the same PR.

## Scope

**In scope (all in one PR):**

- `src/http.ts` promise-chain restructure.
- `test/client.test.ts` bare-assert replacement, XML-strings rewrites, unskipping the eight sites.
- Conditional `src/http.ts` attachment-body encoding fix, if MTOM diagnosis requires it.

**Out of scope:**

- The other two `it.skip` sites in `test/client.test.ts` (lines 2150 and 2231 — namespace array ordering and Node-only saxStream respectively). Tracked separately; not part of #46.
- Issue #45 (`err.root` on non-Fault parse errors). Tracked separately.

## Verification

After all edits:

1. `bun test` → expected 166 pass / 2 skip / 0 fail. (The 2 remaining skips are the out-of-scope sites listed above.)
2. `bun run build` → TypeScript compiles with no new errors.
3. `bun run lint` → no new eslint issues.

## Commit structure

Single PR, commits ordered by concern for review tractability:

1. `fix(http): don't double-invoke callback when user callback throws` — src/http.ts restructure only.
2. `test(client): replace bare assert() with assert.ok() for ESM compat` — seven sites converted; no unskipping; existing 150 passes unchanged.
3. `test(client): rewrite broken XML-strings tests to verify _xml substitution` — two rewrites; still skipped at this point (to keep the diff small and reviewable before unskipping).
4. `test(client): unskip integration tests now that root causes are fixed` — flip 8 `it.skip` → `it`; test count moves 150 → 166 (each flipped site runs twice, under streaming and non-streaming variants, so 8 flips → 16 new passes).
5. (Conditional) `fix(http): pass Buffer/Uint8Array attachment bodies through as bytes` — only if step 4 reveals the MTOM binary encoding bug.

PR title: `fix: unblock 7 skipped integration tests in client.test.ts (closes #46)`.

PR description should note:

- The src-level double-callback bug is a production-affecting fix, not just a test fix.
- The two XML-strings tests were phantom-passing in the upstream node-soap codebase (a chained `.close(() => done())` fired before the SOAP callback). They're rewritten to test what `_xml` actually does.
- Relationship to #43 (already fixed) — this issue can now close.
