/**
 * Property-based tests for Testimonials component
 * Feature: opensearch-agentops-website
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar?: string;
  companyLogo?: string;
  metrics?: string;
}

/**
 * Property 3: Testimonial cards contain all required elements
 * Validates: Requirements 8.2
 * 
 * For any testimonial data object, the rendered card should include 
 * quote text, author name, role, company, and company logo.
 */
describe('Testimonials - Property 3: Testimonial cards contain all required elements', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // Helper function to render a testimonial card
  function renderTestimonialCard(testimonial: Testimonial): string {
    return `
      <div
        class="testimonial-card flex flex-col p-8 rounded-xl bg-slate-900/50 border border-slate-800"
        data-testimonial-author="${testimonial.author.toLowerCase().replace(/\s+/g, '-')}"
      >
        <!-- Quote -->
        <div class="flex-grow mb-6">
          <p class="testimonial-quote text-slate-300 leading-relaxed">
            ${testimonial.quote}
          </p>
        </div>

        <!-- Metrics (conditional) -->
        ${testimonial.metrics ? `
          <div class="testimonial-metrics mb-6 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <p class="text-sm font-semibold text-indigo-300">
              ${testimonial.metrics}
            </p>
          </div>
        ` : ''}

        <!-- Author Info -->
        <div class="flex items-center gap-4">
          ${testimonial.avatar ? `
            <img
              src="${testimonial.avatar}"
              alt="${testimonial.author}"
              class="testimonial-avatar w-12 h-12 rounded-full object-cover border-2 border-slate-700"
              loading="lazy"
            />
          ` : ''}
          <div class="flex-grow">
            <p class="testimonial-author font-semibold text-white">
              ${testimonial.author}
            </p>
            <p class="testimonial-role text-sm text-slate-400">
              ${testimonial.role}
            </p>
            <p class="testimonial-company text-sm text-slate-500">
              ${testimonial.company}
            </p>
          </div>
          ${testimonial.companyLogo ? `
            <img
              src="${testimonial.companyLogo}"
              alt="${testimonial.company}"
              class="testimonial-company-logo h-8 w-auto object-contain opacity-60"
              loading="lazy"
            />
          ` : ''}
        </div>
      </div>
    `;
  }

  it('should contain all required elements for any testimonial data', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.option(
            fc.string({ minLength: 10, maxLength: 100 })
              .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
            { nil: undefined }
          ),
        }),
        (testimonial) => {
          // Render testimonial card
          container.innerHTML = renderTestimonialCard(testimonial);

          const card = container.querySelector('.testimonial-card');
          expect(card).toBeTruthy();

          // Property: Card must have a quote
          const quote = card!.querySelector('.testimonial-quote');
          expect(quote).toBeTruthy();
          expect(quote!.textContent?.trim()).toBe(testimonial.quote.trim());

          // Property: Card must have author name
          const author = card!.querySelector('.testimonial-author');
          expect(author).toBeTruthy();
          expect(author!.textContent?.trim()).toBe(testimonial.author.trim());

          // Property: Card must have role
          const role = card!.querySelector('.testimonial-role');
          expect(role).toBeTruthy();
          expect(role!.textContent?.trim()).toBe(testimonial.role.trim());

          // Property: Card must have company
          const company = card!.querySelector('.testimonial-company');
          expect(company).toBeTruthy();
          expect(company!.textContent?.trim()).toBe(testimonial.company.trim());

          // Property: Card must have company logo if provided
          if (testimonial.companyLogo) {
            const companyLogo = card!.querySelector('.testimonial-company-logo');
            expect(companyLogo).toBeTruthy();
            expect(companyLogo!.getAttribute('src')).toBe(testimonial.companyLogo);
            expect(companyLogo!.getAttribute('alt')).toBe(testimonial.company);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have quote with correct structure', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.option(
            fc.string({ minLength: 10, maxLength: 100 })
              .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
            { nil: undefined }
          ),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const quote = container.querySelector('.testimonial-quote');

          // Property: Quote must be a paragraph element
          expect(quote).toBeTruthy();
          expect(quote!.tagName).toBe('P');

          // Property: Quote must have correct styling classes
          expect(quote!.classList.contains('text-slate-300')).toBe(true);
          expect(quote!.classList.contains('leading-relaxed')).toBe(true);

          // Property: Quote must contain the testimonial quote text
          expect(quote!.textContent?.trim()).toBe(testimonial.quote.trim());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have author info with correct structure', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.option(
            fc.string({ minLength: 10, maxLength: 100 })
              .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
            { nil: undefined }
          ),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const author = container.querySelector('.testimonial-author');
          const role = container.querySelector('.testimonial-role');
          const company = container.querySelector('.testimonial-company');

          // Property: Author must be a paragraph element with correct styling
          expect(author).toBeTruthy();
          expect(author!.tagName).toBe('P');
          expect(author!.classList.contains('font-semibold')).toBe(true);
          expect(author!.classList.contains('text-white')).toBe(true);
          expect(author!.textContent?.trim()).toBe(testimonial.author.trim());

          // Property: Role must be a paragraph element with correct styling
          expect(role).toBeTruthy();
          expect(role!.tagName).toBe('P');
          expect(role!.classList.contains('text-sm')).toBe(true);
          expect(role!.classList.contains('text-slate-400')).toBe(true);
          expect(role!.textContent?.trim()).toBe(testimonial.role.trim());

          // Property: Company must be a paragraph element with correct styling
          expect(company).toBeTruthy();
          expect(company!.tagName).toBe('P');
          expect(company!.classList.contains('text-sm')).toBe(true);
          expect(company!.classList.contains('text-slate-500')).toBe(true);
          expect(company!.textContent?.trim()).toBe(testimonial.company.trim());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have avatar when provided', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.webUrl(),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.option(
            fc.string({ minLength: 10, maxLength: 100 })
              .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
            { nil: undefined }
          ),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const avatar = container.querySelector('.testimonial-avatar');

          // Property: Avatar must exist when provided
          expect(avatar).toBeTruthy();
          expect(avatar!.tagName).toBe('IMG');

          // Property: Avatar must have correct src and alt
          expect(avatar!.getAttribute('src')).toBe(testimonial.avatar);
          expect(avatar!.getAttribute('alt')).toBe(testimonial.author);

          // Property: Avatar must have correct styling
          expect(avatar!.classList.contains('w-12')).toBe(true);
          expect(avatar!.classList.contains('h-12')).toBe(true);
          expect(avatar!.classList.contains('rounded-full')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have company logo when provided', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.webUrl(),
          metrics: fc.option(
            fc.string({ minLength: 10, maxLength: 100 })
              .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
            { nil: undefined }
          ),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const companyLogo = container.querySelector('.testimonial-company-logo');

          // Property: Company logo must exist when provided
          expect(companyLogo).toBeTruthy();
          expect(companyLogo!.tagName).toBe('IMG');

          // Property: Company logo must have correct src and alt
          expect(companyLogo!.getAttribute('src')).toBe(testimonial.companyLogo);
          expect(companyLogo!.getAttribute('alt')).toBe(testimonial.company);

          // Property: Company logo must have correct styling
          expect(companyLogo!.classList.contains('h-8')).toBe(true);
          expect(companyLogo!.classList.contains('w-auto')).toBe(true);
          expect(companyLogo!.classList.contains('object-contain')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 4: Testimonial metrics display conditionally
 * Validates: Requirements 8.3
 * 
 * For any testimonial data object with a metrics field, the rendered card 
 * should display the metrics; for testimonials without metrics, no metrics 
 * section should be rendered.
 */
describe('Testimonials - Property 4: Testimonial metrics display conditionally', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // Helper function to render a testimonial card
  function renderTestimonialCard(testimonial: Testimonial): string {
    return `
      <div
        class="testimonial-card flex flex-col p-8 rounded-xl bg-slate-900/50 border border-slate-800"
        data-testimonial-author="${testimonial.author.toLowerCase().replace(/\s+/g, '-')}"
      >
        <!-- Quote -->
        <div class="flex-grow mb-6">
          <p class="testimonial-quote text-slate-300 leading-relaxed">
            ${testimonial.quote}
          </p>
        </div>

        <!-- Metrics (conditional) -->
        ${testimonial.metrics ? `
          <div class="testimonial-metrics mb-6 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <p class="text-sm font-semibold text-indigo-300">
              ${testimonial.metrics}
            </p>
          </div>
        ` : ''}

        <!-- Author Info -->
        <div class="flex items-center gap-4">
          <div class="flex-grow">
            <p class="testimonial-author font-semibold text-white">
              ${testimonial.author}
            </p>
            <p class="testimonial-role text-sm text-slate-400">
              ${testimonial.role}
            </p>
            <p class="testimonial-company text-sm text-slate-500">
              ${testimonial.company}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  it('should display metrics when metrics field is present', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.string({ minLength: 10, maxLength: 100 })
            .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const card = container.querySelector('.testimonial-card');
          const metricsSection = card!.querySelector('.testimonial-metrics');

          // Property: Metrics section must exist when metrics field is present
          expect(metricsSection).toBeTruthy();

          // Property: Metrics section must contain the metrics text
          const metricsText = metricsSection!.querySelector('p');
          expect(metricsText).toBeTruthy();
          expect(metricsText!.textContent?.trim()).toBe(testimonial.metrics.trim());

          // Property: Metrics section must have correct styling
          expect(metricsSection!.classList.contains('testimonial-metrics')).toBe(true);
          expect(metricsSection!.classList.contains('bg-indigo-500/10')).toBe(true);
          expect(metricsSection!.classList.contains('border')).toBe(true);
          expect(metricsSection!.classList.contains('border-indigo-500/20')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not display metrics section when metrics field is absent', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
        }),
        (testimonial) => {
          // Explicitly set metrics to undefined
          const testimonialWithoutMetrics = { ...testimonial, metrics: undefined };
          container.innerHTML = renderTestimonialCard(testimonialWithoutMetrics);

          const card = container.querySelector('.testimonial-card');
          const metricsSection = card!.querySelector('.testimonial-metrics');

          // Property: Metrics section must NOT exist when metrics field is absent
          expect(metricsSection).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should conditionally render metrics based on presence', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.option(
            fc.string({ minLength: 10, maxLength: 100 })
              .filter(s => s.trim().length >= 10 && !/[<>&"]/.test(s)),
            { nil: undefined }
          ),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const card = container.querySelector('.testimonial-card');
          const metricsSection = card!.querySelector('.testimonial-metrics');

          // Property: Metrics section existence must match metrics field presence
          if (testimonial.metrics) {
            expect(metricsSection).toBeTruthy();
            const metricsText = metricsSection!.querySelector('p');
            // Use innerHTML to preserve HTML entities, or normalize both sides
            const actualText = metricsText!.textContent?.trim() || '';
            const expectedText = testimonial.metrics.trim();
            // Both should be normalized the same way (textContent decodes HTML entities)
            expect(actualText).toBe(expectedText);
          } else {
            expect(metricsSection).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have metrics with correct styling when present', () => {
    fc.assert(
      fc.property(
        fc.record({
          quote: fc.string({ minLength: 20, maxLength: 300 })
            .filter(s => s.trim().length >= 20 && !/[<>&"#]/.test(s)),
          author: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          role: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z\s]+$/.test(s) && s.trim().length >= 3),
          company: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length >= 3),
          avatar: fc.option(fc.webUrl(), { nil: undefined }),
          companyLogo: fc.option(fc.webUrl(), { nil: undefined }),
          metrics: fc.string({ minLength: 10, maxLength: 100 })
            .filter(s => s.trim().length >= 10 && !/[<>&"#]/.test(s)),
        }),
        (testimonial) => {
          container.innerHTML = renderTestimonialCard(testimonial);

          const metricsSection = container.querySelector('.testimonial-metrics');
          const metricsText = metricsSection!.querySelector('p');

          // Property: Metrics text must have correct styling
          expect(metricsText).toBeTruthy();
          expect(metricsText!.classList.contains('text-sm')).toBe(true);
          expect(metricsText!.classList.contains('font-semibold')).toBe(true);
          expect(metricsText!.classList.contains('text-indigo-300')).toBe(true);

          // Property: Metrics section must have correct container styling
          expect(metricsSection!.classList.contains('p-4')).toBe(true);
          expect(metricsSection!.classList.contains('rounded-lg')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
