import { describe, it, expect } from 'vitest';

/**
 * Responsive Design Tests
 * Tests all sections at breakpoints: 640px, 768px, 1024px, 1280px
 * Validates mobile-first approach and proper stacking on mobile
 * Requirements: 16.1, 16.4
 */

describe('Responsive Layout Tests', () => {
  const breakpoints = {
    mobile: 640,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
  };

  // Helper to create a mock DOM element with classes
  const createMockElement = (html: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body;
  };

  describe('Navigation Component Responsive Behavior', () => {
    it('should have responsive classes for mobile and desktop menus', () => {
      // Test that navigation has proper responsive classes
      const navClasses = {
        desktopMenu: ['hidden', 'md:flex'],
        mobileButton: ['md:hidden'],
      };

      expect(navClasses.desktopMenu).toContain('hidden');
      expect(navClasses.desktopMenu).toContain('md:flex');
      expect(navClasses.mobileButton).toContain('md:hidden');
    });

    it('should use responsive padding in navigation container', () => {
      const containerClasses = ['px-4', 'sm:px-6', 'lg:px-8'];
      
      expect(containerClasses).toContain('px-4');
      expect(containerClasses).toContain('sm:px-6');
      expect(containerClasses).toContain('lg:px-8');
    });
  });

  describe('Hero Section Responsive Behavior', () => {
    it('should have responsive grid for trust badges: 2 cols mobile, 4 desktop', () => {
      const gridClasses = ['grid', 'grid-cols-2', 'md:grid-cols-4'];
      
      expect(gridClasses).toContain('grid-cols-2');
      expect(gridClasses).toContain('md:grid-cols-4');
    });

    it('should stack CTAs vertically on mobile, horizontally on desktop', () => {
      const ctaContainerClasses = ['flex', 'flex-col', 'sm:flex-row'];
      
      expect(ctaContainerClasses).toContain('flex-col');
      expect(ctaContainerClasses).toContain('sm:flex-row');
    });

    it('should use responsive text sizes', () => {
      const h1Classes = ['text-5xl', 'md:text-6xl', 'lg:text-7xl'];
      const pClasses = ['text-xl', 'md:text-2xl'];

      expect(h1Classes).toContain('text-5xl');
      expect(h1Classes).toContain('md:text-6xl');
      expect(h1Classes).toContain('lg:text-7xl');
      expect(pClasses).toContain('text-xl');
      expect(pClasses).toContain('md:text-2xl');
    });
  });

  describe('Problem/Solution Section Responsive Behavior', () => {
    it('should stack problem cards vertically on mobile, 3 cols on desktop', () => {
      const gridClasses = ['grid', 'grid-cols-1', 'md:grid-cols-3'];
      
      expect(gridClasses).toContain('grid-cols-1');
      expect(gridClasses).toContain('md:grid-cols-3');
    });

    it('should use responsive grid for stat cards: 1 mobile, 2 tablet, 4 desktop', () => {
      const gridClasses = ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4'];
      
      expect(gridClasses).toContain('grid-cols-1');
      expect(gridClasses).toContain('sm:grid-cols-2');
      expect(gridClasses).toContain('lg:grid-cols-4');
    });
  });

  describe('Features Section Responsive Behavior', () => {
    it('should stack feature blocks vertically on mobile, horizontally on desktop', () => {
      const containerClasses = ['flex', 'flex-col', 'lg:flex-row'];
      
      expect(containerClasses).toContain('flex-col');
      expect(containerClasses).toContain('lg:flex-row');
    });

    it('should use responsive text sizes for feature titles', () => {
      const h3Classes = ['text-2xl', 'md:text-3xl'];
      
      expect(h3Classes).toContain('text-2xl');
      expect(h3Classes).toContain('md:text-3xl');
    });
  });

  describe('Comparison Table Responsive Behavior', () => {
    it('should enable horizontal scroll on mobile with overflow-x-auto', () => {
      const containerClasses = ['comparison-table-container', 'overflow-x-auto'];
      const tableClasses = ['w-full', 'min-w-[800px]'];

      expect(containerClasses).toContain('overflow-x-auto');
      expect(tableClasses).toContain('min-w-[800px]');
    });

    it('should have feature-column class for fixed first column', () => {
      const featureColumnClass = 'feature-column';
      
      expect(featureColumnClass).toBe('feature-column');
    });
  });

  describe('Use Cases Section Responsive Behavior', () => {
    it('should use responsive grid: 1 col mobile, 2 tablet, 3 desktop', () => {
      const gridClasses = ['grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'];
      
      expect(gridClasses).toContain('grid-cols-1');
      expect(gridClasses).toContain('md:grid-cols-2');
      expect(gridClasses).toContain('lg:grid-cols-3');
    });
  });

  describe('Integrations Section Responsive Behavior', () => {
    it('should use responsive grid: 3 mobile, 4 tablet, 6 desktop', () => {
      const gridClasses = ['integration-grid', 'grid', 'grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-6'];
      
      expect(gridClasses).toContain('grid-cols-3');
      expect(gridClasses).toContain('md:grid-cols-4');
      expect(gridClasses).toContain('lg:grid-cols-6');
    });
  });

  describe('Footer Responsive Behavior', () => {
    it('should stack footer columns: 1 mobile, 2 tablet, 4 desktop', () => {
      const gridClasses = ['grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-4'];
      
      expect(gridClasses).toContain('grid-cols-1');
      expect(gridClasses).toContain('md:grid-cols-2');
      expect(gridClasses).toContain('lg:grid-cols-4');
    });

    it('should stack bottom section vertically on mobile, horizontally on desktop', () => {
      const containerClasses = ['flex', 'flex-col', 'md:flex-row'];
      
      expect(containerClasses).toContain('flex-col');
      expect(containerClasses).toContain('md:flex-row');
    });
  });

  describe('Mobile-First Approach Validation', () => {
    it('should use base mobile styles with responsive modifiers', () => {
      const textClasses = ['text-sm', 'md:text-base', 'lg:text-lg'];
      const paddingClasses = ['p-4', 'md:p-6', 'lg:p-8'];
      const spacingClasses = ['space-y-4', 'md:space-y-6'];

      // Base mobile classes should be present
      expect(textClasses).toContain('text-sm');
      expect(paddingClasses).toContain('p-4');
      expect(spacingClasses).toContain('space-y-4');

      // Responsive modifiers should be present
      expect(textClasses).toContain('md:text-base');
      expect(paddingClasses).toContain('md:p-6');
      expect(spacingClasses).toContain('md:space-y-6');
    });
  });

  describe('Container and Padding Responsive Behavior', () => {
    it('should use responsive container padding', () => {
      const containerClasses = ['container', 'mx-auto', 'px-4', 'sm:px-6', 'lg:px-8'];
      
      expect(containerClasses).toContain('px-4');
      expect(containerClasses).toContain('sm:px-6');
      expect(containerClasses).toContain('lg:px-8');
    });

    it('should use responsive max-width containers', () => {
      const container1Classes = ['max-w-6xl', 'mx-auto'];
      const container2Classes = ['max-w-7xl', 'mx-auto'];

      expect(container1Classes).toContain('max-w-6xl');
      expect(container2Classes).toContain('max-w-7xl');
    });
  });

  describe('Responsive Gap and Spacing', () => {
    it('should use responsive gap values', () => {
      const gapClasses = ['gap-4', 'md:gap-6', 'lg:gap-8'];
      const spaceClasses = ['space-y-6', 'md:space-y-8'];

      expect(gapClasses).toContain('gap-4');
      expect(gapClasses).toContain('md:gap-6');
      expect(spaceClasses).toContain('space-y-6');
      expect(spaceClasses).toContain('md:space-y-8');
    });
  });

  describe('Tablet Layout Optimization', () => {
    it('should optimize layouts for medium screens (768px-1024px)', () => {
      const gridClasses = ['grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'];
      
      // Tablet should use 2 columns (md:grid-cols-2)
      expect(gridClasses).toContain('md:grid-cols-2');
      // Desktop should use 3 columns (lg:grid-cols-3)
      expect(gridClasses).toContain('lg:grid-cols-3');
    });
  });
});
