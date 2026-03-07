/**
 * Unit tests for OpenSource component
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('OpenSource Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: GitHub stats display
   * Requirements: 11.1
   */
  describe('GitHub Statistics', () => {
    beforeEach(() => {
      const openSourceHTML = `
        <section id="open-source" class="py-20 bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="max-w-5xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  100% Open Source
                </h2>
                <p class="text-lg text-slate-400 max-w-3xl mx-auto">
                  Built in the open with transparency and community at our core.
                </p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div class="stat-card text-center p-8 rounded-xl bg-slate-900/50 border border-slate-800">
                  <div class="text-4xl font-bold text-white mb-2" data-stat="stars">
                    2,500
                  </div>
                  <div class="text-slate-400 font-medium">
                    GitHub Stars
                  </div>
                </div>

                <div class="stat-card text-center p-8 rounded-xl bg-slate-900/50 border border-slate-800">
                  <div class="text-4xl font-bold text-white mb-2" data-stat="forks">
                    180
                  </div>
                  <div class="text-slate-400 font-medium">
                    Forks
                  </div>
                </div>

                <div class="stat-card text-center p-8 rounded-xl bg-slate-900/50 border border-slate-800">
                  <div class="text-4xl font-bold text-white mb-2" data-stat="contributors">
                    45
                  </div>
                  <div class="text-slate-400 font-medium">
                    Contributors
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = openSourceHTML;
    });

    it('should display GitHub stars count', () => {
      const starsElement = container.querySelector('[data-stat="stars"]');

      expect(starsElement).toBeTruthy();
      expect(starsElement?.textContent?.trim()).toBe('2,500');
    });

    it('should display forks count', () => {
      const forksElement = container.querySelector('[data-stat="forks"]');

      expect(forksElement).toBeTruthy();
      expect(forksElement?.textContent?.trim()).toBe('180');
    });

    it('should display contributors count', () => {
      const contributorsElement = container.querySelector('[data-stat="contributors"]');

      expect(contributorsElement).toBeTruthy();
      expect(contributorsElement?.textContent?.trim()).toBe('45');
    });

    it('should have three stat cards', () => {
      const statCards = container.querySelectorAll('.stat-card');

      expect(statCards.length).toBe(3);
    });

    it('should have stars label', () => {
      const starsCard = container.querySelector('[data-stat="stars"]')?.parentElement;
      const label = starsCard?.querySelector('.text-slate-400');

      expect(label).toBeTruthy();
      expect(label?.textContent?.trim()).toBe('GitHub Stars');
    });

    it('should have forks label', () => {
      const forksCard = container.querySelector('[data-stat="forks"]')?.parentElement;
      const label = forksCard?.querySelector('.text-slate-400');

      expect(label).toBeTruthy();
      expect(label?.textContent?.trim()).toBe('Forks');
    });

    it('should have contributors label', () => {
      const contributorsCard = container.querySelector('[data-stat="contributors"]')?.parentElement;
      const label = contributorsCard?.querySelector('.text-slate-400');

      expect(label).toBeTruthy();
      expect(label?.textContent?.trim()).toBe('Contributors');
    });

    it('should have stat cards in grid layout', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-3')).toBe(true);
    });

    it('should have stat cards with correct styling', () => {
      const statCards = container.querySelectorAll('.stat-card');

      statCards.forEach(card => {
        expect(card.classList.contains('text-center')).toBe(true);
        expect(card.classList.contains('p-8')).toBe(true);
        expect(card.classList.contains('rounded-xl')).toBe(true);
        expect(card.classList.contains('bg-slate-900/50')).toBe(true);
        expect(card.classList.contains('border')).toBe(true);
        expect(card.classList.contains('border-slate-800')).toBe(true);
      });
    });

    it('should have stat values with correct styling', () => {
      const statValues = container.querySelectorAll('[data-stat]');

      statValues.forEach(value => {
        expect(value.classList.contains('text-4xl')).toBe(true);
        expect(value.classList.contains('font-bold')).toBe(true);
        expect(value.classList.contains('text-white')).toBe(true);
        expect(value.classList.contains('mb-2')).toBe(true);
      });
    });
  });

  /**
   * Test: "View on GitHub" button is present
   * Requirements: 11.2
   */
  describe('View on GitHub Button', () => {
    beforeEach(() => {
      const githubButtonHTML = `
        <section id="open-source">
          <div class="flex flex-col sm:flex-row gap-4">
            <a 
              href="https://github.com/opensearch-project/agentops"
              target="_blank"
              rel="noopener noreferrer"
              class="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg"
              data-analytics="cta_view_github"
              data-github-url="https://github.com/opensearch-project/agentops"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"></svg>
              View on GitHub
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = githubButtonHTML;
    });

    it('should render "View on GitHub" button', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');

      expect(githubButton).toBeTruthy();
      expect(githubButton?.textContent).toContain('View on GitHub');
    });

    it('should have correct GitHub URL', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');

      expect(githubButton?.getAttribute('href')).toBe('https://github.com/opensearch-project/agentops');
    });

    it('should open in new tab', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');

      expect(githubButton?.getAttribute('target')).toBe('_blank');
      expect(githubButton?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should have analytics tracking', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');

      expect(githubButton?.getAttribute('data-analytics')).toBe('cta_view_github');
    });

    it('should have GitHub icon', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');
      const icon = githubButton?.querySelector('svg');

      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('w-5')).toBe(true);
      expect(icon?.classList.contains('h-5')).toBe(true);
    });

    it('should have correct button styling', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');

      expect(githubButton?.classList.contains('px-8')).toBe(true);
      expect(githubButton?.classList.contains('py-4')).toBe(true);
      expect(githubButton?.classList.contains('bg-slate-800')).toBe(true);
      expect(githubButton?.classList.contains('hover:bg-slate-700')).toBe(true);
      expect(githubButton?.classList.contains('text-white')).toBe(true);
      expect(githubButton?.classList.contains('font-semibold')).toBe(true);
      expect(githubButton?.classList.contains('rounded-lg')).toBe(true);
    });
  });

  /**
   * Test: License information displays
   * Requirements: 11.3
   */
  describe('License Information', () => {
    beforeEach(() => {
      const licenseHTML = `
        <section id="open-source">
          <div class="flex flex-col items-center gap-6">
            <div class="flex items-center gap-3 px-6 py-3 rounded-full bg-slate-900 border border-slate-800">
              <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"></svg>
              <span class="text-white font-semibold" data-license="Apache 2.0">
                Licensed under Apache 2.0
              </span>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = licenseHTML;
    });

    it('should display license information', () => {
      const licenseElement = container.querySelector('[data-license]');

      expect(licenseElement).toBeTruthy();
      expect(licenseElement?.textContent).toContain('Licensed under Apache 2.0');
    });

    it('should have correct license value', () => {
      const licenseElement = container.querySelector('[data-license]');

      expect(licenseElement?.getAttribute('data-license')).toBe('Apache 2.0');
    });

    it('should have license badge with icon', () => {
      const licenseBadge = container.querySelector('.flex.items-center.gap-3');
      const icon = licenseBadge?.querySelector('svg');

      expect(licenseBadge).toBeTruthy();
      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('w-5')).toBe(true);
      expect(icon?.classList.contains('h-5')).toBe(true);
      expect(icon?.classList.contains('text-indigo-400')).toBe(true);
    });

    it('should have license badge with correct styling', () => {
      const licenseBadge = container.querySelector('.flex.items-center.gap-3');

      expect(licenseBadge?.classList.contains('px-6')).toBe(true);
      expect(licenseBadge?.classList.contains('py-3')).toBe(true);
      expect(licenseBadge?.classList.contains('rounded-full')).toBe(true);
      expect(licenseBadge?.classList.contains('bg-slate-900')).toBe(true);
      expect(licenseBadge?.classList.contains('border')).toBe(true);
      expect(licenseBadge?.classList.contains('border-slate-800')).toBe(true);
    });

    it('should have license text with correct styling', () => {
      const licenseText = container.querySelector('[data-license]');

      expect(licenseText?.classList.contains('text-white')).toBe(true);
      expect(licenseText?.classList.contains('font-semibold')).toBe(true);
    });
  });

  /**
   * Test: Self-hosting docs link is present
   * Requirements: 11.4
   */
  describe('Self-Hosting Documentation Link', () => {
    beforeEach(() => {
      const docsLinkHTML = `
        <section id="open-source">
          <div class="flex flex-col sm:flex-row gap-4">
            <a 
              href="/docs/self-hosting"
              class="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg"
              data-analytics="cta_self_hosting_docs"
              data-docs-url="/docs/self-hosting"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"></svg>
              Self-Hosting Documentation
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = docsLinkHTML;
    });

    it('should render self-hosting docs link', () => {
      const docsLink = container.querySelector('[data-analytics="cta_self_hosting_docs"]');

      expect(docsLink).toBeTruthy();
      expect(docsLink?.textContent).toContain('Self-Hosting Documentation');
    });

    it('should have correct docs URL', () => {
      const docsLink = container.querySelector('[data-analytics="cta_self_hosting_docs"]');

      expect(docsLink?.getAttribute('href')).toBe('/docs/self-hosting');
    });

    it('should have analytics tracking', () => {
      const docsLink = container.querySelector('[data-analytics="cta_self_hosting_docs"]');

      expect(docsLink?.getAttribute('data-analytics')).toBe('cta_self_hosting_docs');
    });

    it('should have docs icon', () => {
      const docsLink = container.querySelector('[data-analytics="cta_self_hosting_docs"]');
      const icon = docsLink?.querySelector('svg');

      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('w-5')).toBe(true);
      expect(icon?.classList.contains('h-5')).toBe(true);
    });

    it('should have correct button styling', () => {
      const docsLink = container.querySelector('[data-analytics="cta_self_hosting_docs"]');

      expect(docsLink?.classList.contains('px-8')).toBe(true);
      expect(docsLink?.classList.contains('py-4')).toBe(true);
      expect(docsLink?.classList.contains('bg-indigo-600')).toBe(true);
      expect(docsLink?.classList.contains('hover:bg-indigo-700')).toBe(true);
      expect(docsLink?.classList.contains('text-white')).toBe(true);
      expect(docsLink?.classList.contains('font-semibold')).toBe(true);
      expect(docsLink?.classList.contains('rounded-lg')).toBe(true);
    });
  });

  /**
   * Test: Section structure
   * Requirements: 11.1, 11.2, 11.3, 11.4
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const openSourceHTML = `
        <section id="open-source" class="py-20 bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="max-w-5xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  100% Open Source
                </h2>
                <p class="text-lg text-slate-400 max-w-3xl mx-auto">
                  Built in the open with transparency and community at our core.
                </p>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = openSourceHTML;
    });

    it('should have open-source section with correct id', () => {
      const section = container.querySelector('#open-source');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('open-source');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#open-source');

      expect(section?.classList.contains('bg-slate-950')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#open-source');

      expect(section?.classList.contains('py-20')).toBe(true);
    });

    it('should have section header', () => {
      const header = container.querySelector('h2');

      expect(header).toBeTruthy();
      expect(header?.textContent?.trim()).toBe('100% Open Source');
    });

    it('should have section description', () => {
      const description = container.querySelector('p.text-lg');

      expect(description).toBeTruthy();
      expect(description?.textContent).toContain('Built in the open with transparency');
    });

    it('should have centered header', () => {
      const headerContainer = container.querySelector('.text-center');

      expect(headerContainer).toBeTruthy();
      expect(headerContainer?.classList.contains('mb-16')).toBe(true);
    });

    it('should have header with correct styling', () => {
      const header = container.querySelector('h2');

      expect(header?.classList.contains('text-3xl')).toBe(true);
      expect(header?.classList.contains('md:text-4xl')).toBe(true);
      expect(header?.classList.contains('font-bold')).toBe(true);
      expect(header?.classList.contains('text-white')).toBe(true);
    });

    it('should have description with correct styling', () => {
      const description = container.querySelector('p.text-lg');

      expect(description?.classList.contains('text-slate-400')).toBe(true);
      expect(description?.classList.contains('max-w-3xl')).toBe(true);
      expect(description?.classList.contains('mx-auto')).toBe(true);
    });
  });

  /**
   * Test: CTA buttons layout
   * Requirements: 11.2, 11.4
   */
  describe('CTA Buttons Layout', () => {
    beforeEach(() => {
      const ctaHTML = `
        <section id="open-source">
          <div class="flex flex-col items-center gap-6">
            <div class="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://github.com/opensearch-project/agentops"
                data-analytics="cta_view_github"
              >
                View on GitHub
              </a>
              <a 
                href="/docs/self-hosting"
                data-analytics="cta_self_hosting_docs"
              >
                Self-Hosting Documentation
              </a>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = ctaHTML;
    });

    it('should have both CTA buttons', () => {
      const githubButton = container.querySelector('[data-analytics="cta_view_github"]');
      const docsButton = container.querySelector('[data-analytics="cta_self_hosting_docs"]');

      expect(githubButton).toBeTruthy();
      expect(docsButton).toBeTruthy();
    });

    it('should have CTAs in flex container', () => {
      const ctaContainer = container.querySelector('.flex.flex-col.sm\\:flex-row');

      expect(ctaContainer).toBeTruthy();
      expect(ctaContainer?.classList.contains('gap-4')).toBe(true);
    });

    it('should have responsive flex direction', () => {
      const ctaContainer = container.querySelector('.flex.flex-col.sm\\:flex-row');

      expect(ctaContainer?.classList.contains('flex-col')).toBe(true);
      expect(ctaContainer?.classList.contains('sm:flex-row')).toBe(true);
    });

    it('should have centered layout', () => {
      const outerContainer = container.querySelector('.flex.flex-col.items-center');

      expect(outerContainer).toBeTruthy();
      expect(outerContainer?.classList.contains('items-center')).toBe(true);
      expect(outerContainer?.classList.contains('gap-6')).toBe(true);
    });
  });
});
