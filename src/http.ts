/*
 * Copyright (c) 2011 Vinay Pulim <vinay@milewise.com>
 * MIT Licensed
 */

import debugBuilder from 'debug';
import MIMEType from 'whatwg-mimetype';
import { IExOptions, IHeaders, IHttpClient, IOptions } from './types';
import { parseMTOMResp } from './utils';

const debug = debugBuilder('fetch-soap');
import { version } from '../package.json';

const textEncoder = new TextEncoder();

/**
 * Helper to concatenate multiple Uint8Arrays into one
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export interface IAttachment {
  name: string;
  contentId: string;
  mimetype: string;
  body: ReadableStream | NodeJS.ReadableStream;
}

/**
 * Response interface compatible with fetch Response
 */
export interface IHttpResponse {
  status: number;
  statusText: string;
  headers: Headers | Record<string, string>;
  data: any;
  /** Request headers that were sent */
  requestHeaders?: IHeaders;
  /** MTOM attachments parsed from multipart response */
  mtomResponseAttachments?: any;
}

/**
 * Internal request options for fetch
 */
interface IFetchRequestOptions {
  url: string;
  method: string;
  headers: IHeaders;
  body?: string | Uint8Array;
}

/**
 * A class representing the http client
 * @param {Object} [options] Options object. It allows the customization of
 * `request` module
 *
 * @constructor
 */
export class HttpClient implements IHttpClient {
  private options: IOptions;
  public customFetch?: typeof fetch;

  constructor(options?: IOptions) {
    options = options || {};
    this.options = options;
    // Allow custom fetch implementation for testing or special environments
    this.customFetch = options.fetch as typeof fetch;
  }

