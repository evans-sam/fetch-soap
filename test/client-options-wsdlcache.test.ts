import { describe, it, beforeAll, beforeEach, afterEach, spyOn, type Mock } from 'bun:test';
import * as assert from 'node:assert';
import * as soap from '../src/soap.js';
import * as utils from '../src/utils.js';
import * as wsdl from '../src/wsdl/index.js';
import * as testHelpers from './test-helpers.js';

describe('SOAP Client - WSDL Cache', function () {
  let wsdlUrl: string;
  let mockHttpClient: ReturnType<typeof testHelpers.createMockHttpClient>;
  const spies: Array<Mock<(...args: any[]) => any>> = [];
  let openWsdlSpy: Mock<typeof wsdl.open_wsdl>;

  beforeAll(function () {
    wsdlUrl = testHelpers.toTestUrl(import.meta.dir + '/wsdl/Dummy.wsdl');
    mockHttpClient = testHelpers.createMockHttpClient(import.meta.dir);
  });

  beforeEach(function () {
    openWsdlSpy = spyOn(wsdl, 'open_wsdl');
    spies.push(openWsdlSpy as unknown as Mock<(...args: any[]) => any>);
  });

  afterEach(function () {
    while (spies.length) {
      const s = spies.pop();
      if (s) s.mockRestore();
    }
  });

  it('should use default cache if not provided', function (done) {
    // ensure cache is empty to prevent impacts to this case
    // if other test already loaded this WSDL
    utils.wsdlCacheSingleton.clear();

    const options = { httpClient: mockHttpClient };

    // cache miss. NB: Bun's spyOn intercepts internal recursive calls to
    // open_wsdl (for xsd imports from Dummy.wsdl), so one "fresh" createClient
    // resolves to 3 open_wsdl invocations (root + 2 nested includes). Sinon's
    // property replacement under CJS only caught the outer call (expected 1).
    // The cache-hit/miss ratio is what the test actually asserts.
    soap.createClient(wsdlUrl, options, function (err, clientFirstCall) {
      if (err) return done(err);
      const firstCount = openWsdlSpy.mock.calls.length;
      assert.ok(firstCount > 0, 'cache miss must call open_wsdl');

      // hits cache
      soap.createClient(wsdlUrl, options, function (err, clientSecondCall) {
        if (err) return done(err);
        assert.strictEqual(openWsdlSpy.mock.calls.length, firstCount);

        // disabled cache
        soap.createClient(wsdlUrl, { httpClient: mockHttpClient, disableCache: true }, function (err, clientSecondCall) {
          if (err) return done(err);
          assert.strictEqual(openWsdlSpy.mock.calls.length, firstCount * 2);
          done();
        });
      });
    });
  });

  it('should use the provided WSDL cache', function (done) {
    /** @type {IWSDLCache} */
    const dummyCache = {
      has: function () {},
      get: function () {},
      set: function () {},
    };
    const hasSpy = spyOn(dummyCache, 'has') as unknown as Mock<(...args: any[]) => any>;
    const getSpy = spyOn(dummyCache, 'get') as unknown as Mock<(...args: any[]) => any>;
    const setSpy = spyOn(dummyCache, 'set') as unknown as Mock<(...args: any[]) => any>;
    spies.push(hasSpy, getSpy, setSpy);
    hasSpy.mockReturnValue(false);
    const options = {
      httpClient: mockHttpClient,
      wsdlCache: dummyCache,
    };
    soap.createClient(wsdlUrl, options, function (err, clientFirstCall) {
      if (err) return done(err);
      assert.strictEqual(hasSpy.mock.calls.length, 1);
      assert.strictEqual(getSpy.mock.calls.length, 0);
      assert.strictEqual(setSpy.mock.calls.length, 1);
      // cache miss — Bun spyOn also sees recursive calls for nested includes,
      // so count is > 1 (vs. sinon's 1 under CJS). The ratio is what matters.
      const firstCount = openWsdlSpy.mock.calls.length;
      assert.ok(firstCount > 0, 'cache miss must call open_wsdl');

      const cacheEntry = setSpy.mock.calls[0];
      assert.deepStrictEqual(cacheEntry[0], wsdlUrl);

      const cachedWSDL = cacheEntry[1];
      assert.ok(cachedWSDL instanceof wsdl.WSDL);
      assert.deepStrictEqual(clientFirstCall.wsdl, cachedWSDL);

      // sandbox.reset() equivalent — clear call history, keep spies/impls in place
      openWsdlSpy.mockClear();
      hasSpy.mockClear();
      getSpy.mockClear();
      setSpy.mockClear();
      hasSpy.mockReturnValue(true);
      getSpy.mockReturnValue(cachedWSDL);

      soap.createClient(wsdlUrl, options, function (err, clientSecondCall) {
        if (err) return done(err);
        // hits cache
        assert.strictEqual(openWsdlSpy.mock.calls.length, 0);
        assert.strictEqual(hasSpy.mock.calls.length, 1);
        assert.strictEqual(getSpy.mock.calls.length, 1);
        assert.deepStrictEqual(getSpy.mock.calls[0], [wsdlUrl]);
        assert.strictEqual(setSpy.mock.calls.length, 0);
        assert.deepStrictEqual(clientSecondCall.wsdl, cachedWSDL);
        done();
      });
    });
  });
});
