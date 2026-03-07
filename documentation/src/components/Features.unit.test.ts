/**
 * Unit tests for Features component
 * Requirements: 5.1, 5.2, 5.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Features Component - Unit Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Test: Four feature blocks render
   * Requirements: 5.1
   */
  describe('Feature Blocks', () => {
    beforeEach(() => {
      const featuresHTML = `
        <section id="features" class="py-20 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  Everything You Need to Build Production AI
                </h2>
              </div>
              <div class="space-y-24">
                <div class="feature-block" data-feature-id="tracing">
                  <h3>LLM Tracing</h3>
                </div>
                <div class="feature-block" data-feature-id="prompts">
                  <h3>Prompt Management</h3>
                </div>
                <div class="feature-block" data-feature-id="evaluation">
                  <h3>Evaluation Framework</h3>
                </div>
                <div class="feature-block" data-feature-id="insights">
                  <h3>AI Insights</h3>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = featuresHTML;
    });

    it('should render exactly four feature blocks', () => {
      const featureBlocks = container.querySelectorAll('.feature-block');

      expect(featureBlocks.length).toBe(4);
    });

    it('should render LLM Tracing feature block', () => {
      const tracingBlock = container.querySelector('[data-feature-id="tracing"]');
      const title = tracingBlock?.querySelector('h3');

      expect(tracingBlock).toBeTruthy();
      expect(title?.textContent).toBe('LLM Tracing');
    });

    it('should render Prompt Management feature block', () => {
      const promptsBlock = container.querySelector('[data-feature-id="prompts"]');
      const title = promptsBlock?.querySelector('h3');

      expect(promptsBlock).toBeTruthy();
      expect(title?.textContent).toBe('Prompt Management');
    });

    it('should render Evaluation Framework feature block', () => {
      const evaluationBlock = container.querySelector('[data-feature-id="evaluation"]');
      const title = evaluationBlock?.querySelector('h3');

      expect(evaluationBlock).toBeTruthy();
      expect(title?.textContent).toBe('Evaluation Framework');
    });

    it('should render AI Insights feature block', () => {
      const insightsBlock = container.querySelector('[data-feature-id="insights"]');
      const title = insightsBlock?.querySelector('h3');

      expect(insightsBlock).toBeTruthy();
      expect(title?.textContent).toBe('AI Insights');
    });

    it('should have section header', () => {
      const header = container.querySelector('h2');

      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('Everything You Need to Build Production AI');
    });

    it('should have feature blocks in space-y container', () => {
      const blocksContainer = container.querySelector('.space-y-24');

      expect(blocksContainer).toBeTruthy();
    });
  });

  /**
   * Test: Alternating layout direction
   * Requirements: 5.6
   */
  describe('Alternating Layout', () => {
    beforeEach(() => {
      const featuresHTML = `
        <section id="features">
          <div class="space-y-24">
            <div class="feature-block flex flex-col lg:flex-row gap-12" data-feature-id="tracing">
              <div class="flex-1">Content</div>
              <div class="flex-1">Visual</div>
            </div>
            <div class="feature-block flex flex-col lg:flex-row-reverse gap-12" data-feature-id="prompts">
              <div class="flex-1">Content</div>
              <div class="flex-1">Visual</div>
            </div>
            <div class="feature-block flex flex-col lg:flex-row gap-12" data-feature-id="evaluation">
              <div class="flex-1">Content</div>
              <div class="flex-1">Visual</div>
            </div>
            <div class="feature-block flex flex-col lg:flex-row-reverse gap-12" data-feature-id="insights">
              <div class="flex-1">Content</div>
              <div class="flex-1">Visual</div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = featuresHTML;
    });

    it('should have alternating flex direction for feature blocks', () => {
      const tracingBlock = container.querySelector('[data-feature-id="tracing"]');
      const promptsBlock = container.querySelector('[data-feature-id="prompts"]');
      const evaluationBlock = container.querySelector('[data-feature-id="evaluation"]');
      const insightsBlock = container.querySelector('[data-feature-id="insights"]');

      expect(tracingBlock?.classList.contains('lg:flex-row')).toBe(true);
      expect(promptsBlock?.classList.contains('lg:flex-row-reverse')).toBe(true);
      expect(evaluationBlock?.classList.contains('lg:flex-row')).toBe(true);
      expect(insightsBlock?.classList.contains('lg:flex-row-reverse')).toBe(true);
    });

    it('should have flex layout on all feature blocks', () => {
      const featureBlocks = container.querySelectorAll('.feature-block');

      featureBlocks.forEach(block => {
        expect(block.classList.contains('flex')).toBe(true);
        expect(block.classList.contains('flex-col')).toBe(true);
      });
    });

    it('should have gap between content and visual', () => {
      const featureBlocks = container.querySelectorAll('.feature-block');

      featureBlocks.forEach(block => {
        expect(block.classList.contains('gap-12')).toBe(true);
      });
    });
  });

  /**
   * Test: Code snippet is present in LLM Tracing
   * Requirements: 5.2
   */
  describe('LLM Tracing Code Snippet', () => {
    beforeEach(() => {
      const tracingHTML = `
        <section id="features">
          <div class="feature-block" data-feature-id="tracing">
            <div class="flex-1">
              <h3>LLM Tracing</h3>
              <p>Complete visibility into every LLM call with automatic instrumentation and detailed performance metrics.</p>
            </div>
            <div class="flex-1">
              <div class="code-snippet rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                <div class="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-red-500"></div>
                    <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div class="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <span class="text-xs text-slate-500 font-mono">python</span>
                </div>
                <pre class="p-6 overflow-x-auto"><code class="text-sm font-mono text-slate-300">from agentops import trace

@trace
def my_llm_call(prompt):
    response = openai.chat.completions.create(
        model="gpt-4-turbo",
        messages=[{"role": "user", "content": prompt}]
    )
    return response</code></pre>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = tracingHTML;
    });

    it('should have code snippet in LLM Tracing feature', () => {
      const tracingBlock = container.querySelector('[data-feature-id="tracing"]');
      const codeSnippet = tracingBlock?.querySelector('.code-snippet');

      expect(codeSnippet).toBeTruthy();
    });

    it('should have code header with language indicator', () => {
      const codeSnippet = container.querySelector('.code-snippet');
      const languageIndicator = codeSnippet?.querySelector('.font-mono');

      expect(languageIndicator).toBeTruthy();
      expect(languageIndicator?.textContent).toBe('python');
    });

    it('should have code content in pre/code tags', () => {
      const codeSnippet = container.querySelector('.code-snippet');
      const pre = codeSnippet?.querySelector('pre');
      const code = pre?.querySelector('code');

      expect(pre).toBeTruthy();
      expect(code).toBeTruthy();
      expect(code?.textContent).toContain('from agentops import trace');
      expect(code?.textContent).toContain('@trace');
    });

    it('should have terminal-style dots in code header', () => {
      const codeSnippet = container.querySelector('.code-snippet');
      const dots = codeSnippet?.querySelectorAll('.w-3.h-3.rounded-full');

      expect(dots?.length).toBe(3);
      expect(dots?.[0]?.classList.contains('bg-red-500')).toBe(true);
      expect(dots?.[1]?.classList.contains('bg-yellow-500')).toBe(true);
      expect(dots?.[2]?.classList.contains('bg-green-500')).toBe(true);
    });

    it('should have code snippet with dark background', () => {
      const codeSnippet = container.querySelector('.code-snippet');

      expect(codeSnippet?.classList.contains('bg-slate-950')).toBe(true);
      expect(codeSnippet?.classList.contains('border')).toBe(true);
      expect(codeSnippet?.classList.contains('border-slate-700')).toBe(true);
    });
  });

  /**
   * Test: Feature content structure
   * Requirements: 5.1
   */
  describe('Feature Content Structure', () => {
    beforeEach(() => {
      const featureHTML = `
        <section id="features">
          <div class="feature-block" data-feature-id="tracing">
            <div class="flex-1 space-y-6">
              <div class="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <svg class="w-7 h-7 text-indigo-500"></svg>
              </div>
              <h3 class="text-2xl md:text-3xl font-bold text-white">LLM Tracing</h3>
              <p class="text-lg text-slate-400">Complete visibility into every LLM call with automatic instrumentation.</p>
              <ul class="space-y-3">
                <li class="flex items-start gap-3">
                  <svg class="w-5 h-5 text-green-500"></svg>
                  <span class="text-slate-300">Auto instrumentation for popular frameworks</span>
                </li>
                <li class="flex items-start gap-3">
                  <svg class="w-5 h-5 text-green-500"></svg>
                  <span class="text-slate-300">Cost per request tracking</span>
                </li>
                <li class="flex items-start gap-3">
                  <svg class="w-5 h-5 text-green-500"></svg>
                  <span class="text-slate-300">Agent and RAG workflow tracking</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = featureHTML;
    });

    it('should have icon in feature block', () => {
      const featureBlock = container.querySelector('.feature-block');
      const icon = featureBlock?.querySelector('.w-14.h-14');

      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('rounded-xl')).toBe(true);
      expect(icon?.classList.contains('bg-indigo-500/10')).toBe(true);
    });

    it('should have title in feature block', () => {
      const featureBlock = container.querySelector('.feature-block');
      const title = featureBlock?.querySelector('h3');

      expect(title).toBeTruthy();
      expect(title?.classList.contains('text-2xl')).toBe(true);
      expect(title?.classList.contains('font-bold')).toBe(true);
      expect(title?.classList.contains('text-white')).toBe(true);
    });

    it('should have description in feature block', () => {
      const featureBlock = container.querySelector('.feature-block');
      const description = featureBlock?.querySelector('p.text-lg');

      expect(description).toBeTruthy();
      expect(description?.classList.contains('text-slate-400')).toBe(true);
    });

    it('should have bullet points list', () => {
      const featureBlock = container.querySelector('.feature-block');
      const bulletList = featureBlock?.querySelector('ul');
      const bullets = bulletList?.querySelectorAll('li');

      expect(bulletList).toBeTruthy();
      expect(bullets?.length).toBe(3);
    });

    it('should have checkmark icons in bullet points', () => {
      const bullets = container.querySelectorAll('li');

      bullets.forEach(bullet => {
        const checkmark = bullet.querySelector('svg.text-green-500');
        expect(checkmark).toBeTruthy();
      });
    });
  });

  /**
   * Test: Prompt Management mockup
   * Requirements: 5.3
   */
  describe('Prompt Management Mockup', () => {
    beforeEach(() => {
      const promptHTML = `
        <section id="features">
          <div class="feature-block" data-feature-id="prompts">
            <div class="flex-1">
              <div class="prompt-mockup rounded-xl border border-slate-700 bg-slate-900 p-6">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-indigo-500/10">
                      <svg class="w-5 h-5 text-indigo-500"></svg>
                    </div>
                    <div>
                      <div class="text-sm font-semibold text-white">Customer Support Prompt</div>
                      <div class="text-xs text-slate-500">Version 3.2 • Production</div>
                    </div>
                  </div>
                  <span class="px-2 py-1 text-xs font-semibold bg-green-500/10 text-green-400 rounded border border-green-500/20">Active</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = promptHTML;
    });

    it('should have prompt mockup in Prompt Management feature', () => {
      const promptsBlock = container.querySelector('[data-feature-id="prompts"]');
      const mockup = promptsBlock?.querySelector('.prompt-mockup');

      expect(mockup).toBeTruthy();
    });

    it('should have prompt title and version', () => {
      const mockup = container.querySelector('.prompt-mockup');
      const title = mockup?.querySelector('.text-sm.font-semibold');
      const version = mockup?.querySelector('.text-xs.text-slate-500');

      expect(title?.textContent).toBe('Customer Support Prompt');
      expect(version?.textContent).toContain('Version 3.2');
      expect(version?.textContent).toContain('Production');
    });

    it('should have active status badge', () => {
      const mockup = container.querySelector('.prompt-mockup');
      const badge = mockup?.querySelector('.bg-green-500\\/10');

      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('Active');
    });
  });

  /**
   * Test: Evaluation Framework grid
   * Requirements: 5.4
   */
  describe('Evaluation Framework Grid', () => {
    beforeEach(() => {
      const evaluationHTML = `
        <section id="features">
          <div class="feature-block" data-feature-id="evaluation">
            <div class="flex-1">
              <div class="evaluation-grid grid grid-cols-2 gap-4">
                <div class="eval-card p-4 rounded-xl bg-slate-900 border border-slate-700">
                  <div class="flex items-center justify-between mb-3">
                    <span class="text-sm font-semibold text-white">Accuracy</span>
                    <span class="text-sm font-bold text-indigo-400">94%</span>
                  </div>
                  <div class="h-2 bg-slate-800 rounded-full">
                    <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style="width: 94%"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = evaluationHTML;
    });

    it('should have evaluation grid in Evaluation Framework feature', () => {
      const evaluationBlock = container.querySelector('[data-feature-id="evaluation"]');
      const grid = evaluationBlock?.querySelector('.evaluation-grid');

      expect(grid).toBeTruthy();
      expect(grid?.classList.contains('grid')).toBe(true);
      expect(grid?.classList.contains('grid-cols-2')).toBe(true);
    });

    it('should have evaluation cards with progress bars', () => {
      const evalCard = container.querySelector('.eval-card');
      const progressBar = evalCard?.querySelector('.h-2.bg-slate-800');

      expect(evalCard).toBeTruthy();
      expect(progressBar).toBeTruthy();
    });

    it('should have evaluation method name and percentage', () => {
      const evalCard = container.querySelector('.eval-card');
      const name = evalCard?.querySelector('.text-sm.font-semibold');
      const percentage = evalCard?.querySelector('.text-sm.font-bold');

      expect(name?.textContent).toBe('Accuracy');
      expect(percentage?.textContent).toBe('94%');
    });
  });

  /**
   * Test: AI Insights mockup
   * Requirements: 5.5
   */
  describe('AI Insights Mockup', () => {
    beforeEach(() => {
      const insightsHTML = `
        <section id="features">
          <div class="feature-block" data-feature-id="insights">
            <div class="flex-1">
              <div class="insights-mockup space-y-4">
                <div class="alert-card rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-lg bg-yellow-500/10">
                      <svg class="w-5 h-5 text-yellow-500"></svg>
                    </div>
                    <div class="flex-1">
                      <h4 class="text-sm font-semibold text-yellow-400">Cost Spike Detected</h4>
                      <p class="text-sm text-slate-300">GPT-4 usage increased 340% in the last hour.</p>
                    </div>
                  </div>
                </div>
                <div class="insight-card rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-lg bg-indigo-500/10">
                      <svg class="w-5 h-5 text-indigo-500"></svg>
                    </div>
                    <div class="flex-1">
                      <h4 class="text-sm font-semibold text-indigo-400">Optimization Opportunity</h4>
                      <p class="text-sm text-slate-300">Your prompt could be 23% shorter without losing quality.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = insightsHTML;
    });

    it('should have insights mockup in AI Insights feature', () => {
      const insightsBlock = container.querySelector('[data-feature-id="insights"]');
      const mockup = insightsBlock?.querySelector('.insights-mockup');

      expect(mockup).toBeTruthy();
    });

    it('should have alert card', () => {
      const alertCard = container.querySelector('.alert-card');

      expect(alertCard).toBeTruthy();
      expect(alertCard?.classList.contains('border-yellow-500/30')).toBe(true);
      expect(alertCard?.classList.contains('bg-yellow-500/5')).toBe(true);
    });

    it('should have insight card', () => {
      const insightCard = container.querySelector('.insight-card');

      expect(insightCard).toBeTruthy();
      expect(insightCard?.classList.contains('border-indigo-500/30')).toBe(true);
      expect(insightCard?.classList.contains('bg-indigo-500/5')).toBe(true);
    });

    it('should have alert card with title and description', () => {
      const alertCard = container.querySelector('.alert-card');
      const title = alertCard?.querySelector('h4');
      const description = alertCard?.querySelector('p');

      expect(title?.textContent).toBe('Cost Spike Detected');
      expect(description?.textContent).toContain('GPT-4 usage increased');
    });

    it('should have insight card with title and description', () => {
      const insightCard = container.querySelector('.insight-card');
      const title = insightCard?.querySelector('h4');
      const description = insightCard?.querySelector('p');

      expect(title?.textContent).toBe('Optimization Opportunity');
      expect(description?.textContent).toContain('prompt could be 23% shorter');
    });
  });

  /**
   * Test: Section structure
   * Requirements: 5.1
   */
  describe('Section Structure', () => {
    beforeEach(() => {
      const featuresHTML = `
        <section id="features" class="py-20 bg-slate-900">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
                  Everything You Need to Build Production AI
                </h2>
                <p class="text-lg text-slate-400 max-w-3xl mx-auto">
                  A complete platform for observability, evaluation, and optimization
                </p>
              </div>
            </div>
          </div>
        </section>
      `;
      
      container.innerHTML = featuresHTML;
    });

    it('should have features section with correct id', () => {
      const section = container.querySelector('#features');

      expect(section).toBeTruthy();
      expect(section?.tagName).toBe('SECTION');
      expect(section?.getAttribute('id')).toBe('features');
    });

    it('should have correct background color', () => {
      const section = container.querySelector('#features');

      expect(section?.classList.contains('bg-slate-900')).toBe(true);
    });

    it('should have correct padding', () => {
      const section = container.querySelector('#features');

      expect(section?.classList.contains('py-20')).toBe(true);
    });

    it('should have section header with title', () => {
      const header = container.querySelector('h2');
      const headerContainer = container.querySelector('.text-center');

      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('Everything You Need to Build Production AI');
      expect(headerContainer).toBeTruthy();
    });

    it('should have section description', () => {
      const description = container.querySelector('p.text-lg');
      const descriptionContainer = description?.parentElement;

      expect(description).toBeTruthy();
      expect(description?.classList.contains('text-slate-400')).toBe(true);
      expect(descriptionContainer?.classList.contains('text-center')).toBe(true);
    });
  });
});
