# Contribution Guidelines

Thank you for your interest in contributing to fetch-soap! This project is a fork of node-soap, focused on creating a universal SOAP client that works in browsers, edge runtimes, and Node.js.

## Project Goals

When contributing, please keep these goals in mind:

1. **Universal compatibility**: Code should work in browsers, edge runtimes (Cloudflare Workers, Vercel Edge, Deno), and Node.js
2. **No Node.js-specific dependencies**: Avoid `fs`, `http`, `crypto`, and other Node.js built-in modules
3. **Use Fetch API**: HTTP requests should use the Fetch API, not Axios or other Node.js HTTP libraries
4. **Maintain API compatibility**: Where possible, maintain compatibility with the node-soap API

## Submitting a Pull Request

- Pull Requests **must** be rebased to the latest version of `master`
- Pull Requests **must have accompanying tests**
- Pull Requests must have passing GitHub CI/CD pipelines
- Please use descriptive commit messages:
  - Use the imperative, present tense: "change" not "changed" nor "changes"
  - Capitalize the first letter
  - Do not end the description with a period (.)

## Making Changes

### Environment Compatibility

Before submitting code, verify it works in:

- Node.js (v18+)
- Modern browsers (check for browser-specific APIs)
- Edge runtimes (no Node.js built-ins)

### Testing

- Add tests for any new functionality
- Ensure all existing tests pass
- If your change affects browser/edge compatibility, note this in the PR

### Code Style

- Run `npm run lint` before submitting
- Run `npm run format` to format code with Prettier
- TypeScript is preferred for new code

## Issue Expiration

Pull requests that have not received a response within 2 weeks may be closed. This helps keep the focus on active contributions.

## Questions?

If you have questions about contributing, please open an issue for discussion.