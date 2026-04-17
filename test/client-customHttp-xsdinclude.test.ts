import { it } from 'bun:test';
import * as fs from 'node:fs';
import * as assert from 'node:assert';
import * as soap from '../src/soap.js';
import { HttpClient } from '../src/http.js';

it('should allow customization of httpClient, the wsdl file, and associated data download should pass through it', function (done) {
  // Load test files
  const wsdl = fs.readFileSync(import.meta.dir + '/wsdl/xsdinclude/xsd_include_http.wsdl').toString('utf8');
  const xsd = fs.readFileSync(import.meta.dir + '/wsdl/xsdinclude/types.xsd').toString('utf8');

  // Custom httpClient that uses mock responses for multiple URLs
  class MyHttpClient extends HttpClient {
    mockResponses: Map<string, string>;

    constructor(options: any) {
      super(options);
      this.mockResponses = new Map();
    }

    setMockResponse(urlPattern: string, response: string) {
      this.mockResponses.set(urlPattern, response);
    }

    request(rurl: string, data: any, callback: any, exheaders?: any, exoptions?: any): any {
      // Find matching mock response
      let mockResponse: string | null = null;
      for (const [pattern, response] of this.mockResponses) {
        if (rurl.includes(pattern)) {
          mockResponse = response;
          break;
        }
      }

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

  // Set up mock responses
  httpCustomClient.setMockResponse('?wsdl', wsdl);
  httpCustomClient.setMockResponse('?xsd', xsd);

  const url = 'http://localhost:50000/Dummy.asmx?wsdl';
  soap.createClient(url, { httpClient: httpCustomClient }, function (err, client) {
    assert.ifError(err);
    assert.ok(client);
    assert.equal(client.httpClient, httpCustomClient);
    const description = client.describe();
    assert.deepEqual(description, {
      DummyService: {
        DummyPortType: {
          Dummy: {
            input: {
              ID: 'IdType|xs:string|pattern',
              Name: 'NameType|xs:string|minLength,maxLength',
            },
            output: {
              Result: 'dummy:DummyList',
            },
          },
        },
      },
    });
    done();
  });
});
