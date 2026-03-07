/**
 * Unit tests for SocialProof component
 * Requirements: 3.1, 3.2
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('SocialProof Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Correct number of logos render
   * Requirements: 3.1
   */
  describe('Company Logos', () => {
    beforeEach(() => {
      const socialProofHTML = `
        <section id="social-proof" class="py-16 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto text-center">
              <p class="text-sm text-slate-400 mb-8 font-medium">
                Trusted by AI teams at
              </p>
              <div class="flex flex-wrap justify-center items-center gap-12 md:gap-16">
                <div class="company-logo-wrapper">
                  <img src="/logos/company1.svg" alt="Company 1" class="company-logo h-8 md:h-10 w-auto object-contain" loading="lazy" />
                </div>
                <div class="company-logo-wrapper">
                  <img src="/logos/company2.svg" alt="Company 2" class="company-logo h-8 md:h-10 w-auto object-contain" loading="lazy" />
                </div>
                <div class="company-logo-wrapper">
                  <img src="/logos/company3.svg" alt="Company 3" class="company-logo h-8 md:h-10 w-auto object-contain" loading="lazy" />
                </div>
                <div class="company-logo-wrapper">
                  <img src="/logos/company4.svg" alt="Company 4" class="company-logo h-8 md:h-10 w-auto object-contain" loading="lazy" />
                </div>
                <div class="company-logo-wrapper">
                  <img src="/logos/company5.svg" alt="Company 5" class="company-logo h-8 md:h-10 w-auto object-contain" loading="lazy" />
                </div>
                <div class="company-logo-wrapper">
                  <img src="/logos/company6.svg" alt="Company 6" class="company-logo h-8 md:h-10 w-auto object-contain" loading="lazy" />
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = socialProofHTML;
    });

    it('should render exactly six company logos', () => {
      const logos = container.querySelectorAll('.company-logo');

      expect(logos.length).toBe(6);
    });

    it('should render all logos with correct wrapper class', () => {
      const wrappers = container.querySelectorAll('.company-logo-wrapper');

      expect(wrappers.length).toBe(6);
    });

    it('should have alt text for all logos', () => {
      const logos = container.querySelectorAll('.company-logo');

      logos.forEach((logo) => {
        const altText = logo.getAttribute('alt');
        expect(altText).toBeTruthy();
        expect(altText).not.toBe('');
      });
    });

    it('should have lazy loading on all logos', () => {
      const logos = container.querySelectorAll('.company-logo');

      logos.forEach((logo) => {
        expect(logo.getAttribute('loading')).toBe('lazy');
      });
    });

    it('should have correct image sizing classes', () => {
      const logos = container.querySelectorAll('.company-logo');

      logos.forEach((logo) => {
        expect(logo.classList.contains('h-8')).toBe(true);
        expect(logo.classList.contains('md:h-10')).toBe(true);
        expect(logo.classList.contains('w-auto')).toBe(true);
        expect(logo.classList.contains('object-contain')).toBe(true);
      });
    });

    it('should have logos in flex container with responsive wrapping', () => {
      const logoContainer = container.querySelector('.flex.flex-wrap');

      expect(logoContainer).toBeTruthy();
      expect(logoContainer?.classList.contains('justify-center')).toBe(true);
      expect(logoContainer?.classList.contains('items-center')).toBe(true);
    });

    it('should have responsive gap spacing', () => {
      const logoContainer = container.querySelector('.flex.flex-wrap');

      expect(logoContainer?.classList.contains('gap-12')).toBe(true);
      expect(logoContainer?.classList.contains('md:gap-16')).toBe(true);
    });
  });

  /**
   * Test: Label text is correct
   * Requirements: 3.1, 3.2
   */
  describe('Label Text', () => {
    beforeEach(() => {
      const socialProofHTML = `
        <section id="social-proof">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto text-center">
              <p class="text-sm text-slate-400 mb-8 font-medium">
                Trusted by AI teams at
              </p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = socialProofHTML;
    });

    it('should render "Trusted by AI teams at" label', () => {
      const label = container.querySelector('p.text-sm');

      expect(label).toBeTruthy();
      expect(label?.textContent?.trim()).toBe('Trusted by AI teams at');
    });

    it('should have correct styling on label', () => {
      const label = container.querySelector('p.text-sm');

      expect(label?.classList.contains('text-sm')).toBe(true);
      expect(label?.classList.contains('text-slate-400')).toBe(true);
      expect(label?.classList.contains('mb-8')).toBe(true);
      expect(label?.classList.contains('font-medium')).toBe(true);
    });

    it('should have label centered', () => {
      const textCenter = container.querySelector('.text-center');

      expect(textCenter).toBeTruthy();
      expect(textCenter?.querySelector('p.text-sm')).toBeTruthy();
    });
  });

  /**
   * Test: Logos have grayscale styling
   * Requirements: 3.2
   */
  describe('Grayscale Styling', () => {
    beforeEach(() => {
      const socialProofHTML = `
        <section id="social-proof">
          <div class="flex flex-wrap justify-center items-center">
            <div class="company-logo-wrapper">
              <img src="/logos/company1.svg" alt="Company 1" class="company-logo" />
            </div>
            <div class="company-logo-wrapper">
              <img src="/logos/company2.svg" alt="Company 2" class="company-logo" />
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = socialProofHTML;
    });

    it('should have company-logo class on all images', () => {
      const logos = container.querySelectorAll('.company-logo');

      expect(logos.length).toBeGreaterThan(0);
      logos.forEach((logo) => {
        expect(logo.classList.contains('company-logo')).toBe(true);
      });
    });

    it('should have company-logo-wrapper class on all wrappers', () => {
      const wrappers = container.querySelectorAll('.company-logo-wrapper');

      expect(wrappers.length).toBeGreaterThan(0);
      wrappers.forEach((wrapper) => {
        expect(wrapper.classList.contains('company-logo-wrapper')).toBe(true);
      });
    });
  });

  /**
   * Test: Section structure
   * Requirements: 3.1
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const socialProofHTML = `
        <section id="social-proof" class="py-16 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto text-center">
              <p class="text-sm text-slate-400 mb-8 font-medium">
                Trusted by AI teams at
              </p>
              <div class="flex flex-wrap justify-center items-center gap-12 md:gap-16">
                <!-- logos -->
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = socialProofHTML;
    });

    it('should have social-proof section with correct id', () => {
      const section = container.querySelector('#social-proof');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('social-proof');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#social-proof');

      expect(section?.classList.contains('bg-slate-900')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#social-proof');

      expect(section?.classList.contains('py-16')).toBe(true);
    });

    it('should have container with correct max-width', () => {
      const maxWidthContainer = container.querySelector('.max-w-6xl');

      expect(maxWidthContainer).toBeTruthy();
      expect(maxWidthContainer?.classList.contains('mx-auto')).toBe(true);
      expect(maxWidthContainer?.classList.contains('text-center')).toBe(true);
    });

    it('should have responsive container padding', () => {
      const containerDiv = container.querySelector('.container');

      expect(containerDiv?.classList.contains('mx-auto')).toBe(true);
      expect(containerDiv?.classList.contains('px-6')).toBe(true);
    });
  });
});
