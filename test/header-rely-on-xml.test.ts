import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as http from 'node:http';
import * as assert from 'node:assert';
import * as soap from '../src/soap.js';
import * as testHelpers from './test-helpers.js';

describe('testing adding header rely on completed xml', () => {
  let server: http.Server | null = null;
  const hostname = '127.0.0.1';
  const port = 15099;
  const baseUrl = 'http://' + hostname + ':' + port;
  const mockHttpClient = testHelpers.createMockHttpClient(import.meta.dir);
  const envelope =
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
    ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><Response>Hello</Response></soap:Body></soap:Envelope>';

  beforeAll(function (done) {
    server = http
      .createServer(function (req, res) {
        res.statusCode = 200;
        res.write(envelope, 'utf8');
        res.end();
      })
      .listen(port, hostname, done);
  });

  afterAll(function (done) {
    server?.close();
    server = null;
    done();
  });

  it('should add header to request, which created from xml before request', function (done) {
    // Create a custom mock HTTP client that captures headers
    let capturedHeaders: Record<string, string> | null = null;
    const customMockClient = {
      request: function (rurl: string, data: unknown, callback: any, exheaders?: Record<string, string>, exoptions?: Record<string, unknown>) {
        capturedHeaders = exheaders ?? null;
        const res = {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/xml' },
          data: envelope,
          requestHeaders: exheaders || {},
        };
        queueMicrotask(() => callback(null, res, res.data));
        return Promise.resolve(res);
      },
    };

    soap.createClient(
      testHelpers.toTestUrl(import.meta.dir + '/wsdl/complex/registration-common.wsdl'),
      { httpClient: mockHttpClient },
      function (err, client) {
        if (err) {
          return void done(err);
        }
        assert.ok(client);

        const testHeaderKey = 'testHeader';
        let testHeaderValue: string | undefined;

        client.on('request', (xml: string) => {
          testHeaderValue = xml;
          client.addHttpHeader(testHeaderKey, xml);
        });

        // Replace httpClient with our custom mock for the actual SOAP call
        (client as any).httpClient = customMockClient;

        (client as any).registerUser('', function (err: any, result: any) {
          // Verify the header was added to the request
          assert.ok(capturedHeaders);
          assert.ok(capturedHeaders![testHeaderKey]);
          assert.equal(capturedHeaders![testHeaderKey], testHeaderValue);
          done();
        });
      },
      baseUrl,
    );
  });
});
