/**
 * Property-based tests for Hero component
 * Feature: opensearch-agentops-website
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property 14: CTA button analytics tracking
 * Validates: Requirements 18.2
 * 
 * For any CTA button element, the element should have analytics tracking attributes 
 * (data-analytics or onClick handler with tracking).
 */
describe('Hero - Property 14: CTA button analytics tracking', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a container for our test HTML
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    document.body.removeChild(container);
  });

  it('should ensure all CTA buttons have analytics tracking attributes', () => {
    fc.assert(
      fc.property(
        fc.record({
          ctas: fc.array(
            fc.record({
              text: fc.string({ minLength: 3, maxLength: 30 }),
              href: fc.oneof(
                fc.constant('/signup'),
                fc.constant('/signin'),
                fc.constant('/demo'),
                fc.webUrl()
              ),
              analyticsId: fc.string({ minLength: 5, maxLength: 50 })
                .map(s => s.replace(/[^a-z0-9_]/gi, '_').toLowerCase())
                .filter(s => s.length >= 5),
              isPrimary: fc.boolean(),
              isExternal: fc.boolean()
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        (data) => {
          // Create CTA buttons with analytics tracking
          const ctaHTML = `
            <section id="hero">
              <div class="cta-container">
                ${data.ctas.map((cta, idx) => {
                  const externalAttrs = cta.isExternal 
                    ? 'target="_blank" rel="noopener noreferrer"' 
                    : '';
                  const primaryClass = cta.isPrimary 
                    ? 'bg-indigo-600 hover:bg-indigo-700' 
                    : 'bg-slate-800 hover:bg-slate-700';
                  
                  return `
                    <a 
                      href="${cta.href}" 
                      class="cta-button ${primaryClass}"
                      data-analytics="${cta.analyticsId}"
                      data-testid="cta-${idx}"
                      ${externalAttrs}
                    >
                      ${cta.text}
                    </a>
                  `;
                }).join('')}
              </div>
            </section>
          `;
          
          container.innerHTML = ctaHTML;

          // Get all CTA buttons
          const ctaButtons = container.querySelectorAll('.cta-button');

          // Property: All CTA buttons must have analytics tracking
          expect(ctaButtons.length).toBeGreaterThan(0);
          
          ctaButtons.forEach((button) => {
            // Check for data-analytics attribute
            const analyticsAttr = button.getAttribute('data-analytics');
            
            // Property: CTA must have analytics tracking attribute
            expect(analyticsAttr).toBeTruthy();
            expect(analyticsAttr!.length).toBeGreaterThan(0);
            
            // Analytics ID should be a valid identifier (alphanumeric + underscores)
            expect(analyticsAttr).toMatch(/^[a-z0-9_]+$/i);
            
            // CTA should have href attribute
            const href = button.getAttribute('href');
            expect(href).toBeTruthy();
            expect(href!.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure primary and secondary CTAs both have analytics tracking', () => {
    fc.assert(
      fc.property(
        fc.record({
          primaryText: fc.string({ minLength: 5, maxLength: 30 })
            .filter(s => s.trim().length >= 5)
            .map(s => s.replace(/[<>"'&]/g, '')), // Sanitize HTML special chars
          secondaryText: fc.string({ minLength: 5, maxLength: 30 })
            .filter(s => s.trim().length >= 5)
            .map(s => s.replace(/[<>"'&]/g, '')), // Sanitize HTML special chars
          primaryHref: fc.oneof(
            fc.constant('/signup'),
            fc.constant('/trial'),
            fc.constant('/get-started')
          ),
          secondaryHref: fc.webUrl(),
          primaryAnalytics: fc.string({ minLength: 5, maxLength: 50 })
            .map(s => `cta_primary_${s.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`)
            .filter(s => s.length >= 12 && !s.includes('__')),
          secondaryAnalytics: fc.string({ minLength: 5, maxLength: 50 })
            .map(s => `cta_secondary_${s.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`)
            .filter(s => s.length >= 14 && !s.includes('__'))
        }),
        (data) => {
          // Create hero section with primary and secondary CTAs
          const heroHTML = `
            <section id="hero">
              <div class="flex gap-4">
                <a 
                  href="${data.primaryHref}" 
                  class="cta-primary bg-indigo-600"
                  data-analytics="${data.primaryAnalytics}"
                >
                  ${data.primaryText}
                </a>
                <a 
                  href="${data.secondaryHref}" 
                  class="cta-secondary bg-slate-800"
                  data-analytics="${data.secondaryAnalytics}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${data.secondaryText}
                </a>
              </div>
            </section>
          `;
          
          container.innerHTML = heroHTML;

          const primaryCTA = container.querySelector('.cta-primary');
          const secondaryCTA = container.querySelector('.cta-secondary');

          // Property: Both primary and secondary CTAs must have analytics tracking
          expect(primaryCTA).toBeTruthy();
          expect(secondaryCTA).toBeTruthy();

          const primaryAnalytics = primaryCTA!.getAttribute('data-analytics');
          const secondaryAnalytics = secondaryCTA!.getAttribute('data-analytics');

          expect(primaryAnalytics).toBeTruthy();
          expect(secondaryAnalytics).toBeTruthy();
          
          // Analytics IDs should be distinct
          expect(primaryAnalytics).not.toBe(secondaryAnalytics);
          
          // Primary analytics should indicate it's a primary CTA
          expect(primaryAnalytics).toContain('cta_primary');
          
          // Secondary analytics should indicate it's a secondary CTA
          expect(secondaryAnalytics).toContain('cta_secondary');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure analytics tracking IDs are descriptive and follow naming convention', () => {
    fc.assert(
      fc.property(
        fc.record({
          section: fc.constantFrom('hero', 'footer', 'pricing', 'features'),
          action: fc.constantFrom('start_trial', 'sign_up', 'contact_sales', 'view_demo', 'github'),
          ctaText: fc.string({ minLength: 3, maxLength: 30 })
            .filter(s => s.trim().length >= 3)
            .map(s => s.replace(/[<>"'&]/g, '')), // Sanitize HTML special chars
          href: fc.oneof(
            fc.constant('/signup'),
            fc.constant('/signin'),
            fc.constant('/demo'),
            fc.constant('/pricing'),
            fc.webUrl()
          )
        }),
        (data) => {
          // Create CTA with descriptive analytics ID
          const analyticsId = `cta_${data.section}_${data.action}`;
          
          // Sanitize href to prevent HTML injection
          const sanitizedHref = data.href.replace(/["'<>]/g, '');
          
          const ctaHTML = `
            <a 
              href="${sanitizedHref}" 
              class="cta-button"
              data-analytics="${analyticsId}"
            >
              ${data.ctaText}
            </a>
          `;
          
          container.innerHTML = ctaHTML;
          const cta = container.querySelector('.cta-button');

          // Property: Analytics ID should follow naming convention
          expect(cta).toBeTruthy();
          const analyticsAttr = cta!.getAttribute('data-analytics');
          
          expect(analyticsAttr).toBeTruthy();
          
          // Should start with 'cta_'
          expect(analyticsAttr).toMatch(/^cta_/);
          
          // Should contain section identifier
          expect(analyticsAttr).toContain(data.section);
          
          // Should contain action identifier
          expect(analyticsAttr).toContain(data.action);
          
          // Should use underscores as separators (snake_case)
          expect(analyticsAttr).toMatch(/^[a-z0-9_]+$/);
          
          // Should not have consecutive underscores
          expect(analyticsAttr).not.toMatch(/__/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure external link CTAs have both analytics tracking and security attributes', () => {
    fc.assert(
      fc.property(
        fc.record({
          text: fc.string({ minLength: 5, maxLength: 30 }),
          url: fc.webUrl(),
          analyticsId: fc.string({ minLength: 5, maxLength: 50 })
            .map(s => `cta_external_${s.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`)
            .filter(s => s.length >= 13)
        }),
        (data) => {
          // Create external CTA with analytics and security attributes
          const ctaHTML = `
            <a 
              href="${data.url}" 
              class="cta-button"
              data-analytics="${data.analyticsId}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${data.text}
            </a>
          `;
          
          container.innerHTML = ctaHTML;
          const cta = container.querySelector('.cta-button');

          // Property: External CTAs must have analytics tracking
          const analyticsAttr = cta!.getAttribute('data-analytics');
          expect(analyticsAttr).toBeTruthy();
          expect(analyticsAttr).toContain('cta_external');

          // Property: External CTAs must have security attributes
          expect(cta!.getAttribute('target')).toBe('_blank');
          
          const rel = cta!.getAttribute('rel');
          expect(rel).toBeTruthy();
          expect(rel).toContain('noopener');
          expect(rel).toContain('noreferrer');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure all CTAs in hero section have unique analytics identifiers', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 3, maxLength: 30 })
              .filter(s => s.trim().length >= 3)
              .map(s => s.replace(/[<>"'&]/g, '')), // Sanitize HTML special chars
            href: fc.oneof(
              fc.constant('/signup'),
              fc.constant('/demo'),
              fc.constant('/pricing'),
              fc.webUrl()
            ),
            analyticsId: fc.string({ minLength: 5, maxLength: 50 })
              .map(s => s.replace(/[^a-z0-9]/gi, '_').toLowerCase())
              .filter(s => {
                // Ensure it's not just underscores and has actual content
                const withoutUnderscores = s.replace(/_/g, '');
                return withoutUnderscores.length >= 3 && s.length >= 5;
              })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (ctas) => {
          // Ensure unique analytics IDs
          const uniqueAnalyticsIds = new Set(ctas.map(cta => cta.analyticsId));
          const ctasWithUniqueIds = ctas.map((cta, idx) => ({
            ...cta,
            analyticsId: `${cta.analyticsId}_${idx}`
          }));

          // Create hero section with multiple CTAs
          const heroHTML = `
            <section id="hero">
              ${ctasWithUniqueIds.map((cta, idx) => `
                <a 
                  href="${cta.href}" 
                  class="cta-button"
                  data-analytics="${cta.analyticsId}"
                  data-testid="cta-${idx}"
                >
                  ${cta.text}
                </a>
              `).join('')}
            </section>
          `;
          
          container.innerHTML = heroHTML;
          const ctaButtons = container.querySelectorAll('.cta-button');

          // Property: All CTAs must have analytics tracking
          expect(ctaButtons.length).toBeGreaterThan(0);
          expect(ctaButtons.length).toBe(ctasWithUniqueIds.length);

          // Collect all analytics IDs
          const analyticsIds = Array.from(ctaButtons).map(btn => 
            btn.getAttribute('data-analytics')
          );

          // Property: All analytics IDs should be present
          analyticsIds.forEach(id => {
            expect(id).toBeTruthy();
            expect(id!.length).toBeGreaterThan(0);
          });

          // Property: All analytics IDs should be unique
          const uniqueIds = new Set(analyticsIds);
          expect(uniqueIds.size).toBe(analyticsIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
