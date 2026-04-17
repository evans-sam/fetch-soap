import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import * as assert from 'node:assert';
import * as jsdiff from 'diff';
import * as soap from '../src/soap.js';
import * as testHelpers from './test-helpers.js';

let server: http.Server;
let port: number;

function normalizeWhiteSpace(raw: string) {
  let normalized = raw.replace(/\r\n|\r|\n/g, ''); // strip line endings
  normalized = normalized.replace(/\s\s+/g, ' '); // convert whitespace to spaces
  normalized = normalized.replace(/> </g, '><'); // get rid of spaces between elements
  return normalized;
}

const requestContext: any = {
  //set these two within each test
  expectedRequest: null,
  responseToSend: null,
  doneHandler: null,
  requestHandler: function (req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: string[] = [];
    req.on('data', function (chunk) {
      // ignore eol on sample files.
      chunks.push(chunk.toString().replace(/\r?\n$/m, ''));
    });
    req.on('end', function () {
      if (!requestContext.expectedRequest) return res.end(requestContext.responseToSend);

      const actualRequest = normalizeWhiteSpace(chunks.join(''));
      const expectedRequest = normalizeWhiteSpace(requestContext.expectedRequest);

      if (actualRequest !== expectedRequest) {
        const diff = jsdiff.diffChars(actualRequest, expectedRequest);
        let comparison = '';
        diff.forEach(function (part: any) {
          let color = 'grey';
          if (part.added) {
            color = 'green';
          }
          if (part.removed) {
            color = 'red';
          }
          comparison += part.value[color];
        });
        console.log(comparison);
      }

      assert.equal(actualRequest, expectedRequest);

      if (!requestContext.responseToSend) return requestContext.doneHandler();
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

describe('SOAP Client schema does not change', () => {
  beforeAll(function (done) {
    server = http.createServer(requestContext.requestHandler);
    server.listen(0, function (e?: Error) {
      if (e) return done(e);
      port = (server.address() as { port: number }).port;
      done();
    });
  });

  afterAll(function (done) {
    server.close(() => done());
  });

  it('should not change the schema', (done) => {
    const tpath = path.join(import.meta.dir, 'request-response-samples', 'RetrieveFareQuoteDateRange__should_handle_child_namespaces');
    const wsdlPath = path.resolve(tpath, 'soap.wsdl');
    const requestJSON = require(path.resolve(tpath, 'request.json'));
    const requestXML = fs.readFileSync(path.resolve(tpath, 'request.xml'), { encoding: 'utf8' });
    const responseJSON = require(path.resolve(tpath, 'response.json'));
    const responseXML = fs.readFileSync(path.resolve(tpath, 'response.xml'), { encoding: 'utf8' });
    const methodName = 'RetrieveFareQuoteDateRange';

    requestContext.expectedRequest = requestXML;
    requestContext.responseToSend = responseXML;

    const wsdlUrl = testHelpers.toTestUrl(wsdlPath);
    const options = testHelpers.getTestOptions(import.meta.dir, { disableCache: true });

    soap.createClient(
      wsdlUrl,
      options,
      function (err, client) {
        if (err) {
          throw err;
        }
        //throw more meaningful error
        if (typeof client[methodName] !== 'function') {
          throw new Error('method ' + methodName + ' does not exists in wsdl specified in test wsdl: ' + wsdlPath);
        }
        const typeBefore = client?.wsdl?.definitions?.schemas?.['http://tempuri.org/Service/Request']?.complexTypes?.TransactionInfo?.children?.[0]?.children?.[2]?.$type;

        cbCaller(client, methodName, requestJSON, responseJSON, null, {}, null, done);

        const typeAfter = client?.wsdl?.definitions?.schemas?.['http://tempuri.org/Service/Request']?.complexTypes?.TransactionInfo?.children?.[0]?.children?.[2]?.$type;
        assert.equal(typeBefore, typeAfter);
      },
      'http://localhost:' + port + '/Message/Message.dll?Handler=Default',
    );
  });
});

function cbCaller(client: any, methodName: string, requestJSON: any, responseJSON: any, responseSoapHeaderJSON: any, options: any, attachmentParts: any, done: any) {
  client[methodName](
    requestJSON,
    function (err: any, json: any, body: any, soapHeader: any) {
      if (requestJSON) {
        if (err) {
          assert.notEqual('undefined: undefined', err.message);
          assert.deepEqual(err.root, responseJSON);
        } else {
          // assert.deepEqual(json, responseJSON);
          assert.deepEqual(json ?? null, responseJSON);
          if (responseSoapHeaderJSON) {
            assert.deepEqual(soapHeader, responseSoapHeaderJSON);
          }
          if (client.lastResponseAttachments) {
            assert.deepEqual(client.lastResponseAttachments.parts, attachmentParts);
          }
        }
      }
      done();
    },
    options,
  );
}
