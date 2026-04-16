import { describe, it, beforeAll, beforeEach, afterAll, setSystemTime } from 'bun:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { globSync } from 'glob';
import * as jsdiff from 'diff';
import 'colors';
import * as soap from '../src/soap.js';
import { WSSecurity } from '../src/security/index.js';
import * as testHelpers from './test-helpers.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const mockHttpClient = testHelpers.createMockHttpClient(import.meta.dir);
let server: http.Server;
let port: number;
const tests = globSync('./request-response-samples/*', { cwd: import.meta.dir })
  .map(function (node) {
    return path.resolve(import.meta.dir, node);
  })
  .filter(function (node) {
    return fs.statSync(node).isDirectory();
  });
const suite: Record<string, (done: (err?: unknown) => void) => void> = {};

function normalizeWhiteSpace(raw: string): string {
  let normalized = raw.replace(/\r\n|\r|\n/g, ''); // strip line endings
  normalized = normalized.replace(/\s\s+/g, ' '); // convert whitespace to spaces
  normalized = normalized.replace(/> </g, '><'); // get rid of spaces between elements
  return normalized;
}

interface RequestContext {
  expectedRequest: string | null;
  responseToSend: string | null;
  doneHandler: ((err?: unknown) => void) | null;
  responseHttpHeaders?: Record<string, string> | null;
  requestHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
}

const requestContext: RequestContext = {
  //set these two within each test
  expectedRequest: null,
  responseToSend: null,
  doneHandler: null,
  requestHandler: function (req, res) {
    const chunks: string[] = [];
    req.on('data', function (chunk) {
      // ignore eol on sample files.
      chunks.push(chunk.toString().replace(/\r?\n$/m, ''));
    });
    req.on('end', function () {
      if (!requestContext.expectedRequest) return res.end(requestContext.responseToSend ?? undefined);

      const actualRequest = normalizeWhiteSpace(chunks.join(''));
      const expectedRequest = normalizeWhiteSpace(requestContext.expectedRequest);

      if (actualRequest !== expectedRequest) {
        const diff = jsdiff.diffChars(actualRequest, expectedRequest);
        let comparison = '';
        diff.forEach(function (part) {
          let color: 'grey' | 'green' | 'red' = 'grey';
          if (part.added) {
            color = 'green';
          }
          if (part.removed) {
            color = 'red';
          }
          comparison += (part.value as unknown as Record<string, string>)[color];
        });
        console.log(comparison);
      }

      assert.equal(actualRequest, expectedRequest);

      if (!requestContext.responseToSend) return requestContext.doneHandler?.();
      if (requestContext.responseHttpHeaders) {
        for (const headerKey in requestContext.responseHttpHeaders) {
          res.setHeader(headerKey, requestContext.responseHttpHeaders[headerKey]);
        }
      }
      res.end(requestContext.responseToSend);

      requestContext.expectedRequest = null;
      requestContext.responseToSend = null;
    });
  },
};

