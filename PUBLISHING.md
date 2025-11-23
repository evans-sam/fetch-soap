# Publishing

This document describes the steps to publish a new version of `fetch-soap`.

## Process

1. Checkout the commit you want to publish (usually `git checkout master`)
2. Run `git log --oneline` to review recent commits
3. Update History.md with the new version's changes:
   - Prefix commit messages with "Enhancement", "Fixed", "Deprecated", etc.
   - Remove any trivial commits (whitespace changes, etc.)
   - Reword line items as necessary for clarity
4. Update the version in package.json
5. Commit your changes to master and push to GitHub
6. Create a GitHub release with release notes
7. Run `npm publish`
