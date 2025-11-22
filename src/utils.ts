import { IMTOMAttachments, IWSDLCache } from './types';
import { WSDL } from './wsdl';

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
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

export function parseMTOMResp(payload: Buffer, boundary: string, callback: (err?: Error, resp?: IMTOMAttachments) => void) {
  return import('formidable')
    .then(({ MultipartParser }) => {
      const resp: IMTOMAttachments = {
        parts: [],
      };
      let headerName = '';
      let headerValue = '';
      let data: Buffer;
      let partIndex = 0;
      const parser = new MultipartParser();

      parser.initWithBoundary(boundary);
      parser.on('data', ({ name, buffer, start, end }) => {
        switch (name) {
          case 'partBegin':
            resp.parts[partIndex] = {
              body: null,
              headers: {},
            };
            data = Buffer.from('');
            break;
          case 'headerField':
            headerName = buffer.slice(start, end).toString();
            break;
          case 'headerValue':
            headerValue = buffer.slice(start, end).toString();
            break;
          case 'headerEnd':
            resp.parts[partIndex].headers[headerName.toLowerCase()] = headerValue;
            break;
          case 'partData':
            data = Buffer.concat([data, buffer.slice(start, end)]);
            break;
          case 'partEnd':
            resp.parts[partIndex].body = data;
            partIndex++;
            break;
        }
      });

      parser.write(payload);

      return callback(null, resp);
    })
    .catch(callback);
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
