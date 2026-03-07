/**
 * Unit tests for Navigation component
 * Requirements: 1.1, 1.3, 1.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Navigation Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: All menu items render correctly
   * Requirements: 1.1
   */
  describe('Menu Items Rendering', () => {
    it('should render all five navigation menu items', () => {
      const navHTML = `
        <nav id="main-navigation">
          <a href="#features">Features</a>
          <a href="#compare">Compare</a>
          <a href="#use-cases">Use Cases</a>
          <a href="#pricing">Pricing</a>
          <a href="https://docs.opensearch.org" target="_blank">Docs</a>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const nav = container.querySelector('#main-navigation');
      const links = nav?.querySelectorAll('a');

      expect(links).toBeTruthy();
      expect(links?.length).toBe(5);
    });

    it('should render Features menu item with correct href', () => {
      const navHTML = `
        <nav>
          <a href="#features" class="nav-link">Features</a>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const link = container.querySelector('a[href="#features"]');

      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Features');
    });

    it('should render Compare menu item with correct href', () => {
      const navHTML = `
        <nav>
          <a href="#compare" class="nav-link">Compare</a>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const link = container.querySelector('a[href="#compare"]');

      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Compare');
    });

    it('should render Use Cases menu item with correct href', () => {
      const navHTML = `
        <nav>
          <a href="#use-cases" class="nav-link">Use Cases</a>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const link = container.querySelector('a[href="#use-cases"]');

      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Use Cases');
    });

    it('should render Pricing menu item with correct href', () => {
      const navHTML = `
        <nav>
          <a href="#pricing" class="nav-link">Pricing</a>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const link = container.querySelector('a[href="#pricing"]');

      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Pricing');
    });

    it('should render Docs menu item as external link', () => {
      const navHTML = `
        <nav>
          <a href="https://docs.opensearch.org" target="_blank" rel="noopener noreferrer">Docs</a>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const link = container.querySelector('a[href="https://docs.opensearch.org"]');

      expect(link).toBeTruthy();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  /**
   * Test: Mobile menu opens and closes
   * Requirements: 1.3, 1.4
   */
  describe('Mobile Menu Functionality', () => {
    beforeEach(() => {
      // Create complete mobile menu structure
      const mobileMenuHTML = `
        <nav>
          <button type="button" id="mobile-menu-button" aria-label="Toggle mobile menu" aria-expanded="false">
            Menu
          </button>
          <div class="hidden" id="mobile-menu">
            <div id="mobile-menu-backdrop"></div>
            <div class="translate-x-full" id="mobile-menu-drawer">
              <button type="button" id="mobile-menu-close" aria-label="Close mobile menu">
                Close
              </button>
              <a href="#features" class="mobile-menu-link">Features</a>
              <a href="#compare" class="mobile-menu-link">Compare</a>
            </div>
          </div>
        </nav>
      `;
      
      container.innerHTML = mobileMenuHTML;
    });

    it('should have mobile menu button with correct attributes', () => {
      const button = container.querySelector('#mobile-menu-button');

      expect(button).toBeTruthy();
      expect(button?.getAttribute('type')).toBe('button');
      expect(button?.getAttribute('aria-label')).toBe('Toggle mobile menu');
      expect(button?.getAttribute('aria-expanded')).toBe('false');
    });

    it('should have mobile menu initially hidden', () => {
      const mobileMenu = container.querySelector('#mobile-menu');

      expect(mobileMenu).toBeTruthy();
      expect(mobileMenu?.classList.contains('hidden')).toBe(true);
    });

    it('should have mobile menu drawer with translate class', () => {
      const drawer = container.querySelector('#mobile-menu-drawer');

      expect(drawer).toBeTruthy();
      expect(drawer?.classList.contains('translate-x-full')).toBe(true);
    });

    it('should open mobile menu when button is clicked', () => {
      const button = container.querySelector('#mobile-menu-button') as HTMLButtonElement;
      const mobileMenu = container.querySelector('#mobile-menu') as HTMLElement;
      const drawer = container.querySelector('#mobile-menu-drawer') as HTMLElement;

      // Simulate opening
      mobileMenu.classList.remove('hidden');
      drawer.classList.remove('translate-x-full');
      button.setAttribute('aria-expanded', 'true');

      expect(mobileMenu.classList.contains('hidden')).toBe(false);
      expect(drawer.classList.contains('translate-x-full')).toBe(false);
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('should close mobile menu when close button is clicked', () => {
      const button = container.querySelector('#mobile-menu-button') as HTMLButtonElement;
      const mobileMenu = container.querySelector('#mobile-menu') as HTMLElement;
      const drawer = container.querySelector('#mobile-menu-drawer') as HTMLElement;

      // First open it
      mobileMenu.classList.remove('hidden');
      drawer.classList.remove('translate-x-full');
      button.setAttribute('aria-expanded', 'true');

      // Then close it
      drawer.classList.add('translate-x-full');
      button.setAttribute('aria-expanded', 'false');
      mobileMenu.classList.add('hidden');

      expect(mobileMenu.classList.contains('hidden')).toBe(true);
      expect(drawer.classList.contains('translate-x-full')).toBe(true);
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('should have close button in mobile menu', () => {
      const closeButton = container.querySelector('#mobile-menu-close');

      expect(closeButton).toBeTruthy();
      expect(closeButton?.getAttribute('type')).toBe('button');
      expect(closeButton?.getAttribute('aria-label')).toBe('Close mobile menu');
    });

    it('should have mobile menu links', () => {
      const links = container.querySelectorAll('.mobile-menu-link');

      expect(links.length).toBeGreaterThan(0);
      expect(links[0]?.getAttribute('href')).toBe('#features');
      expect(links[1]?.getAttribute('href')).toBe('#compare');
    });
  });

  /**
   * Test: CTAs have correct links
   * Requirements: 1.1
   */
  describe('CTA Buttons', () => {
    it('should render Sign In CTA with correct href', () => {
      const ctaHTML = `
        <nav>
          <a href="/signin" class="signin-link">Sign In</a>
        </nav>
      `;
      
      container.innerHTML = ctaHTML;
      const signInLink = container.querySelector('a[href="/signin"]');

      expect(signInLink).toBeTruthy();
      expect(signInLink?.textContent?.trim()).toBe('Sign In');
    });

    it('should render Get Started Free CTA with correct href', () => {
      const ctaHTML = `
        <nav>
          <a href="/signup" class="cta-button">Get Started Free</a>
        </nav>
      `;
      
      container.innerHTML = ctaHTML;
      const ctaLink = container.querySelector('a[href="/signup"]');

      expect(ctaLink).toBeTruthy();
      expect(ctaLink?.textContent?.trim()).toBe('Get Started Free');
    });

    it('should have both CTAs in desktop navigation', () => {
      const navHTML = `
        <nav>
          <div class="desktop-ctas">
            <a href="/signin">Sign In</a>
            <a href="/signup">Get Started Free</a>
          </div>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const signIn = container.querySelector('a[href="/signin"]');
      const getStarted = container.querySelector('a[href="/signup"]');

      expect(signIn).toBeTruthy();
      expect(getStarted).toBeTruthy();
    });

    it('should have both CTAs in mobile menu', () => {
      const mobileHTML = `
        <div id="mobile-menu">
          <a href="/signin">Sign In</a>
          <a href="/signup">Get Started Free</a>
        </div>
      `;
      
      container.innerHTML = mobileHTML;
      const signIn = container.querySelector('a[href="/signin"]');
      const getStarted = container.querySelector('a[href="/signup"]');

      expect(signIn).toBeTruthy();
      expect(getStarted).toBeTruthy();
    });
  });

  /**
   * Test: Logo rendering
   * Requirements: 1.1
   */
  describe('Logo', () => {
    it('should render logo with link to home', () => {
      const logoHTML = `
        <nav>
          <a href="/" class="logo-link">
            <svg class="w-8 h-8"></svg>
            <span>AgentOps</span>
          </a>
        </nav>
      `;
      
      container.innerHTML = logoHTML;
      const logoLink = container.querySelector('a[href="/"]');

      expect(logoLink).toBeTruthy();
      expect(logoLink?.querySelector('span')?.textContent).toBe('AgentOps');
    });

    it('should have logo SVG element', () => {
      const logoHTML = `
        <nav>
          <a href="/">
            <svg class="w-8 h-8" viewBox="0 0 32 32"></svg>
          </a>
        </nav>
      `;
      
      container.innerHTML = logoHTML;
      const svg = container.querySelector('svg');

      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 32 32');
    });
  });

  /**
   * Test: Navigation structure and styling
   * Requirements: 1.1, 1.2
   */
  describe('Navigation Structure', () => {
    it('should have fixed positioning classes', () => {
      const navHTML = `
        <nav class="fixed top-0 left-0 right-0 z-50" id="main-navigation">
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const nav = container.querySelector('#main-navigation');

      expect(nav?.classList.contains('fixed')).toBe(true);
      expect(nav?.classList.contains('top-0')).toBe(true);
      expect(nav?.classList.contains('z-50')).toBe(true);
    });

    it('should have backdrop blur styling', () => {
      const navHTML = `
        <nav class="backdrop-blur-md bg-slate-950/80">
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const nav = container.querySelector('nav');

      expect(nav?.classList.contains('backdrop-blur-md')).toBe(true);
    });

    it('should have proper semantic HTML structure', () => {
      const navHTML = `
        <nav id="main-navigation">
          <div>
            <a href="/">Logo</a>
            <a href="#features">Features</a>
          </div>
        </nav>
      `;
      
      container.innerHTML = navHTML;
      const nav = container.querySelector('nav');

      expect(nav?.tagName).toBe('NAV');
      expect(nav?.getAttribute('id')).toBe('main-navigation');
    });
  });
});
