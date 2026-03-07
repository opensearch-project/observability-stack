# AgentOps Documentation Site

## Overview

A complete documentation site has been created for the AgentOps AI observability platform, featuring 83 pages organized in a hierarchical structure that follows OpenTelemetry-first and agent-focused principles.

## Access

- **URL**: `/docs` (linked from main navigation)
- **Navigation**: Updated "Docs" link in header now points to `/docs` instead of external URL

## Site Structure

```
📚 Documentation Site (83 pages)
├── 🚀 Get Started (7 pages)
│   ├── Overview
│   ├── Quickstart
│   │   ├── Log Your First Traces
│   │   ├── Run Your First Eval
│   │   └── Use Prompt Management
│   ├── Core Concepts
│   ├── Example Project
│   └── Ask AI
│
├── 🔧 Instrument (15 pages)
│   ├── Overview
│   ├── OpenTelemetry Setup
│   │   ├── OTel Collector Configuration
│   │   ├── Auto-Instrumentation
│   │   └── Manual Instrumentation
│   ├── Wrap AI Providers
│   ├── Integrate Frameworks
│   ├── Add Custom Tracing
│   ├── Advanced Tracing Patterns
│   │   ├── Distributed Tracing
│   │   ├── Trace IDs & Propagation
│   │   ├── Sampling Strategies
│   │   └── Event Queuing/Batching
│   ├── Capture User Feedback
│   └── Log Attachments
│
├── 👁️ Observe (17 pages)
│   ├── Overview
│   ├── Tracing
│   │   ├── View & Manage Traces
│   │   ├── Filter & Search Logs
│   │   ├── Sessions
│   │   ├── Trace URLs
│   │   └── Multi-Modality
│   ├── Agent Observability
│   │   ├── Agent Graph & Path
│   │   ├── Tool Call Tracing
│   │   ├── Reasoning Steps
│   │   └── MCP Tracing
│   └── Projects
│       ├── Environments
│       ├── Tags & Metadata
│       ├── Releases & Versioning
│       └── Custom Metrics
│
├── 🏷️ Annotate (7 pages)
│   ├── Overview
│   ├── Labeling Queues
│   ├── Annotation Configs
│   ├── Add Human Feedback
│   ├── Labels & Corrections
│   ├── Comments
│   └── Export Annotated Data
│
├── 📊 Evaluate (11 pages)
│   ├── Overview
│   ├── Datasets
│   │   ├── Create a Dataset
│   │   ├── Update a Dataset
│   │   ├── Get a Dataset
│   │   └── Auto-Add to Dataset
│   └── Experiments
│       ├── Run Experiments (SDK)
│       ├── Run Experiments (UI)
│       ├── Compare Experiments
│       └── CI/CD Integration
│
├── 📝 Prompts (4 pages)
│   ├── Overview
│   ├── Prompt Hub
│   ├── Prompt Optimization
│   └── Troubleshooting & FAQ
│
├── 🚀 Deploy (5 pages)
│   ├── Overview
│   ├── AI Proxy
│   ├── Deploy Prompts
│   ├── Monitor Deployments
│   └── Model Context Protocol (MCP)
│
├── 🔌 Integrations (5 pages)
│   ├── Overview
│   ├── Model Providers
│   ├── Cloud Providers
│   ├── Agent Frameworks
│   └── Custom Integrations
│
├── 📦 SDKs (4 pages)
│   ├── Overview
│   ├── Python SDK
│   ├── JavaScript/TypeScript SDK
│   └── Troubleshooting & FAQ
│
└── 🔐 Platform & Administration (5 pages)
    ├── Overview
    ├── Authentication & Access
    ├── Security
    ├── API & Data Platform
    └── Self-Hosting
```

## Key Features

### Layout & Navigation
- **DocsLayout.astro**: Custom documentation layout with fixed header and sidebar
- **DocsSidebar.astro**: Comprehensive navigation sidebar with all sections
- Responsive design matching the main site aesthetic
- Active page highlighting in navigation
- Breadcrumb-style section indicators

### Design Principles
- **OTel-First**: Dedicated OpenTelemetry instrumentation section
- **Agent-Focused**: Specialized agent observability features
- **Developer Experience**: Clear workflow from Instrument → Observe → Evaluate → Deploy
- **Enterprise-Ready**: Platform administration and security sections

### Content Structure
- Each page includes:
  - Section breadcrumb
  - Page title and description
  - Placeholder content (ready for detailed documentation)
  - Consistent styling with prose formatting

## Files Created

### Layouts
- `src/layouts/DocsLayout.astro` - Main documentation layout

### Components
- `src/components/DocsSidebar.astro` - Navigation sidebar

### Pages (80 documentation pages)
- `src/pages/docs/index.astro` - Documentation home
- `src/pages/docs/get-started/` - 7 pages
- `src/pages/docs/instrument/` - 15 pages
- `src/pages/docs/observe/` - 17 pages
- `src/pages/docs/annotate/` - 7 pages
- `src/pages/docs/evaluate/` - 11 pages
- `src/pages/docs/prompts/` - 4 pages
- `src/pages/docs/deploy/` - 5 pages
- `src/pages/docs/integrations/` - 5 pages
- `src/pages/docs/sdks/` - 4 pages
- `src/pages/docs/platform/` - 5 pages

### Scripts
- `scripts/generate-docs.js` - Page generation script

### Documentation
- `src/pages/docs/README.md` - Documentation structure guide
- `DOCS_STRUCTURE.md` - This file

## Updates Made

### Navigation Component
- Updated `src/components/Navigation.astro`
- Changed "Docs" link from external URL to `/docs`
- Removed `isExternal: true` flag for docs link

## Build Status

✅ Build successful: 83 pages generated
✅ All routes accessible
✅ Navigation working correctly
✅ Responsive design implemented

## Next Steps

To add content to the documentation pages:

1. Navigate to the specific page file in `src/pages/docs/`
2. Replace the placeholder content with actual documentation
3. Add code examples, diagrams, and detailed explanations
4. Build and deploy: `npm run build`

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Regenerate page structure (if needed)
node scripts/generate-docs.js
```

## URLs

All documentation pages follow clean URL patterns:
- `/docs` - Documentation home
- `/docs/get-started` - Get Started section
- `/docs/instrument/opentelemetry/collector` - Nested pages
- etc.
