'use strict';

var soap = require('..'),
  assert = require('assert'),
  testHelpers = require('./test-helpers');

describe('SOAP Client', function () {
  it('should set WSDL options to those specified in createClient', function (done) {
    var options = testHelpers.getTestOptions(__dirname, {
      ignoredNamespaces: {
        namespaces: ['ignoreThisNS'],
        override: true,
      },
      overrideRootElement: {
        namespace: 'tns',
      },
      overridePromiseSuffix: 'Test',
      namespaceArrayElements: true,
    });

    var wsdlUrl = testHelpers.toTestUrl(__dirname + '/wsdl/json_response.wsdl');
    soap.createClient(wsdlUrl, options, function (err, client) {
      assert.ok(client);
      assert.ifError(err);

      assert.ok(client.wsdl.options.ignoredNamespaces[0] === 'ignoreThisNS');
      assert.ok(client.wsdl.options.overrideRootElement.namespace === 'tns');
      assert.ok(typeof client.MyOperationTest === 'function');
      assert.ok(client.wsdl.options.namespaceArrayElements === true);
      done();
    });
  });
});
