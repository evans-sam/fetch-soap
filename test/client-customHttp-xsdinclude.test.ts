'use strict';

var fs = require('fs'),
  soap = require('..'),
  assert = require('assert'),
  httpClient = require('../lib/http.js').HttpClient;

it('should allow customization of httpClient, the wsdl file, and associated data download should pass through it', function (done) {
  // Load test files
  var wsdl = fs.readFileSync(__dirname + '/wsdl/xsdinclude/xsd_include_http.wsdl').toString('utf8');
  var xsd = fs.readFileSync(__dirname + '/wsdl/xsdinclude/types.xsd').toString('utf8');

  // Custom httpClient that uses mock responses for multiple URLs
  class MyHttpClient extends httpClient {
    constructor(options) {
      super(options);
      this.mockResponses = new Map();
    }

    setMockResponse(urlPattern, response) {
      this.mockResponses.set(urlPattern, response);
    }

    request(rurl, data, callback, exheaders, exoptions) {
      // Find matching mock response
      var mockResponse = null;
      for (var [pattern, response] of this.mockResponses) {
        if (rurl.includes(pattern)) {
          mockResponse = response;
          break;
        }
      }

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

  // Set up mock responses
  httpCustomClient.setMockResponse('?wsdl', wsdl);
  httpCustomClient.setMockResponse('?xsd', xsd);

  var url = 'http://localhost:50000/Dummy.asmx?wsdl';
  soap.createClient(url, { httpClient: httpCustomClient }, function (err, client) {
    assert.ifError(err);
    assert.ok(client);
    assert.equal(client.httpClient, httpCustomClient);
    var description = client.describe();
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
