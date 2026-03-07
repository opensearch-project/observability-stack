import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Tailwind CSS Configuration', () => {
  it('should include custom theme values', () => {
    const globalCssContent = readFileSync(
      join(process.cwd(), 'src/styles/global.css'),
      'utf-8'
    );

    // Check for custom color definitions
    expect(globalCssContent).toContain('--color-primary-500');
    expect(globalCssContent).toContain('--color-secondary-500');
    expect(globalCssContent).toContain('--color-accent-500');
    
    // Check for custom font definitions
    expect(globalCssContent).toContain('--font-sans');
    expect(globalCssContent).toContain('--font-mono');
    
    // Check for custom spacing definitions
    expect(globalCssContent).toContain('--spacing-18');
    expect(globalCssContent).toContain('--spacing-22');
    expect(globalCssContent).toContain('--spacing-26');
    expect(globalCssContent).toContain('--spacing-30');
  });

  it('should include base styles', () => {
    const globalCssContent = readFileSync(
      join(process.cwd(), 'src/styles/global.css'),
      'utf-8'
    );

    // Check for body styles
    expect(globalCssContent).toContain('body {');
    expect(globalCssContent).toContain('background-color: #0a0e1a');
    expect(globalCssContent).toContain('text-slate-100');
  });

  it('should include smooth scroll behavior', () => {
    const globalCssContent = readFileSync(
      join(process.cwd(), 'src/styles/global.css'),
      'utf-8'
    );

    expect(globalCssContent).toContain('scroll-behavior: smooth');
  });

  it('should import Tailwind CSS', () => {
    const globalCssContent = readFileSync(
      join(process.cwd(), 'src/styles/global.css'),
      'utf-8'
    );

    expect(globalCssContent).toContain('@import "tailwindcss"');
  });

  it('should define @theme block', () => {
    const globalCssContent = readFileSync(
      join(process.cwd(), 'src/styles/global.css'),
      'utf-8'
    );

    expect(globalCssContent).toContain('@theme {');
  });
});