tests.forEach(function (test) {
  const nameParts = path.basename(test).split('__');
  let name = nameParts[1].replace(/_/g, ' ');
  const methodName = nameParts[0];
  const wsdl = path.resolve(test, 'soap.wsdl');
  const headerJSONPath = path.resolve(test, 'header.json');
  const securityJSONPath = path.resolve(test, 'security.json');
  const requestJSONPath = path.resolve(test, 'request.json');
  const requestXMLPath = path.resolve(test, 'request.xml');
  const responseJSONPath = path.resolve(test, 'response.json');
  const responseSoapHeaderJSONPath = path.resolve(test, 'responseSoapHeader.json');
  const responseJSONErrorPath = path.resolve(test, 'error_response.json');
  const responseXMLPath = path.resolve(test, 'response.xml');
  const optionsPath = path.resolve(test, 'options.json');
  const wsdlOptionsFile = path.resolve(test, 'wsdl_options.json');
  const wsdlJSOptionsFile = path.resolve(test, 'wsdl_options.js');
  const responseHttpHeadersPath = path.resolve(test, 'responseHttpHeader.json');
  const attachmentPartsPath = path.resolve(test, 'attachmentParts.js');
  let wsdlOptions: Record<string, unknown> = {};

  //headerJSON is optional
  let headerJSON: Record<string, unknown> = {};
  if (fs.existsSync(headerJSONPath)) headerJSON = require(headerJSONPath);

  //securityJSON is optional
  let securityJSON: { type?: string; username?: string; password?: string; options?: unknown } = {};
  if (fs.existsSync(securityJSONPath)) securityJSON = require(securityJSONPath);

  //responseJSON is optional
  let responseJSON: unknown = null;
  if (fs.existsSync(responseJSONPath)) responseJSON = require(responseJSONPath);
  else if (fs.existsSync(responseJSONErrorPath)) responseJSON = require(responseJSONErrorPath);

  //responseSoapHeaderJSON is optional
  let responseSoapHeaderJSON: unknown = null;
  if (fs.existsSync(responseSoapHeaderJSONPath)) responseSoapHeaderJSON = require(responseSoapHeaderJSONPath);

  //requestXML is optional
  let requestXML: string | null = null;
  if (fs.existsSync(requestXMLPath)) requestXML = '' + fs.readFileSync(requestXMLPath);

  //responseXML is optional
  let responseXML: string | null = null;
  if (fs.existsSync(responseXMLPath)) responseXML = '' + fs.readFileSync(responseXMLPath);

  //requestJSON is required as node-soap will expect a request object anyway
  const requestJSON: unknown = require(requestJSONPath);

  //options is optional
  let options: Record<string, unknown> = {};
  if (fs.existsSync(optionsPath)) options = require(optionsPath);

  //wsdlOptions is optional
  if (fs.existsSync(wsdlOptionsFile)) wsdlOptions = require(wsdlOptionsFile);
  else if (fs.existsSync(wsdlJSOptionsFile)) wsdlOptions = require(wsdlJSOptionsFile);

  //responseHttpHeaders
  let responseHttpHeaders: Record<string, string> | null = null;
  if (fs.existsSync(responseHttpHeadersPath)) responseHttpHeaders = require(responseHttpHeadersPath);

  //attachmentParts
  let attachmentParts: unknown = null;
  if (fs.existsSync(attachmentPartsPath)) attachmentParts = require(attachmentPartsPath);

  generateTest(name, methodName, wsdl, headerJSON, securityJSON, requestXML, requestJSON, responseXML, responseJSON, responseSoapHeaderJSON, wsdlOptions, options, responseHttpHeaders, attachmentParts, false);
  generateTest(name, methodName, wsdl, headerJSON, securityJSON, requestXML, requestJSON, responseXML, responseJSON, responseSoapHeaderJSON, wsdlOptions, options, responseHttpHeaders, attachmentParts, true);
});

function generateTest(
  name: string,
  methodName: string,
  wsdlPath: string,
  headerJSON: Record<string, unknown>,
  securityJSON: { type?: string; username?: string; password?: string; options?: unknown },
  requestXML: string | null,
  requestJSON: unknown,
  responseXML: string | null,
  responseJSON: unknown,
  responseSoapHeaderJSON: unknown,
  wsdlOptions: Record<string, unknown>,
  options: Record<string, unknown>,
  responseHttpHeaders: Record<string, string> | null,
  attachmentParts: unknown,
  usePromises: boolean,
): void {
  let methodCaller = cbCaller;
  let localMethodName = methodName;
  let localName = name;

  if (usePromises) {
    localName += ' (promisified)';
    localMethodName += 'Async';
    methodCaller = promiseCaller;
  }

  suite[localName] = function (done) {
    let localRequestXML = requestXML;
    let localResponseXML = responseXML;
    if (localRequestXML) {
      // Override the expect request's keys to match
      if (wsdlOptions.overrideElementKey) {
        localRequestXML = localRequestXML.replace(/:Commande/g, ':Order');
        localRequestXML = localRequestXML.replace(/:Nom/g, ':Name');
      }
      requestContext.expectedRequest = localRequestXML;
    }

    if (localResponseXML) {
      if (wsdlOptions.parseReponseAttachments) {
        //all LF to CRLF
        localResponseXML = localResponseXML.replace(/\r\n/g, '\n');
        localResponseXML = localResponseXML.replace(/\n/g, '\r\n');
      }
      // Override the expect request's keys to match
      if (wsdlOptions.overrideElementKey) {
        localResponseXML = localResponseXML.replace(/SillyResponse/g, 'DummyResponse');
      }
      requestContext.responseToSend = localResponseXML;
    }
    requestContext.doneHandler = done;
    requestContext.responseHttpHeaders = responseHttpHeaders;
    // Add mockHttpClient to options for WSDL loading
    const opts = Object.assign({}, wsdlOptions, { httpClient: mockHttpClient });
    soap.createClient(
      testHelpers.toTestUrl(wsdlPath),
      opts,
      function (err: unknown, client: any) {
        if (headerJSON) {
          for (const headerKey in headerJSON) {
            client.addSoapHeader(headerJSON[headerKey], headerKey);
          }
        }
        if (securityJSON && securityJSON.type === 'ws') {
          client.setSecurity(new WSSecurity(securityJSON.username!, securityJSON.password!, securityJSON.options as any));
        }

        //throw more meaningful error
        if (typeof client[localMethodName] !== 'function') {
          throw new Error('method ' + localMethodName + ' does not exists in wsdl specified in test wsdl: ' + wsdlPath);
        }

        methodCaller(client, localMethodName, requestJSON, responseJSON, responseSoapHeaderJSON, options, attachmentParts, done);
      },
      'http://localhost:' + port + '/Message/Message.dll?Handler=Default',
    );
  };
}

