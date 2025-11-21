# fetch-soap

A universal SOAP client using the Fetch API - works in browsers, edge runtimes (Cloudflare Workers, Vercel Edge, Deno), and Node.js.

> **Note:** This project is a fork of [node-soap](https://github.com/vpulim/node-soap) v1.6.0, being refactored to use the Fetch API instead of Node.js-specific dependencies. The goal is to create a truly universal SOAP client that works anywhere JavaScript runs.

## Goals

- **Universal**: Works in browsers, edge runtimes, and Node.js
- **Modern**: Uses the Fetch API and modern JavaScript/TypeScript
- **Minimal dependencies**: Remove Node.js-specific dependencies
- **API compatible**: Maintain compatibility with node-soap where possible

## Current Status

This project is in active development. We are working on:

1. Replacing Axios with the Fetch API
2. Removing Node.js-specific dependencies (fs, http, crypto, etc.)
3. Making the XML parser work in all environments
4. Testing across browsers and edge runtimes

## Installation

```bash
npm install fetch-soap
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

```javascript
// Basic Auth
client.setSecurity(new soap.BasicAuthSecurity('username', 'password'));

// Bearer Token
client.setSecurity(new soap.BearerSecurity('token'));

// WS-Security
client.setSecurity(new soap.WSSecurity('username', 'password', options));
```

## Migration from node-soap

fetch-soap aims to be a drop-in replacement for node-soap in most cases. The main differences will be:

1. Uses Fetch API instead of Axios/request
2. Works in browsers and edge runtimes
3. Some Node.js-specific features (like file system access, streaming) may not be available in all environments

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE)

This project is a fork of [node-soap](https://github.com/vpulim/node-soap), originally created by Vinay Pulim and maintained by the node-soap community.

## Acknowledgments

- [node-soap](https://github.com/vpulim/node-soap) - The original SOAP client for Node.js
- [tinysoap](https://github.com/AzimoLabs/tinysoap) - Inspiration for browser-compatible SOAP