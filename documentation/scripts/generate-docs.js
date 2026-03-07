// Script to generate documentation page structure
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docPages = [
  // Get Started
  { path: 'get-started/quickstart/index', title: 'Quickstart', section: 'Get Started' },
  { path: 'get-started/quickstart/first-traces', title: 'Log Your First Traces', section: 'Get Started > Quickstart' },
  { path: 'get-started/quickstart/first-eval', title: 'Run Your First Eval', section: 'Get Started > Quickstart' },
  { path: 'get-started/quickstart/prompt-management', title: 'Use Prompt Management', section: 'Get Started > Quickstart' },
  { path: 'get-started/core-concepts', title: 'Core Concepts', section: 'Get Started' },
  { path: 'get-started/example-project', title: 'Example Project', section: 'Get Started' },
  { path: 'get-started/ask-ai', title: 'Ask AI', section: 'Get Started' },
  
  // Instrument
  { path: 'instrument/index', title: 'Instrument', section: 'Instrument' },
  { path: 'instrument/opentelemetry/index', title: 'OpenTelemetry Setup', section: 'Instrument' },
  { path: 'instrument/opentelemetry/collector', title: 'OTel Collector Configuration', section: 'Instrument > OpenTelemetry' },
  { path: 'instrument/opentelemetry/auto-instrumentation', title: 'Auto-Instrumentation', section: 'Instrument > OpenTelemetry' },
  { path: 'instrument/opentelemetry/manual-instrumentation', title: 'Manual Instrumentation', section: 'Instrument > OpenTelemetry' },
  { path: 'instrument/wrap-providers', title: 'Wrap AI Providers', section: 'Instrument' },
  { path: 'instrument/integrate-frameworks', title: 'Integrate Frameworks', section: 'Instrument' },
  { path: 'instrument/custom-tracing', title: 'Add Custom Tracing', section: 'Instrument' },
  { path: 'instrument/advanced-tracing/index', title: 'Advanced Tracing Patterns', section: 'Instrument' },
  { path: 'instrument/advanced-tracing/distributed', title: 'Distributed Tracing', section: 'Instrument > Advanced' },
  { path: 'instrument/advanced-tracing/trace-ids', title: 'Trace IDs & Propagation', section: 'Instrument > Advanced' },
  { path: 'instrument/advanced-tracing/sampling', title: 'Sampling Strategies', section: 'Instrument > Advanced' },
  { path: 'instrument/advanced-tracing/batching', title: 'Event Queuing/Batching', section: 'Instrument > Advanced' },
  { path: 'instrument/user-feedback', title: 'Capture User Feedback', section: 'Instrument' },
  { path: 'instrument/attachments', title: 'Log Attachments', section: 'Instrument' },
  
  // Observe
  { path: 'observe/index', title: 'Observe', section: 'Observe' },
  { path: 'observe/tracing/index', title: 'Tracing', section: 'Observe' },
  { path: 'observe/tracing/manage', title: 'View & Manage Traces', section: 'Observe > Tracing' },
  { path: 'observe/tracing/search', title: 'Filter & Search Logs', section: 'Observe > Tracing' },
  { path: 'observe/tracing/sessions', title: 'Sessions', section: 'Observe > Tracing' },
  { path: 'observe/tracing/urls', title: 'Trace URLs', section: 'Observe > Tracing' },
  { path: 'observe/tracing/multi-modality', title: 'Multi-Modality', section: 'Observe > Tracing' },
  { path: 'observe/agent-observability/index', title: 'Agent Observability', section: 'Observe' },
  { path: 'observe/agent-observability/graph', title: 'Agent Graph & Path', section: 'Observe > Agent' },
  { path: 'observe/agent-observability/tool-calls', title: 'Tool Call Tracing', section: 'Observe > Agent' },
  { path: 'observe/agent-observability/reasoning', title: 'Reasoning Steps', section: 'Observe > Agent' },
  { path: 'observe/agent-observability/mcp', title: 'MCP Tracing', section: 'Observe > Agent' },
  { path: 'observe/projects/index', title: 'Projects', section: 'Observe' },
  { path: 'observe/projects/environments', title: 'Environments', section: 'Observe > Projects' },
  { path: 'observe/projects/tags', title: 'Tags & Metadata', section: 'Observe > Projects' },
  { path: 'observe/projects/releases', title: 'Releases & Versioning', section: 'Observe > Projects' },
  { path: 'observe/projects/metrics', title: 'Custom Metrics', section: 'Observe > Projects' },
  
  // Annotate
  { path: 'annotate/index', title: 'Annotate', section: 'Annotate' },
  { path: 'annotate/queues', title: 'Labeling Queues', section: 'Annotate' },
  { path: 'annotate/configs', title: 'Annotation Configs', section: 'Annotate' },
  { path: 'annotate/feedback', title: 'Add Human Feedback', section: 'Annotate' },
  { path: 'annotate/labels', title: 'Labels & Corrections', section: 'Annotate' },
  { path: 'annotate/comments', title: 'Comments', section: 'Annotate' },
  { path: 'annotate/export', title: 'Export Annotated Data', section: 'Annotate' },
  
  // Evaluate
  { path: 'evaluate/index', title: 'Evaluate', section: 'Evaluate' },
  { path: 'evaluate/datasets/index', title: 'Datasets', section: 'Evaluate' },
  { path: 'evaluate/datasets/create', title: 'Create a Dataset', section: 'Evaluate > Datasets' },
  { path: 'evaluate/datasets/update', title: 'Update a Dataset', section: 'Evaluate > Datasets' },
  { path: 'evaluate/datasets/get', title: 'Get a Dataset', section: 'Evaluate > Datasets' },
  { path: 'evaluate/datasets/auto-add', title: 'Auto-Add to Dataset', section: 'Evaluate > Datasets' },
  { path: 'evaluate/experiments/index', title: 'Experiments', section: 'Evaluate' },
  { path: 'evaluate/experiments/sdk', title: 'Run Experiments (SDK)', section: 'Evaluate > Experiments' },
  { path: 'evaluate/experiments/ui', title: 'Run Experiments (UI)', section: 'Evaluate > Experiments' },
  { path: 'evaluate/experiments/compare', title: 'Compare Experiments', section: 'Evaluate > Experiments' },
  { path: 'evaluate/experiments/cicd', title: 'CI/CD Integration', section: 'Evaluate > Experiments' },
  
  // Prompts
  { path: 'prompts/index', title: 'Prompts', section: 'Prompts' },
  { path: 'prompts/hub', title: 'Prompt Hub', section: 'Prompts' },
  { path: 'prompts/optimization', title: 'Prompt Optimization', section: 'Prompts' },
  { path: 'prompts/faq', title: 'Troubleshooting & FAQ', section: 'Prompts' },
  
  // Deploy
  { path: 'deploy/index', title: 'Deploy', section: 'Deploy' },
  { path: 'deploy/proxy', title: 'AI Proxy', section: 'Deploy' },
  { path: 'deploy/prompts', title: 'Deploy Prompts', section: 'Deploy' },
  { path: 'deploy/monitor', title: 'Monitor Deployments', section: 'Deploy' },
  { path: 'deploy/mcp', title: 'Model Context Protocol (MCP)', section: 'Deploy' },
  
  // Integrations
  { path: 'integrations/index', title: 'Integrations', section: 'Integrations' },
  { path: 'integrations/model-providers', title: 'Model Providers', section: 'Integrations' },
  { path: 'integrations/cloud-providers', title: 'Cloud Providers', section: 'Integrations' },
  { path: 'integrations/agent-frameworks', title: 'Agent Frameworks', section: 'Integrations' },
  { path: 'integrations/custom', title: 'Custom Integrations', section: 'Integrations' },
  
  // SDKs
  { path: 'sdks/index', title: 'SDKs', section: 'SDKs' },
  { path: 'sdks/python', title: 'Python SDK', section: 'SDKs' },
  { path: 'sdks/javascript', title: 'JavaScript/TypeScript SDK', section: 'SDKs' },
  { path: 'sdks/faq', title: 'Troubleshooting & FAQ', section: 'SDKs' },
  
  // Platform
  { path: 'platform/index', title: 'Platform & Administration', section: 'Platform' },
  { path: 'platform/auth', title: 'Authentication & Access', section: 'Platform' },
  { path: 'platform/security', title: 'Security', section: 'Platform' },
  { path: 'platform/api', title: 'API & Data Platform', section: 'Platform' },
  { path: 'platform/self-hosting', title: 'Self-Hosting', section: 'Platform' },
];

