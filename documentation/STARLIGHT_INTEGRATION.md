# Starlight Getting Started Integration

## Overview

Successfully integrated Astro Starlight as a separate documentation site for the "Getting Started" guide. This approach avoids the conflicts we encountered when trying to integrate Starlight directly into the main site.

## What Was Done

### 1. Created Separate Starlight Project
- Location: `starlight-docs/` subdirectory
- Configured with base path: `/opensearch-agentops-website/getting-started`
- Completely isolated from main site to avoid conflicts

### 2. Initial Documentation Pages
Created three starter pages in `starlight-docs/src/content/docs/`:

- **index.md** - Introduction to OpenSearch AgentOps
- **quickstart.md** - 5-minute quick start guide
- **installation.md** - Detailed installation instructions

### 3. Build Pipeline Integration
Updated `package.json` with new scripts:
```json
"build": "npm run build:main && npm run build:starlight && npm run merge:docs",
"build:main": "astro build",
"build:starlight": "cd starlight-docs && npm ci && npm run build",
"merge:docs": "mkdir -p dist/getting-started && cp -r starlight-docs/dist/* dist/getting-started/"
```

### 4. GitHub Actions Workflow
Updated `.github/workflows/deploy.yml` to:
1. Install dependencies for both projects
2. Build main site
3. Build Starlight docs
4. Merge Starlight docs into `dist/getting-started/`
5. Deploy combined site to GitHub Pages

### 5. Navigation Updates
Added "Getting Started" link to main navigation in `src/components/Navigation.astro`:
- Desktop navigation
- Mobile navigation
- Links to `/getting-started/` path

### 6. Documentation Updates
Updated `README.md` with:
- New "Getting Started Guide" section
- Updated project structure showing `starlight-docs/`
- New build commands documentation

## URLs

- **Main Site**: https://anirudha.github.io/opensearch-agentops-website/
- **Documentation**: https://anirudha.github.io/opensearch-agentops-website/docs/
- **Getting Started**: https://anirudha.github.io/opensearch-agentops-website/getting-started/

## Local Development

### Main Site
```bash
npm run dev
# Visit http://localhost:4321/opensearch-agentops-website/
```

### Starlight Docs Only
```bash
cd starlight-docs
npm run dev
# Visit http://localhost:4321/opensearch-agentops-website/getting-started/
```

### Build Everything
```bash
npm run build
npm run preview
# Visit http://localhost:4322/opensearch-agentops-website/
```

## Testing

All 569 tests continue to pass:
```bash
npm test
```

## Why This Approach Works

1. **Isolation**: Starlight runs in its own subdirectory with its own dependencies
2. **No Conflicts**: Main site and Starlight don't share configuration or dependencies
3. **Clean Deployment**: Both sites build separately and merge at deployment time
4. **Maintainability**: Each site can be updated independently
5. **Scalability**: Easy to add more Starlight sections in the future

## Future Enhancements

- Add more pages to Getting Started guide
- Implement search across both documentation sites
- Add cross-linking between main docs and Getting Started
- Consider adding more Starlight sections (API Reference, Tutorials, etc.)

## Commit

Committed as: `497dd62 - Add Starlight Getting Started docs`
Pushed to: `main` branch
