'use strict';

var assert = require('assert');
var http = require('http');
var soap = require('../lib/soap');
var server;

describe('Preserve data encoding from endpoint response', function () {
  // Use inline WSDL to avoid needing mock httpClient
  var wsdl =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<definitions name="HelloService" targetNamespace="http://www.examples.com/wsdl/HelloService.wsdl" xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="http://www.examples.com/wsdl/HelloService.wsdl" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    '<message name="SayHelloRequest"><part name="firstName" type="xsd:string"/></message>' +
    '<message name="SayHelloResponse"><part name="greeting" type="xsd:string"/></message>' +
    '<portType name="Hello_PortType"><operation name="sayHello"><input message="tns:SayHelloRequest"/><output message="tns:SayHelloResponse"/></operation></portType>' +
    '<binding name="Hello_Binding" type="tns:Hello_PortType"><soap:binding style="rpc" transport="http://schemas.xmlsoap.org/soap/http"/><operation name="sayHello"><soap:operation soapAction="sayHello"/><input><soap:body encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" namespace="urn:examples:helloservice" use="encoded"/></input><output><soap:body encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" namespace="urn:examples:helloservice" use="encoded"/></output></operation></binding>' +
    '<service name="Hello_Service"><documentation>WSDL File for HelloService</documentation><port binding="tns:Hello_Binding" name="Hello_Port"><soap:address location="http://localhost:51515/SayHello/"/></port></service>' +
    '</definitions>';
  var expectedString = 'àáÁÉÈÀçãü';
  var xml = `<?xml version=\"1.0\" encoding=\"iso-8859-1\"?><soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"  xmlns:tns=\"http://www.examples.com/wsdl/HelloService.wsdl\"><soap:Body><tns:sayHelloResponse>${expectedString}</tns:sayHelloResponse></soap:Body></soap:Envelope>`;
  var xmlEncoded = Buffer.from(xml, 'binary');

  before(function (done) {
    server = http
      .createServer(function (req, res) {
        res.statusCode = 200;
        res.end(xmlEncoded);
      })
      .listen(51515, done);
  });

  after(function () {
    server.close();
  });

  it('Should read special characters with enconding option with success', function (done) {
    var url = 'http://' + server.address().address + ':' + server.address().port;

    if (server.address().address === '0.0.0.0' || server.address().address === '::') {
      url = 'http://127.0.0.1:' + server.address().port;
    }

    soap.createClient(
      wsdl,
      {
        endpoint: url,
        disableCache: true, // disable wsdl cache, otherwise 'mocha test/client-response-options-test.js test/response-preserve-whitespace-test.js' will fail.
        parseReponseAttachments: true,
        encoding: 'latin1',
      },
      function (err, client) {
        if (err) {
          console.log(err);
          throw err;
        }

        client.sayHello(
          {
            firstName: 'hello world',
          },
          function (err, result, rawResponse, soapHeader, rawRequest) {
            if (err) {
              console.log(err);
              throw err;
            }

            assert.strictEqual(expectedString, result);
            done();
          },
        );
      },
    );
  });

  it('Should read special characters with enconding option with error', function (done) {
    var url = 'http://' + server.address().address + ':' + server.address().port;

    if (server.address().address === '0.0.0.0' || server.address().address === '::') {
      url = 'http://127.0.0.1:' + server.address().port;
    }

    soap.createClient(
      wsdl,
      {
        endpoint: url,
        disableCache: true, // disable wsdl cache, otherwise 'mocha test/client-response-options-test.js test/response-preserve-whitespace-test.js' will fail.
        parseReponseAttachments: true,
      },
      function (err, client) {
        if (err) {
          console.log(err);
          throw err;
        }

        client.sayHello(
          {
            firstName: 'hello world',
          },
          function (err, result, rawResponse, soapHeader, rawRequest) {
            if (err) {
              console.log(err);
              throw err;
            }
            assert.strictEqual('���������', result);
            done();
          },
        );
      },
    );
  });
});