const template = (title, section, pagePath) => {
  const depth = pagePath.split('/').length;
  const layoutPath = '../'.repeat(depth) + '../layouts/DocsLayout.astro';
  const sidebarPath = '../'.repeat(depth) + '../components/DocsSidebar.astro';
  
  return `---
import DocsLayout from '${layoutPath}';
import DocsSidebar from '${sidebarPath}';
---

<DocsLayout 
  title="${title}" 
  description="Documentation for ${title}"
  section="${section}"
>
  <DocsSidebar slot="sidebar" />
  
  <div class="space-y-6">
    <section>
      <h2>Overview</h2>
      <p>
        Content for ${title} will be added here.
      </p>
    </section>

    <section>
      <h2>Coming Soon</h2>
      <p>
        This documentation page is under construction. Check back soon for detailed content.
      </p>
    </section>
  </div>
</DocsLayout>
`;
};

// Generate pages
docPages.forEach(page => {
  const filePath = path.join(__dirname, '..', 'src', 'pages', 'docs', `${page.path}.astro`);
  const dir = path.dirname(filePath);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Generate content
  const content = template(page.title, page.section, page.path);
  
  // Write file
  fs.writeFileSync(filePath, content);
  console.log(`Created: ${filePath}`);
});

console.log(`\nGenerated ${docPages.length} documentation pages!`);
