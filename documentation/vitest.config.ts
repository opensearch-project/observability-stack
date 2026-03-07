import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules/',
        'dist/',
        '.astro/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.*',
        '**/scripts/**',
        'src/**/*.astro',
      ],
    },
  },
});
