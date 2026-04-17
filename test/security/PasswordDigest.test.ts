import { describe, it, expect } from 'bun:test';
import * as assert from 'node:assert';
import * as Utils from '../../src/utils.js';

describe('PasswordDigest', () => {
  const nonce = '2FW1CIo2ZUOJmSjVRcJZlQ==';
  const created = '2019-02-12T12:34:12.110Z';
  const password = 'vM3s1hKVMy6zBOn';
  const expected = 'wM9xjA92wCw+QcQI1urjZ6B8+LQ=';

  it('is a function', () => {
    expect(typeof Utils.passwordDigest).toBe('function');
  });

  it('should calculate a valid passworddigest ', async () => {
    const result = await Utils.passwordDigest(nonce, created, password);
    assert.equal(result, expected);
  });
});
