'use strict';

var soap = require('..'),
  http = require('http'),
  assert = require('assert'),
  testHelpers = require('./test-helpers');

describe('testing adding header rely on completed xml', () => {
  let server = null;
  let hostname = '127.0.0.1';
  let port = 15099;
  let baseUrl = 'http://' + hostname + ':' + port;
  var mockHttpClient = testHelpers.createMockHttpClient(__dirname);
  const envelope =
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
    ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><Response>Hello</Response></soap:Body></soap:Envelope>';

  before(function (done) {
    server = http
      .createServer(function (req, res) {
        res.statusCode = 200;
        res.write(envelope, 'utf8');
        res.end();
      })
      .listen(port, hostname, done);
  });

  after(function (done) {
    server.close();
    server = null;
    done();
  });

  it('should add header to request, which created from xml before request', function (done) {
    // Create a custom mock HTTP client that captures headers
    var capturedHeaders = null;
    var customMockClient = {
      request: function (rurl, data, callback, exheaders, exoptions) {
        capturedHeaders = exheaders;
        var res = {
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
      testHelpers.toTestUrl(__dirname + '/wsdl/complex/registration-common.wsdl'),
      { httpClient: mockHttpClient },
      function (err, client) {
        if (err) {
          return void done(err);
        }
        assert.ok(client);

        const testHeaderKey = 'testHeader';
        let testHeaderValue;

        client.on('request', (xml) => {
          testHeaderValue = xml;
          client.addHttpHeader(testHeaderKey, xml);
        });

        // Replace httpClient with our custom mock for the actual SOAP call
        client.httpClient = customMockClient;

        client.registerUser('', function (err, result) {
          // Verify the header was added to the request
          assert.ok(capturedHeaders);
          assert.ok(capturedHeaders[testHeaderKey]);
          assert.equal(capturedHeaders[testHeaderKey], testHeaderValue);
          done();
        });
      },
      baseUrl,
    );
  });
});
