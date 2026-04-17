<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [fetch-soap](#fetch-soap)
  - [Features](#features)
  - [What's Different from node-soap](#whats-different-from-node-soap)
  - [Installation](#installation)
  - [Basic Usage](#basic-usage)
  - [API Documentation](#api-documentation)
    - [Creating a Client](#creating-a-client)
    - [Calling Methods](#calling-methods)
    - [Security](#security)
  - [Migration from node-soap](#migration-from-node-soap)
  - [Contributing](#contributing)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# fetch-soap

A universal SOAP client using the Fetch API - works in browsers, edge runtimes (Cloudflare Workers, Vercel Edge, Deno), and Node.js.

> **Note:** This project is a fork of [node-soap](https://github.com/vpulim/node-soap) v1.6.0, refactored to use the Fetch API instead of Node.js-specific dependencies. It provides a truly universal SOAP client that works anywhere JavaScript runs.

## Features

- **Universal**: Works in browsers, edge runtimes (Cloudflare Workers, Vercel Edge, Deno), and Node.js
- **Modern**: Uses the Fetch API and ES modules
- **Minimal dependencies**: No Node.js-specific dependencies
- **API compatible**: Maintains compatibility with node-soap client API

## What's Different from node-soap

- Uses **Fetch API** instead of Axios/http
- **Client-only** - server functionality has been removed for universal runtime support
- **ES modules** - published as ESM (`"type": "module"`)
- Removed Node.js-specific security classes (ClientSSLSecurity, NTLMSecurity, WSSecurityCert)

## Installation

```bash
npm install fetch-soap
# or
bun add fetch-soap
# or
pnpm add fetch-soap
# or
yarn add fetch-soap
```

## Basic Usage

```javascript
import * as soap from 'fetch-soap';

// Create a client
const client = await soap.createClientAsync('http://example.com/wsdl?wsdl');

// Call a method
const [result] = await client.MyFunctionAsync({ name: 'value' });
console.log(result);
```

## API Documentation

The API is designed to be compatible with node-soap. See the [node-soap documentation](https://github.com/vpulim/node-soap) for detailed API reference.

### Creating a Client

```javascript
// Async/await (recommended)
const client = await soap.createClientAsync(url, options);

// Callback style
soap.createClient(url, options, (err, client) => {
  // ...
});
```

### Calling Methods

```javascript
// Async/await (recommended)
const [result, rawResponse, soapHeader, rawRequest] = await client.MyMethodAsync(args);

// Callback style
client.MyMethod(args, (err, result, rawResponse, soapHeader, rawRequest) => {
  // ...
});
```

### Security

The following security implementations are available:

```javascript
// Basic Auth
client.setSecurity(new soap.BasicAuthSecurity('username', 'password'));

// Bearer Token
client.setSecurity(new soap.BearerSecurity('token'));

// WS-Security (UsernameToken)
client.setSecurity(new soap.WSSecurity('username', 'password', options));
```

> **Note:** Node.js-specific security classes (ClientSSLSecurity, NTLMSecurity, WSSecurityCert) are not available in this universal build.

## Migration from node-soap

fetch-soap aims to be a drop-in replacement for node-soap's client functionality. The main differences are:

1. **ES modules only** - use `import` instead of `require`
2. **Client-only** - `soap.listen()` and server functionality are not available
3. **Fetch API** - uses Fetch instead of Axios/http (custom fetch can be provided via options)
4. **Limited security** - only BasicAuthSecurity, BearerSecurity, and WSSecurity are available
5. **No file system access** - WSDL must be loaded via URL or passed as a string

## Contributing

Contributions are welcome! The project uses [Bun](https://bun.sh) as its test runner and package manager — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines.

## License

MIT License - see [LICENSE](LICENSE)

This project is a fork of [node-soap](https://github.com/vpulim/node-soap), originally created by Vinay Pulim and maintained by the node-soap community.

## Acknowledgments

- [node-soap](https://github.com/vpulim/node-soap) - The original SOAP client for Node.js
- [tinysoap](https://github.com/AzimoLabs/tinysoap) - Inspiration for browser-compatible SOAP
