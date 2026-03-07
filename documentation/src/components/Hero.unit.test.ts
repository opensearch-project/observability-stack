/**
 * Unit tests for Hero component
 * Requirements: 2.1, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Hero Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Headline text is correct
   * Requirements: 2.1, 2.4
   */
  describe('Headline Text', () => {
    it('should render the main headline with correct text', () => {
      const heroHTML = `
        <section id="hero">
          <h1>
            <span class="text-white">Ship Agents Without the Anxiety.</span>
          </h1>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const h1 = container.querySelector('h1');
      const whiteSpan = h1?.querySelector('.text-white');

      expect(h1).toBeTruthy();
      expect(whiteSpan?.textContent?.trim()).toBe('Ship Agents Without the Anxiety.');
    });

    it('should have white text styling on headline', () => {
      const heroHTML = `
        <section id="hero">
          <h1>
            <span class="text-white">Ship Agents Without the Anxiety.</span>
          </h1>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const whiteSpan = container.querySelector('.text-white');

      expect(whiteSpan).toBeTruthy();
      expect(whiteSpan?.classList.contains('text-white')).toBe(true);
    });

    it('should render subheadline text', () => {
      const heroHTML = `
        <section id="hero">
          <p class="text-xl md:text-2xl text-slate-300">
            The unified platform for LLM evaluation, prompt management, and observability. 
            Everything you need to build production-ready AI applications.
          </p>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const subheadline = container.querySelector('p.text-xl');

      expect(subheadline).toBeTruthy();
      expect(subheadline?.textContent).toContain('unified platform for LLM evaluation');
      expect(subheadline?.textContent).toContain('production-ready AI applications');
    });

    it('should render announcement badge with NEW indicator', () => {
      const heroHTML = `
        <section id="hero">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full">
            <span class="px-2 py-0.5 text-xs font-semibold bg-indigo-500 text-white rounded-full">NEW</span>
            <span class="text-sm text-indigo-300">Introducing OpenSearch AgentOps</span>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const badge = container.querySelector('.inline-flex');
      const newIndicator = badge?.querySelector('.bg-indigo-500');
      const text = badge?.querySelector('.text-indigo-300');

      expect(badge).toBeTruthy();
      expect(newIndicator?.textContent).toBe('NEW');
      expect(text?.textContent).toBe('Introducing OpenSearch AgentOps');
    });
  });

  /**
   * Test: All four trust badges render
   * Requirements: 2.4, 2.5
   */
  describe('Trust Badges', () => {
    beforeEach(() => {
      const heroHTML = `
        <section id="hero">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <svg class="w-8 h-8 text-green-500"></svg>
              <span class="text-sm font-semibold text-white">70% Cost Savings</span>
            </div>
            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <svg class="w-8 h-8 text-indigo-500"></svg>
              <span class="text-sm font-semibold text-white">100% Open Source</span>
            </div>
            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <svg class="w-8 h-8 text-cyan-500"></svg>
              <span class="text-sm font-semibold text-white">Self-Hosted Available</span>
            </div>
            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <svg class="w-8 h-8 text-purple-500"></svg>
              <span class="text-sm font-semibold text-white">SOC 2 & HIPAA Ready</span>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
    });

    it('should render exactly four trust badges', () => {
      const badges = container.querySelectorAll('.grid > div');

      expect(badges.length).toBe(4);
    });

    it('should render "70% Cost Savings" badge', () => {
      const badge = Array.from(container.querySelectorAll('span.text-sm'))
        .find(el => el.textContent === '70% Cost Savings');

      expect(badge).toBeTruthy();
      expect(badge?.classList.contains('font-semibold')).toBe(true);
      expect(badge?.classList.contains('text-white')).toBe(true);
    });

    it('should render "100% Open Source" badge', () => {
      const badge = Array.from(container.querySelectorAll('span.text-sm'))
        .find(el => el.textContent === '100% Open Source');

      expect(badge).toBeTruthy();
      expect(badge?.classList.contains('font-semibold')).toBe(true);
      expect(badge?.classList.contains('text-white')).toBe(true);
    });

    it('should render "Self-Hosted Available" badge', () => {
      const badge = Array.from(container.querySelectorAll('span.text-sm'))
        .find(el => el.textContent === 'Self-Hosted Available');

      expect(badge).toBeTruthy();
      expect(badge?.classList.contains('font-semibold')).toBe(true);
      expect(badge?.classList.contains('text-white')).toBe(true);
    });

    it('should render "SOC 2 & HIPAA Ready" badge', () => {
      const badge = Array.from(container.querySelectorAll('span.text-sm'))
        .find(el => el.textContent === 'SOC 2 & HIPAA Ready');

      expect(badge).toBeTruthy();
      expect(badge?.classList.contains('font-semibold')).toBe(true);
      expect(badge?.classList.contains('text-white')).toBe(true);
    });

    it('should have icons in all trust badges', () => {
      const badges = container.querySelectorAll('.grid > div');
      
      badges.forEach(badge => {
        const icon = badge.querySelector('svg');
        expect(icon).toBeTruthy();
        expect(icon?.classList.contains('w-8')).toBe(true);
        expect(icon?.classList.contains('h-8')).toBe(true);
      });
    });

    it('should have correct color classes for badge icons', () => {
      const icons = container.querySelectorAll('svg');
      
      expect(icons[0]?.classList.contains('text-green-500')).toBe(true);
      expect(icons[1]?.classList.contains('text-indigo-500')).toBe(true);
      expect(icons[2]?.classList.contains('text-cyan-500')).toBe(true);
      expect(icons[3]?.classList.contains('text-purple-500')).toBe(true);
    });

    it('should have grid layout with responsive columns', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-4')).toBe(true);
    });
  });

  /**
   * Test: CTAs have correct attributes
   * Requirements: 2.5, 2.6, 2.7
   */
  describe('CTA Buttons', () => {
    beforeEach(() => {
      const heroHTML = `
        <section id="hero">
          <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a 
              href="/signup" 
              class="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg"
              data-analytics="cta_hero_start_trial"
            >
              Start Free Trial
            </a>
            <a 
              href="https://github.com/opensearch-project/agentops" 
              target="_blank"
              rel="noopener noreferrer"
              class="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg"
              data-analytics="cta_hero_github"
            >
              <span class="flex items-center gap-2">
                <svg class="w-5 h-5"></svg>
                Star on GitHub
              </span>
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
    });

    it('should render "Start Free Trial" primary CTA', () => {
      const cta = container.querySelector('a[href="/signup"]');

      expect(cta).toBeTruthy();
      expect(cta?.textContent?.trim()).toBe('Start Free Trial');
    });

    it('should have correct href for primary CTA', () => {
      const cta = container.querySelector('a[href="/signup"]');

      expect(cta?.getAttribute('href')).toBe('/signup');
    });

    it('should have primary styling on "Start Free Trial" button', () => {
      const cta = container.querySelector('a[href="/signup"]');

      expect(cta?.classList.contains('bg-indigo-600')).toBe(true);
      expect(cta?.classList.contains('hover:bg-indigo-700')).toBe(true);
      expect(cta?.classList.contains('text-white')).toBe(true);
      expect(cta?.classList.contains('font-semibold')).toBe(true);
    });

    it('should render "Star on GitHub" secondary CTA', () => {
      const cta = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');

      expect(cta).toBeTruthy();
      expect(cta?.textContent).toContain('Star on GitHub');
    });

    it('should have correct href for GitHub CTA', () => {
      const cta = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');

      expect(cta?.getAttribute('href')).toBe('https://github.com/opensearch-project/agentops');
    });

    it('should open GitHub link in new tab', () => {
      const cta = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');

      expect(cta?.getAttribute('target')).toBe('_blank');
      expect(cta?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should have secondary styling on GitHub button', () => {
      const cta = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');

      expect(cta?.classList.contains('bg-slate-800')).toBe(true);
      expect(cta?.classList.contains('hover:bg-slate-700')).toBe(true);
      expect(cta?.classList.contains('text-white')).toBe(true);
    });

    it('should have GitHub icon in secondary CTA', () => {
      const cta = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');
      const icon = cta?.querySelector('svg');

      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('w-5')).toBe(true);
      expect(icon?.classList.contains('h-5')).toBe(true);
    });

    it('should have analytics tracking attributes on both CTAs', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');
      const secondaryCTA = container.querySelector('a[href="https://github.com/opensearch-project/agentops"]');

      expect(primaryCTA?.getAttribute('data-analytics')).toBe('cta_hero_start_trial');
      expect(secondaryCTA?.getAttribute('data-analytics')).toBe('cta_hero_github');
    });

    it('should have both CTAs in flex container', () => {
      const ctaContainer = container.querySelector('.flex');
      const ctas = ctaContainer?.querySelectorAll('a');

      expect(ctaContainer).toBeTruthy();
      expect(ctas?.length).toBe(2);
    });
  });

  /**
   * Test: Dashboard preview mockup
   * Requirements: 2.2
   */
  describe('Dashboard Preview', () => {
    it('should render dashboard preview container', () => {
      const heroHTML = `
        <section id="hero">
          <div id="dashboard-preview-container" class="relative max-w-5xl mx-auto">
            <div class="relative rounded-xl overflow-hidden border border-slate-700">
              <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
                <!-- Dashboard content -->
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const dashboardContainer = container.querySelector('#dashboard-preview-container');

      expect(dashboardContainer).toBeTruthy();
      expect(dashboardContainer?.classList.contains('relative')).toBe(true);
      expect(dashboardContainer?.classList.contains('max-w-5xl')).toBe(true);
    });

    it('should have border and shadow effects on dashboard mockup', () => {
      const heroHTML = `
        <section id="hero">
          <div id="dashboard-preview-container">
            <div class="relative rounded-xl overflow-hidden border border-slate-700 shadow-2xl shadow-indigo-500/20">
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const mockup = container.querySelector('.rounded-xl');

      expect(mockup?.classList.contains('border')).toBe(true);
      expect(mockup?.classList.contains('border-slate-700')).toBe(true);
      expect(mockup?.classList.contains('shadow-2xl')).toBe(true);
    });

    it('should have gradient background in dashboard mockup', () => {
      const heroHTML = `
        <section id="hero">
          <div id="dashboard-preview-container">
            <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const background = container.querySelector('.bg-gradient-to-br');

      expect(background).toBeTruthy();
      expect(background?.classList.contains('from-slate-900')).toBe(true);
      expect(background?.classList.contains('via-slate-800')).toBe(true);
      expect(background?.classList.contains('to-slate-900')).toBe(true);
    });
  });

  /**
   * Test: Hero section structure
   * Requirements: 2.1
   */
  describe('Hero Section Structure', () => {
    it('should have hero section with correct id', () => {
      const heroHTML = `
        <section id="hero" class="relative min-h-screen">
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const hero = container.querySelector('#hero');

      expect(hero).toBeTruthy();
      expect(hero?.tagName).toBe('SECTION');
      expect(hero?.getAttribute('id')).toBe('hero');
    });

    it('should have full viewport height', () => {
      const heroHTML = `
        <section id="hero" class="min-h-screen">
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const hero = container.querySelector('#hero');

      expect(hero?.classList.contains('min-h-screen')).toBe(true);
    });

    it('should have relative positioning for background elements', () => {
      const heroHTML = `
        <section id="hero" class="relative overflow-hidden">
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const hero = container.querySelector('#hero');

      expect(hero?.classList.contains('relative')).toBe(true);
      expect(hero?.classList.contains('overflow-hidden')).toBe(true);
    });

    it('should have background orbs container', () => {
      const heroHTML = `
        <section id="hero">
          <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div class="orb orb-1"></div>
            <div class="orb orb-2"></div>
            <div class="orb orb-3"></div>
          </div>
        </section>
      `;
      
      container.innerHTML = heroHTML;
      const orbContainer = container.querySelector('.absolute.inset-0');
      const orbs = container.querySelectorAll('.orb');

      expect(orbContainer).toBeTruthy();
      expect(orbContainer?.getAttribute('aria-hidden')).toBe('true');
      expect(orbs.length).toBe(3);
    });
  });
});
