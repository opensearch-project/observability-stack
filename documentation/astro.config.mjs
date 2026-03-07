// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://anirudha.github.io',
  base: '/opensearch-agentops-website',
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Minimize JavaScript bundle size with esbuild (built-in, faster)
      minify: 'esbuild',
      cssMinify: true,
      // Rollup options for better tree-shaking
      rollupOptions: {
        output: {
          // Manual chunks for better code splitting
          manualChunks: (id) => {
            // Vendor chunks for better caching
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  },
  build: {
    // Inline small assets to reduce HTTP requests
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  image: {
    // Configure image optimization with Sharp
    // Sharp provides fast, high-quality image processing
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: false,
      },
    },
    // Default image formats - WebP and AVIF for modern browsers
    // WebP: ~30% smaller than JPEG, widely supported
    // AVIF: ~50% smaller than JPEG, growing support
    formats: ['webp', 'avif'],
    // Quality setting balances file size and visual quality
    // 80 is optimal for web (imperceptible quality loss, significant size reduction)
    quality: 80,
  },
});