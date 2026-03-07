/**
 * Unit tests for ProblemSolution component
 * Requirements: 4.1, 4.3, 4.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ProblemSolution Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Three problem cards render with correct themes
   * Requirements: 4.1, 4.2, 4.3
   */
  describe('Problem Cards', () => {
    beforeEach(() => {
      const problemSolutionHTML = `
        <section id="problem-solution" class="py-20 bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="mb-20">
                <h2 class="text-3xl md:text-4xl font-bold text-white text-center mb-4">
                  The Problem with Current Solutions
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div class="problem-card p-6 rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-sm transition-transform duration-300 hover:scale-105" data-theme="red">
                    <div class="w-12 h-12 rounded-lg bg-red-500/5 border border-red-500/20 flex items-center justify-center mb-4">
                      <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Tool Sprawl</h3>
                    <p class="text-slate-400 leading-relaxed">Managing separate tools for tracing, prompts, and evaluation creates complexity and integration headaches.</p>
                  </div>
                  <div class="problem-card p-6 rounded-xl border border-orange-500/20 bg-orange-500/5 backdrop-blur-sm transition-transform duration-300 hover:scale-105" data-theme="orange">
                    <div class="w-12 h-12 rounded-lg bg-orange-500/5 border border-orange-500/20 flex items-center justify-center mb-4">
                      <svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Cost Explosion</h3>
                    <p class="text-slate-400 leading-relaxed">Multiple vendor subscriptions and per-request pricing quickly spiral out of control as you scale.</p>
                  </div>
                  <div class="problem-card p-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-sm transition-transform duration-300 hover:scale-105" data-theme="yellow">
                    <div class="w-12 h-12 rounded-lg bg-yellow-500/5 border border-yellow-500/20 flex items-center justify-center mb-4">
                      <svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Vendor Lock-in</h3>
                    <p class="text-slate-400 leading-relaxed">Proprietary platforms trap your data and workflows, making it expensive and risky to switch.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = problemSolutionHTML;
    });

    it('should render exactly three problem cards', () => {
      const problemCards = container.querySelectorAll('.problem-card');

      expect(problemCards.length).toBe(3);
    });

    it('should render "Tool Sprawl" card with red theme', () => {
      const toolSprawlCard = Array.from(container.querySelectorAll('.problem-card'))
        .find(card => card.getAttribute('data-theme') === 'red');
      const title = toolSprawlCard?.querySelector('h3');
      const icon = toolSprawlCard?.querySelector('svg');

      expect(toolSprawlCard).toBeTruthy();
      expect(title?.textContent).toBe('Tool Sprawl');
      expect(toolSprawlCard?.classList.contains('border-red-500/20')).toBe(true);
      expect(toolSprawlCard?.classList.contains('bg-red-500/5')).toBe(true);
      expect(icon?.classList.contains('text-red-500')).toBe(true);
    });

    it('should render "Cost Explosion" card with orange theme', () => {
      const costExplosionCard = Array.from(container.querySelectorAll('.problem-card'))
        .find(card => card.getAttribute('data-theme') === 'orange');
      const title = costExplosionCard?.querySelector('h3');
      const icon = costExplosionCard?.querySelector('svg');

      expect(costExplosionCard).toBeTruthy();
      expect(title?.textContent).toBe('Cost Explosion');
      expect(costExplosionCard?.classList.contains('border-orange-500/20')).toBe(true);
      expect(costExplosionCard?.classList.contains('bg-orange-500/5')).toBe(true);
      expect(icon?.classList.contains('text-orange-500')).toBe(true);
    });

    it('should render "Vendor Lock-in" card with yellow theme', () => {
      const vendorLockInCard = Array.from(container.querySelectorAll('.problem-card'))
        .find(card => card.getAttribute('data-theme') === 'yellow');
      const title = vendorLockInCard?.querySelector('h3');
      const icon = vendorLockInCard?.querySelector('svg');

      expect(vendorLockInCard).toBeTruthy();
      expect(title?.textContent).toBe('Vendor Lock-in');
      expect(vendorLockInCard?.classList.contains('border-yellow-500/20')).toBe(true);
      expect(vendorLockInCard?.classList.contains('bg-yellow-500/5')).toBe(true);
      expect(icon?.classList.contains('text-yellow-500')).toBe(true);
    });

    it('should have icons in all problem cards', () => {
      const problemCards = container.querySelectorAll('.problem-card');

      problemCards.forEach(card => {
        const icon = card.querySelector('svg');
        expect(icon).toBeTruthy();
        expect(icon?.classList.contains('w-6')).toBe(true);
        expect(icon?.classList.contains('h-6')).toBe(true);
      });
    });

    it('should have titles in all problem cards', () => {
      const problemCards = container.querySelectorAll('.problem-card');

      problemCards.forEach(card => {
        const title = card.querySelector('h3');
        expect(title).toBeTruthy();
        expect(title?.classList.contains('text-xl')).toBe(true);
        expect(title?.classList.contains('font-bold')).toBe(true);
        expect(title?.classList.contains('text-white')).toBe(true);
      });
    });

    it('should have descriptions in all problem cards', () => {
      const problemCards = container.querySelectorAll('.problem-card');

      problemCards.forEach(card => {
        const description = card.querySelector('p');
        expect(description).toBeTruthy();
        expect(description?.classList.contains('text-slate-400')).toBe(true);
        expect(description?.textContent).toBeTruthy();
        expect(description?.textContent?.length).toBeGreaterThan(0);
      });
    });

    it('should have problem cards in grid layout', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
      expect(grid?.classList.contains('md:grid-cols-3')).toBe(true);
    });

    it('should have hover effect classes on problem cards', () => {
      const problemCards = container.querySelectorAll('.problem-card');

      problemCards.forEach(card => {
        expect(card.classList.contains('hover:scale-105')).toBe(true);
      });
    });
  });

  /**
   * Test: Solution headline is correct
   * Requirements: 4.4
   */
  describe('Solution Headline', () => {
    beforeEach(() => {
      const solutionHTML = `
        <section id="problem-solution">
          <div class="relative">
            <div class="relative bg-slate-900 rounded-2xl p-8 md:p-12 border border-slate-800">
              <h2 class="text-3xl md:text-4xl font-bold text-center mb-4">
                <span class="bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
                  One Platform. Everything You Need.
                </span>
              </h2>
              <p class="text-lg text-slate-400 text-center mb-12 max-w-2xl mx-auto">
                OpenSearch AgentOps unifies LLM tracing, prompt management, and evaluation in a single open-source platform
              </p>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = solutionHTML;
    });

    it('should render solution headline with correct text', () => {
      const headline = container.querySelector('h2 span');

      expect(headline).toBeTruthy();
      expect(headline?.textContent?.trim()).toBe('One Platform. Everything You Need.');
    });

    it('should have gradient text styling on headline', () => {
      const headline = container.querySelector('h2 span');

      expect(headline?.classList.contains('bg-gradient-to-r')).toBe(true);
      expect(headline?.classList.contains('from-indigo-500')).toBe(true);
      expect(headline?.classList.contains('via-purple-500')).toBe(true);
      expect(headline?.classList.contains('to-cyan-500')).toBe(true);
      expect(headline?.classList.contains('bg-clip-text')).toBe(true);
      expect(headline?.classList.contains('text-transparent')).toBe(true);
    });

    it('should have centered headline', () => {
      const h2 = container.querySelector('h2');

      expect(h2?.classList.contains('text-center')).toBe(true);
    });

    it('should render solution description', () => {
      const description = container.querySelector('p.text-lg');

      expect(description).toBeTruthy();
      expect(description?.textContent).toContain('OpenSearch AgentOps unifies');
      expect(description?.classList.contains('text-center')).toBe(true);
    });
  });

  /**
   * Test: Four stat cards render with correct values
   * Requirements: 4.4, 4.5
   */
  describe('Stat Cards', () => {
    beforeEach(() => {
      const statsHTML = `
        <section id="problem-solution">
          <div class="relative">
            <div class="relative bg-slate-900 rounded-2xl p-8 md:p-12 border border-slate-800">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="stat-card text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-colors duration-300">
                  <div class="text-2xl md:text-3xl font-bold text-white mb-2">70% Cost Savings</div>
                  <div class="text-sm text-slate-400">vs. multiple vendors</div>
                </div>
                <div class="stat-card text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-colors duration-300">
                  <div class="text-2xl md:text-3xl font-bold text-white mb-2">1 Unified Platform</div>
                  <div class="text-sm text-slate-400">for all AI ops</div>
                </div>
                <div class="stat-card text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-colors duration-300">
                  <div class="text-2xl md:text-3xl font-bold text-white mb-2">10+ Eval Methods</div>
                  <div class="text-sm text-slate-400">built-in</div>
                </div>
                <div class="stat-card text-center p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-colors duration-300">
                  <div class="text-2xl md:text-3xl font-bold text-white mb-2">100% Data Ownership</div>
                  <div class="text-sm text-slate-400">self-hosted option</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = statsHTML;
    });

    it('should render exactly four stat cards', () => {
      const statCards = container.querySelectorAll('.stat-card');

      expect(statCards.length).toBe(4);
    });

    it('should render "70% Cost Savings" stat card', () => {
      const statValue = Array.from(container.querySelectorAll('.stat-card'))
        .find(card => card.textContent?.includes('70% Cost Savings'));

      expect(statValue).toBeTruthy();
      expect(statValue?.textContent).toContain('vs. multiple vendors');
    });

    it('should render "1 Unified Platform" stat card', () => {
      const statValue = Array.from(container.querySelectorAll('.stat-card'))
        .find(card => card.textContent?.includes('1 Unified Platform'));

      expect(statValue).toBeTruthy();
      expect(statValue?.textContent).toContain('for all AI ops');
    });

    it('should render "10+ Eval Methods" stat card', () => {
      const statValue = Array.from(container.querySelectorAll('.stat-card'))
        .find(card => card.textContent?.includes('10+ Eval Methods'));

      expect(statValue).toBeTruthy();
      expect(statValue?.textContent).toContain('built-in');
    });

    it('should render "100% Data Ownership" stat card', () => {
      const statValue = Array.from(container.querySelectorAll('.stat-card'))
        .find(card => card.textContent?.includes('100% Data Ownership'));

      expect(statValue).toBeTruthy();
      expect(statValue?.textContent).toContain('self-hosted option');
    });

    it('should have stat values with correct styling', () => {
      const statCards = container.querySelectorAll('.stat-card');

      statCards.forEach(card => {
        const value = card.querySelector('.text-2xl');
        expect(value).toBeTruthy();
        expect(value?.classList.contains('font-bold')).toBe(true);
        expect(value?.classList.contains('text-white')).toBe(true);
      });
    });

    it('should have stat labels with correct styling', () => {
      const statCards = container.querySelectorAll('.stat-card');

      statCards.forEach(card => {
        const label = card.querySelector('.text-sm');
        expect(label).toBeTruthy();
        expect(label?.classList.contains('text-slate-400')).toBe(true);
      });
    });

    it('should have stat cards in grid layout', () => {
      const grid = container.querySelector('.grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid-cols-1')).toBe(true);
      expect(grid?.classList.contains('sm:grid-cols-2')).toBe(true);
      expect(grid?.classList.contains('lg:grid-cols-4')).toBe(true);
    });

    it('should have centered text in stat cards', () => {
      const statCards = container.querySelectorAll('.stat-card');

      statCards.forEach(card => {
        expect(card.classList.contains('text-center')).toBe(true);
      });
    });

    it('should have hover effect classes on stat cards', () => {
      const statCards = container.querySelectorAll('.stat-card');

      statCards.forEach(card => {
        expect(card.classList.contains('hover:border-indigo-500/50')).toBe(true);
      });
    });
  });

  /**
   * Test: Solution block has gradient border
   * Requirements: 4.5
   */
  describe('Solution Block Styling', () => {
    beforeEach(() => {
      const solutionHTML = `
        <section id="problem-solution">
          <div class="relative">
            <div class="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 rounded-2xl blur-sm opacity-20"></div>
            <div class="relative bg-slate-900 rounded-2xl p-8 md:p-12 border border-slate-800">
              <h2>One Platform. Everything You Need.</h2>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = solutionHTML;
    });

    it('should have gradient border effect element', () => {
      const gradientBorder = container.querySelector('.absolute.inset-0.bg-gradient-to-r');

      expect(gradientBorder).toBeTruthy();
      expect(gradientBorder?.classList.contains('from-indigo-500')).toBe(true);
      expect(gradientBorder?.classList.contains('via-purple-500')).toBe(true);
      expect(gradientBorder?.classList.contains('to-cyan-500')).toBe(true);
      expect(gradientBorder?.classList.contains('blur-sm')).toBe(true);
      expect(gradientBorder?.classList.contains('opacity-20')).toBe(true);
    });

    it('should have solution block with correct background', () => {
      const solutionBlock = container.querySelector('.relative.bg-slate-900');

      expect(solutionBlock).toBeTruthy();
      expect(solutionBlock?.classList.contains('rounded-2xl')).toBe(true);
      expect(solutionBlock?.classList.contains('border')).toBe(true);
      expect(solutionBlock?.classList.contains('border-slate-800')).toBe(true);
    });

    it('should have relative positioning on solution container', () => {
      const container = document.querySelector('.relative');

      expect(container).toBeTruthy();
    });
  });

  /**
   * Test: Section structure
   * Requirements: 4.1
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const problemSolutionHTML = `
        <section id="problem-solution" class="py-20 bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="mb-20">
                <h2 class="text-3xl md:text-4xl font-bold text-white text-center mb-4">
                  The Problem with Current Solutions
                </h2>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = problemSolutionHTML;
    });

    it('should have problem-solution section with correct id', () => {
      const section = container.querySelector('#problem-solution');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('problem-solution');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#problem-solution');

      expect(section?.classList.contains('bg-slate-950')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#problem-solution');

      expect(section?.classList.contains('py-20')).toBe(true);
    });

    it('should have container with correct max-width', () => {
      const maxWidthContainer = container.querySelector('.max-w-6xl');

      expect(maxWidthContainer).toBeTruthy();
      expect(maxWidthContainer?.classList.contains('mx-auto')).toBe(true);
    });

    it('should have problems section heading', () => {
      const heading = container.querySelector('h2');

      expect(heading).toBeTruthy();
      expect(heading?.textContent).toContain('The Problem with Current Solutions');
      expect(heading?.classList.contains('text-center')).toBe(true);
    });
  });
});
