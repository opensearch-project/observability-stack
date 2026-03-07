import { useState } from 'react';

type TabId = 'quick' | 'standard' | 'custom';

interface Tab {
  id: TabId;
  label: string;
  timing: string;
  title: string;
  description: string;
  code: string;
  language: string;
  benefits: string[];
}

const tabs: Tab[] = [
  {
    id: 'quick',
    label: 'Quickest',
    timing: '5 min',
    title: 'Pre-Instrumented Framework',
    description: 'Zero configuration. Just import and go. Perfect for getting started fast.',
    language: 'python',
    code: `from agentops import Client

# One line initialization
agentops.init(api_key="your_key")

# Your existing code works as-is
def my_agent_function(prompt):
    response = llm.generate(prompt)
    return response

# Automatic OTEL traces, metrics, and logs
result = my_agent_function("Hello AI")`,
    benefits: [
      'Zero configuration required',
      'Automatic instrumentation of popular frameworks',
      'Instant OTEL traces and metrics',
      'Works with existing code',
      'Production-ready in 5 minutes',
    ],
  },
  {
    id: 'standard',
    label: 'Standard',
    timing: '15 min',
    title: 'Manual OTEL Instrumentation',
    description: 'Full control over your observability. Use standard OTEL APIs directly.',
    language: 'python',
    code: `from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from agentops.exporters import AgentOpsExporter

# Configure OTEL with Observability Stack exporter
provider = TracerProvider()
exporter = AgentOpsExporter(api_key="your_key")
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

# Use standard OTEL APIs
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("agent_task"):
    response = llm.generate(prompt)
    # Full control over span attributes
    span = trace.get_current_span()
    span.set_attribute("llm.model", "gpt-4")
    span.set_attribute("llm.tokens", 150)`,
    benefits: [
      'Standard OTEL APIs - no vendor lock-in',
      'Full control over spans and attributes',
      'Custom instrumentation for your use case',
      'Works with any OTEL-compatible backend',
      'Easy migration to/from other OTEL tools',
    ],
  },
  {
    id: 'custom',
    label: 'Custom OTEL',
    timing: 'Flexible',
    title: 'Bring Your Own OTEL Setup',
    description: 'Already using OTEL? Just point your exporter to Observability Stack. Keep your existing setup.',
    language: 'python',
    code: `from opentelemetry.sdk.trace.export import BatchSpanProcessor
from agentops.exporters import AgentOpsExporter

# Add Observability Stack as an additional exporter
# Keep your existing OTEL configuration
exporter = AgentOpsExporter(
    endpoint="https://api.agentops.ai/v1/traces",
    api_key="your_key"
)

# Add to your existing trace provider
trace_provider.add_span_processor(
    BatchSpanProcessor(exporter)
)

# Your existing OTEL instrumentation continues to work
# Traces now flow to both your existing backend AND Observability Stack`,
    benefits: [
      'Keep your existing OTEL setup',
      'Multi-backend support (send to multiple destinations)',
      'No code changes required',
      'Works with any OTEL collector',
      'Gradual migration path',
    ],
  },
];

export default function IntegrationPathsTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('quick');

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Tab Buttons */}
      <div className="flex flex-wrap gap-4 mb-8 justify-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            className={`
              px-6 py-3 rounded-lg font-semibold transition-all duration-200
              ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-slate-900 border-2 border-cyan-500'
                  : 'bg-slate-800 text-slate-300 border-2 border-slate-700 hover:border-slate-600'
              }
            `}
          >
            <div className="flex flex-col items-center gap-1">
              <span>{tab.label}</span>
              <span className="text-xs opacity-80">({tab.timing})</span>
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content with Fade-in Animation */}
      <div
        key={activeTab}
        className="animate-fade-in"
        style={{ animationFillMode: 'forwards' }}
      >
        {/* Title and Description */}
        <div className="text-center mb-8">
          <h3 className="text-3xl font-bold text-white mb-3">
            {currentTab.title}
          </h3>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            {currentTab.description}
          </p>
        </div>

        {/* Code Example and Benefits Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Code Block */}
          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm text-slate-400 font-mono">example.py</span>
              <span className="text-xs text-slate-500 uppercase">{currentTab.language}</span>
            </div>
            <div className="p-6 overflow-x-auto">
              <pre className="text-sm font-mono">
                <code className={`language-${currentTab.language}`}>
                  {currentTab.code.split('\n').map((line, i) => {
                    // Simple syntax highlighting
                    let highlightedLine = line;
                    
                    // Comments
                    if (line.trim().startsWith('#')) {
                      return (
                        <div key={i} className="text-slate-500">
                          {line}
                        </div>
                      );
                    }
                    
                    // Keywords
                    const keywords = ['from', 'import', 'def', 'return', 'with', 'as'];
                    keywords.forEach((keyword) => {
                      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
                      if (regex.test(line)) {
                        return;
                      }
                    });
                    
                    return (
                      <div key={i} className="text-slate-200">
                        {line}
                      </div>
                    );
                  })}
                </code>
              </pre>
            </div>
          </div>

          {/* Benefits List */}
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
            <h4 className="text-xl font-semibold text-white mb-4">Key Benefits</h4>
            <ul className="space-y-3">
              {currentTab.benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-3">
                  <svg
                    className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-slate-300">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
