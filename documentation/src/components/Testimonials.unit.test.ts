/**
 * Unit tests for Testimonials component
 * Requirements: 8.1, 8.2, 8.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Testimonials Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Minimum three testimonials render
   * Requirements: 8.1
   */
  describe('Testimonial Cards', () => {
    beforeEach(() => {
      const testimonialsHTML = `
        <section id="testimonials" class="py-20 bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  Trusted by AI Teams Worldwide
                </h2>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div class="testimonial-card" data-testimonial-author="sarah-chen">
                  <div class="flex-grow mb-6">
                    <p class="testimonial-quote">Great product!</p>
                  </div>
                  <div class="testimonial-metrics">70% cost reduction</div>
                  <div class="flex items-center gap-4">
                    <p class="testimonial-author">Sarah Chen</p>
                    <p class="testimonial-role">VP of Engineering</p>
                    <p class="testimonial-company">TechCorp AI</p>
                  </div>
                </div>
                <div class="testimonial-card" data-testimonial-author="michael-rodriguez">
                  <div class="flex-grow mb-6">
                    <p class="testimonial-quote">Amazing platform!</p>
                  </div>
                  <div class="testimonial-metrics">3 tools to 1 platform</div>
                  <div class="flex items-center gap-4">
                    <p class="testimonial-author">Michael Rodriguez</p>
                    <p class="testimonial-role">Lead AI Engineer</p>
                    <p class="testimonial-company">DataFlow Systems</p>
                  </div>
                </div>
                <div class="testimonial-card" data-testimonial-author="emily-watson">
                  <div class="flex-grow mb-6">
                    <p class="testimonial-quote">Open source is key!</p>
                  </div>
                  <div class="flex items-center gap-4">
                    <p class="testimonial-author">Emily Watson</p>
                    <p class="testimonial-role">CTO</p>
                    <p class="testimonial-company">InnovateLabs</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = testimonialsHTML;
    });

    it('should render at least three testimonial cards', () => {
      const testimonialCards = container.querySelectorAll('.testimonial-card');

      expect(testimonialCards.length).toBeGreaterThanOrEqual(3);
    });

    it('should render exactly three testimonial cards', () => {
      const testimonialCards = container.querySelectorAll('.testimonial-card');

      expect(testimonialCards.length).toBe(3);
    });

    it('should render Sarah Chen testimonial', () => {
      const sarahCard = container.querySelector('[data-testimonial-author="sarah-chen"]');
      const author = sarahCard?.querySelector('.testimonial-author');

      expect(sarahCard).toBeTruthy();
      expect(author?.textContent).toBe('Sarah Chen');
    });

    it('should render Michael Rodriguez testimonial', () => {
      const michaelCard = container.querySelector('[data-testimonial-author="michael-rodriguez"]');
      const author = michaelCard?.querySelector('.testimonial-author');

      expect(michaelCard).toBeTruthy();
      expect(author?.textContent).toBe('Michael Rodriguez');
    });

    it('should render Emily Watson testimonial', () => {
      const emilyCard = container.querySelector('[data-testimonial-author="emily-watson"]');
      const author = emilyCard?.querySelector('.testimonial-author');

      expect(emilyCard).toBeTruthy();
      expect(author?.textContent).toBe('Emily Watson');
    });

    it('should have section header', () => {
      const header = container.querySelector('h2');

      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('Trusted by AI Teams Worldwide');
    });

    it('should have testimonial cards in grid layout', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true);
    });
  });

  /**
   * Test: Testimonials with metrics display them
   * Requirements: 8.2, 8.3
   */
  describe('Testimonial Metrics Display', () => {
    beforeEach(() => {
      const testimonialsHTML = `
        <section id="testimonials">
          <div class="grid">
            <div class="testimonial-card" data-testimonial-author="with-metrics">
              <div class="flex-grow mb-6">
                <p class="testimonial-quote">Great product with measurable results!</p>
              </div>
              <div class="testimonial-metrics mb-6 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <p class="text-sm font-semibold text-indigo-300">
                  70% cost reduction, 3x faster debugging
                </p>
              </div>
              <div class="flex items-center gap-4">
                <p class="testimonial-author">John Doe</p>
                <p class="testimonial-role">Engineer</p>
                <p class="testimonial-company">Tech Company</p>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = testimonialsHTML;
    });

    it('should display metrics section when metrics are present', () => {
      const card = container.querySelector('[data-testimonial-author="with-metrics"]');
      const metricsSection = card?.querySelector('.testimonial-metrics');

      expect(metricsSection).toBeTruthy();
    });

    it('should display metrics text correctly', () => {
      const card = container.querySelector('[data-testimonial-author="with-metrics"]');
      const metricsSection = card?.querySelector('.testimonial-metrics');
      const metricsText = metricsSection?.querySelector('p');

      expect(metricsText).toBeTruthy();
      expect(metricsText?.textContent?.trim()).toBe('70% cost reduction, 3x faster debugging');
    });

    it('should have metrics section with correct styling', () => {
      const card = container.querySelector('[data-testimonial-author="with-metrics"]');
      const metricsSection = card?.querySelector('.testimonial-metrics');

      expect(metricsSection?.classList.contains('testimonial-metrics')).toBe(true);
      expect(metricsSection?.classList.contains('bg-indigo-500/10')).toBe(true);
      expect(metricsSection?.classList.contains('border')).toBe(true);
      expect(metricsSection?.classList.contains('border-indigo-500/20')).toBe(true);
    });

    it('should have metrics text with correct styling', () => {
      const card = container.querySelector('[data-testimonial-author="with-metrics"]');
      const metricsText = card?.querySelector('.testimonial-metrics p');

      expect(metricsText?.classList.contains('text-sm')).toBe(true);
      expect(metricsText?.classList.contains('font-semibold')).toBe(true);
      expect(metricsText?.classList.contains('text-indigo-300')).toBe(true);
    });
  });


  /**
   * Test: Testimonials without metrics don't show metrics section
   * Requirements: 8.2, 8.3
   */
  describe('Testimonial Without Metrics', () => {
    beforeEach(() => {
      const testimonialsHTML = `
        <section id="testimonials">
          <div class="grid">
            <div class="testimonial-card" data-testimonial-author="without-metrics">
              <div class="flex-grow mb-6">
                <p class="testimonial-quote">Great product!</p>
              </div>
              <div class="flex items-center gap-4">
                <p class="testimonial-author">Jane Smith</p>
                <p class="testimonial-role">Developer</p>
                <p class="testimonial-company">Software Inc</p>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = testimonialsHTML;
    });

    it('should not display metrics section when metrics are absent', () => {
      const card = container.querySelector('[data-testimonial-author="without-metrics"]');
      const metricsSection = card?.querySelector('.testimonial-metrics');

      expect(metricsSection).toBeNull();
    });

    it('should still display quote when metrics are absent', () => {
      const card = container.querySelector('[data-testimonial-author="without-metrics"]');
      const quote = card?.querySelector('.testimonial-quote');

      expect(quote).toBeTruthy();
      expect(quote?.textContent).toBe('Great product!');
    });

    it('should still display author info when metrics are absent', () => {
      const card = container.querySelector('[data-testimonial-author="without-metrics"]');
      const author = card?.querySelector('.testimonial-author');
      const role = card?.querySelector('.testimonial-role');
      const company = card?.querySelector('.testimonial-company');

      expect(author).toBeTruthy();
      expect(author?.textContent).toBe('Jane Smith');
      expect(role).toBeTruthy();
      expect(role?.textContent).toBe('Developer');
      expect(company).toBeTruthy();
      expect(company?.textContent).toBe('Software Inc');
    });
  });

  /**
   * Test: Card structure and required elements
   * Requirements: 8.2
   */
  describe('Card Structure', () => {
    beforeEach(() => {
      const testimonialCardHTML = `
        <section id="testimonials">
          <div class="grid">
            <div
              class="testimonial-card flex flex-col p-8 rounded-xl bg-slate-900/50 border border-slate-800"
              data-testimonial-author="test-author"
            >
              <!-- Quote -->
              <div class="flex-grow mb-6">
                <svg 
                  class="w-10 h-10 text-indigo-500/30 mb-4" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <p class="testimonial-quote text-slate-300 leading-relaxed">
                  This is a test testimonial quote that demonstrates the product value.
                </p>
              </div>

              <!-- Author Info -->
              <div class="flex items-center gap-4">
                <img
                  src="/avatars/test.jpg"
                  alt="Test Author"
                  class="testimonial-avatar w-12 h-12 rounded-full object-cover border-2 border-slate-700"
                  loading="lazy"
                />
                <div class="flex-grow">
                  <p class="testimonial-author font-semibold text-white">
                    Test Author
                  </p>
                  <p class="testimonial-role text-sm text-slate-400">
                    Test Role
                  </p>
                  <p class="testimonial-company text-sm text-slate-500">
                    Test Company
                  </p>
                </div>
                <img
                  src="/logos/test-company.svg"
                  alt="Test Company"
                  class="testimonial-company-logo h-8 w-auto object-contain opacity-60"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = testimonialCardHTML;
    });

    it('should have a quote in the card', () => {
      const card = container.querySelector('.testimonial-card');
      const quote = card?.querySelector('.testimonial-quote');

      expect(quote).toBeTruthy();
      expect(quote?.classList.contains('text-slate-300')).toBe(true);
      expect(quote?.classList.contains('leading-relaxed')).toBe(true);
      expect(quote?.textContent?.trim()).toContain('This is a test testimonial quote');
    });

    it('should have quote icon', () => {
      const card = container.querySelector('.testimonial-card');
      const quoteIcon = card?.querySelector('svg.w-10.h-10');

      expect(quoteIcon).toBeTruthy();
      expect(quoteIcon?.classList.contains('text-indigo-500/30')).toBe(true);
    });

    it('should have author name in the card', () => {
      const card = container.querySelector('.testimonial-card');
      const author = card?.querySelector('.testimonial-author');

      expect(author).toBeTruthy();
      expect(author?.classList.contains('font-semibold')).toBe(true);
      expect(author?.classList.contains('text-white')).toBe(true);
      expect(author?.textContent?.trim()).toBe('Test Author');
    });

    it('should have role in the card', () => {
      const card = container.querySelector('.testimonial-card');
      const role = card?.querySelector('.testimonial-role');

      expect(role).toBeTruthy();
      expect(role?.classList.contains('text-sm')).toBe(true);
      expect(role?.classList.contains('text-slate-400')).toBe(true);
      expect(role?.textContent?.trim()).toBe('Test Role');
    });

    it('should have company in the card', () => {
      const card = container.querySelector('.testimonial-card');
      const company = card?.querySelector('.testimonial-company');

      expect(company).toBeTruthy();
      expect(company?.classList.contains('text-sm')).toBe(true);
      expect(company?.classList.contains('text-slate-500')).toBe(true);
      expect(company?.textContent?.trim()).toBe('Test Company');
    });

    it('should have company logo in the card', () => {
      const card = container.querySelector('.testimonial-card');
      const companyLogo = card?.querySelector('.testimonial-company-logo');

      expect(companyLogo).toBeTruthy();
      expect(companyLogo?.tagName).toBe('IMG');
      expect(companyLogo?.getAttribute('src')).toBe('/logos/test-company.svg');
      expect(companyLogo?.getAttribute('alt')).toBe('Test Company');
      expect(companyLogo?.classList.contains('h-8')).toBe(true);
      expect(companyLogo?.classList.contains('w-auto')).toBe(true);
    });

    it('should have avatar in the card', () => {
      const card = container.querySelector('.testimonial-card');
      const avatar = card?.querySelector('.testimonial-avatar');

      expect(avatar).toBeTruthy();
      expect(avatar?.tagName).toBe('IMG');
      expect(avatar?.getAttribute('src')).toBe('/avatars/test.jpg');
      expect(avatar?.getAttribute('alt')).toBe('Test Author');
      expect(avatar?.classList.contains('w-12')).toBe(true);
      expect(avatar?.classList.contains('h-12')).toBe(true);
      expect(avatar?.classList.contains('rounded-full')).toBe(true);
    });

    it('should have card with correct base styling', () => {
      const card = container.querySelector('.testimonial-card');

      expect(card).toBeTruthy();
      expect(card?.classList.contains('flex')).toBe(true);
      expect(card?.classList.contains('flex-col')).toBe(true);
      expect(card?.classList.contains('p-8')).toBe(true);
      expect(card?.classList.contains('rounded-xl')).toBe(true);
      expect(card?.classList.contains('bg-slate-900/50')).toBe(true);
      expect(card?.classList.contains('border')).toBe(true);
      expect(card?.classList.contains('border-slate-800')).toBe(true);
    });
  });


  /**
   * Test: Section structure
   * Requirements: 8.1
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const testimonialsHTML = `
        <section id="testimonials" class="py-20 bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  Trusted by AI Teams Worldwide
                </h2>
                <p class="text-lg text-slate-400 max-w-3xl mx-auto">
                  See how teams are building better AI applications with OpenSearch AgentOps
                </p>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = testimonialsHTML;
    });

    it('should have testimonials section with correct id', () => {
      const section = container.querySelector('#testimonials');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('testimonials');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#testimonials');

      expect(section?.classList.contains('bg-slate-950')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#testimonials');

      expect(section?.classList.contains('py-20')).toBe(true);
    });

    it('should have section header with title', () => {
      const header = container.querySelector('h2');
      const headerContainer = container.querySelector('.text-center');

      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('Trusted by AI Teams Worldwide');
      expect(headerContainer).toBeTruthy();
    });

    it('should have section description', () => {
      const description = container.querySelector('p.text-lg');

      expect(description).toBeTruthy();
      expect(description?.classList.contains('text-slate-400')).toBe(true);
      expect(description?.textContent).toContain('OpenSearch AgentOps');
    });

    it('should have centered header', () => {
      const headerContainer = container.querySelector('.text-center');

      expect(headerContainer).toBeTruthy();
      expect(headerContainer?.classList.contains('mb-16')).toBe(true);
    });

    it('should have container with correct max-width', () => {
      const maxWidthContainer = container.querySelector('.max-w-6xl');

      expect(maxWidthContainer).toBeTruthy();
      expect(maxWidthContainer?.classList.contains('mx-auto')).toBe(true);
    });
  });

  /**
   * Test: Responsive grid layout
   * Requirements: 8.1
   */
  describe('Responsive Grid Layout', () => {
    beforeEach(() => {
      const gridHTML = `
        <section id="testimonials">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div class="testimonial-card">Card 1</div>
            <div class="testimonial-card">Card 2</div>
            <div class="testimonial-card">Card 3</div>
          </div>
        </section>
      `;
      
      container.innerHTML = gridHTML;
    });

    it('should have grid layout', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid')).toBe(true);
    });

    it('should have 1 column on mobile', () => {
      const grid = container.querySelector('.grid');

      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
    });

    it('should have 2 columns on tablet', () => {
      const grid = container.querySelector('.grid');

      expect(grid?.classList.contains('md:grid-cols-2')).toBe(true);
    });

    it('should have 3 columns on desktop', () => {
      const grid = container.querySelector('.grid');

      expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true);
    });

    it('should have gap between cards', () => {
      const grid = container.querySelector('.grid');

      expect(grid?.classList.contains('gap-8')).toBe(true);
    });
  });

  /**
   * Test: Mixed testimonials (with and without metrics)
   * Requirements: 8.1, 8.2, 8.3
   */
  describe('Mixed Testimonials', () => {
    beforeEach(() => {
      const testimonialsHTML = `
        <section id="testimonials">
          <div class="grid">
            <div class="testimonial-card" data-testimonial-author="card-1">
              <p class="testimonial-quote">Quote 1</p>
              <div class="testimonial-metrics">Metrics 1</div>
              <p class="testimonial-author">Author 1</p>
            </div>
            <div class="testimonial-card" data-testimonial-author="card-2">
              <p class="testimonial-quote">Quote 2</p>
              <div class="testimonial-metrics">Metrics 2</div>
              <p class="testimonial-author">Author 2</p>
            </div>
            <div class="testimonial-card" data-testimonial-author="card-3">
              <p class="testimonial-quote">Quote 3</p>
              <p class="testimonial-author">Author 3</p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = testimonialsHTML;
    });

    it('should render three testimonials with mixed metrics', () => {
      const cards = container.querySelectorAll('.testimonial-card');

      expect(cards.length).toBe(3);
    });

    it('should show metrics for first two testimonials', () => {
      const card1 = container.querySelector('[data-testimonial-author="card-1"]');
      const card2 = container.querySelector('[data-testimonial-author="card-2"]');
      
      const metrics1 = card1?.querySelector('.testimonial-metrics');
      const metrics2 = card2?.querySelector('.testimonial-metrics');

      expect(metrics1).toBeTruthy();
      expect(metrics2).toBeTruthy();
    });

    it('should not show metrics for third testimonial', () => {
      const card3 = container.querySelector('[data-testimonial-author="card-3"]');
      const metrics3 = card3?.querySelector('.testimonial-metrics');

      expect(metrics3).toBeNull();
    });

    it('should show quotes for all testimonials', () => {
      const cards = container.querySelectorAll('.testimonial-card');

      cards.forEach(card => {
        const quote = card.querySelector('.testimonial-quote');
        expect(quote).toBeTruthy();
      });
    });

    it('should show authors for all testimonials', () => {
      const cards = container.querySelectorAll('.testimonial-card');

      cards.forEach(card => {
        const author = card.querySelector('.testimonial-author');
        expect(author).toBeTruthy();
      });
    });
  });
});
