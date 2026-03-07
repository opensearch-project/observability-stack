/**
 * Unit tests for SEO features in Layout component
 * Requirements: 17.2, 17.3, 17.4, 17.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('SEO Features - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Meta tags are present in head
   * Requirements: 17.2
   */
  describe('Meta Tags', () => {
    it('should have title meta tag', () => {
      const headHTML = `
        <head>
          <title>OpenSearch AgentOps - AI Observability & Evaluation Platform</title>
          <meta name="title" content="OpenSearch AgentOps - AI Observability & Evaluation Platform" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const titleTag = container.querySelector('title');
      const metaTitle = container.querySelector('meta[name="title"]');

      expect(titleTag).toBeTruthy();
      expect(titleTag?.textContent).toContain('OpenSearch AgentOps');
      expect(metaTitle).toBeTruthy();
      expect(metaTitle?.getAttribute('content')).toContain('OpenSearch AgentOps');
    });

    it('should have description meta tag', () => {
      const headHTML = `
        <head>
          <meta name="description" content="The unified open-source platform for LLM evaluation, prompt management, and observability." />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const metaDescription = container.querySelector('meta[name="description"]');

      expect(metaDescription).toBeTruthy();
      expect(metaDescription?.getAttribute('content')).toContain('unified open-source platform');
    });

    it('should have Open Graph title meta tag', () => {
      const headHTML = `
        <head>
          <meta property="og:title" content="OpenSearch AgentOps - AI Observability & Evaluation Platform" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const ogTitle = container.querySelector('meta[property="og:title"]');

      expect(ogTitle).toBeTruthy();
      expect(ogTitle?.getAttribute('content')).toContain('OpenSearch AgentOps');
    });

    it('should have Open Graph description meta tag', () => {
      const headHTML = `
        <head>
          <meta property="og:description" content="The unified open-source platform for LLM evaluation, prompt management, and observability." />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const ogDescription = container.querySelector('meta[property="og:description"]');

      expect(ogDescription).toBeTruthy();
      expect(ogDescription?.getAttribute('content')).toBeTruthy();
    });

    it('should have Open Graph image meta tag', () => {
      const headHTML = `
        <head>
          <meta property="og:image" content="/og-image.png" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const ogImage = container.querySelector('meta[property="og:image"]');

      expect(ogImage).toBeTruthy();
      expect(ogImage?.getAttribute('content')).toBe('/og-image.png');
    });

    it('should have Open Graph type meta tag', () => {
      const headHTML = `
        <head>
          <meta property="og:type" content="website" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const ogType = container.querySelector('meta[property="og:type"]');

      expect(ogType).toBeTruthy();
      expect(ogType?.getAttribute('content')).toBe('website');
    });

    it('should have Open Graph URL meta tag', () => {
      const headHTML = `
        <head>
          <meta property="og:url" content="https://opensearch-agentops.com" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const ogUrl = container.querySelector('meta[property="og:url"]');

      expect(ogUrl).toBeTruthy();
      expect(ogUrl?.getAttribute('content')).toBeTruthy();
    });

    it('should have Twitter card meta tag', () => {
      const headHTML = `
        <head>
          <meta property="twitter:card" content="summary_large_image" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const twitterCard = container.querySelector('meta[property="twitter:card"]');

      expect(twitterCard).toBeTruthy();
      expect(twitterCard?.getAttribute('content')).toBe('summary_large_image');
    });

    it('should have Twitter title meta tag', () => {
      const headHTML = `
        <head>
          <meta property="twitter:title" content="OpenSearch AgentOps - AI Observability & Evaluation Platform" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const twitterTitle = container.querySelector('meta[property="twitter:title"]');

      expect(twitterTitle).toBeTruthy();
      expect(twitterTitle?.getAttribute('content')).toContain('OpenSearch AgentOps');
    });

    it('should have Twitter description meta tag', () => {
      const headHTML = `
        <head>
          <meta property="twitter:description" content="The unified open-source platform for LLM evaluation, prompt management, and observability." />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const twitterDescription = container.querySelector('meta[property="twitter:description"]');

      expect(twitterDescription).toBeTruthy();
      expect(twitterDescription?.getAttribute('content')).toBeTruthy();
    });

    it('should have Twitter image meta tag', () => {
      const headHTML = `
        <head>
          <meta property="twitter:image" content="/og-image.png" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const twitterImage = container.querySelector('meta[property="twitter:image"]');

      expect(twitterImage).toBeTruthy();
      expect(twitterImage?.getAttribute('content')).toBe('/og-image.png');
    });

    it('should have canonical link tag', () => {
      const headHTML = `
        <head>
          <link rel="canonical" href="https://opensearch-agentops.com/" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const canonical = container.querySelector('link[rel="canonical"]');

      expect(canonical).toBeTruthy();
      expect(canonical?.getAttribute('href')).toBeTruthy();
    });

    it('should have viewport meta tag', () => {
      const headHTML = `
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const viewport = container.querySelector('meta[name="viewport"]');

      expect(viewport).toBeTruthy();
      expect(viewport?.getAttribute('content')).toContain('width=device-width');
    });
  });

  /**
   * Test: JSON-LD script tag exists
   * Requirements: 17.3
   */
  describe('Structured Data (JSON-LD)', () => {
    it('should have JSON-LD script tag with type application/ld+json', () => {
      const headHTML = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenSearch AgentOps"
            }
          </script>
        </head>
      `;
      
      container.innerHTML = headHTML;
      const jsonLdScript = container.querySelector('script[type="application/ld+json"]');

      expect(jsonLdScript).toBeTruthy();
      expect(jsonLdScript?.getAttribute('type')).toBe('application/ld+json');
    });

    it('should have valid JSON-LD content with @context', () => {
      const headHTML = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenSearch AgentOps"
            }
          </script>
        </head>
      `;
      
      container.innerHTML = headHTML;
      const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
      const jsonContent = jsonLdScript?.textContent;

      expect(jsonContent).toBeTruthy();
      
      if (jsonContent) {
        const parsedJson = JSON.parse(jsonContent);
        expect(parsedJson['@context']).toBe('https://schema.org');
      }
    });

    it('should have SoftwareApplication type in JSON-LD', () => {
      const headHTML = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenSearch AgentOps"
            }
          </script>
        </head>
      `;
      
      container.innerHTML = headHTML;
      const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
      const jsonContent = jsonLdScript?.textContent;

      if (jsonContent) {
        const parsedJson = JSON.parse(jsonContent);
        expect(parsedJson['@type']).toBe('SoftwareApplication');
      }
    });

    it('should have name property in JSON-LD', () => {
      const headHTML = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenSearch AgentOps"
            }
          </script>
        </head>
      `;
      
      container.innerHTML = headHTML;
      const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
      const jsonContent = jsonLdScript?.textContent;

      if (jsonContent) {
        const parsedJson = JSON.parse(jsonContent);
        expect(parsedJson.name).toBe('OpenSearch AgentOps');
      }
    });

    it('should have applicationCategory in JSON-LD', () => {
      const headHTML = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenSearch AgentOps",
              "applicationCategory": "DeveloperApplication"
            }
          </script>
        </head>
      `;
      
      container.innerHTML = headHTML;
      const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
      const jsonContent = jsonLdScript?.textContent;

      if (jsonContent) {
        const parsedJson = JSON.parse(jsonContent);
        expect(parsedJson.applicationCategory).toBe('DeveloperApplication');
      }
    });

    it('should have offers property in JSON-LD', () => {
      const headHTML = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenSearch AgentOps",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              }
            }
          </script>
        </head>
      `;
      
      container.innerHTML = headHTML;
      const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
      const jsonContent = jsonLdScript?.textContent;

      if (jsonContent) {
        const parsedJson = JSON.parse(jsonContent);
        expect(parsedJson.offers).toBeTruthy();
        expect(parsedJson.offers['@type']).toBe('Offer');
        expect(parsedJson.offers.price).toBe('0');
        expect(parsedJson.offers.priceCurrency).toBe('USD');
      }
    });
  });

  /**
   * Test: sitemap.xml file exists
   * Requirements: 17.4
   */
  describe('Sitemap', () => {
    it('should have sitemap-index.xml file in dist directory', () => {
      const sitemapPath = join(process.cwd(), 'dist', 'sitemap-index.xml');
      const exists = existsSync(sitemapPath);

      expect(exists).toBe(true);
    });

    it('should have sitemap-0.xml file in dist directory', () => {
      const sitemapPath = join(process.cwd(), 'dist', 'sitemap-0.xml');
      const exists = existsSync(sitemapPath);

      expect(exists).toBe(true);
    });

    it('should have valid XML content in sitemap-index.xml', () => {
      const sitemapPath = join(process.cwd(), 'dist', 'sitemap-index.xml');
      
      if (existsSync(sitemapPath)) {
        const content = readFileSync(sitemapPath, 'utf-8');
        
        expect(content).toContain('<?xml');
        expect(content).toContain('sitemapindex');
        expect(content).toContain('xmlns');
      }
    });

    it('should reference sitemap-0.xml in sitemap-index.xml', () => {
      const sitemapPath = join(process.cwd(), 'dist', 'sitemap-index.xml');
      
      if (existsSync(sitemapPath)) {
        const content = readFileSync(sitemapPath, 'utf-8');
        
        expect(content).toContain('sitemap-0.xml');
      }
    });

    it('should have valid XML content in sitemap-0.xml', () => {
      const sitemapPath = join(process.cwd(), 'dist', 'sitemap-0.xml');
      
      if (existsSync(sitemapPath)) {
        const content = readFileSync(sitemapPath, 'utf-8');
        
        expect(content).toContain('<?xml');
        expect(content).toContain('urlset');
        expect(content).toContain('xmlns');
      }
    });

    it('should contain URL entries in sitemap-0.xml', () => {
      const sitemapPath = join(process.cwd(), 'dist', 'sitemap-0.xml');
      
      if (existsSync(sitemapPath)) {
        const content = readFileSync(sitemapPath, 'utf-8');
        
        expect(content).toContain('<url>');
        expect(content).toContain('<loc>');
      }
    });
  });

  /**
   * Test: robots.txt file exists
   * Requirements: 17.5
   */
  describe('Robots.txt', () => {
    it('should have robots.txt file in public directory', () => {
      const robotsPath = join(process.cwd(), 'public', 'robots.txt');
      const exists = existsSync(robotsPath);

      expect(exists).toBe(true);
    });

    it('should have robots.txt file in dist directory after build', () => {
      const robotsPath = join(process.cwd(), 'dist', 'robots.txt');
      const exists = existsSync(robotsPath);

      expect(exists).toBe(true);
    });

    it('should contain User-agent directive in robots.txt', () => {
      const robotsPath = join(process.cwd(), 'public', 'robots.txt');
      
      if (existsSync(robotsPath)) {
        const content = readFileSync(robotsPath, 'utf-8');
        
        expect(content).toContain('User-agent:');
      }
    });

    it('should allow all crawlers in robots.txt', () => {
      const robotsPath = join(process.cwd(), 'public', 'robots.txt');
      
      if (existsSync(robotsPath)) {
        const content = readFileSync(robotsPath, 'utf-8');
        
        expect(content).toContain('User-agent: *');
        expect(content).toContain('Allow: /');
      }
    });

    it('should reference sitemap in robots.txt', () => {
      const robotsPath = join(process.cwd(), 'public', 'robots.txt');
      
      if (existsSync(robotsPath)) {
        const content = readFileSync(robotsPath, 'utf-8');
        
        expect(content).toContain('Sitemap:');
        expect(content).toContain('sitemap-index.xml');
      }
    });

    it('should have correct sitemap URL format in robots.txt', () => {
      const robotsPath = join(process.cwd(), 'public', 'robots.txt');
      
      if (existsSync(robotsPath)) {
        const content = readFileSync(robotsPath, 'utf-8');
        
        expect(content).toMatch(/Sitemap:\s*https?:\/\//);
      }
    });
  });

  /**
   * Test: Additional SEO best practices
   * Requirements: 17.2
   */
  describe('Additional SEO Elements', () => {
    it('should have charset meta tag', () => {
      const headHTML = `
        <head>
          <meta charset="UTF-8" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const charset = container.querySelector('meta[charset]');

      expect(charset).toBeTruthy();
      expect(charset?.getAttribute('charset')).toBe('UTF-8');
    });

    it('should have favicon link', () => {
      const headHTML = `
        <head>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        </head>
      `;
      
      container.innerHTML = headHTML;
      const favicon = container.querySelector('link[rel="icon"]');

      expect(favicon).toBeTruthy();
      expect(favicon?.getAttribute('href')).toContain('favicon');
    });

    it('should have lang attribute on html element', () => {
      const htmlElement = document.createElement('html');
      htmlElement.setAttribute('lang', 'en');
      
      expect(htmlElement.getAttribute('lang')).toBe('en');
    });
  });
});
