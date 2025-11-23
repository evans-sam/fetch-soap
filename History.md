# fetch-soap Changelog

This project is a fork of [node-soap](https://github.com/vpulim/node-soap) v1.6.0.

---

## Forked from node-soap v1.6.0

The following is the history from node-soap up to the fork point. For the complete node-soap history, see the [node-soap repository](https://github.com/vpulim/node-soap/blob/master/History.md).

---

# 0.1.0 / 2024-XX-XX (fetch-soap)

- [FORK] Forked from node-soap v1.6.0
- [CHANGE] Renamed package to `fetch-soap`
- [CHANGE] Updated package metadata and documentation
- [GOAL] Replace Axios with Fetch API for universal compatibility
- [GOAL] Remove Node.js-specific dependencies
- [GOAL] Support browsers and edge runtimes

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
