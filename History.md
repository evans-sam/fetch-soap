# fetch-soap Changelog

This project is a fork of [node-soap](https://github.com/vpulim/node-soap) v1.6.0.

---

# 1.0.1 / 2025-11-22

- [FIX] Fix bundler compatibility issue with JSON import from package.json

# 1.0.0 / 2025-11-22

Initial release of fetch-soap, a universal SOAP client using the Fetch API.

### Breaking Changes from node-soap

- **Removed server functionality** - Server-side SOAP hosting has been removed to support universal runtimes
- **Removed Node.js-specific security classes** - `ClientSSLSecurity`, `ClientSSLSecurityPFX`, `NTLMSecurity`, `WSSecurityCert`, `WSSecurityCertWithToken`, and `WSSecurityPlusCert` have been removed
- **ES Modules only** - Package is now ESM-only (`"type": "module"`)
- **Node.js 18+ required** - Minimum Node.js version increased to 18.0.0

### New Features

- **Fetch API support** - Replace Axios with native Fetch API for universal compatibility
- **Custom fetch implementation** - Pass your own fetch function via `httpClient` option
- **Browser and edge runtime support** - Works in browsers, Cloudflare Workers, Vercel Edge, Deno, and Node.js
- **ES Module exports** - Proper ESM exports with subpath exports for `security`, `client`, `wsdl`, `http`, and `types`

### Changes

- Refactored `HttpClient` to use Fetch API instead of Axios
- Refactored MTOM response parsing to use `Uint8Array` for binary data handling
- Refactored `BasicAuthSecurity` to use `stringToBase64` helper for encoding
- Refactored security XML handling to support async operations
- Replaced `uuid` with `crypto.randomUUID()` for UUID generation
- Replaced `assert` module with custom assertion function for universal compatibility
- Updated stream handling in client with error handling and lock release
- Added `eventemitter3` as a dependency for universal event emitter support

---

## Forked from node-soap v1.6.0

The following is the history from node-soap up to the fork point. For the complete node-soap history, see the [node-soap repository](https://github.com/vpulim/node-soap/blob/master/History.md).

---

# Pre-fork History (node-soap)

## 1.6.0 / 2025-10-25 (node-soap)

- [ENHANCEMENT] Add support for multi-service and multi-port binding WSDL files (#1337)
- [ENHANCEMENT] Add new 'addElement' option to WSSE Security that adds custom xml to <wsse> element (#1362)
- [MAINTENANCE] Bump actions/setup-node from 4 to 5 (#1358)
- [MAINTENANCE] Update dependencies (#1372)
- [DOC] Fix typos in Readme (#1374)

## 1.5.0 / 2025-10-07 (node-soap)

- [ENHANCEMENT] Handle different namespace prefix for the same namespace, requires to set new option `forceUseSchemaXmlns` (#1365)
- [ENHANCEMENT] Adding custom envelope key option for server and client header fix (#1208, #1170, #1330)
- [MAINTENANCE] Bump eslint to 9.36.0 (#1361)
- [MAINTENANCE] Bump mocha from 11.7.1 to 11.7.2 (#1354)
- [MAINTENANCE] Add prettier as a default formatter (#1353)

For earlier node-soap history, see: https://github.com/vpulim/node-soap/blob/master/History.md
