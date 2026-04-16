import { describe, it, expect, beforeAll, afterAll, setSystemTime } from 'bun:test';
import { WSSecurity } from '../../src/security/index.js';

describe('WSSecurity', () => {
  beforeAll(() => {
    setSystemTime(new Date('2025-10-06T00:00:00Z'));
  });

  afterAll(() => {
    setSystemTime();
  });

  it('is a function', () => {
    expect(typeof WSSecurity).toBe('function');
  });

  it('should accept valid constructor variables', () => {
    const username = 'myUser';
    const password = 'myPass';
    const options = {
      passwordType: 'PasswordText',
      hasNonce: true,
      actor: 'urn:sample',
    };
    const instance = new WSSecurity(username, password, options);
    expect(instance).toHaveProperty('_username', username);
    expect(instance).toHaveProperty('_password', password);
    expect(instance).toHaveProperty('_passwordType', options.passwordType);
    expect(instance).toHaveProperty('_hasNonce', options.hasNonce);
    expect(instance).toHaveProperty('_actor', options.actor);
  });

  it('should accept passwordType as 3rd arg', () => {
    const username = 'myUser';
    const password = 'myPass';
    const passwordType = 'PasswordText';
    const instance = new WSSecurity(username, password, passwordType);
    expect(instance).toHaveProperty('_username', username);
    expect(instance).toHaveProperty('_password', password);
    expect(instance).toHaveProperty('_passwordType', passwordType);
    // These fields are declared but uninitialized in WSSecurity.ts. Under
    // modern class-fields semantics (Bun's default), they appear as own
    // properties with value undefined, whereas under legacy tsc compile
    // they were absent entirely. The test asserts the constructor didn't
    // explicitly set them, which is preserved by checking for undefined.
    expect((instance as any)._hasNonce).toBeUndefined();
    expect((instance as any)._actor).toBeUndefined();
  });

  it('should insert a WSSecurity when postProcess is called', () => {
    const username = 'my&User';
    const password = 'my&Pass';
    const options = {
      passwordType: 'PassWordText',
      hasNonce: false,
      actor: 'urn:sample',
    };
    const instance = new WSSecurity(username, password, options);
    const xml = instance.toXML();

    expect(xml).toBe(
      `<wsse:Security soap:actor="urn:sample" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">` +
        `<wsu:Timestamp wsu:Id="Timestamp-2025-10-06T00:00:00Z">` +
        `<wsu:Created>2025-10-06T00:00:00Z</wsu:Created>` +
        `<wsu:Expires>2025-10-06T00:10:00Z</wsu:Expires>` +
        `</wsu:Timestamp><wsse:UsernameToken xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" wsu:Id="SecurityToken-2025-10-06T00:00:00Z">` +
        `<wsse:Username>my&amp;User</wsse:Username>` +
        `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">my&amp;Pass</wsse:Password>` +
        `<wsu:Created>2025-10-06T00:00:00Z</wsu:Created>` +
        `</wsse:UsernameToken></wsse:Security>`,
    );
  });

  it('should add envelopeKey to properties in Security block', () => {
    const username = 'myUser';
    const password = 'myPass';
    const options = {
      hasTimeStamp: false,
      mustUnderstand: true,
      actor: 'urn:sample',
      envelopeKey: 'soapenv',
    };
    const instance = new WSSecurity(username, password, options);
    const xml = instance.toXML();
    expect(xml).toContain('<wsse:Security soapenv:actor="urn:sample" ');
    expect(xml).toContain('soapenv:mustUnderstand="1"');
  });

  it('should add appendElement when provided', () => {
    const username = 'myUser';
    const password = 'myPass';
    const options = {
      hasTimeStamp: false,
      appendElement: '<custom:MyCustomElement xmlns:custom="http://example.com/custom">foo</custom:MyCustomElement>',
    };
    const instance = new WSSecurity(username, password, options);
    const xml = instance.toXML();

    expect(xml).toBe(
      `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">` +
        `<wsse:UsernameToken xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" wsu:Id="SecurityToken-2025-10-06T00:00:00Z">` +
        `<wsse:Username>myUser</wsse:Username>` +
        `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">myPass</wsse:Password>` +
        `<wsu:Created>2025-10-06T00:00:00Z</wsu:Created>` +
        `</wsse:UsernameToken>` +
        `<custom:MyCustomElement xmlns:custom="http://example.com/custom">foo</custom:MyCustomElement>` +
        `</wsse:Security>`,
    );
  });
});
