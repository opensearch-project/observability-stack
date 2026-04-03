/**
 * Default configuration values.
 */
export const DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-2';

export const DEFAULTS = {
  pipelineName: `obs-stack-${Math.floor(Date.now() / 1000)}`,
  osInstanceType: 'r6g.large.search',
  osInstanceCount: 1,
  osVolumeSize: 100,
  osEngineVersion: 'OpenSearch_3.5',
  minOcu: 1,
  maxOcu: 4,
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
    osAction: '',
    opensearchEndpoint: '',
    opensearchUser: 'admin',
    opensearchPassword: '',
    osDomainName: '',
    osInstanceType: DEFAULTS.osInstanceType,
    osInstanceCount: DEFAULTS.osInstanceCount,
    osVolumeSize: DEFAULTS.osVolumeSize,
    osEngineVersion: DEFAULTS.osEngineVersion,
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
