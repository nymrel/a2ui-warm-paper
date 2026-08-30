# npm trusted-publishing contract

`a2ui-warm-paper` is not currently published to npm. The repository is ready for a future trusted release, but repository readiness is not publication evidence.

## Operator-owned prerequisites

Before any release tag is created, an npm package owner must:

1. Establish the package name on npm if it has not been published before. npm does not allow repository automation to configure a trusted publisher for a package that does not yet exist.
2. Configure the package's trusted publisher for GitHub Actions using organization `nymrel`, repository `a2ui-warm-paper`, workflow `publish.yml`, and environment `npm-publish`.
3. Configure the protected GitHub `npm-publish` environment and its reviewer policy.
4. Confirm that `npm view a2ui-warm-paper version` returns the intended existing version before creating the next release version and tag.

Those provider and account mutations remain an operator gate. They are not implied by a passing pull request.

## Repository contract

- Releases run only for an exact `v<package.json version>` tag pushed from repository history.
- The publish job waits for the Linux/Windows, Node 22/24 quality matrix and workflow-security scan.
- The job uses Node 24.20.0 and npm 11.19.1, satisfying npm trusted-publishing runtime requirements.
- The release installs from `package-lock.json` without lifecycle scripts and reruns `npm run check` before publishing.
- The release path intentionally has no dependency cache, npm access token, `NODE_AUTH_TOKEN`, or repository secret.
- `id-token: write` exists only on the protected publish job. npm derives provenance automatically from the trusted OIDC exchange.

## Release procedure

1. Merge a reviewed, passing release candidate to `main`.
2. Update `package.json` and `package-lock.json` to a new semver version in a separate reviewed change.
3. Re-run `npm run check` and `npm audit --audit-level=high` from a clean checkout.
4. Create and push the exact annotated tag `v<version>`.
5. Verify the GitHub Actions publish job and the resulting npm provenance statement.
6. Verify the installed artifact from a new consumer project before describing the package as published.

Never use a personal npm token as a fallback for this workflow. A failed trusted release is a stop condition until its provider configuration or repository evidence is corrected.
