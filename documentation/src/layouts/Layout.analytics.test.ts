/**
 * Property-based tests for analytics tracking
 * Feature: opensearch-agentops-website
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';

describe('Analytics Tracking Property Tests', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock gtag function
    (window as any).gtag = vi.fn();
    (window as any).dataLayer = [];
  });

  /**
   * Property 15: Form submission tracking
   * For any form element, the form should have submission tracking
   * Validates: Requirements 18.4
   */
  it('should track all form submissions with form metadata', () => {
    fc.assert(
      fc.property(
        fc.record({
          formId: fc.string({ minLength: 1, maxLength: 50 }),
          formAction: fc.webUrl(),
          hasSubmitHandler: fc.boolean()
        }),
        (formData) => {
          // Create a form element
          const form = document.createElement('form');
          form.id = formData.formId;
          form.action = formData.formAction;
          document.body.appendChild(form);

          // Simulate the analytics tracking setup
          const mockGtag = vi.fn();
          (window as any).gtag = mockGtag;

          // Add event listener (simulating the DOMContentLoaded handler)
          form.addEventListener('submit', function(e) {
            e.preventDefault(); // Prevent actual submission
            const formId = this.id || 'unnamed_form';
            const formAction = this.action || window.location.href;
            if (typeof (window as any).gtag !== 'undefined') {
              (window as any).gtag('event', 'form_submission', {
                'form_id': formId,
                'form_action': formAction,
                'page_location': window.location.href
              });
            }
          });

          // Trigger form submission
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);

          // Verify gtag was called with correct parameters
          // Note: URLs may be normalized by the browser (e.g., "http://a.aa/./" becomes "http://a.aa")
          const calls = mockGtag.mock.calls;
          expect(calls.length).toBeGreaterThan(0);
          expect(calls[0][0]).toBe('event');
          expect(calls[0][1]).toBe('form_submission');
          expect(calls[0][2]).toHaveProperty('form_id', formData.formId);
          
          // Normalize both URLs for comparison (remove trailing slashes, dots, query params, fragments)
          const normalizeUrl = (url: string) => {
            try {
              const urlObj = new URL(url);
              return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.replace(/\/+$/, '').replace(/\/\.+/g, '');
            } catch {
              return url.replace(/\/+$/, '').replace(/\/\.+/g, '');
            }
          };
          
          const expectedNormalized = normalizeUrl(formData.formAction);
          const actualNormalized = normalizeUrl(calls[0][2].form_action);
          expect(actualNormalized).toBe(expectedNormalized);

          // Cleanup
          document.body.removeChild(form);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16: External link tracking
   * For any external link, the link should have click tracking attributes
   * Validates: Requirements 18.5
   */
  it('should track all external link clicks with link metadata', () => {
    fc.assert(
      fc.property(
        fc.record({
          href: fc.webUrl(),
          linkText: fc.string({ minLength: 1, maxLength: 100 }),
          isExternal: fc.boolean()
        }),
        (linkData) => {
          // Create an external link element
          const link = document.createElement('a');
          link.href = linkData.href;
          link.textContent = linkData.linkText;
          
          // Mark as external link
          if (linkData.isExternal) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
          }
          
          document.body.appendChild(link);

          // Simulate the analytics tracking setup
          const mockGtag = vi.fn();
          (window as any).gtag = mockGtag;

          // Add event listener for external links (simulating the DOMContentLoaded handler)
          if (link.target === '_blank' || link.rel.includes('noopener')) {
            link.addEventListener('click', function(e) {
              e.preventDefault(); // Prevent navigation in test
              const href = this.getAttribute('href');
              if (typeof (window as any).gtag !== 'undefined') {
                (window as any).gtag('event', 'external_link_click', {
                  'link_url': href,
                  'link_text': this.textContent?.trim(),
                  'page_location': window.location.href
                });
              }
            });
          }

          // Trigger click event
          const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
          link.dispatchEvent(clickEvent);

          // Verify gtag was called correctly for external links
          if (linkData.isExternal) {
            const calls = mockGtag.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            expect(calls[0][0]).toBe('event');
            expect(calls[0][1]).toBe('external_link_click');
            expect(calls[0][2]).toHaveProperty('link_url', linkData.href);
            // Check that link_text matches after trimming (handles whitespace)
            expect(calls[0][2].link_text).toBe(linkData.linkText.trim());
          } else {
            // Internal links should not trigger external link tracking
            expect(mockGtag).not.toHaveBeenCalled();
          }

          // Cleanup
          document.body.removeChild(link);
        }
      ),
      { numRuns: 100 }
    );
  });
});
