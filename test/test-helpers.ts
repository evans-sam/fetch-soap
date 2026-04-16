'use strict';

/**
 * Test helpers for fetch-soap tests.
 *
 * Provides a mock HTTP client that serves WSDL files from the local filesystem,
 * allowing tests to use URL-style paths while reading from disk.
 */

var fs = require('fs');
var path = require('path');

/**
 * Create a mock HTTP client that reads files from the filesystem.
 * This allows tests to use URLs that map to local file paths.
 *
 * @param {string} baseDir - Base directory for resolving relative paths
 * @returns {Object} Mock HTTP client compatible with fetch-soap
 */
function createMockHttpClient(baseDir, realHttpClient) {
  baseDir = baseDir || __dirname;
  // Get the real axios-based HTTP client for pass-through
  var HttpClient = require('../lib/http').HttpClient;
  var _realClient = realHttpClient || new HttpClient();

  return {
    request: function (rurl, data, callback, exheaders, exoptions) {
      // Only intercept test-files URLs, pass through others to real client
      if (!rurl.startsWith('http://test-files/') && !rurl.startsWith('https://test-files/')) {
        return _realClient.request(rurl, data, callback, exheaders, exoptions);
      }

      // Extract file path from URL - the path after host is the absolute file path
      var filePath = rurl.replace(/^https?:\/\/test-files/, '');

      // Normalize the path
      filePath = path.normalize(filePath);

      // Read the file
      fs.readFile(filePath, 'utf8', function (err, content) {
        if (err) {
          return callback(err);
        }

        // Create a mock response
        var response = {
          status: 200,
          statusCode: 200,
          headers: {
            'content-type': 'application/xml',
          },
          data: content,
        };

        callback(null, response, content);
      });

      // Return a mock promise for compatibility
      return {
        then: function (resolve, reject) {
          fs.readFile(filePath, 'utf8', function (err, content) {
            if (err) {
              if (reject) reject(err);
              return;
            }
            var response = {
              status: 200,
              statusCode: 200,
              headers: { 'content-type': 'application/xml' },
              data: content,
            };
            if (resolve) resolve(response);
          });
          return this;
        },
        catch: function (reject) {
          return this;
        },
      };
    },
  };
}

/**
 * Convert a local file path to a test URL.
 * The mock HTTP client will convert this back to a file path.
 *
 * @param {string} filePath - Local file path
 * @returns {string} URL that the mock client will handle
 */
function toTestUrl(filePath) {
  // Normalize path separators
  var normalized = path.normalize(filePath);

  // Always use http://test-files/ prefix which the mock client will intercept
  // and convert back to a file path
  var urlPath = normalized.split(path.sep).join('/');

  // Handle Windows drive letters
  if (/^[a-zA-Z]:/.test(urlPath)) {
    urlPath = '/' + urlPath;
  }

  return 'http://test-files' + urlPath;
}

/**
 * Get test options with mock HTTP client configured.
 *
 * @param {string} baseDir - Base directory for resolving paths
 * @param {Object} additionalOptions - Additional options to merge
 * @returns {Object} Options object with httpClient configured
 */
function getTestOptions(baseDir, additionalOptions) {
  var options = {
    httpClient: createMockHttpClient(baseDir),
  };

  if (additionalOptions) {
    Object.keys(additionalOptions).forEach(function (key) {
      options[key] = additionalOptions[key];
    });
  }

  return options;
}

module.exports = {
  createMockHttpClient: createMockHttpClient,
  toTestUrl: toTestUrl,
  getTestOptions: getTestOptions,
};
