import { describe, it, expect } from 'bun:test';
import { BearerSecurity } from '../../src/security/index.js';

describe('BearerSecurity', () => {
  const token = 'token';

  it('is a function', () => {
    expect(typeof BearerSecurity).toBe('function');
  });

  describe('defaultOption param', () => {
    it('is accepted as the second param', () => {
      new BearerSecurity(token, {});
    });

    it('is used in addOptions', () => {
      const options: Record<string, unknown> = {};
      const defaultOptions = { foo: 2 };
      const instance = new BearerSecurity(token, defaultOptions);
      instance.addOptions(options);
      expect(options).toHaveProperty('foo', 2);
    });

    it('should return the authoriation header on calling addHeader', () => {
      const security = new BearerSecurity(token, {});
      const headers: Record<string, string> = {};
      security.addHeaders(headers);
      expect(headers).toHaveProperty('Authorization', 'Bearer token');
    });
  });
});
