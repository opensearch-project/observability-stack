# Releasing

How maintainers cut a release of observability-stack. Versioning follows the scheme in [RFC #27](https://github.com/opensearch-project/observability-stack/issues/27).

## Versioning

Independent bundle semver: `vMAJOR.MINOR.PATCH[-(alpha|beta|rc).N]`. Upstream component versions (OpenSearch, Data Prepper, OTel Collector, Prometheus) are pinned in `.env` and listed in the release notes, not encoded in the tag.

- Prerelease: `v0.2.0-beta.1`, `v1.0.0-rc.2`. Publishes to an npm dist-tag matching the qualifier (`alpha`/`beta`/`rc`), so bare `npx` stays on the stable `latest`.
- Stable: `v0.2.0`. Publishes to `latest`.
- `v1.0.0` is a deliberate major/GA decision (a breaking change or a GA milestone), not an automatic follow-on to the first stable.

The `release-drafter.yml` workflow rejects any tag that does not match the scheme, or whose version disagrees with `aws/cli-installer/package.json`.

## The CLI ships with the bundle

The CLI (`aws/cli-installer`, published to npm as `@opensearch-project/observability-stack`) is version-locked to the bundle. Its managed deploy clones the stack at the git tag matching its own version (`v${PKG_VERSION}`). So the CLI `package.json` version, the git tag, and the release must all agree. There is no CLI-only release path.

## Cutting a release

1. Open a PR that sets `aws/cli-installer/package.json` to the target version (e.g. `0.2.0-beta.1`). Sign commits for DCO (`git commit -s`). Get a maintainer review and merge to `main`.
2. Tag the merged commit and push it:
   ```
   git tag v0.2.0-beta.1 <sha>
   git push upstream v0.2.0-beta.1
   ```
   The tag is the release trigger. Merging alone publishes nothing.
3. The `release-to-npm` job pauses on the `release-approval` environment. A required reviewer, who cannot be the release author, opens the workflow run and approves the deployment.
4. On approval, the workflow validates the version, runs tests, publishes the CLI to the correct npm dist-tag, and drafts the GitHub release. Fill in the release notes with the component-version matrix from `.env`.

## Promoting a prerelease to stable

Once the prerelease is validated and any fixes are merged, repeat the flow with the qualifier dropped: set `package.json` to `0.2.0`, tag `v0.2.0`, approve. It publishes to `latest`.
