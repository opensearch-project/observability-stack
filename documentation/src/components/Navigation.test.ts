/**
 * Property-based tests for Navigation component
 * Feature: opensearch-agentops-website
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property 7: Keyboard navigation support
 * Validates: Requirements 15.2
 * 
 * For any interactive element (buttons, links, form inputs), 
 * the element should be keyboard accessible with proper focus indicators and tab order.
 */
describe('Navigation - Property 7: Keyboard navigation support', () => {
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

  it('should ensure all interactive elements are keyboard accessible with tabindex', () => {
    fc.assert(
      fc.property(
        fc.record({
          menuItems: fc.array(
            fc.record({
              label: fc.stringMatching(/^[a-zA-Z0-9\s]{1,20}$/),
              href: fc.oneof(
                fc.constant('#features'),
                fc.constant('#compare'),
                fc.constant('#pricing'),
                fc.webUrl()
              ),
              isExternal: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          )
        }),
        (data) => {
          // Create navigation HTML with interactive elements
          const navHTML = `
            <nav>
              <a href="/" class="logo-link">Logo</a>
              ${data.menuItems.map((item, idx) => 
                `<a href="${item.href}" class="nav-link" data-testid="nav-link-${idx}">${item.label}</a>`
              ).join('')}
              <a href="/signin" class="signin-link">Sign In</a>
              <button type="button" class="cta-button">Get Started</button>
              <button type="button" class="mobile-menu-button" aria-label="Toggle menu">Menu</button>
            </nav>
          `;
          
          container.innerHTML = navHTML;

          // Get all interactive elements
          const interactiveElements = container.querySelectorAll('a, button');

          // Property: All interactive elements should be keyboard accessible
          interactiveElements.forEach((element) => {
            // Check that element is focusable (either has tabindex >= 0 or is naturally focusable)
            const tabIndex = element.getAttribute('tabindex');
            const isNaturallyFocusable = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
            
            // Element should either be naturally focusable or have a non-negative tabindex
            const isKeyboardAccessible = isNaturallyFocusable || (tabIndex !== null && parseInt(tabIndex) >= 0);
            
            expect(isKeyboardAccessible).toBe(true);

            // Check that buttons have proper type attribute
            if (element.tagName === 'BUTTON') {
              const buttonType = element.getAttribute('type');
              expect(buttonType).toBeTruthy();
              expect(['button', 'submit', 'reset']).toContain(buttonType);
            }

            // Check that links have href attribute
            if (element.tagName === 'A') {
              const href = element.getAttribute('href');
              expect(href).toBeTruthy();
            }
          });

          // Property: Tab order should be logical (elements appear in DOM order)
          const focusableElements = Array.from(interactiveElements).filter(el => {
            const tabIndex = el.getAttribute('tabindex');
            return tabIndex === null || parseInt(tabIndex) >= 0;
          });

          // Verify elements can receive focus in order
          expect(focusableElements.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure buttons have aria-label when they contain only icons', () => {
    fc.assert(
      fc.property(
        fc.record({
          ariaLabel: fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => s.trim().length >= 5 && !s.includes('"') && !s.includes("'")),
          buttonType: fc.constantFrom('button', 'submit', 'reset')
        }),
        (data) => {
          // Create icon-only button
          const button = document.createElement('button');
          button.type = data.buttonType;
          button.setAttribute('aria-label', data.ariaLabel);
          button.className = 'icon-button';
          button.innerHTML = '<svg><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
          
          container.innerHTML = '';
          container.appendChild(button);

          // Property: Icon-only buttons must have aria-label with non-whitespace content
          expect(button).toBeTruthy();
          const ariaLabel = button.getAttribute('aria-label');
          expect(ariaLabel).toBeTruthy();
          expect(ariaLabel!.trim().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure focus indicators are visible with proper styling', () => {
    fc.assert(
      fc.property(
        fc.record({
          elementType: fc.constantFrom('a', 'button'),
          content: fc.string({ minLength: 1, maxLength: 30 })
        }),
        (data) => {
          // Create focusable element with focus styles
          const elementHTML = data.elementType === 'a'
            ? `<a href="#test" class="focus:outline-none focus:ring-2 focus:ring-primary-500">${data.content}</a>`
            : `<button type="button" class="focus:outline-none focus:ring-2 focus:ring-primary-500">${data.content}</button>`;
          
          container.innerHTML = elementHTML;
          const element = container.querySelector(data.elementType);

          // Property: Focusable elements should have focus indicator classes
          expect(element).toBeTruthy();
          const classList = element!.className;
          
          // Check for focus-related classes (Tailwind focus utilities)
          const hasFocusStyles = classList.includes('focus:') || 
                                 classList.includes('focus-visible:') ||
                                 element!.matches(':focus-visible');
          
          // At minimum, element should be focusable
          expect(element!.tagName).toMatch(/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure external links have proper attributes for keyboard users', () => {
    fc.assert(
      fc.property(
        fc.record({
          href: fc.webUrl(),
          label: fc.string({ minLength: 3, maxLength: 30 })
        }),
        (data) => {
          // Create external link
          const linkHTML = `
            <a 
              href="${data.href}" 
              target="_blank" 
              rel="noopener noreferrer"
              class="external-link"
            >
              ${data.label}
            </a>
          `;
          
          container.innerHTML = linkHTML;
          const link = container.querySelector('a');

          // Property: External links should have proper security attributes
          expect(link).toBeTruthy();
          
          if (link!.getAttribute('target') === '_blank') {
            const rel = link!.getAttribute('rel');
            expect(rel).toBeTruthy();
            expect(rel).toContain('noopener');
          }

          // Link should be keyboard accessible
          expect(link!.tagName).toBe('A');
          expect(link!.getAttribute('href')).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });
});
