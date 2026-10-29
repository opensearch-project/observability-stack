/**
 * Default configuration values.
 */
export const DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-2';

export const DEFAULTS = {
  pipelineName: `obs-stack-${Math.floor(Date.now() / 1000)}`,
  opensearchType: 'managed',
  osInstanceType: 'r6g.large.search',
  osInstanceCount: 1,
  osVolumeSize: 100,
  osEngineVersion: 'OpenSearch_3.5',
  minOcu: 1,
  maxOcu: 4,
  // OpenSearch Serverless NextGen collection group compute limits (indexing and search OCU).
  // 0 lets the group scale to zero when idle; the OTel demo plus agent examples settle at about
  // 2 indexing and 2 search OCU, so 16 leaves headroom for bursts.
  aossMinOcu: 0,
  aossMaxOcu: 16,
  serviceMapWindow: '30s',
};

/**
 * Create a blank config with all defaults applied.
 */
export function createDefaultConfig() {
  return {
    mode: '',
    pipelineName: DEFAULTS.pipelineName,
    region: '',
    opensearchType: DEFAULTS.opensearchType,
    osAction: '',
    aossCollectionName: '',
    aossCollectionGroupName: '',
    aossMinOcu: DEFAULTS.aossMinOcu,
    aossMaxOcu: DEFAULTS.aossMaxOcu,
    opensearchEndpoint: '',
    opensearchUser: 'admin',
    opensearchPassword: '',
    osDomainName: '',
    osInstanceType: DEFAULTS.osInstanceType,
    osInstanceCount: DEFAULTS.osInstanceCount,
    osVolumeSize: DEFAULTS.osVolumeSize,
    osEngineVersion: DEFAULTS.osEngineVersion,
    // Network topology (empty = public endpoints, current default behavior)
    vpcId: '',
    subnetIds: [],
    securityGroupIds: [],
    // For VPC-private domains: the domain's master user is the caller's IAM principal
    // (set at create time) and FGAC role mapping is deferred to run through the
    // reachable managed OpenSearch UI once the Application exists.
    iamMasterArn: '',
    deferFgacToUi: false,
    iamAction: '',
    iamRoleArn: '',
    iamRoleName: '',
    apsAction: '',
    prometheusUrl: '',
    apsWorkspaceAlias: '',
    apsWorkspaceId: '',
    minOcu: DEFAULTS.minOcu,
    maxOcu: DEFAULTS.maxOcu,
    serviceMapWindow: DEFAULTS.serviceMapWindow,
    dashboardsAction: '',
    dashboardsUrl: '',
    connectedDataSourceRoleName: '',
    connectedDataSourceRoleArn: '',
    connectedDataSourceName: '',
    connectedDataSourceArn: '',
    appName: '',
    appId: '',
    appEndpoint: '',
    ingestEndpoints: [],
    outputFile: '',
    dryRun: false,
    skipDemo: false,
    accountId: '',
  };
}

// Collection group names are limited to 32 characters.
const AOSS_GROUP_NAME_MAX = 32;

/** Default collection group name for a collection: `<collection>-cg`, truncated to 32 chars. */
export function defaultCollectionGroupName(collectionName) {
  const suffix = '-cg';
  return `${collectionName.slice(0, AOSS_GROUP_NAME_MAX - suffix.length)}${suffix}`;
}
