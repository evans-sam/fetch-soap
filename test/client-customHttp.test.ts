import { it } from 'bun:test';
import * as fs from 'node:fs';
import * as assert from 'node:assert';
import * as soap from '../src/soap.js';
import { HttpClient } from '../src/http.js';

it('should allow customization of httpClient and the wsdl file download should pass through it', function (done) {
  const wsdl = fs.readFileSync('./test/wsdl/default_namespace.wsdl').toString('utf8');
  let requestMade = false;

  // Custom httpClient that uses mock responses
  class MyHttpClient extends HttpClient {
    mockResponses: Map<string, string>;

    constructor(options: any) {
      super(options);
      this.mockResponses = new Map();
    }

    setMockResponse(url: string, response: string) {
      this.mockResponses.set(url, response);
    }

    request(rurl: string, data: any, callback: any, exheaders?: any, exoptions?: any): any {
      requestMade = true;
      const mockResponse = this.mockResponses.get(rurl);

      if (mockResponse) {
        const res = {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/xml' },
          data: mockResponse,
          requestHeaders: exheaders || {},
        };
        // Use queueMicrotask to simulate async response
        queueMicrotask(() => {
          callback(null, res, mockResponse);
        });
        return Promise.resolve(res);
      }

      // Fall back to actual fetch for unmocked URLs
      return super.request(rurl, data, callback, exheaders, exoptions);
    }
  }

  const httpCustomClient = new MyHttpClient({});
  const url = 'http://localhost:50000/Platform.asmx?wsdl';

  // Set up mock response for WSDL URL
  httpCustomClient.setMockResponse(url, wsdl);

  soap.createClient(url, { httpClient: httpCustomClient }, function (err, client) {
    assert.ifError(err);
    assert.ok(client);
    assert.ok(requestMade, 'Custom httpClient request method should have been called');
    assert.equal(client.httpClient, httpCustomClient);
    const description = client.describe();
    assert.deepEqual(description, {
      MyService: {
        MyServicePort: {
          MyOperation: {
            input: {},
            output: {},
          },
        },
      },
    });
    done();
  });
});
