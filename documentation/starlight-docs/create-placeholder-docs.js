// Script to create placeholder documentation pages
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docsStructure = {
  'get-started': {
    title: 'Get Started',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'core-concepts', title: 'Core Concepts' },
      { slug: 'example-project', title: 'Example Project' },
      { slug: 'ask-ai', title: 'Ask AI' },
    ],
    subdirs: {
      'quickstart': {
        pages: [
          { slug: 'index', title: 'Quickstart' },
          { slug: 'first-traces', title: 'Log Your First Traces' },
          { slug: 'first-eval', title: 'Run Your First Eval' },
          { slug: 'prompt-management', title: 'Use Prompt Management' },
        ]
      }
    }
  },
  'instrument': {
    title: 'Instrument',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'wrap-providers', title: 'Wrap AI Providers' },
      { slug: 'integrate-frameworks', title: 'Integrate Frameworks' },
      { slug: 'custom-tracing', title: 'Add Custom Tracing' },
      { slug: 'user-feedback', title: 'Capture User Feedback' },
      { slug: 'attachments', title: 'Log Attachments' },
    ],
    subdirs: {
      'opentelemetry': {
        pages: [
          { slug: 'index', title: 'OpenTelemetry Setup' },
          { slug: 'collector', title: 'OTel Collector Configuration' },
          { slug: 'auto-instrumentation', title: 'Auto-Instrumentation' },
          { slug: 'manual-instrumentation', title: 'Manual Instrumentation' },
        ]
      },
      'advanced-tracing': {
        pages: [
          { slug: 'index', title: 'Advanced Tracing Patterns' },
          { slug: 'distributed', title: 'Distributed Tracing' },
          { slug: 'trace-ids', title: 'Trace IDs & Propagation' },
          { slug: 'sampling', title: 'Sampling Strategies' },
          { slug: 'batching', title: 'Event Queuing/Batching' },
        ]
      }
    }
  },
  'observe': {
    title: 'Observe',
    pages: [
      { slug: 'index', title: 'Overview' },
    ],
    subdirs: {
      'tracing': {
        pages: [
          { slug: 'index', title: 'Tracing' },
          { slug: 'manage', title: 'View & Manage Traces' },
          { slug: 'search', title: 'Filter & Search Logs' },
          { slug: 'sessions', title: 'Sessions' },
          { slug: 'urls', title: 'Trace URLs' },
          { slug: 'multi-modality', title: 'Multi-Modality' },
        ]
      },
      'agent-observability': {
        pages: [
          { slug: 'index', title: 'Agent Observability' },
          { slug: 'graph', title: 'Agent Graph & Path' },
          { slug: 'tool-calls', title: 'Tool Call Tracing' },
          { slug: 'reasoning', title: 'Reasoning Steps' },
          { slug: 'mcp', title: 'MCP Tracing' },
        ]
      },
      'projects': {
        pages: [
          { slug: 'index', title: 'Projects' },
          { slug: 'environments', title: 'Environments' },
          { slug: 'tags', title: 'Tags & Metadata' },
          { slug: 'releases', title: 'Releases & Versioning' },
          { slug: 'metrics', title: 'Custom Metrics' },
        ]
      }
    }
  },
  'annotate': {
    title: 'Annotate',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'queues', title: 'Labeling Queues' },
      { slug: 'configs', title: 'Annotation Configs' },
      { slug: 'feedback', title: 'Add Human Feedback' },
      { slug: 'labels', title: 'Labels & Corrections' },
      { slug: 'comments', title: 'Comments' },
      { slug: 'export', title: 'Export Annotated Data' },
    ]
  },
  'evaluate': {
    title: 'Evaluate',
    pages: [
      { slug: 'index', title: 'Overview' },
    ],
    subdirs: {
      'datasets': {
        pages: [
          { slug: 'index', title: 'Datasets' },
          { slug: 'create', title: 'Create a Dataset' },
          { slug: 'update', title: 'Update a Dataset' },
          { slug: 'get', title: 'Get a Dataset' },
          { slug: 'auto-add', title: 'Auto-Add to Dataset' },
        ]
      },
      'experiments': {
        pages: [
          { slug: 'index', title: 'Experiments' },
          { slug: 'sdk', title: 'Run Experiments (SDK)' },
          { slug: 'ui', title: 'Run Experiments (UI)' },
          { slug: 'compare', title: 'Compare Experiments' },
          { slug: 'cicd', title: 'CI/CD Integration' },
        ]
      }
    }
  },
  'prompts': {
    title: 'Prompts',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'hub', title: 'Prompt Hub' },
      { slug: 'optimization', title: 'Prompt Optimization' },
      { slug: 'faq', title: 'Troubleshooting & FAQ' },
    ]
  },
  'deploy': {
    title: 'Deploy',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'proxy', title: 'AI Proxy' },
      { slug: 'prompts', title: 'Deploy Prompts' },
      { slug: 'monitor', title: 'Monitor Deployments' },
      { slug: 'mcp', title: 'Model Context Protocol (MCP)' },
    ]
  },
  'integrations': {
    title: 'Integrations',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'model-providers', title: 'Model Providers' },
      { slug: 'cloud-providers', title: 'Cloud Providers' },
      { slug: 'agent-frameworks', title: 'Agent Frameworks' },
      { slug: 'custom', title: 'Custom Integrations' },
    ]
  },
  'sdks': {
    title: 'SDKs',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'python', title: 'Python SDK' },
      { slug: 'javascript', title: 'JavaScript/TypeScript SDK' },
      { slug: 'faq', title: 'Troubleshooting & FAQ' },
    ]
  },
  'platform': {
    title: 'Platform & Administration',
    pages: [
      { slug: 'index', title: 'Overview' },
      { slug: 'auth', title: 'Authentication & Access' },
      { slug: 'security', title: 'Security' },
      { slug: 'api', title: 'API & Data Platform' },
      { slug: 'self-hosting', title: 'Self-Hosting' },
    ]
  }
};