function cbCaller(
  client: any,
  methodName: string,
  requestJSON: unknown,
  responseJSON: unknown,
  responseSoapHeaderJSON: unknown,
  options: Record<string, unknown>,
  attachmentParts: unknown,
  done: (err?: unknown) => void,
): void {
  client[methodName](
    requestJSON,
    function (err: any, json: unknown, body: unknown, soapHeader: unknown) {
      try {
        if (requestJSON) {
          if (err) {
            assert.notEqual('undefined: undefined', err.message);
            assert.deepEqual(err.root, responseJSON);
          } else {
            // assert.deepEqual(json, responseJSON);
            assert.equal(JSON.stringify(typeof json === 'undefined' ? null : json), JSON.stringify(responseJSON));
            if (responseSoapHeaderJSON) {
              assert.equal(JSON.stringify(soapHeader), JSON.stringify(responseSoapHeaderJSON));
            }
            if (client.lastResponseAttachments) {
              assert.deepEqual(client.lastResponseAttachments.parts, attachmentParts);
            }
          }
        }
      } catch (err) {
        done(err);
        throw err;
      }
      done();
    },
    options,
  );
}

function promiseCaller(
  client: any,
  methodName: string,
  requestJSON: unknown,
  responseJSON: unknown,
  responseSoapHeaderJSON: unknown,
  options: Record<string, unknown>,
  attachmentParts: unknown,
  done: (err?: unknown) => void,
): void {
  client[methodName](requestJSON)
    .then(function (responseArr: unknown[]) {
      const json = responseArr[0];
      const soapHeader = responseArr[2];

      if (requestJSON) {
        // assert.deepEqual(json, responseJSON);
        assert.equal(JSON.stringify(typeof json === 'undefined' ? null : json), JSON.stringify(responseJSON));
        if (responseSoapHeaderJSON) {
          assert.equal(JSON.stringify(soapHeader), JSON.stringify(responseSoapHeaderJSON));
        }
        if (client.lastResponseAttachments) {
          assert.deepEqual(client.lastResponseAttachments.parts, attachmentParts);
        }
      }
    })
    .catch(function (err: any) {
      if (requestJSON) {
        assert.notEqual('undefined: undefined', err.message);
        assert.deepEqual(err.root, responseJSON);
      }
    })
    .finally(function () {
      done();
    });
}

describe('Request Response Sampling', function () {
  const origRandom = Math.random;

  beforeAll(function (done) {
    setSystemTime(new Date('2014-10-12T01:02:03Z'));
    Math.random = function () {
      return 1;
    };
    server = http.createServer(requestContext.requestHandler);
    server.listen(0, function (e?: Error) {
      if (e) return done(e);
      const address = server.address();
      if (address && typeof address !== 'string') {
        port = address.port;
      }
      done();
    });
  });

  beforeEach(function () {
    requestContext.expectedRequest = null;
    requestContext.responseToSend = null;
    requestContext.doneHandler = null;
  });

  afterAll(function () {
    setSystemTime();
    Math.random = origRandom;
    server.close();
  });

  Object.keys(suite).map(function (key) {
    it(key, suite[key]);
  });
});
