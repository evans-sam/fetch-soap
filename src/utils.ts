import { IMTOMAttachments, IWSDLCache } from './types';
import { WSDL } from './wsdl';

/**
 * Simple assertion function (replaces Node.js assert module)
 * Throws an error if the condition is falsy
 */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Helper to convert a base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper to convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Encode a string to base64 (UTF-8 safe)
 * Handles non-ASCII characters correctly by encoding to UTF-8 first
 */
export function stringToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ArrayToBase64(bytes);
}

/**
 * Generate a random nonce using Web Crypto API
 * Returns a base64-encoded 16-byte random value
 */
export function generateNonce(): string {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  return uint8ArrayToBase64(nonceBytes);
}

/**
 * Compute WS-Security password digest using Web Crypto API
 * digest = base64 ( sha1 ( nonce + created + password ) )
 */
export async function passwordDigest(nonce: string, created: string, password: string): Promise<string> {
  const NonceBytes = base64ToUint8Array(nonce || '');
  const CreatedBytes = new TextEncoder().encode(created || '');
  const PasswordBytes = new TextEncoder().encode(password || '');

  // Concatenate all bytes
  const FullBytes = new Uint8Array(NonceBytes.length + CreatedBytes.length + PasswordBytes.length);
  FullBytes.set(NonceBytes, 0);
  FullBytes.set(CreatedBytes, NonceBytes.length);
  FullBytes.set(PasswordBytes, NonceBytes.length + CreatedBytes.length);

  // Compute SHA-1 digest
  const hashBuffer = await crypto.subtle.digest('SHA-1', FullBytes);
  return uint8ArrayToBase64(new Uint8Array(hashBuffer));
}

export const TNS_PREFIX = '__tns__'; // Prefix for targetNamespace

/**
 * Find a key from an object based on the value
 * @param {Object} xmlnsMapping prefix/uri mapping
 * @param {*} nsURI value
 * @returns {String} The matching key
 */
export function findPrefix(xmlnsMapping, nsURI) {
  for (const n in xmlnsMapping) {
    if (n === TNS_PREFIX) {
      continue;
    }
    if (xmlnsMapping[n] === nsURI) {
      return n;
    }
  }
}

export function splitQName<T>(nsName: T) {
  if (typeof nsName !== 'string') {
    return {
      prefix: TNS_PREFIX,
      name: nsName,
    };
  }

  const [topLevelName] = nsName.split('|', 1);

  const prefixOffset = topLevelName.indexOf(':');

  return {
    prefix: topLevelName.substring(0, prefixOffset) || TNS_PREFIX,
    name: topLevelName.substring(prefixOffset + 1),
  };
}

export function xmlEscape(obj) {
  if (typeof obj === 'string') {
    if (obj.substr(0, 9) === '<![CDATA[' && obj.substr(-3) === ']]>') {
      return obj;
    }
    return obj.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  return obj;
}

/**
 * Find the index of a pattern in a Uint8Array
 */
function indexOfPattern(data: Uint8Array, pattern: Uint8Array, startIndex = 0): number {
  for (let i = startIndex; i <= data.length - pattern.length; i++) {
    let found = true;
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse MIME multipart response without formidable (browser-compatible)
 * @param payload The response body as ArrayBuffer or Uint8Array
 * @param boundary The multipart boundary string
 * @param callback Callback with parsed attachments
 */
export function parseMTOMResp(payload: ArrayBuffer | Uint8Array, boundary: string, callback: (err?: Error, resp?: IMTOMAttachments) => void) {
  try {
    const data = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    const textDecoder = new TextDecoder('utf-8');
    const resp: IMTOMAttachments = { parts: [] };

    // The boundary delimiter is: CRLF + "--" + boundary
    // But the first boundary may not have a leading CRLF
    const boundaryBytes = new TextEncoder().encode('--' + boundary);
    const doubleCrlfBytes = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]); // \r\n\r\n

    // Find the first boundary
    let pos = indexOfPattern(data, boundaryBytes, 0);
    if (pos === -1) {
      return callback(new Error('Could not find initial boundary'));
    }

    // Move past the boundary and CRLF
    pos += boundaryBytes.length;
    if (data[pos] === 0x0d && data[pos + 1] === 0x0a) {
      pos += 2; // skip CRLF after boundary
    }

    while (pos < data.length) {
      // Check for end boundary (--boundary--)
      if (data[pos] === 0x2d && data[pos + 1] === 0x2d) {
        break; // End of multipart
      }

      // Find the end of headers (double CRLF)
      const headersEnd = indexOfPattern(data, doubleCrlfBytes, pos);
      if (headersEnd === -1) {
        return callback(new Error('Could not find end of headers'));
      }

      // Parse headers
      const headersData = data.slice(pos, headersEnd);
      const headersText = textDecoder.decode(headersData);
      const headers: { [key: string]: string } = {};

      for (const line of headersText.split('\r\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const name = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          headers[name] = value;
        }
      }

      // Move past headers and double CRLF
      const bodyStart = headersEnd + doubleCrlfBytes.length;

      // Find the next boundary
      const nextBoundaryPos = indexOfPattern(data, boundaryBytes, bodyStart);
      let bodyEnd: number;

      if (nextBoundaryPos === -1) {
        // No more boundaries, take rest as body
        bodyEnd = data.length;
      } else {
        // Body ends before the CRLF that precedes the boundary
        bodyEnd = nextBoundaryPos;
        // Remove trailing CRLF before boundary if present
        if (bodyEnd >= 2 && data[bodyEnd - 2] === 0x0d && data[bodyEnd - 1] === 0x0a) {
          bodyEnd -= 2;
        }
      }

      // Extract body
      const body = data.slice(bodyStart, bodyEnd);
      resp.parts.push({ body, headers });

      // Move to next part
      if (nextBoundaryPos === -1) {
        break;
      }
      pos = nextBoundaryPos + boundaryBytes.length;

      // Skip CRLF after boundary or check for end marker (--)
      if (data[pos] === 0x2d && data[pos + 1] === 0x2d) {
        break; // End of multipart
      }
      if (data[pos] === 0x0d && data[pos + 1] === 0x0a) {
        pos += 2;
      }
    }

    callback(undefined, resp);
  } catch (err) {
    callback(err instanceof Error ? err : new Error(String(err)));
  }
}

class DefaultWSDLCache implements IWSDLCache {
  private cache: {
    [key: string]: WSDL;
  };
  constructor() {
    this.cache = {};
  }

  public has(key: string): boolean {
    return !!this.cache[key];
  }

  public get(key: string): WSDL {
    return this.cache[key];
  }

  public set(key: string, wsdl: WSDL) {
    this.cache[key] = wsdl;
  }

  public clear() {
    this.cache = {};
  }
}
export const wsdlCacheSingleton = new DefaultWSDLCache();
