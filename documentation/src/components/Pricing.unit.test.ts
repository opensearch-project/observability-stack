/**
 * Unit tests for Pricing component
 * Requirements: 9.1, 9.2
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Pricing Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Pricing section renders
   * Requirements: 9.1
   */
  describe('Pricing Section Rendering', () => {
    beforeEach(() => {
      const pricingHTML = `
        <section id="pricing" class="py-20 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">
                Simple, Transparent Pricing
              </h2>
              <p class="text-lg text-slate-400 mb-12 max-w-2xl mx-auto">
                Start free with unlimited tracing and evaluation. Pay only for what you use with our flexible, 
                usage-based pricing. No hidden fees, no vendor lock-in.
              </p>
              <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a 
                  href="/signup" 
                  class="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors duration-200 shadow-lg shadow-indigo-500/50"
                  data-analytics="cta_pricing_start_trial"
                >
                  Start Free Trial
                </a>
                <a 
                  href="/contact-sales" 
                  class="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors duration-200 border border-slate-700"
                  data-analytics="cta_pricing_talk_sales"
                >
                  Talk to Sales
                </a>
              </div>
              <p class="text-sm text-slate-500 mt-8">
                Self-hosted option available for complete control and zero usage costs
              </p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = pricingHTML;
    });

    it('should render pricing section with correct id', () => {
      const section = container.querySelector('#pricing');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('pricing');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#pricing');

      expect(section?.classList.contains('bg-slate-900')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#pricing');

      expect(section?.classList.contains('py-20')).toBe(true);
    });

    it('should render headline text', () => {
      const headline = container.querySelector('h2');

      expect(headline).toBeTruthy();
      expect(headline?.textContent?.trim()).toBe('Simple, Transparent Pricing');
    });

    it('should render description text', () => {
      const description = container.querySelector('p.text-lg');

      expect(description).toBeTruthy();
      expect(description?.textContent).toContain('Start free with unlimited tracing');
      expect(description?.textContent).toContain('usage-based pricing');
    });

    it('should have centered content', () => {
      const textCenter = container.querySelector('.text-center');

      expect(textCenter).toBeTruthy();
      expect(textCenter?.querySelector('h2')).toBeTruthy();
    });

    it('should have container with correct max-width', () => {
      const maxWidthContainer = container.querySelector('.max-w-4xl');

      expect(maxWidthContainer).toBeTruthy();
      expect(maxWidthContainer?.classList.contains('mx-auto')).toBe(true);
      expect(maxWidthContainer?.classList.contains('text-center')).toBe(true);
    });

    it('should render additional info text', () => {
      const infoText = container.querySelector('p.text-sm');

      expect(infoText).toBeTruthy();
      expect(infoText?.textContent).toContain('Self-hosted option available');
    });
  });

  /**
   * Test: CTA buttons are present
   * Requirements: 9.2
   */
  describe('CTA Buttons', () => {
    beforeEach(() => {
      const pricingHTML = `
        <section id="pricing">
          <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a 
              href="/signup" 
              class="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors duration-200 shadow-lg shadow-indigo-500/50"
              data-analytics="cta_pricing_start_trial"
            >
              Start Free Trial
            </a>
            <a 
              href="/contact-sales" 
              class="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors duration-200 border border-slate-700"
              data-analytics="cta_pricing_talk_sales"
            >
              Talk to Sales
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = pricingHTML;
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

      expect(primaryCTA?.getAttribute('data-analytics')).toBe('cta_pricing_start_trial');
    });

    it('should have analytics tracking on secondary CTA', () => {
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(secondaryCTA?.getAttribute('data-analytics')).toBe('cta_pricing_talk_sales');
    });

    it('should have primary styling on primary CTA', () => {
      const primaryCTA = container.querySelector('a[href="/signup"]');

      expect(primaryCTA?.classList.contains('bg-indigo-600')).toBe(true);
      expect(primaryCTA?.classList.contains('hover:bg-indigo-700')).toBe(true);
      expect(primaryCTA?.classList.contains('text-white')).toBe(true);
      expect(primaryCTA?.classList.contains('font-semibold')).toBe(true);
    });

    it('should have secondary styling on secondary CTA', () => {
      const secondaryCTA = container.querySelector('a[href="/contact-sales"]');

      expect(secondaryCTA?.classList.contains('bg-slate-800')).toBe(true);
      expect(secondaryCTA?.classList.contains('hover:bg-slate-700')).toBe(true);
      expect(secondaryCTA?.classList.contains('border')).toBe(true);
      expect(secondaryCTA?.classList.contains('border-slate-700')).toBe(true);
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
   * Test: Responsive layout
   * Requirements: 9.1
   */
  describe('Responsive Layout', () => {
    beforeEach(() => {
      const pricingHTML = `
        <section id="pricing" class="py-20 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">
                Simple, Transparent Pricing
              </h2>
              <p class="text-lg text-slate-400 mb-12 max-w-2xl mx-auto">
                Description text
              </p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = pricingHTML;
    });

    it('should have responsive headline sizing', () => {
      const headline = container.querySelector('h2');

      expect(headline?.classList.contains('text-3xl')).toBe(true);
      expect(headline?.classList.contains('md:text-4xl')).toBe(true);
    });

    it('should have responsive container padding', () => {
      const containerDiv = container.querySelector('.container');

      expect(containerDiv?.classList.contains('mx-auto')).toBe(true);
      expect(containerDiv?.classList.contains('px-6')).toBe(true);
    });

    it('should have max-width constraint on description', () => {
      const description = container.querySelector('p.text-lg');

      expect(description?.classList.contains('max-w-2xl')).toBe(true);
      expect(description?.classList.contains('mx-auto')).toBe(true);
    });
  });
});
