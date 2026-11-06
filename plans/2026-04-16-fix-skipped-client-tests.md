# Unblock Skipped Client Integration Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the seven skipped integration tests in `test/client.test.ts` (issue [#46](https://github.com/evans-sam/fetch-soap/issues/46)) by fixing the real root causes: a `src/http.ts` double-callback bug, seven bare `assert(x)` sites that fail under ESM, and two phantom-passing XML-strings tests inherited from upstream node-soap.

**Architecture:** Single bundled PR, five commits organized by concern. One src fix restructures a fetch promise chain so that user-callback throws no longer trigger a second callback invocation. The rest are test-layer changes: targeted `assert(x)` → `assert.ok(x)` replacements, a rewrite of the two XML-strings tests to verify `_xml` substitution against `client.lastRequest`, and flipping `it.skip` markers to `it`. A sixth conditional commit addresses a binary-attachment encoding bug in `src/http.ts` only if MTOM diagnosis surfaces it.

**Tech Stack:** TypeScript, Bun runtime (`bun:test`, Bun's built-in `fetch`), `node:http` for test servers, `node:assert`.

**Reference:** [specs/2026-04-16-fix-skipped-client-tests-design.md](../specs/2026-04-16-fix-skipped-client-tests-design.md)

---

## File Structure

Files touched:

- **Modify:** `src/http.ts` — restructure the fetch promise chain in `HttpClient.request()` (lines 247–323). Conditional sixth commit may also adjust the multipart-body construction block (lines 158–170).
- **Modify:** `test/client.test.ts` — seven bare-assert replacements (lines 74, 301, 308, 387, 421, 790, 1864); two XML-strings test rewrites (lines 163–194 and 1910–1923); eight `it.skip` → `it` flips (lines 66, 163, 254, 376, 397, 774, 1857, 1910).

No new files created. No deletions.

---

## Task 1: Pre-work baseline

Confirm the starting state so every later step has a trustworthy anchor.

**Files:**

- Read-only: `test/client.test.ts`, `src/http.ts`, `package.json`

- [ ] **Step 1: Confirm clean working tree on the correct branch**

```bash
git status
git branch --show-current
```

Expected output: `nothing to commit, working tree clean` and branch `46-7-integration-tests-in-clienttestts-skipped-during-bun-migration-hangstimeouts`.

- [ ] **Step 2: Install dependencies**

```bash
bun install
```

Expected: no errors. Dependencies resolve from `bun.lock`.

- [ ] **Step 3: Capture baseline test count**

```bash
bun test 2>&1 | tail -10
```

Expected: `442 pass / 18 skip / 0 fail` (or very close — minor variations in pass count are fine; what matters is 0 fail and 18 skip).

Record this number. After Task 5, the expected counts are 458 pass / 2 skip / 0 fail.

- [ ] **Step 4: Confirm baseline typecheck and lint**

```bash
bun run build && bun run lint
```

Expected: both complete successfully with no errors.

---

## Task 2: Fix `src/http.ts` double-callback (commit 1)

The `.catch()` after `.then()` in `HttpClient.request()` catches throws from inside the user-supplied callback and re-invokes the callback with that thrown error — double-fire. Switch to `.then(onFulfilled, onRejected)` so `onRejected` only sees real fetch-layer rejections.

**Files:**

- Modify: `src/http.ts:247-323`

- [ ] **Step 1: Verify the exact current code block to replace**

Run:

```bash
sed -n '247,323p' src/http.ts
```

Expected first line: `    const responsePromise = fetchFn(options.url, fetchOptions)`
Expected last line: `      });`
Expected content of lines 319–323:

```ts
      .catch((err) => {
        if (timeoutId) clearTimeout(timeoutId);
        callback(err);
        throw err;
      });
```

If the lines don't match, stop and re-read `src/http.ts` in full before proceeding.

- [ ] **Step 2: Apply the restructure**

Use Edit to replace this exact block:

```ts
const responsePromise = fetchFn(options.url, fetchOptions)
  .then(async (response) => {
    if (timeoutId) clearTimeout(timeoutId);

    const headersObj = this.headersToObject(response.headers);

    // Determine how to read the response body
    let responseData: any;
    if (this.options.parseReponseAttachments) {
      responseData = await response.arrayBuffer();
    } else {
      responseData = await response.text();
    }

    const res: IHttpResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: headersObj,
      data: responseData,
      requestHeaders: options.headers,
    };

    const handleBody = (body?: string) => {
      res.data = this.handleResponse(body !== undefined ? body : res.data);
      callback(null, res, res.data);
      return res;
    };

    if (this.options.parseReponseAttachments) {
      const contentType = headersObj['content-type'];
      const isMultipartResp = contentType && contentType.toLowerCase().indexOf('multipart/related') > -1;
      if (isMultipartResp) {
        let boundary;
        const parsedContentType = MIMEType.parse(contentType);
        if (parsedContentType) {
          boundary = parsedContentType.parameters.get('boundary');
        }
        if (!boundary) {
          const err = new Error('Missing boundary from content-type');
          callback(err);
          throw err;
        }
        return new Promise<IHttpResponse>((resolve, reject) => {
          parseMTOMResp(responseData, boundary, (err, multipartResponse) => {
            if (err) {
              callback(err);
              return reject(err);
            }
            // first part is the soap response
            const firstPart = multipartResponse.parts.shift();
            if (!firstPart || !firstPart.body) {
              const parseErr = new Error('Cannot parse multipart response');
              callback(parseErr);
              return reject(parseErr);
            }
            res.mtomResponseAttachments = multipartResponse;
            const decoder = new TextDecoder(this.options.encoding || 'utf-8');
            const bodyStr = decoder.decode(firstPart.body);
            handleBody(bodyStr);
            resolve(res);
          });
        });
      } else {
        // Convert ArrayBuffer to string
        const decoder = new TextDecoder(this.options.encoding || 'utf-8');
        const bodyStr = decoder.decode(responseData);
        return handleBody(bodyStr);
      }
    } else {
      return handleBody();
    }
  })
  .catch((err) => {
    if (timeoutId) clearTimeout(timeoutId);
    callback(err);
    throw err;
  });
```

With this:

```ts
const responsePromise = fetchFn(options.url, fetchOptions).then(
  async (response) => {
    if (timeoutId) clearTimeout(timeoutId);

    const headersObj = this.headersToObject(response.headers);

    // Determine how to read the response body
    let responseData: any;
    if (this.options.parseReponseAttachments) {
      responseData = await response.arrayBuffer();
    } else {
      responseData = await response.text();
    }

    const res: IHttpResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: headersObj,
      data: responseData,
      requestHeaders: options.headers,
    };

    const handleBody = (body?: string) => {
      res.data = this.handleResponse(body !== undefined ? body : res.data);
      callback(null, res, res.data);
      return res;
    };

    if (this.options.parseReponseAttachments) {
      const contentType = headersObj['content-type'];
      const isMultipartResp = contentType && contentType.toLowerCase().indexOf('multipart/related') > -1;
      if (isMultipartResp) {
        let boundary;
        const parsedContentType = MIMEType.parse(contentType);
        if (parsedContentType) {
          boundary = parsedContentType.parameters.get('boundary');
        }
        if (!boundary) {
          const err = new Error('Missing boundary from content-type');
          callback(err);
          throw err;
        }
        return new Promise<IHttpResponse>((resolve, reject) => {
          parseMTOMResp(responseData, boundary, (err, multipartResponse) => {
            if (err) {
              callback(err);
              return reject(err);
            }
            // first part is the soap response
            const firstPart = multipartResponse.parts.shift();
            if (!firstPart || !firstPart.body) {
              const parseErr = new Error('Cannot parse multipart response');
              callback(parseErr);
              return reject(parseErr);
            }
            res.mtomResponseAttachments = multipartResponse;
            const decoder = new TextDecoder(this.options.encoding || 'utf-8');
            const bodyStr = decoder.decode(firstPart.body);
            handleBody(bodyStr);
            resolve(res);
          });
        });
      } else {
        // Convert ArrayBuffer to string
        const decoder = new TextDecoder(this.options.encoding || 'utf-8');
        const bodyStr = decoder.decode(responseData);
        return handleBody(bodyStr);
      }
    } else {
      return handleBody();
    }
  },
  (err) => {
    if (timeoutId) clearTimeout(timeoutId);
    callback(err);
    throw err;
  },
);
```

Only two things change: `.then(async (response) => { ... })` becomes `.then(` with a second argument, and `.catch((err) => { ... })` becomes the second argument (with closing `)` instead of trailing `.catch`). The body of both handlers is identical to the original.

- [ ] **Step 3: Typecheck**

```bash
bun run build
```

Expected: no errors. The promise-chain refactor shouldn't introduce any type changes.

- [ ] **Step 4: Run the existing non-skipped tests to confirm no regression**

```bash
bun test 2>&1 | tail -5
```

Expected: `442 pass / 18 skip / 0 fail` (same as baseline — unchanged). The src fix shouldn't affect any currently-passing test since none of them throw from user callbacks.

- [ ] **Step 5: Commit**

```bash
git add src/http.ts
git commit -m "$(cat <<'EOF'
fix(http): don't double-invoke callback when user callback throws

HttpClient.request() wrapped the fetch chain as
.then(success).catch(catchErr). The .catch caught three cases:

  1. fetch-level rejections (network errors) — correct
  2. explicit callback(err); throw err; from boundary / parseMTOMResp
     paths — correct
  3. exceptions thrown inside the user-supplied callback when invoked
     at the handleBody call site — INCORRECT

Case 3 caused callback to fire a second time with the user's own
thrown error repackaged as a transport error. In tests this masks a
single assertion failure as a double done() that leaves the test
timing out at 5000ms. In production it leaks user-code exceptions
back through the callback API.

Switch to .then(onFulfilled, onRejected). onRejected only fires for
rejection of the fetch promise itself; exceptions inside onFulfilled
now propagate as rejection of the returned responsePromise, which the
existing tail .catch(() => {}) swallows. Behavior preserved for the
three legitimate cases:

- Fetch failure: callback fires once; promise rejects for awaiters.
- parseMTOMResp / boundary errors: inline callback(err); throw err;
  still calls callback once, then rejects the promise.
- User callback throws: promise rejects and is swallowed by the tail
  no-op. Callback is not re-invoked. Matches normal Node/browser
  semantics.

Refs #46.
EOF
)"
```

Expected: commit succeeds. No pre-commit hook installed for this repo.

---

## Task 3: Replace bare `assert(x)` with `assert.ok(x)` (commit 2)

`test/client.test.ts` uses `import * as assert from 'node:assert'`. The namespace object isn't callable under Bun ESM — bare `assert(x)` throws `TypeError: assert is not a function`. Convert the seven sites to `assert.ok(x)`.

**Files:**

- Modify: `test/client.test.ts` — lines 74, 301, 308, 387, 421, 790, 1864

- [ ] **Step 1: Verify the seven call sites before editing**

```bash
grep -n "^\s*assert(" test/client.test.ts
```

Expected output (exact):

```text
74:      assert(!called);
301:                    assert(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1);
308:                    assert(attachmentHeaders['Content-Disposition'].indexOf(attachment.name) > -1);
387:                assert(body.contentType.indexOf('action') > -1);
421:                assert(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1);
790:                assert(!client.lastRequestHeaders.SOAPAction);
1864:        assert(!called);
```

If counts or line numbers differ, stop and re-read `test/client.test.ts` before proceeding.

- [ ] **Step 2: Replace line 74**

Use Edit to change:

```ts
assert(!called);
```

to:

```ts
assert.ok(!called);
```

Context for uniqueness: this is the first `assert(!called)` in the file, inside the `should issue async callback for cached wsdl` test. Include surrounding lines in `old_string` if needed — e.g. the preceding line is `      });` at 73 and following is `    });` at 75.

- [ ] **Step 3: Replace line 301**

Change:

```ts
assert(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1);
assert.equal(dataHeaders['Content-ID'], contentType.start);
```

to:

```ts
assert.ok(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1);
assert.equal(dataHeaders['Content-ID'], contentType.start);
```

Using the trailing `assert.equal(...)` line disambiguates this from the identical line at 421.

- [ ] **Step 4: Replace line 308**

Change:

```ts
assert(attachmentHeaders['Content-Disposition'].indexOf(attachment.name) > -1);
```

to:

```ts
assert.ok(attachmentHeaders['Content-Disposition'].indexOf(attachment.name) > -1);
```

This text is unique in the file — no extra context needed.

- [ ] **Step 5: Replace line 387**

Change:

```ts
assert(body.contentType.indexOf('action') > -1);
```

to:

```ts
assert.ok(body.contentType.indexOf('action') > -1);
```

Unique in the file.

- [ ] **Step 6: Replace line 421**

Change:

```ts
assert(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1);
assert.equal(dataHeaders['Content-ID'], contentType.start);
done();
```

to:

```ts
assert.ok(dataHeaders['Content-Type'].indexOf('application/xop+xml') > -1);
assert.equal(dataHeaders['Content-ID'], contentType.start);
done();
```

The trailing `done();` disambiguates this from line 301.

- [ ] **Step 7: Replace line 790**

Change:

```ts
assert(!client.lastRequestHeaders.SOAPAction);
```

to:

```ts
assert.ok(!client.lastRequestHeaders.SOAPAction);
```

Unique in the file.

- [ ] **Step 8: Replace line 1864**

Change:

```ts
        assert(!called);
      });

      it('should allow customization of httpClient', function (done) {
```

to:

```ts
        assert.ok(!called);
      });

      it('should allow customization of httpClient', function (done) {
```

The trailing `it('should allow customization of httpClient'...` line disambiguates this from the first `assert(!called)` at line 74.

- [ ] **Step 9: Verify all seven sites are replaced**

```bash
grep -n "^\s*assert(" test/client.test.ts
```

Expected: no matches (empty output). If any remain, fix them now.

- [ ] **Step 10: Typecheck**

```bash
bun run build
```

Expected: no errors.

- [ ] **Step 11: Run existing test suite to confirm no regression**

```bash
bun test 2>&1 | tail -5
```

Expected: `442 pass / 18 skip / 0 fail`. Still identical to baseline — the skipped tests remain skipped, and the non-skipped tests don't touch the replaced lines.

- [ ] **Step 12: Commit**

```bash
git add test/client.test.ts
git commit -m "$(cat <<'EOF'
test(client): replace bare assert() with assert.ok() for ESM compat

test/client.test.ts uses 'import * as assert from node:assert'. The
namespace object returned by that import is not callable under Bun's
ESM — bare assert(x) throws 'TypeError: assert is not a function'.
Under CJS/Mocha require('assert') returned a callable function, so
the pattern worked there.

When the throw occurred synchronously at the test body (lines 74,
1864), the test failed fast with the TypeError. When it occurred
inside an async callback (lines 301, 308, 387, 421, 790), done()
never fired and the test timed out — matching the hang symptom in
issue #46.

Convert the seven sites to assert.ok(). Leaves 150 existing passes
unchanged (skipped tests stay skipped at this commit); unskipping
happens in a later commit once the src-level double-callback fix
has landed.

Refs #46.
EOF
)"
```

Expected: commit succeeds.

---

## Task 4: Rewrite the XML-strings tests (commit 3)

The two `should allow passing in XML strings` tests assert `err` truthy and `raw.indexOf('html') !== -1` — conditions the test server can never produce. They were phantom-passing in upstream node-soap via a chained `.close(() => done())` that fired `done` before the SOAP callback. Rewrite to test what `_xml` actually does: substitute the raw string into the outgoing SOAP request body, verified via `client.lastRequest`. Keep `it.skip` at this commit so the diff is review-scoped; the unskip flip happens in Task 5.

**Files:**

- Modify: `test/client.test.ts` — lines 163–194 (sync variant), lines 1910–1923 (async variant)

- [ ] **Step 1: Verify current sync variant content (lines 163–194)**

```bash
sed -n '163,194p' test/client.test.ts
```

Expected first line: `    it.skip('should allow passing in XML strings', function (done) {`
Expected last line: `    });`

If content differs, re-read the file before proceeding.

- [ ] **Step 2: Replace the sync variant**

Use Edit to replace this exact block (lines 163–194):

```ts
it.skip('should allow passing in XML strings', function (done) {
  let server: http.Server | null = null;
  const hostname = '127.0.0.1';
  const port = testHelpers.nextTestPort();
  const baseUrl = 'http://' + hostname + ':' + port;

  server = http
    .createServer(function (req, res) {
      res.statusCode = 200;
      res.write("<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'><soapenv:Body/></soapenv:Envelope>");
      res.end();
    })
    .listen(port, hostname, function () {
      soap.createClient(
        testHelpers.toTestUrl(import.meta.dir + '/wsdl/default_namespace.wsdl'),
        Object.assign({ envelopeKey: 'soapenv' }, meta.options),
        function (err, client) {
          assert.ok(client);
          assert.ifError(err);

          const xmlStr =
            '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">\n\t<head>\n\t\t<title>404 - Not Found</title>\n\t</head>\n\t<body>\n\t\t<h1>404 - Not Found</h1>\n\t\t<script type="text/javascript" src="http://gp1.wpc.edgecastcdn.net/00222B/beluga/pilot_rtm/beluga_beacon.js"></script>\n\t</body>\n</html>';
          client.MyOperation({ _xml: xmlStr }, function (err, result, raw, soapHeader) {
            assert.ok(err);
            assert.notEqual(raw.indexOf('html'), -1);
            done();
          });
        },
        baseUrl,
      );
    });
});
```

with:

```ts
it.skip('should allow passing in XML strings', function (done) {
  const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
  const hostname = '127.0.0.1';
  const port = testHelpers.nextTestPort();
  const baseUrl = 'http://' + hostname + ':' + port;

  const server = http
    .createServer(function (req, res) {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/xml');
        res.end("<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'>" + '<soapenv:Body/></soapenv:Envelope>');
      });
    })
    .listen(port, hostname, function () {
      soap.createClient(
        testHelpers.toTestUrl(import.meta.dir + '/wsdl/default_namespace.wsdl'),
        Object.assign({ envelopeKey: 'soapenv' }, meta.options),
        function (err, client) {
          assert.ifError(err);
          assert.ok(client);
          client.MyOperation({ _xml: xmlStr }, function (err2) {
            assert.ifError(err2);
            assert.ok(client.lastRequest.includes(xmlStr), 'lastRequest should contain the raw _xml content');
            server.close();
            done();
          });
        },
        baseUrl,
      );
    });
});
```

Note: keep `it.skip` for now. The unskip happens in Task 5.

- [ ] **Step 3: Verify current async variant content (lines 1910–1923)**

```bash
sed -n '1910,1923p' test/client.test.ts
```

Expected first line: `      it.skip('should allow passing in XML strings', function (done) {`
Expected last line: `      });`

If content differs, re-read the file before proceeding.

- [ ] **Step 4: Replace the async variant**

Use Edit to replace this exact block:

```ts
it.skip('should allow passing in XML strings', function (done) {
  soap
    .createClientAsync(testHelpers.toTestUrl(import.meta.dir + '/wsdl/default_namespace.wsdl'), Object.assign({ envelopeKey: 'soapenv' }, meta.options), baseUrl)
    .then(function (client) {
      assert.ok(client);
      const xmlStr =
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">\n\t<head>\n\t\t<title>404 - Not Found</title>\n\t</head>\n\t<body>\n\t\t<h1>404 - Not Found</h1>\n\t\t<script type="text/javascript" src="http://gp1.wpc.edgecastcdn.net/00222B/beluga/pilot_rtm/beluga_beacon.js"></script>\n\t</body>\n</html>';
      return client.MyOperationAsync({ _xml: xmlStr });
    })
    .then(function ([result, raw, soapHeader]: any) {})
    .catch(function (err) {
      done();
    });
});
```

with:

```ts
it.skip('should allow passing in XML strings', function (done) {
  const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
  const hostname = '127.0.0.1';
  const port = testHelpers.nextTestPort();
  const localBaseUrl = 'http://' + hostname + ':' + port;

  const server = http
    .createServer(function (req, res) {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/xml');
        res.end("<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'>" + '<soapenv:Body/></soapenv:Envelope>');
      });
    })
    .listen(port, hostname, function () {
      let capturedClient: any;
      soap
        .createClientAsync(testHelpers.toTestUrl(import.meta.dir + '/wsdl/default_namespace.wsdl'), Object.assign({ envelopeKey: 'soapenv' }, meta.options), localBaseUrl)
        .then(function (client) {
          assert.ok(client);
          capturedClient = client;
          return client.MyOperationAsync({ _xml: xmlStr });
        })
        .then(function () {
          assert.ok(capturedClient.lastRequest.includes(xmlStr), 'lastRequest should contain the raw _xml content');
          server.close();
          done();
        })
        .catch(function (err) {
          server.close();
          done(err);
        });
    });
});
```

Notes on the async rewrite:

- Uses `localBaseUrl` (not `baseUrl`) to avoid shadowing the outer `describe`'s `baseUrl = 'http://127.0.0.1:80'`.
- `capturedClient` hoists the client out of the first `.then` so the second `.then` can read `lastRequest`.
- `.catch` now calls `done(err)` with the error rather than swallowing it — so if the rewrite breaks, the failure is visible, not masked as a passing test.

- [ ] **Step 5: Typecheck**

```bash
bun run build
```

Expected: no errors.

- [ ] **Step 6: Run existing test suite to confirm no regression**

```bash
bun test 2>&1 | tail -5
```

Expected: `442 pass / 18 skip / 0 fail`. The two rewritten tests are still `it.skip`, so neither runs.

- [ ] **Step 7: Commit**

```bash
git add test/client.test.ts
git commit -m "$(cat <<'EOF'
test(client): rewrite broken XML-strings tests to verify _xml substitution

The two 'should allow passing in XML strings' tests asserted err
truthy and raw.indexOf('html') !== -1. The test server always
returned a valid empty SOAP envelope regardless of request body, so
neither assertion could ever hold. Upstream node-soap (verbatim
identical code) had an extra .close(() => { done(); }) chained after
.listen(...), which closed the server and fired done() from the close
handler before the SOAP callback could run. Under Mocha's bail-on-
first-done behavior the body assertions never actually executed;
under Bun they can't pass.

No original intent to port. Rewrite both tests to verify what _xml
actually does: substitute the raw XML into the outgoing SOAP request
body. Assertions now target client.lastRequest.includes(xmlStr). The
async rewrite uses a captured client reference and propagates errors
to done() so that a future regression produces a visible failure
rather than a passing phantom.

Kept it.skip at this commit so the diff is review-scoped to content
changes. Unskipping lands in the next commit.

Refs #46.
EOF
)"
```

Expected: commit succeeds.

---

## Task 5: Unskip the eight sites (commit 4)

Flip `it.skip` → `it` at all eight sites. This is the moment of truth — any remaining bugs surface here.

**Files:**

- Modify: `test/client.test.ts` — lines 66, 163, 254, 376, 397, 774, 1857, 1910

- [ ] **Step 1: Verify the eight `it.skip` sites before flipping**

```bash
grep -n "it\.skip" test/client.test.ts
```

Expected output (exact):

```text
66:    it.skip('should issue async callback for cached wsdl', function (done) {
163:    it.skip('should allow passing in XML strings', function (done) {
254:      it.skip('should send binary attachments using XOP + MTOM', function (done) {
376:      it.skip('Should preserve SOAP 1.2 "action" header when sending MTOM request', function (done) {
397:      it.skip('Should send MTOM request even without attachment', function (done) {
774:      it.skip('should add proper headers for soap12', function (done) {
1857:      it.skip('should issue async promise for cached wsdl', function (done) {
1910:      it.skip('should allow passing in XML strings', function (done) {
2150:  it.skip('should add namespace to array of objects', function (done) {
2231:  it.skip('should return the saxStream (Node.js-specific, not supported in universal mode)', (done) => {
```

Ten `it.skip` sites total. Lines 2150 and 2231 are out of scope for #46 and must stay skipped. The other eight get flipped.

- [ ] **Step 2: Flip line 66**

Change:

```ts
    it.skip('should issue async callback for cached wsdl', function (done) {
```

to:

```ts
    it('should issue async callback for cached wsdl', function (done) {
```

- [ ] **Step 3: Flip line 163**

Change:

```ts
    it.skip('should allow passing in XML strings', function (done) {
      const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
```

to:

```ts
    it('should allow passing in XML strings', function (done) {
      const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
```

The second line disambiguates this from the async variant at line 1910.

- [ ] **Step 4: Flip line 254**

Change:

```ts
      it.skip('should send binary attachments using XOP + MTOM', function (done) {
```

to:

```ts
      it('should send binary attachments using XOP + MTOM', function (done) {
```

- [ ] **Step 5: Flip line 376**

Change:

```ts
      it.skip('Should preserve SOAP 1.2 "action" header when sending MTOM request', function (done) {
```

to:

```ts
      it('Should preserve SOAP 1.2 "action" header when sending MTOM request', function (done) {
```

- [ ] **Step 6: Flip line 397**

Change:

```ts
      it.skip('Should send MTOM request even without attachment', function (done) {
```

to:

```ts
      it('Should send MTOM request even without attachment', function (done) {
```

- [ ] **Step 7: Flip line 774**

Change:

```ts
      it.skip('should add proper headers for soap12', function (done) {
```

to:

```ts
      it('should add proper headers for soap12', function (done) {
```

- [ ] **Step 8: Flip line 1857**

Change:

```ts
      it.skip('should issue async promise for cached wsdl', function (done) {
```

to:

```ts
      it('should issue async promise for cached wsdl', function (done) {
```

- [ ] **Step 9: Flip line 1910**

Change:

```ts
      it.skip('should allow passing in XML strings', function (done) {
        const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
```

to:

```ts
      it('should allow passing in XML strings', function (done) {
        const xmlStr = '<custom-raw-xml>hello</custom-raw-xml>';
```

The second line disambiguates this from the sync variant at line 163.

- [ ] **Step 10: Verify only the two out-of-scope skips remain**

```bash
grep -n "it\.skip" test/client.test.ts
```

Expected output (exact):

```text
2150:  it.skip('should add namespace to array of objects', function (done) {
2231:  it.skip('should return the saxStream (Node.js-specific, not supported in universal mode)', (done) => {
```

If any other `it.skip` remain, flip them now.

- [ ] **Step 11: Run the full test suite**

```bash
bun test 2>&1 | tail -15
```

Expected best-case: `458 pass / 2 skip / 0 fail`. Stop and proceed directly to Task 7 (final verification).

Expected likely-case: some MTOM tests fail. If one or more of the three MTOM tests (`should send binary attachments using XOP + MTOM`, `Should preserve SOAP 1.2 "action" header when sending MTOM request`, `Should send MTOM request even without attachment`) fail, continue to Task 6.

Expected unlikely-case: non-MTOM tests fail. If so, capture the failure, stop, and investigate — this indicates a root cause not covered by the design. Common-case diagnosis:

- If a bare `assert(x)` you missed — grep for `^\s*assert(` again.
- If the XML-strings rewrite captures `lastRequest` before it's set — add a `console.log` inside the MyOperation callback and re-run with `--timeout 15000`.

- [ ] **Step 12: If Step 11 passed with 458/2/0, commit and skip Task 6**

```bash
git add test/client.test.ts
git commit -m "$(cat <<'EOF'
test(client): unskip integration tests now that root causes are fixed

Flip 8 it.skip -> it sites: cached-wsdl callback (66) and promise
(1857) variants, the two rewritten XML-strings tests (163, 1910),
the MTOM trio (254, 376, 397), and the soap12 headers test (774).
Each site runs under both 'SOAP Client' and 'SOAP Client (with
streaming)' describes, so 8 flips produces 16 new passing tests.

Two it.skip sites remain (lines 2150, 2231) — both outside the
forEach wrapper and out of scope for #46 (pre-existing namespace-
array-ordering concern and a Node-only saxStream API respectively).

Final count: 458 pass / 2 skip / 0 fail.

Closes #46.
EOF
)"
```

Then jump to Task 7.

- [ ] **Step 13: If Step 11 revealed MTOM failure(s), commit the partial-progress flip**

Some MTOM tests will fail at this commit; that's expected and Task 6 fixes them. Stage the commit anyway so the unskip is its own reviewable unit:

```bash
git add test/client.test.ts
git commit -m "$(cat <<'EOF'
test(client): unskip integration tests now that root causes are fixed

Flip 8 it.skip -> it sites. Test suite now surfaces a residual MTOM
binary-attachment failure addressed in the following commit.

Refs #46.
EOF
)"
```

Update the commit message at PR-prep time (Task 7) to reference the MTOM-fix commit.

---

## Task 6 (Conditional): Fix MTOM binary-attachment encoding bug (commit 5)

Only do this task if Task 5 Step 11 surfaced failure(s) in the MTOM tests. The expected root cause: `textEncoder.encode(part.body)` at `src/http.ts:167` treats an attachment `Buffer` as a string, corrupting binary data at null bytes.

**Files:**

- Modify: `src/http.ts:158-170` (multipart body construction)

- [ ] **Step 1: Confirm the failure mode**

Run the binary-attachments test alone with a longer timeout:

```bash
bun test test/client.test.ts -t "should send binary attachments using XOP + MTOM" --timeout 15000 2>&1 | tail -25
```

If the failure message mentions `Body does not contain part of binary data` (from the test server's `assert.ok(body.includes(PNG...))` on line 266), the binary data is corrupted in transit → confirms the encoding bug.

Other failure modes (e.g. connection refused, timeout with no clear cause) indicate a different root cause — stop and investigate before applying the fix below.

- [ ] **Step 2: Verify the exact current code block**

```bash
sed -n '158,170p' src/http.ts
```

Expected content:

```ts
const dataParts: Uint8Array[] = [textEncoder.encode(`--${boundary}\r\n`)];

let multipartCount = 0;
multipart.forEach((part) => {
  Object.keys(part).forEach((key) => {
    if (key !== 'body') {
      dataParts.push(textEncoder.encode(`${key}: ${part[key]}\r\n`));
    }
  });
  dataParts.push(textEncoder.encode('\r\n'), textEncoder.encode(part.body), textEncoder.encode(`\r\n--${boundary}${multipartCount === multipart.length - 1 ? '--' : ''}\r\n`));
  multipartCount++;
});
options.body = concatUint8Arrays(dataParts);
```

- [ ] **Step 3: Apply the encoding fix**

Use Edit to replace this exact line:

```ts
dataParts.push(textEncoder.encode('\r\n'), textEncoder.encode(part.body), textEncoder.encode(`\r\n--${boundary}${multipartCount === multipart.length - 1 ? '--' : ''}\r\n`));
```

with:

```ts
const bodyBytes = part.body instanceof Uint8Array ? part.body : typeof part.body === 'string' ? textEncoder.encode(part.body) : textEncoder.encode(String(part.body));
dataParts.push(textEncoder.encode('\r\n'), bodyBytes, textEncoder.encode(`\r\n--${boundary}${multipartCount === multipart.length - 1 ? '--' : ''}\r\n`));
```

`Buffer` extends `Uint8Array`, so `part.body instanceof Uint8Array` covers both plain Uint8Arrays (universal) and Buffers (Node). The `String(part.body)` fallback preserves current behavior for any non-string, non-byte inputs (e.g. numbers) rather than throwing — the previous code would also have coerced via template-string equivalence.

- [ ] **Step 4: Typecheck**

```bash
bun run build
```

Expected: no errors.

- [ ] **Step 5: Re-run the MTOM tests**

```bash
bun test test/client.test.ts -t "MTOM" --timeout 15000 2>&1 | tail -15
```

Expected: all six MTOM test runs pass (three tests × two streaming/non-streaming variants).

- [ ] **Step 6: Run the full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: `458 pass / 2 skip / 0 fail`.

- [ ] **Step 7: Commit**

```bash
git add src/http.ts
git commit -m "$(cat <<'EOF'
fix(http): pass Buffer/Uint8Array attachment bodies through as bytes

The multipart body construction in buildRequest() piped every part
through textEncoder.encode(part.body). TextEncoder.encode accepts a
string and produces UTF-8 bytes — when passed a Buffer, it coerces
via String(buffer), losing all bytes that aren't valid UTF-8 and
truncating at the first null byte. Binary attachments (e.g. PNG) got
corrupted on the way to the wire.

Fix: inspect part.body and pass it through untouched when it's
already a Uint8Array (Buffer inherits from Uint8Array so Node
callers still work). Only encode when body is a string.

Unblocks 'should send binary attachments using XOP + MTOM' which
asserts the raw PNG bytes make it through to the multipart body.

Refs #46.
EOF
)"
```

Expected: commit succeeds.

---

## Task 7: Final verification and PR preparation

- [ ] **Step 1: Full test suite**

```bash
bun test 2>&1 | tail -10
```

Expected: `458 pass / 2 skip / 0 fail`. If the count differs, stop and investigate.

- [ ] **Step 2: Typecheck**

```bash
bun run build
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
bun run lint
```

Expected: no new errors. Pre-existing warnings are fine (compare against the pre-commit baseline if unsure).

- [ ] **Step 4: Confirm commit log is clean**

```bash
git log --oneline master..HEAD
```

Expected output (4 or 5 commits depending on whether Task 6 ran):

```text
<sha> fix(http): pass Buffer/Uint8Array attachment bodies through as bytes      [conditional]
<sha> test(client): unskip integration tests now that root causes are fixed
<sha> test(client): rewrite broken XML-strings tests to verify _xml substitution
<sha> test(client): replace bare assert() with assert.ok() for ESM compat
<sha> fix(http): don't double-invoke callback when user callback throws
<sha> docs(specs): design for unblocking skipped client.test.ts integration tests
```

(The docs commit from the brainstorming phase is also on-branch; that's expected.)

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin 46-7-integration-tests-in-clienttestts-skipped-during-bun-migration-hangstimeouts
gh pr create --title "fix: unblock 7 skipped integration tests in client.test.ts" --body "$(cat <<'EOF'
## Summary

- Fixes double-callback bug in `src/http.ts` where the `.catch` after `.then` re-invoked the user callback if the callback itself threw. Switched to `.then(onFulfilled, onRejected)` so `onRejected` only sees fetch-layer rejections. Production-affecting fix, not just a test unblocker.
- Replaces seven bare `assert(x)` sites with `assert.ok(x)` — the namespace object from `import * as assert from 'node:assert'` isn't callable under ESM, so those sites threw `TypeError` (fast-failing at the test body or silently masking `done()` inside callbacks).
- Rewrites the two `should allow passing in XML strings` tests. They were phantom-passing in upstream node-soap via a chained `.close(() => done())` that fired `done` before the SOAP callback. Rewrite verifies what `_xml` actually does: substitute the raw string into `client.lastRequest`.
- Unskips seven tests (eight `it.skip` sites; `should allow passing in XML strings` has sync + async variants). Each runs twice for streaming and non-streaming variants → 16 new passing tests.

Final count: **458 pass / 2 skip / 0 fail** (the two remaining skips are the pre-existing out-of-scope sites on lines 2150 and 2231).

Related: #43 (already fixed — this issue can now close).

Closes #46.

## Test plan

- [ ] `bun test` — 458 pass / 2 skip / 0 fail
- [ ] `bun run build` — no errors
- [ ] `bun run lint` — no new errors
- [ ] CI passes on this branch
EOF
)"
```

Expected: PR URL returned. Paste it at the end of your summary.

- [ ] **Step 6: Report completion**

Summarize in your final message:

- Final test count (458 pass / 2 skip / 0 fail).
- Whether Task 6 ran (yes means MTOM encoding bug was real and fixed; no means MTOM tests passed under just the src/http.ts + test-layer fixes).
- PR URL.

---

## Self-review (done during planning, not by the executor)

**Spec coverage**

- Root cause 1 (`src/http.ts` double-callback) → Task 2.
- Root cause 2 (bare `assert(x)`) → Task 3.
- Root cause 3 (broken XML-strings tests) → Task 4.
- Unskipping → Task 5.
- Conditional MTOM buffer-encoding → Task 6.
- Verification, commit order, PR prep → Task 7.
- Out-of-scope items (lines 2150, 2231) → verified in Task 5 Step 1 as staying skipped.

All spec sections map to tasks.

**Placeholder scan**

No TBD, TODO, "implement later", "add appropriate error handling", or similar. Every code step shows full code. Every command shows expected output.

**Type consistency**

- `client.lastRequest` is used in both rewritten tests and is a `string | undefined` (per `src/client.ts:66`). The `.includes(xmlStr)` call is valid only if `lastRequest` is set before the callback fires — which it is, because `src/client.ts:523` assigns `this.lastRequest = xml` before invoking the HTTP client. Safe.
- `part.body instanceof Uint8Array` in Task 6 — `Buffer` inherits from `Uint8Array`, verified. Safe.
- The `localBaseUrl` rename in the async XML-strings rewrite doesn't shadow or alias the outer `baseUrl`. Safe.

No inconsistencies.
