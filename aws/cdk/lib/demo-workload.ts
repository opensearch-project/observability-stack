import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as aoss from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';
import { IngestionPipeline } from './ingestion-pipeline';

/** The only indices the eval canary reads: agent spans, and results (to skip graded traces). */
export const CANARY_READ_INDICES = ['otel-v1-apm-span*', 'otel-v1-genai-evaluation*'];

export interface DemoOpenSearchTarget {
  serverless: boolean;
  /** Domain or collection URL, with https://. */
  url: string;
  /** Domain or collection ARN. */
  arn: string;
  /** Collection name (serverless only). */
  collectionName?: string;
}

export interface DemoWorkloadProps {
  pipeline: IngestionPipeline;
  /** Where the eval canary reads agent spans. Without it the canary does not run. */
  opensearch?: DemoOpenSearchTarget;
  /** Existing VPC to run the instance in. It needs a private subnet that routes through a NAT gateway. */
  vpcId?: string;
}

export class DemoWorkload extends Construct {
  public readonly instance: ec2.Instance;
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: DemoWorkloadProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const region = stack.region;
    // No public IP; egress through a NAT gateway, which also works with VPC Block Public Access.
    const vpc = props.vpcId
      ? ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId })
      : new ec2.Vpc(this, 'Vpc', {
        maxAzs: 1,
        natGateways: 1,
        subnetConfiguration: [
          { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
          { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        ],
      });

    const role = this.role = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['osis:Ingest'],
      resources: [props.pipeline.pipeline.attrPipelineArn],
    }));

    // Read access for the eval canary, which scores agent spans and sends the results back
    // through the collector. Managed domains also need an FGAC readall mapping (the stack adds it).
    const target = props.opensearch;
    if (target?.serverless) {
      if (!target.collectionName) throw new Error('DemoWorkload: serverless target needs collectionName');
      role.addToPolicy(new iam.PolicyStatement({ actions: ['aoss:APIAccessAll'], resources: [target.arn] }));
      new aoss.CfnAccessPolicy(this, 'CanaryReadAccess', {
        name: `${target.collectionName.slice(0, 22)}-demo-read`,
        type: 'data',
        policy: cdk.Fn.toJsonString([{
          Rules: [
            { ResourceType: 'index', Resource: CANARY_READ_INDICES.map((i) => `index/${target.collectionName}/${i}`), Permission: ['aoss:DescribeIndex', 'aoss:ReadDocument'] },
          ],
          Principal: [role.roleArn],
        }]),
      });
    } else if (target) {
      role.addToPolicy(new iam.PolicyStatement({
        actions: ['es:ESHttpGet', 'es:ESHttpPost'],
        resources: CANARY_READ_INDICES.map((i) => `${target.arn}/${i}`),
      }));
    }
    const canaryEnv = target ? [
      '',
      '# Eval canary: reads agent spans from the domain or collection with SigV4 (instance role)',
      '# and sends gen_ai.evaluation.result events through the collector to the pipeline.',
      'cat >> .env << \'CANARYEOF\'',
      'COMPOSE_PROFILES=aws-evals',
      'EVAL_CANARY_OPENSEARCH_URL=${OpenSearchUrl}',
      `OPENSEARCH_AWS_SERVICE=${target.serverless ? 'aoss' : 'es'}`,
      `AWS_REGION=${region}`,
      'CANARYEOF',
      'export COMPOSE_PROFILES=aws-evals',
    ] : [
      '',
      '# Managed mode has no local opensearch/prometheus. Clear COMPOSE_PROFILES',
      '# (overriding the local-backends value committed in .env) to prune the',
      '# services that require those backends.',
      'export COMPOSE_PROFILES=',
    ];

    this.instance = new ec2.Instance(this, 'Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: new ec2.InstanceType('t3.xlarge'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(30, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
      }],
      // IMDSv2 with hop limit 2, so containers (collector, eval canary) reach the instance credentials
      httpTokens: ec2.HttpTokens.REQUIRED,
      httpPutResponseHopLimit: 2,
    });

    const pipelineName = props.pipeline.pipelineName;

    // Use Fn::Sub to inject the OSIS endpoint at deploy time
    const osiEndpoint = cdk.Fn.join('', [
      'https://',
      cdk.Fn.select(0, props.pipeline.pipeline.attrIngestEndpointUrls),
    ]);

    // Build user data with Fn::Sub for the OSIS endpoint
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euo pipefail',
      'exec > /var/log/obs-stack-init.log 2>&1',
      '',
      'dnf install -y docker git',
      'systemctl enable --now docker',
      'usermod -aG docker ec2-user',
      '',
      'mkdir -p /usr/local/lib/docker/cli-plugins',
      'curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose',
      'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
      '',
      'git clone --depth 1 https://github.com/opensearch-project/observability-stack.git /opt/obs-stack',
      'cd /opt/obs-stack',
    );

    // Write collector config — use Fn::Sub to resolve OSI_ENDPOINT
    this.instance.instance.addPropertyOverride('UserData', {
      'Fn::Base64': { 'Fn::Sub': [
        [
          '#!/bin/bash',
          'set -euo pipefail',
          'exec > /var/log/obs-stack-init.log 2>&1',
          '',
          'dnf install -y docker git',
          'systemctl enable --now docker',
          'usermod -aG docker ec2-user',
          '',
          'mkdir -p /usr/local/lib/docker/cli-plugins',
          'curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose',
          'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
          '',
          '# docker compose --build needs buildx; the example agents build from source.',
          '# Shell vars below use the ${!name} Fn::Sub escape (this script is an Fn::Sub).',
          'BX_ARCH=$([ "$(uname -m)" = "aarch64" ] && echo arm64 || echo amd64)',
          'curl -SL "https://github.com/docker/buildx/releases/download/v0.36.1/buildx-v0.36.1.linux-${!BX_ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-buildx',
          'chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx',
          '',
          'git clone --depth 1 https://github.com/opensearch-project/observability-stack.git /opt/obs-stack',
          'cd /opt/obs-stack',
          '',
          '# Patch otel-demo frontend-proxy: upstream envoy template references',
          '# the TELEMETRY_DOCS_HOST/TELEMETRY_DOCS_PORT vars but those are not',
          '# wired through compose, so envoy bootstraps with an empty socket',
          '# address and crash-loops. Inject the vars and forward them in.',
          'if ! grep -q "^TELEMETRY_DOCS_HOST=" .env; then',
          '  printf "\\nTELEMETRY_DOCS_HOST=otel-collector\\nTELEMETRY_DOCS_PORT=4318\\n" >> .env',
          'fi',
          'if ! grep -q "TELEMETRY_DOCS_HOST" docker-compose.otel-demo.yml; then',
          '  sed -i "/^      - FLAGD_UI_PORT$/a\\      - TELEMETRY_DOCS_HOST\\n      - TELEMETRY_DOCS_PORT" docker-compose.otel-demo.yml',
          'fi',
          '',
          '# Overlay on the stack collector config, passed as a second --config. The collector merges',
          '# the files and replaces lists, so the exporters and pipelines go to OSIS while the base',
          '# config keeps its processors: gen_ai_normalizer, and the transform that de-dots colliding',
          '# attribute keys and stringifies map log bodies (OpenSearch rejects those otherwise).',
          'cat > docker-compose/otel-collector/managed.yaml << \'COLLECTOREOF\'',
          'extensions:',
          '  sigv4auth:',
          `    region: "${region}"`,
          '    service: osis',
          'processors:',
          '  resourcedetection: { detectors: [env, ec2, system] }',
          'exporters:',
          '  otlphttp/osis-logs:',
          `    logs_endpoint: \${OsiEndpoint}/${pipelineName}/v1/logs`,
          '    auth: { authenticator: sigv4auth }',
          '    compression: none',
          '    retry_on_failure:',
          '      enabled: true',
          '      initial_interval: 5s',
          '      max_interval: 60s',
          '      max_elapsed_time: 1800s',
          '  otlphttp/osis-traces:',
          `    traces_endpoint: \${OsiEndpoint}/${pipelineName}/v1/traces`,
          '    auth: { authenticator: sigv4auth }',
          '    compression: none',
          '    retry_on_failure:',
          '      enabled: true',
          '      initial_interval: 5s',
          '      max_interval: 60s',
          '      max_elapsed_time: 1800s',
          '  otlphttp/osis-metrics:',
          `    metrics_endpoint: \${OsiEndpoint}/${pipelineName}/v1/metrics`,
          '    auth: { authenticator: sigv4auth }',
          '    compression: none',
          '    retry_on_failure:',
          '      enabled: true',
          '      initial_interval: 5s',
          '      max_interval: 60s',
          '      max_elapsed_time: 1800s',
          'service:',
          '  extensions: [sigv4auth]',
          '  pipelines:',
          '    logs: { receivers: [otlp], processors: [resourcedetection, memory_limiter, transform, batch], exporters: [otlphttp/osis-logs] }',
          '    traces: { receivers: [otlp], processors: [resourcedetection, memory_limiter, gen_ai_normalizer, transform, batch], exporters: [otlphttp/osis-traces] }',
          '    metrics: { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-metrics] }',
          'COLLECTOREOF',
          '',
          'cat > /opt/obs-stack/docker-compose.managed.yml << \'MANAGEDEOF\'',
          'include:',
          '  - docker-compose.otel-demo.yml',
          '  - docker-compose.examples.yml',
          'x-default-logging: &logging',
          '  driver: "json-file"',
          '  options:',
          '    max-size: "5m"',
          '    max-file: "2"',
          'networks:',
          '  observability-stack-network:',
          '    driver: bridge',
          'services:',
          '  otel-collector:',
          '    # Version from the stack .env, so it matches the processors in the base config.',
          '    image: otel/opentelemetry-collector-contrib:${!OTEL_COLLECTOR_VERSION}',
          '    container_name: otel-collector',
          '    command: ["--config=/etc/otelcol-config.yml", "--config=/etc/otelcol-managed.yml"]',
          '    volumes:',
          '      - ./docker-compose/otel-collector/config.yaml:/etc/otelcol-config.yml',
          '      - ./docker-compose/otel-collector/managed.yaml:/etc/otelcol-managed.yml',
          '    ports:',
          '      - "4317:4317"',
          '      - "4318:4318"',
          '      - "8888:8888"',
          '    environment:',
          `      - AWS_REGION=${region}`,
          '      - GOMEMLIMIT=400MiB',
          '    networks:',
          '      - observability-stack-network',
          '    restart: unless-stopped',
          '    deploy:',
          '      resources:',
          '        limits:',
          '          memory: 500M',
          '    logging: *logging',
          'MANAGEDEOF',
          ...canaryEnv,
          '',
          '# Kafka\'s healthcheck can exceed compose\'s dependency grace window on',
          '# first boot, leaving kafka-dependent services in Created state. Retry',
          '# once — second pass finds kafka healthy and starts the stragglers.',
          'docker compose -f docker-compose.managed.yml up -d || true',
          'sleep 60',
          'docker compose -f docker-compose.managed.yml up -d',
        ].join('\n'),
        { OsiEndpoint: osiEndpoint, OpenSearchUrl: target?.url ?? '' },
      ]},
    });

    new cdk.CfnOutput(stack, 'DemoInstanceId', { value: this.instance.instanceId });
  }
}
