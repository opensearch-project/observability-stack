import { useState, useEffect } from 'react';

const taglines = [
  // Services (cyan)
  { label: 'Services', text: 'APM traces, service maps, and distributed tracing across your stack', color: 'text-cyan-400' },
  { label: 'Services', text: 'See every request, every dependency, every bottleneck', color: 'text-cyan-400' },
  { label: 'Services', text: 'From microservices to monoliths—full visibility', color: 'text-cyan-400' },
  // Metrics (emerald)
  { label: 'Metrics', text: 'Prometheus metrics, custom dashboards, SLO/SLI tracking', color: 'text-emerald-400' },
  { label: 'Metrics', text: 'Anomaly detection and forecasting built in', color: 'text-emerald-400' },
  { label: 'Metrics', text: 'Real-time dashboards for the signals that matter', color: 'text-emerald-400' },
  // Logs (amber)
  { label: 'Logs', text: 'Correlate logs with traces—debug in minutes, not days', color: 'text-amber-400' },
  { label: 'Logs', text: 'Structured logging, search, and alerting at scale', color: 'text-amber-400' },
  { label: 'Logs', text: 'From ingestion to insight, all in one place', color: 'text-amber-400' },
  // AI (orange)
  { label: 'AI Agents', text: 'Agent tracing, local evals, and LLM observability', color: 'text-orange-400' },
  { label: 'AI Agents', text: 'Your agents aren\'t black boxes anymore', color: 'text-orange-400' },
  { label: 'AI Agents', text: 'Evals, prompt management, and cost tracking for LLMs', color: 'text-orange-400' },
];

export function CyclingTagline() {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % taglines.length);
        setIsVisible(true);
      }, 400);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const current = taglines[index];

  return (
    <div className="h-8 flex items-center relative">
      <span className={`${current.color} text-sm font-semibold uppercase tracking-wide`}>
        {current.label}
      </span>
      <div className="absolute left-[85px] top-0 h-full flex items-center overflow-hidden w-[400px]">
        <span
          className={`text-slate-400 whitespace-nowrap transition-all duration-500 ease-in-out ${
            isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
          }`}
        >
          {current.text}
        </span>
      </div>
    </div>
  );
}
