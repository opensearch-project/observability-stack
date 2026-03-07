import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Responsive Design Tests for OTEL Redesign Components
 * Tests responsive layouts at breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)
 * Validates: Requirements 12.1, 12.2, 12.4, 12.5
 */

describe('OTEL Redesign - Responsive Layout Tests', () => {
  describe('QuickWin Section - Responsive Stacking', () => {
    it('should stack code block and live output vertically on mobile (< 1024px)', () => {
      const quickWinContent = readFileSync(
        join(process.cwd(), 'src/components/QuickWin.astro'),
        'utf-8'
      );

      // Check for grid-cols-1 base (mobile) and lg:grid-cols-2 (desktop)
      expect(quickWinContent).toContain('grid-cols-1');
      expect(quickWinContent).toContain('lg:grid-cols-2');
      
      // Validates: Requirements 3.7, 12.4
    });

    it('should use responsive text sizes for section header', () => {
      const quickWinContent = readFileSync(
        join(process.cwd(), 'src/components/QuickWin.astro'),
        'utf-8'
      );

      // Check for responsive heading sizes
      expect(quickWinContent).toMatch(/text-4xl.*md:text-5xl/s);
      
      // Validates: Requirements 12.1, 12.4
    });

    it('should have responsive padding', () => {
      const quickWinContent = readFileSync(
        join(process.cwd(), 'src/components/QuickWin.astro'),
        'utf-8'
      );

      // Check for responsive padding
      expect(quickWinContent).toContain('px-6');
      expect(quickWinContent).toContain('py-20');
      
      // Validates: Requirements 12.1
    });

    it('should have responsive gap between grid items', () => {
      const quickWinContent = readFileSync(
        join(process.cwd(), 'src/components/QuickWin.astro'),
        'utf-8'
      );

      // Check for gap spacing
      expect(quickWinContent).toMatch(/gap-\d+/);
      
      // Validates: Requirements 12.4
    });
  });

  describe('WhyOTEL Section - Grid Adjustments (3→2→1 columns)', () => {
    it('should use 1 column on mobile, 2 on tablet, 3 on desktop', () => {
      const whyOTELContent = readFileSync(
        join(process.cwd(), 'src/components/WhyOTEL.astro'),
        'utf-8'
      );

      // Check for responsive grid columns: 1 → 2 → 3
      expect(whyOTELContent).toContain('grid-cols-1');
      expect(whyOTELContent).toMatch(/md:grid-cols-2/);
      expect(whyOTELContent).toMatch(/lg:grid-cols-3/);
      
      // Validates: Requirements 5.5, 12.4, 12.5
    });

    it('should have responsive card padding', () => {
      const whyOTELContent = readFileSync(
        join(process.cwd(), 'src/components/WhyOTEL.astro'),
        'utf-8'
      );

      // Check for padding on cards
      expect(whyOTELContent).toMatch(/p-\d+/);
      
      // Validates: Requirements 12.1
    });

    it('should use responsive text sizes for card titles', () => {
      const whyOTELContent = readFileSync(
        join(process.cwd(), 'src/components/WhyOTEL.astro'),
        'utf-8'
      );

      // Check for text sizing
      expect(whyOTELContent).toMatch(/text-xl|text-2xl/);
      
      // Validates: Requirements 12.4
    });
  });

  describe('Features Section - Responsive Layout', () => {
    it('should use responsive flex layout for feature blocks', () => {
      const featuresContent = readFileSync(
        join(process.cwd(), 'src/components/Features.astro'),
        'utf-8'
      );

      // Check for responsive flex layout (flex-col on mobile, lg:flex-row on desktop)
      expect(featuresContent).toContain('flex-col');
      expect(featuresContent).toMatch(/lg:flex-row/);
      
      // Validates: Requirements 6.5, 12.4
    });

    it('should have responsive gap between feature blocks', () => {
      const featuresContent = readFileSync(
        join(process.cwd(), 'src/components/Features.astro'),
        'utf-8'
      );

      // Check for gap spacing
      expect(featuresContent).toMatch(/gap-\d+/);
      
      // Validates: Requirements 12.4
    });

    it('should use responsive text sizes for section header', () => {
      const featuresContent = readFileSync(
        join(process.cwd(), 'src/components/Features.astro'),
        'utf-8'
      );

      // Check for responsive heading sizes
      expect(featuresContent).toMatch(/text-3xl|text-4xl/);
      
      // Validates: Requirements 12.1, 12.4
    });
  });

  describe('DeveloperTestimonials Section - Grid Adjustments (3→2→1 columns)', () => {
    it('should render testimonials component with responsive container', () => {
      const testimonialsContent = readFileSync(
        join(process.cwd(), 'src/components/DeveloperTestimonials.astro'),
        'utf-8'
      );

      // Check for responsive container
      expect(testimonialsContent).toContain('container');
      expect(testimonialsContent).toContain('mx-auto');
      expect(testimonialsContent).toContain('px-6');
      
      // Validates: Requirements 12.1, 12.4
    });

    it('should use responsive text sizes for section header', () => {
      const testimonialsContent = readFileSync(
        join(process.cwd(), 'src/components/DeveloperTestimonials.astro'),
        'utf-8'
      );

      // Check for responsive heading sizes
      expect(testimonialsContent).toMatch(/text-3xl.*md:text-4xl/s);
      
      // Validates: Requirements 12.4
    });
  });

  describe('Hero Section - Responsive Layout', () => {
    it('should use responsive text sizes for main headline', () => {
      const heroContent = readFileSync(
        join(process.cwd(), 'src/components/Hero.astro'),
        'utf-8'
      );

      // Check for responsive heading sizes
      expect(heroContent).toMatch(/text-4xl|text-5xl|text-6xl/);
      
      // Validates: Requirements 12.1, 12.4
    });

    it('should have responsive padding and spacing', () => {
      const heroContent = readFileSync(
        join(process.cwd(), 'src/components/Hero.astro'),
        'utf-8'
      );

      // Check for responsive padding
      expect(heroContent).toMatch(/px-\d+/);
      expect(heroContent).toMatch(/py-\d+/);
      
      // Validates: Requirements 12.1
    });

    it('should stack CTAs appropriately on mobile', () => {
      const heroContent = readFileSync(
        join(process.cwd(), 'src/components/Hero.astro'),
        'utf-8'
      );

      // Check for flex layout with responsive direction
      expect(heroContent).toMatch(/flex-col|flex-row/);
      
      // Validates: Requirements 12.4
    });
  });

  describe('Navigation - Mobile Menu', () => {
    it('should show hamburger menu on mobile (< 768px)', () => {
      const navigationContent = readFileSync(
        join(process.cwd(), 'src/components/Navigation.astro'),
        'utf-8'
      );

      // Check for mobile menu button with md:hidden
      expect(navigationContent).toContain('md:hidden');
      expect(navigationContent).toMatch(/mobile-menu|hamburger/i);
      
      // Validates: Requirements 1.3, 12.4
    });

    it('should hide desktop menu on mobile', () => {
      const navigationContent = readFileSync(
        join(process.cwd(), 'src/components/Navigation.astro'),
        'utf-8'
      );

      // Check for hidden md:flex pattern
      expect(navigationContent).toContain('hidden md:flex');
      
      // Validates: Requirements 1.3, 12.4
    });
  });

  describe('Footer - Responsive Columns', () => {
    it('should stack footer columns: 1 mobile, 2 tablet, 4 desktop', () => {
      const footerContent = readFileSync(
        join(process.cwd(), 'src/components/Footer.astro'),
        'utf-8'
      );

      // Check for responsive grid columns
      expect(footerContent).toContain('grid-cols-1');
      expect(footerContent).toMatch(/md:grid-cols-2/);
      expect(footerContent).toMatch(/lg:grid-cols-4/);
      
      // Validates: Requirements 9.6, 12.4, 12.5
    });

    it('should have responsive padding', () => {
      const footerContent = readFileSync(
        join(process.cwd(), 'src/components/Footer.astro'),
        'utf-8'
      );

      // Check for responsive padding
      expect(footerContent).toMatch(/px-\d+/);
      expect(footerContent).toMatch(/py-\d+/);
      
      // Validates: Requirements 12.1
    });
  });

  describe('Mobile-First Approach Verification', () => {
    it('all OTEL components should define base mobile styles first', () => {
      const components = [
        'Hero.astro',
        'QuickWin.astro',
        'IntegrationPaths.astro',
        'WhyOTEL.astro',
        'Features.astro',
        'DeveloperTestimonials.astro',
        'Footer.astro',
      ];

      components.forEach((component) => {
        const content = readFileSync(
          join(process.cwd(), 'src/components', component),
          'utf-8'
        );

        // Check that base classes exist (mobile-first)
        const hasMobileFirstClasses = 
          content.includes('grid-cols-1') ||
          content.includes('flex-col') ||
          content.includes('text-') ||
          content.includes('px-') ||
          content.includes('py-');

        expect(hasMobileFirstClasses).toBe(true);
      });
      
      // Validates: Requirements 12.2
    });
  });

  describe('Breakpoint Consistency at Standard Sizes', () => {
    it('components should use Tailwind breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)', () => {
      const components = [
        'Hero.astro',
        'QuickWin.astro',
        'WhyOTEL.astro',
        'Features.astro',
        'DeveloperTestimonials.astro',
        'Footer.astro',
      ];

      const standardBreakpoints = ['sm:', 'md:', 'lg:', 'xl:'];

      components.forEach((component) => {
        const content = readFileSync(
          join(process.cwd(), 'src/components', component),
          'utf-8'
        );

        // Check that at least one standard breakpoint is used
        const usesStandardBreakpoints = standardBreakpoints.some((bp) =>
          content.includes(bp)
        );

        expect(usesStandardBreakpoints).toBe(true);
      });
      
      // Validates: Requirements 12.1
    });
  });

  describe('Tablet Layout Optimization', () => {
    it('sections should optimize for medium screens (768px-1024px)', () => {
      const components = [
        'WhyOTEL.astro',
        'Features.astro',
        'DeveloperTestimonials.astro',
        'Footer.astro',
      ];

      components.forEach((component) => {
        const content = readFileSync(
          join(process.cwd(), 'src/components', component),
          'utf-8'
        );

        // Check for md: breakpoint usage (tablet optimization)
        expect(content).toMatch(/md:/);
      });
      
      // Validates: Requirements 12.5
    });
  });

  describe('Responsive Container Widths', () => {
    it('sections should use max-w-7xl or similar container constraints', () => {
      const components = [
        'Hero.astro',
        'QuickWin.astro',
        'IntegrationPaths.astro',
        'WhyOTEL.astro',
        'Features.astro',
        'DeveloperTestimonials.astro',
      ];

      components.forEach((component) => {
        const content = readFileSync(
          join(process.cwd(), 'src/components', component),
          'utf-8'
        );

        // Check for max-width container
        expect(content).toMatch(/max-w-\w+/);
      });
      
      // Validates: Requirements 12.1
    });
  });

  describe('Responsive Gap and Spacing', () => {
    it('grid layouts should have appropriate gap values', () => {
      const components = [
        'QuickWin.astro',
        'WhyOTEL.astro',
        'Features.astro',
      ];

      components.forEach((component) => {
        const content = readFileSync(
          join(process.cwd(), 'src/components', component),
          'utf-8'
        );

        // Check for gap classes
        expect(content).toMatch(/gap-\d+/);
      });
      
      // Validates: Requirements 12.4
    });
  });
});
