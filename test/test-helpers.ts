import * as fs from 'node:fs';
import * as path from 'node:path';
import { HttpClient } from '../src/http.js';

interface MockResponse {
  status: number;
  statusCode: number;
  headers: Record<string, string>;
  data: string;
}

type RequestCallback = (err: NodeJS.ErrnoException | null, response?: MockResponse, body?: string) => void;

interface MockHttpClient {
  request(rurl: string, data: unknown, callback: RequestCallback, exheaders?: Record<string, string>, exoptions?: Record<string, unknown>): Promise<MockResponse> | ReturnType<HttpClient['request']>;
}

export function createMockHttpClient(baseDir?: string, realHttpClient?: HttpClient): MockHttpClient {
  // `baseDir` is retained for API compat (callers pass it via getTestOptions
  // and direct calls) but isn't needed inside the handler: toTestUrl() embeds
  // an absolute filesystem path in the URL, which we extract as-is.
  void baseDir;
  const _realClient = realHttpClient || new HttpClient();

  return {
    request(rurl, data, callback, exheaders, exoptions) {
      if (!rurl.startsWith('http://test-files/') && !rurl.startsWith('https://test-files/')) {
        return _realClient.request(rurl, data, callback, exheaders, exoptions);
      }

      let filePath = rurl.replace(/^https?:\/\/test-files/, '');
      filePath = path.normalize(filePath);

      // Single fs.readFile; callback and promise resolve off the same read,
      // matching the real HttpClient contract where the callback and the
      // returned promise both reflect one HTTP round-trip.
      const responsePromise = new Promise<MockResponse>((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, content) => {
          if (err) {
            callback(err);
            reject(err);
            return;
          }
          const response: MockResponse = {
            status: 200,
            statusCode: 200,
            headers: { 'content-type': 'application/xml' },
            data: content,
          };
          callback(null, response, content);
          resolve(response);
        });
      });

      // Callback is the primary error channel; swallow unattached rejections
      // so consumers that only use the callback don't surface as unhandled.
      // Mirrors the pattern in src/http.ts's request().
      responsePromise.catch(() => {
        /* handled by callback */
      });

      return responsePromise;
    },
  };
}

export function toTestUrl(filePath: string): string {
  const normalized = path.normalize(filePath);
  let urlPath = normalized.split(path.sep).join('/');
  if (/^[a-zA-Z]:/.test(urlPath)) {
    urlPath = '/' + urlPath;
  }
  return 'http://test-files' + urlPath;
}

// Monotonic port allocator for integration tests. Each test calling
// nextTestPort() gets a fresh port in the 15099+ range. Avoids EADDRINUSE
// when tests run sequentially without mocha --bail (since each test would
// otherwise reuse the same hardcoded port and collide when prior servers
// haven't fully closed).
let _testPortCounter = 15099;
export function nextTestPort(): number {
  return _testPortCounter++;
}

export function getTestOptions(baseDir: string, additionalOptions?: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {
    httpClient: createMockHttpClient(baseDir),
  };
  if (additionalOptions) {
    for (const key of Object.keys(additionalOptions)) {
      options[key] = additionalOptions[key];
    }
  }
  return options;
}
