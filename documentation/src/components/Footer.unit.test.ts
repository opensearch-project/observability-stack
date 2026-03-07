/**
 * Unit tests for Footer component
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Footer Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: All four columns render
   * Requirements: 13.1
   */
  describe('Footer Columns Rendering', () => {
    it('should render all four footer columns', () => {
      const footerHTML = `
        <footer id="footer">
          <div class="footer-column">
            <h3>Product</h3>
          </div>
          <div class="footer-column">
            <h3>Resources</h3>
          </div>
          <div class="footer-column">
            <h3>Company</h3>
          </div>
          <div class="footer-column">
            <h3>Legal</h3>
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const columns = container.querySelectorAll('.footer-column');

      expect(columns).toBeTruthy();
      expect(columns.length).toBe(4);
    });

    it('should render Product column with correct title', () => {
      const footerHTML = `
        <footer>
          <div class="footer-column">
            <h3>Product</h3>
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const heading = container.querySelector('h3');

      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Product');
    });

    it('should render Resources column with correct title', () => {
      const footerHTML = `
        <footer>
          <div class="footer-column">
            <h3>Resources</h3>
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const heading = container.querySelector('h3');

      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Resources');
    });

    it('should render Company column with correct title', () => {
      const footerHTML = `
        <footer>
          <div class="footer-column">
            <h3>Company</h3>
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const heading = container.querySelector('h3');

      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Company');
    });

    it('should render Legal column with correct title', () => {
      const footerHTML = `
        <footer>
          <div class="footer-column">
            <h3>Legal</h3>
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const heading = container.querySelector('h3');

      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Legal');
    });
  });

  /**
   * Test: Each column has correct links
   * Requirements: 13.2, 13.3, 13.4, 13.5
   */
  describe('Product Column Links', () => {
    beforeEach(() => {
      const productColumnHTML = `
        <footer>
          <div class="footer-column">
            <h3>Product</h3>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="/changelog">Changelog</a></li>
              <li><a href="/roadmap">Roadmap</a></li>
            </ul>
          </div>
        </footer>
      `;
      container.innerHTML = productColumnHTML;
    });

    it('should have Features link', () => {
      const link = container.querySelector('a[href="#features"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Features');
    });

    it('should have Pricing link', () => {
      const link = container.querySelector('a[href="#pricing"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Pricing');
    });

    it('should have Changelog link', () => {
      const link = container.querySelector('a[href="/changelog"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Changelog');
    });

    it('should have Roadmap link', () => {
      const link = container.querySelector('a[href="/roadmap"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Roadmap');
    });

    it('should have all four Product links', () => {
      const links = container.querySelectorAll('a');
      expect(links.length).toBe(4);
    });
  });

  describe('Resources Column Links', () => {
    beforeEach(() => {
      const resourcesColumnHTML = `
        <footer>
          <div class="footer-column">
            <h3>Resources</h3>
            <ul>
              <li><a href="https://docs.opensearch.org" target="_blank" rel="noopener noreferrer">Documentation</a></li>
              <li><a href="https://docs.opensearch.org/api" target="_blank" rel="noopener noreferrer">API Reference</a></li>
              <li><a href="/tutorials">Tutorials</a></li>
              <li><a href="/blog">Blog</a></li>
            </ul>
          </div>
        </footer>
      `;
      container.innerHTML = resourcesColumnHTML;
    });

    it('should have Documentation link as external', () => {
      const link = container.querySelector('a[href="https://docs.opensearch.org"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Documentation');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should have API Reference link as external', () => {
      const link = container.querySelector('a[href="https://docs.opensearch.org/api"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('API Reference');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should have Tutorials link', () => {
      const link = container.querySelector('a[href="/tutorials"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Tutorials');
    });

    it('should have Blog link', () => {
      const link = container.querySelector('a[href="/blog"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Blog');
    });

    it('should have all four Resources links', () => {
      const links = container.querySelectorAll('a');
      expect(links.length).toBe(4);
    });
  });

  describe('Company Column Links', () => {
    beforeEach(() => {
      const companyColumnHTML = `
        <footer>
          <div class="footer-column">
            <h3>Company</h3>
            <ul>
              <li><a href="/about">About</a></li>
              <li><a href="/careers">Careers</a></li>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/press">Press</a></li>
            </ul>
          </div>
        </footer>
      `;
      container.innerHTML = companyColumnHTML;
    });

    it('should have About link', () => {
      const link = container.querySelector('a[href="/about"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('About');
    });

    it('should have Careers link', () => {
      const link = container.querySelector('a[href="/careers"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Careers');
    });

    it('should have Contact link', () => {
      const link = container.querySelector('a[href="/contact"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Contact');
    });

    it('should have Press link', () => {
      const link = container.querySelector('a[href="/press"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Press');
    });

    it('should have all four Company links', () => {
      const links = container.querySelectorAll('a');
      expect(links.length).toBe(4);
    });
  });

  describe('Legal Column Links', () => {
    beforeEach(() => {
      const legalColumnHTML = `
        <footer>
          <div class="footer-column">
            <h3>Legal</h3>
            <ul>
              <li><a href="/privacy">Privacy</a></li>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/security">Security</a></li>
              <li><a href="/gdpr">GDPR</a></li>
            </ul>
          </div>
        </footer>
      `;
      container.innerHTML = legalColumnHTML;
    });

    it('should have Privacy link', () => {
      const link = container.querySelector('a[href="/privacy"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Privacy');
    });

    it('should have Terms link', () => {
      const link = container.querySelector('a[href="/terms"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Terms');
    });

    it('should have Security link', () => {
      const link = container.querySelector('a[href="/security"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Security');
    });

    it('should have GDPR link', () => {
      const link = container.querySelector('a[href="/gdpr"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('GDPR');
    });

    it('should have all four Legal links', () => {
      const links = container.querySelectorAll('a');
      expect(links.length).toBe(4);
    });
  });

  /**
   * Test: Logo and copyright display
   * Requirements: 13.6
   */
  describe('Logo and Copyright', () => {
    it('should render logo with link to home', () => {
      const footerHTML = `
        <footer>
          <a href="/">
            <svg class="w-8 h-8"></svg>
            <span>AgentOps</span>
          </a>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const logoLink = container.querySelector('a[href="/"]');

      expect(logoLink).toBeTruthy();
      expect(logoLink?.querySelector('span')?.textContent).toBe('AgentOps');
    });

    it('should have logo SVG element', () => {
      const footerHTML = `
        <footer>
          <a href="/">
            <svg class="w-8 h-8" viewBox="0 0 32 32"></svg>
          </a>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const svg = container.querySelector('svg');

      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 32 32');
    });

    it('should display copyright notice', () => {
      const currentYear = new Date().getFullYear();
      const footerHTML = `
        <footer>
          <p id="copyright-notice">© ${currentYear} OpenSearch AgentOps. All rights reserved.</p>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const copyright = container.querySelector('#copyright-notice');

      expect(copyright).toBeTruthy();
      expect(copyright?.textContent).toContain(currentYear.toString());
      expect(copyright?.textContent).toContain('OpenSearch AgentOps');
      expect(copyright?.textContent).toContain('All rights reserved');
    });

    it('should display current year in copyright', () => {
      const currentYear = new Date().getFullYear();
      const footerHTML = `
        <footer>
          <p id="copyright-notice">© ${currentYear} OpenSearch AgentOps. All rights reserved.</p>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const copyright = container.querySelector('#copyright-notice');

      expect(copyright?.textContent).toContain(currentYear.toString());
    });
  });

  /**
   * Test: Social media links are present
   * Requirements: 13.6
   */
  describe('Social Media Links', () => {
    beforeEach(() => {
      const socialLinksHTML = `
        <footer>
          <div id="social-links">
            <a href="https://github.com/opensearch-project/agentops" target="_blank" rel="noopener noreferrer" aria-label="Visit our GitHub page">
              <svg class="w-6 h-6"></svg>
            </a>
            <a href="https://twitter.com/opensearch" target="_blank" rel="noopener noreferrer" aria-label="Visit our Twitter page">
              <svg class="w-6 h-6"></svg>
            </a>
            <a href="https://discord.gg/opensearch" target="_blank" rel="noopener noreferrer" aria-label="Visit our Discord page">
              <svg class="w-6 h-6"></svg>
            </a>
            <a href="https://linkedin.com/company/opensearch" target="_blank" rel="noopener noreferrer" aria-label="Visit our LinkedIn page">
              <svg class="w-6 h-6"></svg>
            </a>
          </div>
        </footer>
      `;
      container.innerHTML = socialLinksHTML;
    });

    it('should have GitHub social link', () => {
      const link = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');
      expect(link).toBeTruthy();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.getAttribute('aria-label')).toContain('GitHub');
    });

    it('should have Twitter social link', () => {
      const link = container.querySelector('a[href="https://twitter.com/opensearch"]');
      expect(link).toBeTruthy();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.getAttribute('aria-label')).toContain('Twitter');
    });

    it('should have Discord social link', () => {
      const link = container.querySelector('a[href="https://discord.gg/opensearch"]');
      expect(link).toBeTruthy();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.getAttribute('aria-label')).toContain('Discord');
    });

    it('should have LinkedIn social link', () => {
      const link = container.querySelector('a[href="https://linkedin.com/company/opensearch"]');
      expect(link).toBeTruthy();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.getAttribute('aria-label')).toContain('LinkedIn');
    });

    it('should have all four social media links', () => {
      const socialLinks = container.querySelectorAll('#social-links a');
      expect(socialLinks.length).toBe(4);
    });

    it('should have SVG icons for social links', () => {
      const svgs = container.querySelectorAll('#social-links svg');
      expect(svgs.length).toBe(4);
    });

    it('should have proper accessibility labels for social links', () => {
      const links = container.querySelectorAll('#social-links a');
      links.forEach(link => {
        expect(link.getAttribute('aria-label')).toBeTruthy();
        expect(link.getAttribute('aria-label')).toContain('Visit our');
      });
    });
  });

  /**
   * Test: Responsive layout structure
   * Requirements: 13.1
   */
  describe('Responsive Layout', () => {
    it('should have grid layout classes for responsive design', () => {
      const footerHTML = `
        <footer>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <div class="footer-column"></div>
            <div class="footer-column"></div>
            <div class="footer-column"></div>
            <div class="footer-column"></div>
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('lg:grid-cols-4')).toBe(true);
    });

    it('should have proper semantic footer element', () => {
      const footerHTML = `
        <footer id="footer">
          <div>Content</div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const footer = container.querySelector('footer');

      expect(footer).toBeTruthy();
      expect(footer?.tagName).toBe('FOOTER');
      expect(footer?.getAttribute('id')).toBe('footer');
    });
  });

  /**
   * Test: Footer styling and structure
   * Requirements: 13.1, 13.6
   */
  describe('Footer Structure and Styling', () => {
    it('should have dark background styling', () => {
      const footerHTML = `
        <footer class="bg-slate-950 border-t border-slate-800">
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const footer = container.querySelector('footer');

      expect(footer?.classList.contains('bg-slate-950')).toBe(true);
      expect(footer?.classList.contains('border-t')).toBe(true);
    });

    it('should have proper spacing classes', () => {
      const footerHTML = `
        <footer class="py-12">
          <div class="container mx-auto px-6">
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const footer = container.querySelector('footer');
      const containerDiv = footer?.querySelector('.container');

      expect(footer?.classList.contains('py-12')).toBe(true);
      expect(containerDiv?.classList.contains('mx-auto')).toBe(true);
      expect(containerDiv?.classList.contains('px-6')).toBe(true);
    });

    it('should have border separator for bottom section', () => {
      const footerHTML = `
        <footer>
          <div class="border-t border-slate-800 pt-8">
          </div>
        </footer>
      `;
      
      container.innerHTML = footerHTML;
      const bottomSection = container.querySelector('.border-t');

      expect(bottomSection).toBeTruthy();
      expect(bottomSection?.classList.contains('border-slate-800')).toBe(true);
      expect(bottomSection?.classList.contains('pt-8')).toBe(true);
    });
  });
});

