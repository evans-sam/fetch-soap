import { describe, it } from 'bun:test';
import * as assert from 'node:assert';
import { trim } from '../src/wsdl/index.js';

function verify(input: string, expected: string) {
  const actual = trim(input);
  assert.strictEqual(actual, expected, `${actual} != ${expected}`);
}

describe('trim', () => {
  it('removes whitespace', () => {
    verify(' \n <> \n  ', '<>');
  });

  it('removes non breaking space', () => {
    verify('\xA0<>', '<>');
  });

  it('removes all', () => {
    verify('\xA0\n \t<\n\t\xA0>\t \n \xA0', '<\n\t\xA0>');
  });
});
