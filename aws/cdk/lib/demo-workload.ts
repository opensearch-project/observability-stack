import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { IngestionPipeline } from './ingestion-pipeline';

export interface DemoWorkloadProps {
  pipeline: IngestionPipeline;
}

export class DemoWorkload extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: DemoWorkloadProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const role = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['osis:Ingest'],
      resources: [props.pipeline.pipeline.attrPipelineArn],
    }));

    this.instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: new ec2.InstanceType('t3.xlarge'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(30, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
      }],
      requireImdsv2: true,
    });

    // User data — mirrors ec2-demo.mjs buildUserData()
    // Pipeline endpoint is a deploy-time value via CloudFormation intrinsics
    const pipelineName = props.pipeline.pipelineName;
    const ud = ec2.UserData.forLinux();
    ud.addCommands(
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
      'BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep tag_name | cut -d\'"\' -f4)',
      'curl -SL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-amd64" -o /usr/local/lib/docker/cli-plugins/docker-buildx',
      'chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx',
      '',
      'git clone --depth 1 https://github.com/opensearch-project/observability-stack.git /opt/obs-stack',
      'cd /opt/obs-stack',
    );

    // Write collector config — uses Fn.sub for pipeline endpoint
    // We use a Fn::Sub to inject the OSIS endpoint at deploy time
    const collectorConfig = [
      'extensions:',
      '  sigv4auth:',
      `    region: "${stack.region}"`,
      '    service: osis',
      'receivers:',
      '  otlp:',
      '    protocols:',
      '      grpc: { endpoint: 0.0.0.0:4317 }',
      '      http: { endpoint: 0.0.0.0:4318, cors: { allowed_origins: ["http://*", "https://*"] } }',
      'processors:',
      '  batch: { timeout: 10s, send_batch_size: 1024 }',
      '  memory_limiter: { check_interval: 5s, limit_percentage: 80, spike_limit_percentage: 25 }',
      '  resourcedetection: { detectors: [env, ec2, system] }',
      'exporters:',
      '  otlphttp/osis-logs:',
      `    logs_endpoint: \${OSI_ENDPOINT}/${pipelineName}/v1/logs`,
      '    auth: { authenticator: sigv4auth }',
      '    compression: none',
      '  otlphttp/osis-traces:',
      `    traces_endpoint: \${OSI_ENDPOINT}/${pipelineName}/v1/traces`,
      '    auth: { authenticator: sigv4auth }',
      '    compression: none',
      '  otlphttp/osis-metrics:',
      `    metrics_endpoint: \${OSI_ENDPOINT}/${pipelineName}/v1/metrics`,
      '    auth: { authenticator: sigv4auth }',
      '    compression: none',
      'service:',
      '  telemetry: { logs: { level: info } }',
      '  extensions: [sigv4auth]',
      '  pipelines:',
      '    logs: { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-logs] }',
      '    traces: { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-traces] }',
      '    metrics: { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-metrics] }',
    ].join('\n');

    // Use Fn::Sub to resolve the pipeline endpoint at deploy time
    ud.addCommands(
      `cat > docker-compose/otel-collector/config.yaml << 'COLLECTOREOF'`,
      collectorConfig,
      'COLLECTOREOF',
    );

    // Write managed-mode compose file
    ud.addCommands(
      `cat > /opt/obs-stack/docker-compose.managed.yml << 'MANAGEDEOF'`,
      'include:',
      '  - docker-compose.examples.yml',
      '  - docker-compose.otel-demo.yml',
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
      '    image: otel/opentelemetry-collector-contrib:${OTEL_COLLECTOR_VERSION}',
      '    container_name: otel-collector',
      '    command: ["--config=/etc/otelcol-config.yml"]',
      '    volumes:',
      '      - ./docker-compose/otel-collector/config.yaml:/etc/otelcol-config.yml',
      '    ports:',
      '      - "${OTEL_COLLECTOR_PORT_GRPC:-4317}:4317"',
      '      - "${OTEL_COLLECTOR_PORT_HTTP:-4318}:4318"',
      '      - "8888:8888"',
      '    environment:',
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
      '',
      'docker compose -f docker-compose.managed.yml up -d',
    );

    this.instance.addUserData(ud.render());

    new cdk.CfnOutput(stack, 'DemoInstanceId', {
      value: this.instance.instanceId,
    });
  }
}
