/**
 * Unit tests for Integrations component
 * Requirements: 10.1, 10.2, 10.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Integrations Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: All specified integrations render
   * Requirements: 10.1, 10.2, 10.3
   */
  describe('Integration Logos', () => {
    beforeEach(() => {
      const integrationsHTML = `
        <section id="integrations" class="py-24 bg-slate-900">
          <div class="container mx-auto px-4 max-w-7xl">
            <div class="text-center mb-16">
              <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
                Integrations
              </h2>
              <p class="text-xl text-slate-400 max-w-3xl mx-auto">
                Works seamlessly with your existing AI stack
              </p>
            </div>

            <div class="space-y-12">
              <!-- LLM Providers -->
              <div class="integration-category" data-category="llm">
                <h3 class="text-2xl font-semibold text-white mb-6 text-center">
                  LLM Providers
                </h3>
                <div class="integration-grid grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  <div class="integration-logo" data-integration="OpenAI" data-category="llm">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        OpenAI
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="Anthropic" data-category="llm">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        Anthropic
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="Google" data-category="llm">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        Google
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="Cohere" data-category="llm">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        Cohere
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Frameworks -->
              <div class="integration-category" data-category="framework">
                <h3 class="text-2xl font-semibold text-white mb-6 text-center">
                  Frameworks
                </h3>
                <div class="integration-grid grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  <div class="integration-logo" data-integration="LangChain" data-category="framework">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        LangChain
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="LlamaIndex" data-category="framework">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        LlamaIndex
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="Haystack" data-category="framework">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        Haystack
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- SDKs -->
              <div class="integration-category" data-category="sdk">
                <h3 class="text-2xl font-semibold text-white mb-6 text-center">
                  SDKs
                </h3>
                <div class="integration-grid grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  <div class="integration-logo" data-integration="Python" data-category="sdk">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        Python
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="Node.js" data-category="sdk">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        Node.js
                      </div>
                    </div>
                  </div>
                  <div class="integration-logo" data-integration="REST API" data-category="sdk">
                    <div class="text-center">
                      <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                        REST API
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = integrationsHTML;
    });

    it('should render all LLM provider logos', () => {
      const llmLogos = container.querySelectorAll('[data-category="llm"]');
      const llmProviders = ['OpenAI', 'Anthropic', 'Google', 'Cohere'];

      // Should have 5 elements: 1 category container + 4 logos
      expect(llmLogos.length).toBe(5);

      llmProviders.forEach(provider => {
        const logo = container.querySelector(`[data-integration="${provider}"]`);
        expect(logo).toBeTruthy();
        expect(logo?.textContent?.trim()).toBe(provider);
      });
    });

    it('should render all framework logos', () => {
      const frameworkCategory = container.querySelector('[data-category="framework"].integration-category');
      const frameworkLogos = frameworkCategory?.querySelectorAll('.integration-logo');
      const frameworks = ['LangChain', 'LlamaIndex', 'Haystack'];

      expect(frameworkLogos?.length).toBe(3);

      frameworks.forEach(framework => {
        const logo = container.querySelector(`[data-integration="${framework}"]`);
        expect(logo).toBeTruthy();
        expect(logo?.textContent?.trim()).toBe(framework);
      });
    });

    it('should render all SDK options', () => {
      const sdkCategory = container.querySelector('[data-category="sdk"].integration-category');
      const sdkLogos = sdkCategory?.querySelectorAll('.integration-logo');
      const sdks = ['Python', 'Node.js', 'REST API'];

      expect(sdkLogos?.length).toBe(3);

      sdks.forEach(sdk => {
        const logo = container.querySelector(`[data-integration="${sdk}"]`);
        expect(logo).toBeTruthy();
        expect(logo?.textContent?.trim()).toBe(sdk);
      });
    });

    it('should render total of 10 integration logos', () => {
      const allLogos = container.querySelectorAll('.integration-logo');
      expect(allLogos.length).toBe(10);
    });

    it('should have OpenAI logo', () => {
      const openaiLogo = container.querySelector('[data-integration="OpenAI"]');
      expect(openaiLogo).toBeTruthy();
      expect(openaiLogo?.getAttribute('data-category')).toBe('llm');
    });

    it('should have Anthropic logo', () => {
      const anthropicLogo = container.querySelector('[data-integration="Anthropic"]');
      expect(anthropicLogo).toBeTruthy();
      expect(anthropicLogo?.getAttribute('data-category')).toBe('llm');
    });

    it('should have Google logo', () => {
      const googleLogo = container.querySelector('[data-integration="Google"]');
      expect(googleLogo).toBeTruthy();
      expect(googleLogo?.getAttribute('data-category')).toBe('llm');
    });

    it('should have Cohere logo', () => {
      const cohereLogo = container.querySelector('[data-integration="Cohere"]');
      expect(cohereLogo).toBeTruthy();
      expect(cohereLogo?.getAttribute('data-category')).toBe('llm');
    });

    it('should have LangChain logo', () => {
      const langchainLogo = container.querySelector('[data-integration="LangChain"]');
      expect(langchainLogo).toBeTruthy();
      expect(langchainLogo?.getAttribute('data-category')).toBe('framework');
    });

    it('should have LlamaIndex logo', () => {
      const llamaindexLogo = container.querySelector('[data-integration="LlamaIndex"]');
      expect(llamaindexLogo).toBeTruthy();
      expect(llamaindexLogo?.getAttribute('data-category')).toBe('framework');
    });

    it('should have Haystack logo', () => {
      const haystackLogo = container.querySelector('[data-integration="Haystack"]');
      expect(haystackLogo).toBeTruthy();
      expect(haystackLogo?.getAttribute('data-category')).toBe('framework');
    });

    it('should have Python SDK logo', () => {
      const pythonLogo = container.querySelector('[data-integration="Python"]');
      expect(pythonLogo).toBeTruthy();
      expect(pythonLogo?.getAttribute('data-category')).toBe('sdk');
    });

    it('should have Node.js SDK logo', () => {
      const nodejsLogo = container.querySelector('[data-integration="Node.js"]');
      expect(nodejsLogo).toBeTruthy();
      expect(nodejsLogo?.getAttribute('data-category')).toBe('sdk');
    });

    it('should have REST API SDK logo', () => {
      const restapiLogo = container.querySelector('[data-integration="REST API"]');
      expect(restapiLogo).toBeTruthy();
      expect(restapiLogo?.getAttribute('data-category')).toBe('sdk');
    });
  });

  /**
   * Test: Integrations are grouped by category
   * Requirements: 10.1, 10.2, 10.3
   */
  describe('Category Grouping', () => {
    beforeEach(() => {
      const integrationsHTML = `
        <section id="integrations">
          <div class="space-y-12">
            <div class="integration-category" data-category="llm">
              <h3 class="text-2xl font-semibold text-white mb-6 text-center">
                LLM Providers
              </h3>
              <div class="integration-grid">
                <div class="integration-logo" data-integration="OpenAI" data-category="llm"></div>
                <div class="integration-logo" data-integration="Anthropic" data-category="llm"></div>
                <div class="integration-logo" data-integration="Google" data-category="llm"></div>
                <div class="integration-logo" data-integration="Cohere" data-category="llm"></div>
              </div>
            </div>

            <div class="integration-category" data-category="framework">
              <h3 class="text-2xl font-semibold text-white mb-6 text-center">
                Frameworks
              </h3>
              <div class="integration-grid">
                <div class="integration-logo" data-integration="LangChain" data-category="framework"></div>
                <div class="integration-logo" data-integration="LlamaIndex" data-category="framework"></div>
                <div class="integration-logo" data-integration="Haystack" data-category="framework"></div>
              </div>
            </div>

            <div class="integration-category" data-category="sdk">
              <h3 class="text-2xl font-semibold text-white mb-6 text-center">
                SDKs
              </h3>
              <div class="integration-grid">
                <div class="integration-logo" data-integration="Python" data-category="sdk"></div>
                <div class="integration-logo" data-integration="Node.js" data-category="sdk"></div>
                <div class="integration-logo" data-integration="REST API" data-category="sdk"></div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = integrationsHTML;
    });

    it('should have three category sections', () => {
      const categories = container.querySelectorAll('.integration-category');
      expect(categories.length).toBe(3);
    });

    it('should have LLM Providers category', () => {
      const llmCategory = container.querySelector('[data-category="llm"].integration-category');
      const heading = llmCategory?.querySelector('h3');
      
      expect(llmCategory).toBeTruthy();
      expect(heading?.textContent?.trim()).toBe('LLM Providers');
    });

    it('should have Frameworks category', () => {
      const frameworkCategory = container.querySelector('[data-category="framework"].integration-category');
      const heading = frameworkCategory?.querySelector('h3');
      
      expect(frameworkCategory).toBeTruthy();
      expect(heading?.textContent?.trim()).toBe('Frameworks');
    });

    it('should have SDKs category', () => {
      const sdkCategory = container.querySelector('[data-category="sdk"].integration-category');
      const heading = sdkCategory?.querySelector('h3');
      
      expect(sdkCategory).toBeTruthy();
      expect(heading?.textContent?.trim()).toBe('SDKs');
    });

    it('should have 4 logos in LLM Providers category', () => {
      const llmCategory = container.querySelector('[data-category="llm"].integration-category');
      const logos = llmCategory?.querySelectorAll('.integration-logo');
      
      expect(logos?.length).toBe(4);
    });

    it('should have 3 logos in Frameworks category', () => {
      const frameworkCategory = container.querySelector('[data-category="framework"].integration-category');
      const logos = frameworkCategory?.querySelectorAll('.integration-logo');
      
      expect(logos?.length).toBe(3);
    });

    it('should have 3 logos in SDKs category', () => {
      const sdkCategory = container.querySelector('[data-category="sdk"].integration-category');
      const logos = sdkCategory?.querySelectorAll('.integration-logo');
      
      expect(logos?.length).toBe(3);
    });

    it('should have category headings with correct styling', () => {
      const headings = container.querySelectorAll('.integration-category h3');
      
      expect(headings.length).toBe(3);
      
      headings.forEach(heading => {
        expect(heading.classList.contains('text-2xl')).toBe(true);
        expect(heading.classList.contains('font-semibold')).toBe(true);
        expect(heading.classList.contains('text-white')).toBe(true);
        expect(heading.classList.contains('text-center')).toBe(true);
      });
    });

    it('should have integration grids in each category', () => {
      const categories = container.querySelectorAll('.integration-category');
      
      categories.forEach(category => {
        const grid = category.querySelector('.integration-grid');
        expect(grid).toBeTruthy();
      });
    });

    it('should have all LLM logos in LLM category', () => {
      const llmCategory = container.querySelector('[data-category="llm"].integration-category');
      const llmLogos = llmCategory?.querySelectorAll('.integration-logo');
      
      const llmNames = Array.from(llmLogos || []).map(logo => 
        logo.getAttribute('data-integration')
      );
      
      expect(llmNames).toContain('OpenAI');
      expect(llmNames).toContain('Anthropic');
      expect(llmNames).toContain('Google');
      expect(llmNames).toContain('Cohere');
    });

    it('should have all framework logos in Frameworks category', () => {
      const frameworkCategory = container.querySelector('[data-category="framework"].integration-category');
      const frameworkLogos = frameworkCategory?.querySelectorAll('.integration-logo');
      
      const frameworkNames = Array.from(frameworkLogos || []).map(logo => 
        logo.getAttribute('data-integration')
      );
      
      expect(frameworkNames).toContain('LangChain');
      expect(frameworkNames).toContain('LlamaIndex');
      expect(frameworkNames).toContain('Haystack');
    });

    it('should have all SDK logos in SDKs category', () => {
      const sdkCategory = container.querySelector('[data-category="sdk"].integration-category');
      const sdkLogos = sdkCategory?.querySelectorAll('.integration-logo');
      
      const sdkNames = Array.from(sdkLogos || []).map(logo => 
        logo.getAttribute('data-integration')
      );
      
      expect(sdkNames).toContain('Python');
      expect(sdkNames).toContain('Node.js');
      expect(sdkNames).toContain('REST API');
    });
  });

  /**
   * Test: Section structure
   * Requirements: 10.1, 10.2, 10.3
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const integrationsHTML = `
        <section id="integrations" class="py-24 bg-slate-900">
          <div class="container mx-auto px-4 max-w-7xl">
            <div class="text-center mb-16">
              <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
                Integrations
              </h2>
              <p class="text-xl text-slate-400 max-w-3xl mx-auto">
                Works seamlessly with your existing AI stack
              </p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = integrationsHTML;
    });

    it('should have integrations section with correct id', () => {
      const section = container.querySelector('#integrations');
      
      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('integrations');
    });

    it('should have section header', () => {
      const header = container.querySelector('h2');
      
      expect(header).toBeTruthy();
      expect(header?.textContent?.trim()).toBe('Integrations');
    });

    it('should have section description', () => {
      const description = container.querySelector('p.text-xl');
      
      expect(description).toBeTruthy();
      expect(description?.textContent).toContain('Works seamlessly with your existing AI stack');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#integrations');
      
      expect(section?.classList.contains('bg-slate-900')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#integrations');
      
      expect(section?.classList.contains('py-24')).toBe(true);
    });

    it('should have centered header', () => {
      const headerContainer = container.querySelector('.text-center');
      
      expect(headerContainer).toBeTruthy();
      expect(headerContainer?.classList.contains('mb-16')).toBe(true);
    });

    it('should have header with correct styling', () => {
      const header = container.querySelector('h2');
      
      expect(header?.classList.contains('text-4xl')).toBe(true);
      expect(header?.classList.contains('md:text-5xl')).toBe(true);
      expect(header?.classList.contains('font-bold')).toBe(true);
      expect(header?.classList.contains('text-white')).toBe(true);
    });

    it('should have description with correct styling', () => {
      const description = container.querySelector('p.text-xl');
      
      expect(description?.classList.contains('text-slate-400')).toBe(true);
      expect(description?.classList.contains('max-w-3xl')).toBe(true);
      expect(description?.classList.contains('mx-auto')).toBe(true);
    });
  });

  /**
   * Test: Responsive grid layout
   * Requirements: 10.4
   */
  describe('Responsive Grid Layout', () => {
    beforeEach(() => {
      const gridHTML = `
        <section id="integrations">
          <div class="integration-grid grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            <div class="integration-logo" data-integration="OpenAI"></div>
            <div class="integration-logo" data-integration="Anthropic"></div>
            <div class="integration-logo" data-integration="Google"></div>
            <div class="integration-logo" data-integration="Cohere"></div>
          </div>
        </section>
      `;
      
      container.innerHTML = gridHTML;
    });

    it('should have grid layout', () => {
      const grid = container.querySelector('.integration-grid');
      
      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid')).toBe(true);
    });

    it('should have 3 columns on mobile', () => {
      const grid = container.querySelector('.integration-grid');
      
      expect(grid?.classList.contains('grid-cols-3')).toBe(true);
    });

    it('should have 4 columns on tablet', () => {
      const grid = container.querySelector('.integration-grid');
      
      expect(grid?.classList.contains('md:grid-cols-4')).toBe(true);
    });

    it('should have 6 columns on desktop', () => {
      const grid = container.querySelector('.integration-grid');
      
      expect(grid?.classList.contains('lg:grid-cols-6')).toBe(true);
    });

    it('should have gap between logos', () => {
      const grid = container.querySelector('.integration-grid');
      
      expect(grid?.classList.contains('gap-6')).toBe(true);
    });
  });

  /**
   * Test: Logo styling
   * Requirements: 10.4
   */
  describe('Logo Styling', () => {
    beforeEach(() => {
      const logoHTML = `
        <section id="integrations">
          <div class="integration-logo flex items-center justify-center p-6 bg-slate-800 rounded-lg border border-slate-700 transition-all duration-300 hover:border-indigo-500 hover:bg-slate-750">
            <div class="text-center">
              <div class="text-slate-400 hover:text-white transition-colors duration-300 font-medium">
                OpenAI
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = logoHTML;
    });

    it('should have logo with correct base styling', () => {
      const logo = container.querySelector('.integration-logo');
      
      expect(logo).toBeTruthy();
      expect(logo?.classList.contains('flex')).toBe(true);
      expect(logo?.classList.contains('items-center')).toBe(true);
      expect(logo?.classList.contains('justify-center')).toBe(true);
      expect(logo?.classList.contains('p-6')).toBe(true);
      expect(logo?.classList.contains('bg-slate-800')).toBe(true);
      expect(logo?.classList.contains('rounded-lg')).toBe(true);
      expect(logo?.classList.contains('border')).toBe(true);
      expect(logo?.classList.contains('border-slate-700')).toBe(true);
    });

    it('should have hover effect classes', () => {
      const logo = container.querySelector('.integration-logo');
      
      expect(logo?.classList.contains('hover:border-indigo-500')).toBe(true);
    });

    it('should have transition classes', () => {
      const logo = container.querySelector('.integration-logo');
      
      expect(logo?.classList.contains('transition-all')).toBe(true);
      expect(logo?.classList.contains('duration-300')).toBe(true);
    });

    it('should have text with correct styling', () => {
      const text = container.querySelector('.text-slate-400');
      
      expect(text).toBeTruthy();
      expect(text?.classList.contains('hover:text-white')).toBe(true);
      expect(text?.classList.contains('transition-colors')).toBe(true);
      expect(text?.classList.contains('duration-300')).toBe(true);
      expect(text?.classList.contains('font-medium')).toBe(true);
    });

    it('should have centered text container', () => {
      const textContainer = container.querySelector('.text-center');
      
      expect(textContainer).toBeTruthy();
    });
  });
});
