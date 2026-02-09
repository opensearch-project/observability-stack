# [GitHub Request] Rename repository `agentops` to `observability-stack`

**Request Type:** Repository Management

## Details of the request

We are requesting a rename of the existing repository:

- **Current name:** `opensearch-project/agentops`
- **New name:** `opensearch-project/observability-stack`

The repository provides a pre-configured observability stack built on OpenTelemetry, OpenSearch, and Prometheus. The name "agentops" was chosen early on when the focus was narrower (agent observability), but the stack serves as a general-purpose observability solution for microservices, web applications, and AI agents alike. Renaming to "observability-stack" better reflects the project's scope and makes it more discoverable.

GitHub will automatically set up redirects from the old URL to the new one, so existing links and clones will continue to work.

## Additional information to support your request

- All four current maintainers support this rename:
  - @kylehounslow
  - @vamsimanohar
  - @goyamegh
- Internal references (Docker network names, documentation, install scripts, etc.) will be updated in a follow-up PR immediately after the rename is completed.
- The repository is currently in alpha status with limited external adoption, so the impact of the rename is minimal.

## When does this request need to be completed?

No hard deadline. Standard processing time (7-10 business days) is fine. Not urgent.
