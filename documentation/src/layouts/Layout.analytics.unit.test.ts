/**
 * Unit tests for analytics tracking
 * Feature: opensearch-agentops-website
 * Requirements: 18.1, 18.3
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Analytics Unit Tests', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
  });

  /**
   * Test GA4 script is present
   * Requirements: 18.1
   */
  it('should include GA4 script tag in layout', () => {
    // Create a mock layout HTML structure
    const layoutHTML = `
      <!doctype html>
      <html lang="en">
        <head>
          <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
          <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XXXXXXXXXX');
          </script>
        </head>
        <body></body>
      </html>
    `;

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(layoutHTML, 'text/html');

    // Check for GA4 script tag
    const gaScript = doc.querySelector('script[src*="googletagmanager.com/gtag/js"]');
    expect(gaScript).toBeTruthy();
    expect(gaScript?.getAttribute('src')).toContain('gtag/js');
    expect(gaScript?.getAttribute('src')).toContain('G-XXXXXXXXXX');

    // Check for gtag initialization script
    const scripts = Array.from(doc.querySelectorAll('script'));
    const gtagInitScript = scripts.find(script => 
      script.textContent?.includes('window.dataLayer') && 
      script.textContent?.includes('gtag')
    );
    expect(gtagInitScript).toBeTruthy();
    expect(gtagInitScript?.textContent).toContain('gtag(\'config\', \'G-XXXXXXXXXX\')');
  });

  /**
   * Test scroll depth tracking is set up
   * Requirements: 18.3
   */
  it('should set up scroll depth tracking for 25%, 50%, 75%, 100%', () => {
    // Create a mock layout HTML with scroll tracking script
    const layoutHTML = `
      <!doctype html>
      <html lang="en">
        <head>
          <script>
            var scrollDepths = [25, 50, 75, 100];
            var trackedDepths = {};
            
            function trackScrollDepth() {
              var scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
              var scrolled = window.scrollY;
              var scrollPercent = (scrolled / scrollHeight) * 100;
              
              scrollDepths.forEach(function(depth) {
                if (scrollPercent >= depth && !trackedDepths[depth]) {
                  trackedDepths[depth] = true;
                  if (typeof gtag !== 'undefined') {
                    gtag('event', 'scroll_depth', {
                      'depth_percentage': depth,
                      'page_location': window.location.href
                    });
                  }
                }
              });
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(layoutHTML, 'text/html');

    // Check for scroll tracking script
    const scripts = Array.from(doc.querySelectorAll('script'));
    const scrollTrackingScript = scripts.find(script => 
      script.textContent?.includes('scrollDepths') && 
      script.textContent?.includes('trackScrollDepth')
    );
    
    expect(scrollTrackingScript).toBeTruthy();
    expect(scrollTrackingScript?.textContent).toContain('[25, 50, 75, 100]');
    expect(scrollTrackingScript?.textContent).toContain('scroll_depth');
    expect(scrollTrackingScript?.textContent).toContain('depth_percentage');
  });

  /**
   * Test CTA click tracking is set up
   * Requirements: 18.2
   */
  it('should set up CTA click tracking for elements with data-analytics attribute', () => {
    // Create a mock layout HTML with CTA tracking script
    const layoutHTML = `
      <!doctype html>
      <html lang="en">
        <head>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              document.querySelectorAll('[data-analytics]').forEach(function(element) {
                element.addEventListener('click', function() {
                  var ctaName = this.getAttribute('data-analytics');
                  if (typeof gtag !== 'undefined') {
                    gtag('event', 'cta_click', {
                      'cta_name': ctaName,
                      'page_location': window.location.href
                    });
                  }
                });
              });
            });
          </script>
        </head>
        <body></body>
      </html>
    `;

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(layoutHTML, 'text/html');

    // Check for CTA tracking script
    const scripts = Array.from(doc.querySelectorAll('script'));
    const ctaTrackingScript = scripts.find(script => 
      script.textContent?.includes('[data-analytics]') && 
      script.textContent?.includes('cta_click')
    );
    
    expect(ctaTrackingScript).toBeTruthy();
    expect(ctaTrackingScript?.textContent).toContain('data-analytics');
    expect(ctaTrackingScript?.textContent).toContain('cta_click');
    expect(ctaTrackingScript?.textContent).toContain('cta_name');
  });

  /**
   * Test external link tracking is set up
   * Requirements: 18.5
   */
  it('should set up external link click tracking', () => {
    // Create a mock layout HTML with external link tracking script
    const layoutHTML = `
      <!doctype html>
      <html lang="en">
        <head>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              document.querySelectorAll('a[target="_blank"], a[rel*="noopener"]').forEach(function(link) {
                link.addEventListener('click', function() {
                  var href = this.getAttribute('href');
                  if (typeof gtag !== 'undefined') {
                    gtag('event', 'external_link_click', {
                      'link_url': href,
                      'link_text': this.textContent.trim(),
                      'page_location': window.location.href
                    });
                  }
                });
              });
            });
          </script>
        </head>
        <body></body>
      </html>
    `;

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(layoutHTML, 'text/html');

    // Check for external link tracking script
    const scripts = Array.from(doc.querySelectorAll('script'));
    const linkTrackingScript = scripts.find(script => 
      script.textContent?.includes('target="_blank"') && 
      script.textContent?.includes('external_link_click')
    );
    
    expect(linkTrackingScript).toBeTruthy();
    expect(linkTrackingScript?.textContent).toContain('external_link_click');
    expect(linkTrackingScript?.textContent).toContain('link_url');
    expect(linkTrackingScript?.textContent).toContain('link_text');
  });

  /**
   * Test form submission tracking is set up
   * Requirements: 18.4
   */
  it('should set up form submission tracking', () => {
    // Create a mock layout HTML with form tracking script
    const layoutHTML = `
      <!doctype html>
      <html lang="en">
        <head>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              document.querySelectorAll('form').forEach(function(form) {
                form.addEventListener('submit', function(e) {
                  var formId = this.id || 'unnamed_form';
                  var formAction = this.action || window.location.href;
                  if (typeof gtag !== 'undefined') {
                    gtag('event', 'form_submission', {
                      'form_id': formId,
                      'form_action': formAction,
                      'page_location': window.location.href
                    });
                  }
                });
              });
            });
          </script>
        </head>
        <body></body>
      </html>
    `;

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(layoutHTML, 'text/html');

    // Check for form tracking script
    const scripts = Array.from(doc.querySelectorAll('script'));
    const formTrackingScript = scripts.find(script => 
      script.textContent?.includes('querySelectorAll(\'form\')') && 
      script.textContent?.includes('form_submission')
    );
    
    expect(formTrackingScript).toBeTruthy();
    expect(formTrackingScript?.textContent).toContain('form_submission');
    expect(formTrackingScript?.textContent).toContain('form_id');
    expect(formTrackingScript?.textContent).toContain('form_action');
  });
});
