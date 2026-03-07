# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marketing website and documentation for OpenSearch Observability Stack — an OpenTelemetry-native observability platform. Built with Astro 5, React 19, and Tailwind CSS 4.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Dev server at localhost:4321
npm run build            # Full production build (main site + Starlight docs)
npm run build:main       # Build main site only
npm run build:starlight  # Build Starlight docs only (runs npm ci in starlight-docs/)
npm test                 # Run all tests (vitest --run)
npx vitest --run src/components/Hero.test.ts  # Run a single test file
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with v8 coverage
```

## Architecture

### Two-Site Build

The project produces two separate Astro builds merged into one output:

1. **Main marketing site** (`src/`) — Astro + React + Tailwind. Single-page landing at `/`. Configured in root `astro.config.mjs`.
2. **Documentation site** (`starlight-docs/`) — Astro Starlight. Served at `/docs/`. Has its own `package.json` and `astro.config.mjs`. The `build` script runs both and copies Starlight output into `dist/docs/`.

Both sites use `base: '/'` (or `/docs`) for custom domain deployment at `observability.opensearch.org`. All internal links must respect this base path.

### Component Patterns

- **Astro components** (`.astro`) handle static markup and layout (Hero, Features, Navigation, Footer, etc.)
- **React components** (`.tsx`) handle interactive/client-side behavior (CyclingTagline, IntegrationPathsTabs, DeveloperTestimonials)
- Components and their tests live side-by-side in `src/components/`

### Testing

- **Framework**: Vitest with happy-dom environment
- **Setup**: `vitest.setup.ts` imports `@testing-library/jest-dom/vitest`
- **Test location**: Co-located with source files (e.g., `Hero.astro` → `Hero.test.ts`, `Hero.unit.test.ts`)
- **React component tests**: Use `@testing-library/react` (`.test.tsx` files)
- **Astro component tests**: Test HTML output as strings (`.test.ts` / `.unit.test.ts` files)
- **Coverage**: Includes only `src/**/*.{ts,tsx}`, excludes `.astro` files

### Starlight Docs

Documentation content lives in `starlight-docs/src/content/docs/` organized by section directories (get-started, send-data, investigate, apm, dashboards, alerts, etc.). Pages are Markdown/MDX with required frontmatter (`title`, `description`). Sidebar is auto-generated from directory structure via `starlight-docs/astro.config.mjs`.

To dev the docs site independently:
```bash
cd starlight-docs && npm install && npm run dev
```
