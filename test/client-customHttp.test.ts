'use strict';

var fs = require('fs'),
  soap = require('..'),
  assert = require('assert'),
  httpClient = require('../lib/http.js').HttpClient,
  should = require('should');

it('should allow customization of httpClient and the wsdl file download should pass through it', function (done) {
  var wsdl = fs.readFileSync('./test/wsdl/default_namespace.wsdl').toString('utf8');
  var requestMade = false;

  // Custom httpClient that uses mock responses
  class MyHttpClient extends httpClient {
    constructor(options) {
      super(options);
      this.mockResponses = new Map();
    }

    setMockResponse(url, response) {
      this.mockResponses.set(url, response);
    }

    request(rurl, data, callback, exheaders, exoptions) {
      requestMade = true;
      var mockResponse = this.mockResponses.get(rurl);

      if (mockResponse) {
        var res = {
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

  var httpCustomClient = new MyHttpClient({});
  var url = 'http://localhost:50000/Platform.asmx?wsdl';

  // Set up mock response for WSDL URL
  httpCustomClient.setMockResponse(url, wsdl);

  soap.createClient(url, { httpClient: httpCustomClient }, function (err, client) {
    assert.ifError(err);
    assert.ok(client);
    assert.ok(requestMade, 'Custom httpClient request method should have been called');
    assert.equal(client.httpClient, httpCustomClient);
    var description = client.describe();
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
