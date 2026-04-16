import { describe, it, expect } from 'bun:test';
import { BasicAuthSecurity } from '../../src/security/index.js';

describe('BasicAuthSecurity', () => {
  const username = 'admin';
  const password = 'password1234';

  it('is a function', () => {
    expect(typeof BasicAuthSecurity).toBe('function');
  });

  describe('defaultOption param', () => {
    it('is accepted as the third param', () => {
      new BasicAuthSecurity(username, password, {});
    });

    it('Should have Authorization header when addHeaders is invoked', () => {
      const security = new BasicAuthSecurity(username, password, {});
      const headers: Record<string, string> = {};
      security.addHeaders(headers);
      expect(headers).toHaveProperty('Authorization');
    });

    it('is used in addOptions', () => {
      const options: Record<string, unknown> = {};
      const defaultOptions = { foo: 3 };
      const instance = new BasicAuthSecurity(username, password, defaultOptions);
      instance.addOptions(options);
      expect(options).toHaveProperty('foo', 3);
    });
  });
});
