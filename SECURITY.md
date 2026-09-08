# Security Policy

## Supported source

The package is not published to npm yet. Security fixes target the current `main` branch until a public version and its support window are explicitly announced. A version string in `package.json` is not evidence of a published or supported registry artifact.

## Reporting a Vulnerability

Nymrel maintains this project, with JalenBuilds LLC retained as the legal entity for security contact purposes.

If you believe you have found a security vulnerability in `a2ui-warm-paper`, please report it by emailing us at:

**contact@nymrel.com**

Please include:
1. Type of issue (for example, unsafe rendering, prototype pollution or unsafe path traversal in the stream-delta patcher, or an unvalidated payload boundary)
2. Step-by-step instructions to reproduce the issue
3. Any proof-of-concept code or sample A2UI payload
4. Affected version(s)

Please do not include secrets or sensitive production data. Response timing depends on severity and maintainer availability.

The parser treats delta paths and recursively merged values as untrusted input. Keys capable of changing JavaScript prototypes (`__proto__`, `prototype`, and `constructor`) are rejected at every supported delta boundary. Please report any bypass privately before opening a public issue.
