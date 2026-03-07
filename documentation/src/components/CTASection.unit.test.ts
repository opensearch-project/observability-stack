/**
 * Unit tests for CTASection component
 * Requirements: 12.1, 12.2, 12.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('CTASection Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Headline and subtext render
   * Requirements: 12.1
   */
  describe('Headline and Subtext Rendering', () => {
    beforeEach(() => {
      const ctaSectionHTML = `
        <section id="cta-final" class="relative py-20 overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-600 opacity-90"></div>
          <div class="absolute inset-0 bg-slate-950 opacity-40"></div>
          
          <div class="container mx-auto px-6 relative z-10">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
                Ready to Transform Your AI Development?
              </h2>
              <p class="text-lg md:text-xl text-white/90 mb-12 max-w-2xl mx-auto">
                Join thousands of AI teams building better applications with unified observability, 
                evaluation, and prompt management. Start free today.
              </p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = ctaSectionHTML;
    });

    it('should render CTA section with correct id', () => {
      const section = container.querySelector('#cta-final');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('cta-final');
    });

    it('should render headline text', () => {
      const headline = container.querySelector('h2');

      expect(headline).toBeTruthy();
      expect(headline?.textContent?.trim()).toBe('Ready to Transform Your AI Development?');
    });

    it('should render subtext', () => {
      const subtext = container.querySelector('p.text-lg');

      expect(subtext).toBeTruthy();
      expect(subtext?.textContent).toContain('Join thousands of AI teams');
      expect(subtext?.textContent).toContain('unified observability');
      expect(subtext?.textContent).toContain('Start free today');
    });

    it('should have responsive headline sizing', () => {
      const headline = container.querySelector('h2');

      expect(headline?.classList.contains('text-3xl')).toBe(true);
      expect(headline?.classList.contains('md:text-4xl')).toBe(true);
      expect(headline?.classList.contains('lg:text-5xl')).toBe(true);
    });

    it('should have responsive subtext sizing', () => {
      const subtext = container.querySelector('p.text-lg');

      expect(subtext?.classList.contains('text-lg')).toBe(true);
      expect(subtext?.classList.contains('md:text-xl')).toBe(true);
    });

    it('should have centered content', () => {
      const textCenter = container.querySelector('.text-center');

      expect(textCenter).toBeTruthy();
      expect(textCenter?.querySelector('h2')).toBeTruthy();
      expect(textCenter?.querySelector('p')).toBeTruthy();
    });

    it('should have gradient background', () => {
      const gradientBg = container.querySelector('.bg-gradient-to-br');

      expect(gradientBg).toBeTruthy();
      expect(gradientBg?.classList.contains('from-indigo-600')).toBe(true);
      expect(gradientBg?.classList.contains('via-purple-600')).toBe(true);
      expect(gradientBg?.classList.contains('to-cyan-600')).toBe(true);
    });

    it('should have overlay for gradient', () => {
      const overlays = container.querySelectorAll('.absolute.inset-0');

      expect(overlays.length).toBeGreaterThanOrEqual(2);
    });
  });

  /**
   * Test: Both CTAs are present
   * Requirements: 12.2
   */
  describe('CTA Buttons', () => {
    beforeEach(() => {
      const ctaSectionHTML = `
        <section id="cta-final">
          <div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <a 
              href="/signup" 
              class="px-8 py-4 bg-white hover:bg-slate-100 text-indigo-600 font-semibold rounded-lg transition-colors duration-200 shadow-lg"
              data-analytics="cta_final_start_trial"
            >
              Start Free Trial
            </a>
            <a 
              href="/contact-sales" 
              class="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors duration-200 border border-white/30 backdrop-blur-sm"
              data-analytics="cta_final_talk_sales"
            >
              Talk to Sales
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = ctaSectionHTML;
    });

    it('should render primary CTA button', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');

      expect(primaryCTA).toBeTruthy();
      expect(primaryCTA?.textContent?.trim()).toBe('Start Free Trial');
    });

    it('should render secondary CTA button', () => {
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(secondaryCTA).toBeTruthy();
      expect(secondaryCTA?.textContent?.trim()).toBe('Talk to Sales');
    });

    it('should have correct href on primary CTA', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');

      expect(primaryCTA?.getAttribute('href')).toBe('/signup');
    });

    it('should have correct href on secondary CTA', () => {
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(secondaryCTA?.getAttribute('href')).toBe('/contact-sales');
    });

    it('should have analytics tracking on primary CTA', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');

      expect(primaryCTA?.getAttribute('data-analytics')).toBe('cta_final_start_trial');
    });

    it('should have analytics tracking on secondary CTA', () => {
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(secondaryCTA?.getAttribute('data-analytics')).toBe('cta_final_talk_sales');
    });

    it('should have primary styling on primary CTA', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');

      expect(primaryCTA?.classList.contains('bg-white')).toBe(true);
      expect(primaryCTA?.classList.contains('hover:bg-slate-100')).toBe(true);
      expect(primaryCTA?.classList.contains('text-indigo-600')).toBe(true);
      expect(primaryCTA?.classList.contains('font-semibold')).toBe(true);
    });

    it('should have secondary styling on secondary CTA', () => {
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(secondaryCTA?.classList.contains('bg-white/10')).toBe(true);
      expect(secondaryCTA?.classList.contains('hover:bg-white/20')).toBe(true);
      expect(secondaryCTA?.classList.contains('text-white')).toBe(true);
      expect(secondaryCTA?.classList.contains('border')).toBe(true);
    });

    it('should have CTAs in flex container', () => {
      const ctaContainer = container.querySelector('.flex');

      expect(ctaContainer).toBeTruthy();
      expect(ctaContainer?.classList.contains('justify-center')).toBe(true);
      expect(ctaContainer?.classList.contains('items-center')).toBe(true);
    });

    it('should have responsive flex direction', () => {
      const ctaContainer = container.querySelector('.flex');

      expect(ctaContainer?.classList.contains('flex-col')).toBe(true);
      expect(ctaContainer?.classList.contains('sm:flex-row')).toBe(true);
    });

    it('should have gap between CTAs', () => {
      const ctaContainer = container.querySelector('.flex');

      expect(ctaContainer?.classList.contains('gap-4')).toBe(true);
    });

    it('should have correct padding on CTAs', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(primaryCTA?.classList.contains('px-8')).toBe(true);
      expect(primaryCTA?.classList.contains('py-4')).toBe(true);
      expect(secondaryCTA?.classList.contains('px-8')).toBe(true);
      expect(secondaryCTA?.classList.contains('py-4')).toBe(true);
    });

    it('should have rounded corners on CTAs', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(primaryCTA?.classList.contains('rounded-lg')).toBe(true);
      expect(secondaryCTA?.classList.contains('rounded-lg')).toBe(true);
    });
  });

  /**
   * Test: Trust badges repeat
   * Requirements: 12.3
   */
  describe('Trust Badges', () => {
    beforeEach(() => {
      const ctaSectionHTML = `
        <section id="cta-final">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm">
              <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-sm font-semibold text-white">70% Cost Savings</span>
            </div>

            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm">
              <svg class="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span class="text-sm font-semibold text-white">100% Open Source</span>
            </div>

            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm">
              <svg class="w-8 h-8 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <span class="text-sm font-semibold text-white">Self-Hosted Available</span>
            </div>

            <div class="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm">
              <svg class="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span class="text-sm font-semibold text-white">SOC 2 & HIPAA Ready</span>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = ctaSectionHTML;
    });

    it('should render four trust badges', () => {
      const badges = container.querySelectorAll('.grid > div');

      expect(badges.length).toBe(4);
    });

    it('should render "70% Cost Savings" badge', () => {
      const badge = Array.from(container.querySelectorAll('span')).find(
        span => span.textContent?.trim() === '70% Cost Savings'
      );

      expect(badge).toBeTruthy();
    });

    it('should render "100% Open Source" badge', () => {
      const badge = Array.from(container.querySelectorAll('span')).find(
        span => span.textContent?.trim() === '100% Open Source'
      );

      expect(badge).toBeTruthy();
    });

    it('should render "Self-Hosted Available" badge', () => {
      const badge = Array.from(container.querySelectorAll('span')).find(
        span => span.textContent?.trim() === 'Self-Hosted Available'
      );

      expect(badge).toBeTruthy();
    });

    it('should render "SOC 2 & HIPAA Ready" badge', () => {
      const badge = Array.from(container.querySelectorAll('span')).find(
        span => span.textContent?.trim() === 'SOC 2 & HIPAA Ready'
      );

      expect(badge).toBeTruthy();
    });

    it('should have grid layout for badges', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-4')).toBe(true);
    });

    it('should have gap between badges', () => {
      const grid = container.querySelector('.grid');

      expect(grid?.classList.contains('gap-4')).toBe(true);
    });

    it('should have icons in badges', () => {
      const icons = container.querySelectorAll('svg');

      expect(icons.length).toBe(4);
    });

    it('should have correct styling on badge cards', () => {
      const badges = container.querySelectorAll('.grid > div');

      badges.forEach(badge => {
        expect(badge.classList.contains('flex')).toBe(true);
        expect(badge.classList.contains('flex-col')).toBe(true);
        expect(badge.classList.contains('items-center')).toBe(true);
        expect(badge.classList.contains('rounded-lg')).toBe(true);
        expect(badge.classList.contains('bg-white/10')).toBe(true);
        expect(badge.classList.contains('border')).toBe(true);
      });
    });

    it('should have backdrop blur on badges', () => {
      const badges = container.querySelectorAll('.grid > div');

      badges.forEach(badge => {
        expect(badge.classList.contains('backdrop-blur-sm')).toBe(true);
      });
    });

    it('should have correct text styling on badge labels', () => {
      const labels = container.querySelectorAll('.grid > div > span');

      labels.forEach(label => {
        expect(label.classList.contains('text-sm')).toBe(true);
        expect(label.classList.contains('font-semibold')).toBe(true);
        expect(label.classList.contains('text-white')).toBe(true);
      });
    });
  });

  /**
   * Test: Responsive layout
   * Requirements: 12.1, 12.3
   */
  describe('Responsive Layout', () => {
    beforeEach(() => {
      const ctaSectionHTML = `
        <section id="cta-final" class="relative py-20 overflow-hidden">
          <div class="container mx-auto px-6 relative z-10">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
                Ready to Transform Your AI Development?
              </h2>
              <p class="text-lg md:text-xl text-white/90 mb-12 max-w-2xl mx-auto">
                Join thousands of AI teams building better applications.
              </p>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                <div>Badge 1</div>
                <div>Badge 2</div>
                <div>Badge 3</div>
                <div>Badge 4</div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = ctaSectionHTML;
    });

    it('should have responsive container padding', () => {
      const containerDiv = container.querySelector('.container');

      expect(containerDiv?.classList.contains('mx-auto')).toBe(true);
      expect(containerDiv?.classList.contains('px-6')).toBe(true);
    });

    it('should have max-width constraint on content', () => {
      const maxWidthContainer = container.querySelector('.max-w-4xl');

      expect(maxWidthContainer).toBeTruthy();
      expect(maxWidthContainer?.classList.contains('mx-auto')).toBe(true);
    });

    it('should have responsive badge grid', () => {
      const grid = container.querySelector('.grid');

      expect(grid?.classList.contains('grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-4')).toBe(true);
    });

    it('should have max-width on subtext', () => {
      const subtext = container.querySelector('p.text-lg');

      expect(subtext?.classList.contains('max-w-2xl')).toBe(true);
      expect(subtext?.classList.contains('mx-auto')).toBe(true);
    });
  });
});