  /**
   * Build the HTTP request (method, uri, headers, ...)
   * @param {String} rurl The resource url
   * @param {Object|String} data The payload
   * @param {Object} exheaders Extra http headers
   * @param {Object} exoptions Extra options
   * @returns {Object} The http request object for fetch
   */
  public buildRequest(rurl: string, data: any, exheaders?: IHeaders, exoptions: IExOptions = {}): IFetchRequestOptions {
    const curl = new URL(rurl);
    const method = data ? 'POST' : 'GET';

    const host = curl.hostname;
    const port = parseInt(curl.port || '', 10);
    const headers: IHeaders = {
      'User-Agent': 'fetch-soap/' + version,
      'Accept': 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'none',
      'Accept-Charset': 'utf-8',
      ...(exoptions.forever && { Connection: 'keep-alive' }),
      'Host': host + (isNaN(port) ? '' : ':' + port),
    };
    const mergeOptions = ['headers'];

    const { attachments: _attachments, ...newExoptions } = exoptions;
    const attachments: IAttachment[] = _attachments || [];

    if (typeof data === 'string' && attachments.length === 0 && !exoptions.forceMTOM) {
      headers['Content-Length'] = String(new TextEncoder().encode(data).length);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    exheaders = exheaders || {};
    for (const attr in exheaders) {
      headers[attr] = exheaders[attr];
    }

    const options: IFetchRequestOptions = {
      url: curl.href,
      method: method,
      headers: headers,
    };

    if (exoptions.forceMTOM || attachments.length > 0) {
      const start = crypto.randomUUID();
      let action = null;
      if (headers['Content-Type'] && headers['Content-Type'].indexOf('action') > -1) {
        for (const ct of headers['Content-Type'].split('; ')) {
          if (ct.indexOf('action') > -1) {
            action = ct;
          }
        }
      }
      const boundary = crypto.randomUUID();
      headers['Content-Type'] = 'multipart/related; type="application/xop+xml"; start="<' + start + '>"; start-info="text/xml"; boundary=' + boundary;
      if (action) {
        headers['Content-Type'] = headers['Content-Type'] + '; ' + action;
      }
      const multipart: any[] = [
        {
          'Content-Type': 'application/xop+xml; charset=UTF-8; type="text/xml"',
          'Content-ID': '<' + start + '>',
          'body': data,
        },
      ];

      attachments.forEach((attachment) => {
        multipart.push({
          'Content-Type': attachment.mimetype,
          'Content-Transfer-Encoding': 'binary',
          'Content-ID': '<' + attachment.contentId + '>',
          'Content-Disposition': 'attachment; filename="' + attachment.name + '"',
          'body': attachment.body,
        });
      });
      const dataParts: Uint8Array[] = [textEncoder.encode(`--${boundary}\r\n`)];

      let multipartCount = 0;
      multipart.forEach((part) => {
        Object.keys(part).forEach((key) => {
          if (key !== 'body') {
            dataParts.push(textEncoder.encode(`${key}: ${part[key]}\r\n`));
          }
        });
        dataParts.push(
          textEncoder.encode('\r\n'),
          textEncoder.encode(part.body),
          textEncoder.encode(`\r\n--${boundary}${multipartCount === multipart.length - 1 ? '--' : ''}\r\n`),
        );
        multipartCount++;
      });
      options.body = concatUint8Arrays(dataParts);
    } else {
      options.body = data;
    }

    for (const attr in newExoptions) {
      if (mergeOptions.indexOf(attr) !== -1) {
        for (const header in exoptions[attr]) {
          options.headers[header] = exoptions[attr][header];
        }
      }
      // Skip options that are not relevant for fetch
    }
    debug('Http request: %j', options);
    return options;
  }

  /**
   * Handle the http response
   * @param {Object} body The http body
   * @returns {string} Processed body
   */
  public handleResponse(body: any): any {
    debug('Http response body: %j', body);
    if (typeof body === 'string') {
      // Remove any extra characters that appear before or after the SOAP envelope.
      const regex = /(?:<\?[^?]*\?>[\s]*)?<([^:]*):Envelope([\S\s]*)<\/\1:Envelope>/i;
      const match = body.replace(/<!--[\s\S]*?-->/, '').match(regex);
      if (match) {
        body = match[0];
      }
    }
    return body;
  }

  /**
   * Convert fetch Headers to plain object
   */
  private headersToObject(headers: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((value, key) => {
      obj[key.toLowerCase()] = value;
    });
    return obj;
  }

  public request(
    rurl: string,
    data: any,
    callback: (error: any, res?: IHttpResponse, body?: any) => any,
    exheaders?: IHeaders,
    exoptions?: IExOptions,
  ): Promise<IHttpResponse> {
    const options = this.buildRequest(rurl, data, exheaders, exoptions);
    const fetchFn = this.customFetch || fetch;

    // Check for NTLM - no longer supported
    if (exoptions !== undefined && exoptions.ntlm) {
      const error = new Error('NTLM authentication is not supported. NTLM requires Node.js-specific TCP socket handling.');
      queueMicrotask(() => callback(error));
      return Promise.reject(error);
    }

    const fetchOptions: RequestInit = {
      method: options.method,
      headers: options.headers,
      body: options.body as BodyInit,
    };

    // Add timeout support via AbortController
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    if (exoptions?.timeout) {
      timeoutId = setTimeout(() => controller.abort(), exoptions.timeout);
      fetchOptions.signal = controller.signal;
    }

    const responsePromise = fetchFn(options.url, fetchOptions)
      .then(async (response) => {
        if (timeoutId) clearTimeout(timeoutId);

        const headersObj = this.headersToObject(response.headers);

        // Determine how to read the response body
        let responseData: any;
        if (this.options.parseReponseAttachments) {
          responseData = await response.arrayBuffer();
        } else {
          responseData = await response.text();
        }

        const res: IHttpResponse = {
          status: response.status,
          statusText: response.statusText,
          headers: headersObj,
          data: responseData,
          requestHeaders: options.headers,
        };

        const handleBody = (body?: string) => {
          res.data = this.handleResponse(body !== undefined ? body : res.data);
          callback(null, res, res.data);
          return res;
        };

        if (this.options.parseReponseAttachments) {
          const contentType = headersObj['content-type'];
          const isMultipartResp = contentType && contentType.toLowerCase().indexOf('multipart/related') > -1;
          if (isMultipartResp) {
            let boundary;
            const parsedContentType = MIMEType.parse(contentType);
            if (parsedContentType) {
              boundary = parsedContentType.parameters.get('boundary');
            }
            if (!boundary) {
              const err = new Error('Missing boundary from content-type');
              callback(err);
              throw err;
            }
            return new Promise<IHttpResponse>((resolve, reject) => {
              parseMTOMResp(responseData, boundary, (err, multipartResponse) => {
                if (err) {
                  callback(err);
                  return reject(err);
                }
                // first part is the soap response
                const firstPart = multipartResponse.parts.shift();
                if (!firstPart || !firstPart.body) {
                  const parseErr = new Error('Cannot parse multipart response');
                  callback(parseErr);
                  return reject(parseErr);
                }
                res.mtomResponseAttachments = multipartResponse;
                const bodyStr = firstPart.body.toString(this.options.encoding || 'utf8');
                handleBody(bodyStr);
                resolve(res);
              });
            });
          } else {
            // Convert ArrayBuffer to string
            const decoder = new TextDecoder(this.options.encoding || 'utf-8');
            const bodyStr = decoder.decode(responseData);
            return handleBody(bodyStr);
          }
        } else {
          return handleBody();
        }
      })
      .catch((err) => {
        if (timeoutId) clearTimeout(timeoutId);
        callback(err);
        throw err;
      });

    return responsePromise;
  }

  public requestStream(
    rurl: string,
    data: any,
    exheaders?: IHeaders,
    exoptions?: IExOptions,
  ): Promise<IHttpResponse> {
    const options = this.buildRequest(rurl, data, exheaders, exoptions);
    const fetchFn = this.customFetch || fetch;

    const fetchOptions: RequestInit = {
      method: options.method,
      headers: options.headers,
      body: options.body as BodyInit,
    };

    return fetchFn(options.url, fetchOptions).then((response) => {
      const headersObj = this.headersToObject(response.headers);

      const res: IHttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: headersObj,
        data: response.body, // Return the ReadableStream directly
        requestHeaders: options.headers,
      };

      return res;
    });
  }
}
