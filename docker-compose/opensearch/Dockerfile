ARG OPENSEARCH_VERSION
ARG OPENSEARCH_DOCKER_REPO

# Use OpenSearch image as base
FROM ${OPENSEARCH_DOCKER_REPO}/opensearch:${OPENSEARCH_VERSION}

RUN /usr/share/opensearch/bin/opensearch-plugin list
# uninstall user-behavior-insights and performance-insights plugins due to issues prior to 3.5.0 release
RUN /usr/share/opensearch/bin/opensearch-plugin remove opensearch-ubi && \
    /usr/share/opensearch/bin/opensearch-plugin remove opensearch-performance-analyzer

# from https://github.com/opensearch-project/opensearch-build/blob/25740e9f9e1da93d8c600eff8dd20b613ebb94f0/docker/release/dockerfiles/opensearch.al2023.dockerfile
ENTRYPOINT ["./opensearch-docker-entrypoint.sh"]
CMD ["opensearch"]