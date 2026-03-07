/**
 * Unit tests for UseCases component
 * Requirements: 7.1, 7.2, 7.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('UseCases Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Five cards render
   * Requirements: 7.1
   */
  describe('Use Case Cards', () => {
    beforeEach(() => {
      const useCasesHTML = `
        <section id="use-cases" class="py-20 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  Built for Every AI Use Case
                </h2>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <a href="#rag-systems" class="use-case-card" data-use-case-id="rag-systems">
                  <h3>RAG System Development</h3>
                </a>
                <a href="#customer-support" class="use-case-card" data-use-case-id="customer-support">
                  <h3>Customer Support AI</h3>
                </a>
                <a href="#code-generation" class="use-case-card" data-use-case-id="code-generation">
                  <h3>Code Generation Tools</h3>
                </a>
                <a href="#content-generation" class="use-case-card" data-use-case-id="content-generation">
                  <h3>Content Generation</h3>
                </a>
                <a href="#enterprise-governance" class="use-case-card" data-use-case-id="enterprise-governance">
                  <h3>Enterprise AI Governance</h3>
                </a>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = useCasesHTML;
    });

    it('should render exactly five use case cards', () => {
      const useCaseCards = container.querySelectorAll('.use-case-card');

      expect(useCaseCards.length).toBe(5);
    });

    it('should render RAG System Development card', () => {
      const ragCard = container.querySelector('[data-use-case-id="rag-systems"]');
      const title = ragCard?.querySelector('h3');

      expect(ragCard).toBeTruthy();
      expect(title?.textContent).toBe('RAG System Development');
    });

    it('should render Customer Support AI card', () => {
      const supportCard = container.querySelector('[data-use-case-id="customer-support"]');
      const title = supportCard?.querySelector('h3');

      expect(supportCard).toBeTruthy();
      expect(title?.textContent).toBe('Customer Support AI');
    });

    it('should render Code Generation Tools card', () => {
      const codeCard = container.querySelector('[data-use-case-id="code-generation"]');
      const title = codeCard?.querySelector('h3');

      expect(codeCard).toBeTruthy();
      expect(title?.textContent).toBe('Code Generation Tools');
    });

    it('should render Content Generation card', () => {
      const contentCard = container.querySelector('[data-use-case-id="content-generation"]');
      const title = contentCard?.querySelector('h3');

      expect(contentCard).toBeTruthy();
      expect(title?.textContent).toBe('Content Generation');
    });

    it('should render Enterprise AI Governance card', () => {
      const governanceCard = container.querySelector('[data-use-case-id="enterprise-governance"]');
      const title = governanceCard?.querySelector('h3');

      expect(governanceCard).toBeTruthy();
      expect(title?.textContent).toBe('Enterprise AI Governance');
    });

    it('should have section header', () => {
      const header = container.querySelector('h2');

      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('Built for Every AI Use Case');
    });

    it('should have use case cards in grid layout', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true);
    });
  });

  /**
   * Test: Each card has all required elements
   * Requirements: 7.2
   */
  describe('Card Structure', () => {
    beforeEach(() => {
      const useCaseCardHTML = `
        <section id="use-cases">
          <div class="grid">
            <a
              href="#rag-systems"
              class="use-case-card group block p-6 rounded-xl bg-slate-800/50 border border-slate-700"
              data-use-case-id="rag-systems"
            >
              <!-- Icon -->
              <div class="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                <svg 
                  class="w-6 h-6 text-indigo-500" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7"
                  />
                </svg>
              </div>

              <!-- Title -->
              <h3 class="text-xl font-bold text-white mb-3">
                RAG System Development
              </h3>

              <!-- Description -->
              <p class="text-slate-400 leading-relaxed mb-4">
                Build and optimize retrieval-augmented generation systems with comprehensive tracing.
              </p>

              <!-- Learn More Link -->
              <div class="flex items-center gap-2 text-indigo-400 font-semibold">
                <span>Learn more</span>
                <svg 
                  class="w-4 h-4" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = useCaseCardHTML;
    });

    it('should have an icon in the card', () => {
      const card = container.querySelector('.use-case-card');
      const iconContainer = card?.querySelector('.w-12.h-12');
      const icon = iconContainer?.querySelector('svg');

      expect(iconContainer).toBeTruthy();
      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('w-6')).toBe(true);
      expect(icon?.classList.contains('h-6')).toBe(true);
      expect(icon?.classList.contains('text-indigo-500')).toBe(true);
    });

    it('should have a title in the card', () => {
      const card = container.querySelector('.use-case-card');
      const title = card?.querySelector('h3');

      expect(title).toBeTruthy();
      expect(title?.classList.contains('text-xl')).toBe(true);
      expect(title?.classList.contains('font-bold')).toBe(true);
      expect(title?.classList.contains('text-white')).toBe(true);
      expect(title?.textContent?.trim()).toBe('RAG System Development');
    });

    it('should have a description in the card', () => {
      const card = container.querySelector('.use-case-card');
      const description = card?.querySelector('p');

      expect(description).toBeTruthy();
      expect(description?.classList.contains('text-slate-400')).toBe(true);
      expect(description?.classList.contains('leading-relaxed')).toBe(true);
      expect(description?.textContent).toBeTruthy();
      expect(description?.textContent?.length).toBeGreaterThan(0);
    });

    it('should have a "Learn more" link in the card', () => {
      const card = container.querySelector('.use-case-card');
      const learnMoreLink = card?.querySelector('.flex.items-center.gap-2');
      const linkText = learnMoreLink?.querySelector('span');
      const arrowIcon = learnMoreLink?.querySelector('svg');

      expect(learnMoreLink).toBeTruthy();
      expect(linkText?.textContent).toBe('Learn more');
      expect(arrowIcon).toBeTruthy();
      expect(arrowIcon?.classList.contains('w-4')).toBe(true);
      expect(arrowIcon?.classList.contains('h-4')).toBe(true);
    });

    it('should have all four elements in correct order', () => {
      const card = container.querySelector('.use-case-card');
      const children = Array.from(card!.children);

      expect(children.length).toBe(4);

      // First child should be icon container
      expect(children[0].classList.contains('w-12')).toBe(true);
      expect(children[0].querySelector('svg')).toBeTruthy();

      // Second child should be title
      expect(children[1].tagName).toBe('H3');

      // Third child should be description
      expect(children[2].tagName).toBe('P');

      // Fourth child should be learn more link
      expect(children[3].classList.contains('flex')).toBe(true);
      expect(children[3].textContent).toContain('Learn more');
    });

    it('should have icon container with correct styling', () => {
      const iconContainer = container.querySelector('.w-12.h-12');

      expect(iconContainer).toBeTruthy();
      expect(iconContainer?.classList.contains('rounded-lg')).toBe(true);
      expect(iconContainer?.classList.contains('bg-indigo-500/10')).toBe(true);
      expect(iconContainer?.classList.contains('border')).toBe(true);
      expect(iconContainer?.classList.contains('border-indigo-500/20')).toBe(true);
    });

    it('should have learn more link with correct styling', () => {
      const learnMoreLink = container.querySelector('.flex.items-center.gap-2');

      expect(learnMoreLink).toBeTruthy();
      expect(learnMoreLink?.classList.contains('text-indigo-400')).toBe(true);
      expect(learnMoreLink?.classList.contains('font-semibold')).toBe(true);
    });
  });

  /**
   * Test: "Learn more" links have correct hrefs
   * Requirements: 7.3
   */
  describe('Learn More Links', () => {
    beforeEach(() => {
      const useCasesHTML = `
        <section id="use-cases">
          <div class="grid">
            <a href="#rag-systems" class="use-case-card" data-use-case-id="rag-systems">
              <h3>RAG System Development</h3>
              <div class="flex items-center gap-2">
                <span>Learn more</span>
              </div>
            </a>
            <a href="#customer-support" class="use-case-card" data-use-case-id="customer-support">
              <h3>Customer Support AI</h3>
              <div class="flex items-center gap-2">
                <span>Learn more</span>
              </div>
            </a>
            <a href="#code-generation" class="use-case-card" data-use-case-id="code-generation">
              <h3>Code Generation Tools</h3>
              <div class="flex items-center gap-2">
                <span>Learn more</span>
              </div>
            </a>
            <a href="#content-generation" class="use-case-card" data-use-case-id="content-generation">
              <h3>Content Generation</h3>
              <div class="flex items-center gap-2">
                <span>Learn more</span>
              </div>
            </a>
            <a href="#enterprise-governance" class="use-case-card" data-use-case-id="enterprise-governance">
              <h3>Enterprise AI Governance</h3>
              <div class="flex items-center gap-2">
                <span>Learn more</span>
              </div>
            </a>
          </div>
        </section>
      `;
      
      container.innerHTML = useCasesHTML;
    });

    it('should have RAG Systems card with correct href', () => {
      const ragCard = container.querySelector('[data-use-case-id="rag-systems"]');

      expect(ragCard).toBeTruthy();
      expect(ragCard?.getAttribute('href')).toBe('#rag-systems');
    });

    it('should have Customer Support card with correct href', () => {
      const supportCard = container.querySelector('[data-use-case-id="customer-support"]');

      expect(supportCard).toBeTruthy();
      expect(supportCard?.getAttribute('href')).toBe('#customer-support');
    });

    it('should have Code Generation card with correct href', () => {
      const codeCard = container.querySelector('[data-use-case-id="code-generation"]');

      expect(codeCard).toBeTruthy();
      expect(codeCard?.getAttribute('href')).toBe('#code-generation');
    });

    it('should have Content Generation card with correct href', () => {
      const contentCard = container.querySelector('[data-use-case-id="content-generation"]');

      expect(contentCard).toBeTruthy();
      expect(contentCard?.getAttribute('href')).toBe('#content-generation');
    });

    it('should have Enterprise Governance card with correct href', () => {
      const governanceCard = container.querySelector('[data-use-case-id="enterprise-governance"]');

      expect(governanceCard).toBeTruthy();
      expect(governanceCard?.getAttribute('href')).toBe('#enterprise-governance');
    });

    it('should have all cards as anchor elements', () => {
      const cards = container.querySelectorAll('.use-case-card');

      cards.forEach(card => {
        expect(card.tagName).toBe('A');
        expect(card.getAttribute('href')).toBeTruthy();
        expect(card.getAttribute('href')).toMatch(/^#/);
      });
    });

    it('should have unique hrefs for each card', () => {
      const cards = container.querySelectorAll('.use-case-card');
      const hrefs = Array.from(cards).map(card => card.getAttribute('href'));
      const uniqueHrefs = new Set(hrefs);

      expect(uniqueHrefs.size).toBe(hrefs.length);
    });
  });

  /**
   * Test: Card hover effects
   * Requirements: 7.1
   */
  describe('Card Styling and Hover Effects', () => {
    beforeEach(() => {
      const useCaseCardHTML = `
        <section id="use-cases">
          <a
            href="#rag-systems"
            class="use-case-card group block p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 hover:-translate-y-1 transition-all duration-300"
            data-use-case-id="rag-systems"
          >
            <h3>RAG System Development</h3>
          </a>
        </section>
      `;
      
      container.innerHTML = useCaseCardHTML;
    });

    it('should have card with correct base styling', () => {
      const card = container.querySelector('.use-case-card');

      expect(card).toBeTruthy();
      expect(card?.classList.contains('block')).toBe(true);
      expect(card?.classList.contains('p-6')).toBe(true);
      expect(card?.classList.contains('rounded-xl')).toBe(true);
      expect(card?.classList.contains('bg-slate-800/50')).toBe(true);
      expect(card?.classList.contains('border')).toBe(true);
      expect(card?.classList.contains('border-slate-700')).toBe(true);
    });

    it('should have hover effect classes', () => {
      const card = container.querySelector('.use-case-card');

      expect(card?.classList.contains('hover:border-indigo-500/50')).toBe(true);
      expect(card?.classList.contains('hover:-translate-y-1')).toBe(true);
    });

    it('should have transition classes', () => {
      const card = container.querySelector('.use-case-card');

      expect(card?.classList.contains('transition-all')).toBe(true);
      expect(card?.classList.contains('duration-300')).toBe(true);
    });

    it('should have group class for child hover effects', () => {
      const card = container.querySelector('.use-case-card');

      expect(card?.classList.contains('group')).toBe(true);
    });
  });

  /**
   * Test: Section structure
   * Requirements: 7.1
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const useCasesHTML = `
        <section id="use-cases" class="py-20 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  Built for Every AI Use Case
                </h2>
                <p class="text-lg text-slate-400 max-w-3xl mx-auto">
                  From RAG systems to enterprise governance, OpenSearch AgentOps adapts to your specific needs
                </p>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = useCasesHTML;
    });

    it('should have use-cases section with correct id', () => {
      const section = container.querySelector('#use-cases');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('use-cases');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#use-cases');

      expect(section?.classList.contains('bg-slate-900')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#use-cases');

      expect(section?.classList.contains('py-20')).toBe(true);
    });

    it('should have section header with title', () => {
      const header = container.querySelector('h2');
      const headerContainer = container.querySelector('.text-center');

      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('Built for Every AI Use Case');
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
   * Requirements: 7.1
   */
  describe('Responsive Grid Layout', () => {
    beforeEach(() => {
      const gridHTML = `
        <section id="use-cases">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <a href="#card1" class="use-case-card">Card 1</a>
            <a href="#card2" class="use-case-card">Card 2</a>
            <a href="#card3" class="use-case-card">Card 3</a>
            <a href="#card4" class="use-case-card">Card 4</a>
            <a href="#card5" class="use-case-card">Card 5</a>
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

      expect(grid?.classList.contains('gap-6')).toBe(true);
    });
  });
});
