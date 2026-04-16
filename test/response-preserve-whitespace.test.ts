'use strict';

var assert = require('assert');
var http = require('http');
var soap = require('../');
var server;

describe('Preserve whitespace', function () {
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

  before(function (done) {
    server = http
      .createServer(function (req, res) {
        res.statusCode = 200;
        res.end(
          '"<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"  xmlns:tns=\"http://www.examples.com/wsdl/HelloService.wsdl\"><soap:Body><tns:sayHelloResponse><tns:greeting> </tns:greeting></tns:sayHelloResponse></soap:Body></soap:Envelope>"',
        );
      })
      .listen(51515, done);
  });

  after(function () {
    server.close();
  });

  it('preserves leading and trailing whitespace when preserveWhitespace option is true', function (done) {
    var url = 'http://' + server.address().address + ':' + server.address().port;

    if (server.address().address === '0.0.0.0' || server.address().address === '::') {
      url = 'http://127.0.0.1:' + server.address().port;
    }

    soap.createClient(
      wsdl,
      {
        endpoint: url,
        disableCache: true, // disable wsdl cache, otherwise 'mocha test/client-response-options-test.js test/response-preserve-whitespace-test.js' will fail.
        preserveWhitespace: true,
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
            assert.equal(' ', result.greeting);
            done();
          },
        );
      },
    );
  });
});
