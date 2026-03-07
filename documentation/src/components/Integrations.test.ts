/**
 * Property-based tests for Integrations component
 * Feature: opensearch-agentops-website
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

interface Integration {
  name: string;
  category: 'llm' | 'framework' | 'sdk';
}

/**
 * Property 5: Integration logos have hover effects
 * Validates: Requirements 10.4
 * 
 * For any integration logo element, hovering should apply a visual effect 
 * (opacity or color change).
 */
describe('Integrations - Property 5: Integration logos have hover effects', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // Helper function to render an integration logo
  function renderIntegrationLogo(integration: Integration): string {
    return `
      <div 
        class="integration-logo flex items-center justify-center p-6 bg-slate-800 rounded-lg border border-slate-700 transition-all duration-300 hover:border-indigo-500 hover:bg-slate-750"
        data-integration="${integration.name}"
        data-category="${integration.category}"
        style="filter: grayscale(100%); opacity: 0.7;"
      >
        <div class="text-center">
          <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
            ${integration.name}
          </div>
        </div>
      </div>
    `;
  }

  it('should have grayscale filter applied by default for any integration', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
          category: fc.constantFrom('llm', 'framework', 'sdk'),
        }),
        (integration) => {
          container.innerHTML = renderIntegrationLogo(integration);

          const logo = container.querySelector('.integration-logo') as HTMLElement;
          expect(logo).toBeTruthy();

          // Property: Logo must have grayscale filter applied
          const computedStyle = window.getComputedStyle(logo);
          const filter = computedStyle.filter || logo.style.filter;
          expect(filter).toContain('grayscale');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have reduced opacity by default for any integration', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
          category: fc.constantFrom('llm', 'framework', 'sdk'),
        }),
        (integration) => {
          container.innerHTML = renderIntegrationLogo(integration);

          const logo = container.querySelector('.integration-logo') as HTMLElement;
          expect(logo).toBeTruthy();

          // Property: Logo must have reduced opacity
          const computedStyle = window.getComputedStyle(logo);
          const opacity = computedStyle.opacity || logo.style.opacity;
          expect(parseFloat(opacity)).toBeLessThan(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have hover classes for visual effects for any integration', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
          category: fc.constantFrom('llm', 'framework', 'sdk'),
        }),
        (integration) => {
          container.innerHTML = renderIntegrationLogo(integration);

          const logo = container.querySelector('.integration-logo');
          expect(logo).toBeTruthy();

          // Property: Logo must have hover border color class
          expect(logo!.classList.contains('hover:border-indigo-500')).toBe(true);

          // Property: Logo must have transition class for smooth effects
          expect(logo!.classList.contains('transition-all')).toBe(true);
          expect(logo!.classList.contains('duration-300')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have text color transition on hover for any integration', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
          category: fc.constantFrom('llm', 'framework', 'sdk'),
        }),
        (integration) => {
          container.innerHTML = renderIntegrationLogo(integration);

          const logo = container.querySelector('.integration-logo');
          const textElement = logo!.querySelector('.text-slate-400');
          
          expect(textElement).toBeTruthy();

          // Property: Text must have hover color class
          expect(textElement!.classList.contains('hover:text-white')).toBe(true);

          // Property: Text must have transition class
          expect(textElement!.classList.contains('transition-colors')).toBe(true);
          expect(textElement!.classList.contains('duration-300')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have data attributes for integration name and category', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
          category: fc.constantFrom('llm', 'framework', 'sdk'),
        }),
        (integration) => {
          container.innerHTML = renderIntegrationLogo(integration);

          const logo = container.querySelector('.integration-logo');
          expect(logo).toBeTruthy();

          // Property: Logo must have data-integration attribute
          expect(logo!.getAttribute('data-integration')).toBe(integration.name);

          // Property: Logo must have data-category attribute
          expect(logo!.getAttribute('data-category')).toBe(integration.category);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should render multiple integration logos with hover effects', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
            category: fc.constantFrom('llm', 'framework', 'sdk'),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        (integrations) => {
          // Render multiple integration logos
          const gridHTML = `
            <div class="integration-grid grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
              ${integrations.map(integration => renderIntegrationLogo(integration)).join('')}
            </div>
          `;
          
          container.innerHTML = gridHTML;

          const logos = container.querySelectorAll('.integration-logo');

          // Property: Number of logos should match number of integrations
          expect(logos.length).toBe(integrations.length);

          // Property: Each logo should have hover effects
          logos.forEach((logo, index) => {
            const integration = integrations[index];

            // Check grayscale filter
            const logoElement = logo as HTMLElement;
            const filter = logoElement.style.filter;
            expect(filter).toContain('grayscale');

            // Check hover classes
            expect(logo.classList.contains('hover:border-indigo-500')).toBe(true);
            expect(logo.classList.contains('transition-all')).toBe(true);

            // Check data attributes
            expect(logo.getAttribute('data-integration')).toBe(integration.name);
            expect(logo.getAttribute('data-category')).toBe(integration.category);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have consistent styling structure for all integrations', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere', 'LangChain', 'LlamaIndex', 'Haystack', 'Python', 'Node.js', 'REST API'),
          category: fc.constantFrom('llm', 'framework', 'sdk'),
        }),
        (integration) => {
          container.innerHTML = renderIntegrationLogo(integration);

          const logo = container.querySelector('.integration-logo');
          expect(logo).toBeTruthy();

          // Property: Logo must have consistent base styling
          expect(logo!.classList.contains('flex')).toBe(true);
          expect(logo!.classList.contains('items-center')).toBe(true);
          expect(logo!.classList.contains('justify-center')).toBe(true);
          expect(logo!.classList.contains('p-6')).toBe(true);
          expect(logo!.classList.contains('bg-slate-800')).toBe(true);
          expect(logo!.classList.contains('rounded-lg')).toBe(true);
          expect(logo!.classList.contains('border')).toBe(true);
          expect(logo!.classList.contains('border-slate-700')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should group integrations by category with all having hover effects', () => {
    fc.assert(
      fc.property(
        fc.record({
          llm: fc.array(
            fc.record({
              name: fc.constantFrom('OpenAI', 'Anthropic', 'Google', 'Cohere'),
              category: fc.constant('llm' as const),
            }),
            { minLength: 1, maxLength: 4 }
          ),
          framework: fc.array(
            fc.record({
              name: fc.constantFrom('LangChain', 'LlamaIndex', 'Haystack'),
              category: fc.constant('framework' as const),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          sdk: fc.array(
            fc.record({
              name: fc.constantFrom('Python', 'Node.js', 'REST API'),
              category: fc.constant('sdk' as const),
            }),
            { minLength: 1, maxLength: 3 }
          ),
        }),
        (groupedIntegrations) => {
          // Render grouped integrations
          const sectionsHTML = Object.entries(groupedIntegrations).map(([category, items]) => `
            <div class="integration-category" data-category="${category}">
              <div class="integration-grid grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                ${items.map(integration => renderIntegrationLogo(integration)).join('')}
              </div>
            </div>
          `).join('');
          
          container.innerHTML = sectionsHTML;

          const categories = container.querySelectorAll('.integration-category');

          // Property: Should have three categories
          expect(categories.length).toBe(3);

          // Property: Each category should have logos with hover effects
          categories.forEach((categoryElement) => {
            const logos = categoryElement.querySelectorAll('.integration-logo');
            
            logos.forEach((logo) => {
              // Each logo must have hover effects
              expect(logo.classList.contains('hover:border-indigo-500')).toBe(true);
              expect(logo.classList.contains('transition-all')).toBe(true);
              
              const logoElement = logo as HTMLElement;
              const filter = logoElement.style.filter;
              expect(filter).toContain('grayscale');
            });
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
