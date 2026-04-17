import { describe, it } from 'bun:test';
import * as assert from 'node:assert';
import * as soap from '../src/soap.js';
import * as testHelpers from './test-helpers.js';

describe('SOAP Client', function () {
  it('should set WSDL options to those specified in createClient', function (done) {
    const options = testHelpers.getTestOptions(import.meta.dir, {
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

    const wsdlUrl = testHelpers.toTestUrl(import.meta.dir + '/wsdl/json_response.wsdl');
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