function createPlaceholderPage(title, description) {
  return `---
title: ${title}
description: ${description}
---

# ${title}

This page is under construction. Content coming soon.

## Overview

Documentation for ${title} will be added here.

## Related Links

- [View Full Documentation](/opensearch-agentops-website/docs/)
- [GitHub Repository](https://github.com/anirudha/opensearch-agentops-website)
`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createPages(basePath, section, sectionTitle) {
  // Create main section pages
  section.pages.forEach(page => {
    const filePath = path.join(basePath, `${page.slug}.md`);
    const content = createPlaceholderPage(
      page.title,
      `Learn about ${page.title} in OpenSearch AgentOps`
    );
    fs.writeFileSync(filePath, content);
    console.log(`Created: ${filePath}`);
  });

  // Create subdirectory pages
  if (section.subdirs) {
    Object.entries(section.subdirs).forEach(([subdirName, subdir]) => {
      const subdirPath = path.join(basePath, subdirName);
      ensureDir(subdirPath);
      
      subdir.pages.forEach(page => {
        const filePath = path.join(subdirPath, `${page.slug}.md`);
        const content = createPlaceholderPage(
          page.title,
          `Learn about ${page.title} in OpenSearch AgentOps`
        );
        fs.writeFileSync(filePath, content);
        console.log(`Created: ${filePath}`);
      });
    });
  }
}

// Main execution
const contentDocsPath = path.join(__dirname, 'src', 'content', 'docs');

// Remove existing guides and reference folders
const guidesPath = path.join(contentDocsPath, 'guides');
const referencePath = path.join(contentDocsPath, 'reference');
if (fs.existsSync(guidesPath)) {
  fs.rmSync(guidesPath, { recursive: true });
  console.log('Removed guides folder');
}
if (fs.existsSync(referencePath)) {
  fs.rmSync(referencePath, { recursive: true });
  console.log('Removed reference folder');
}

// Create all documentation sections
Object.entries(docsStructure).forEach(([sectionName, section]) => {
  const sectionPath = path.join(contentDocsPath, sectionName);
  ensureDir(sectionPath);
  createPages(sectionPath, section, section.title);
});

console.log('\n✅ All placeholder pages created successfully!');
