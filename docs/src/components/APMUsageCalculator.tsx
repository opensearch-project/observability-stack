import { useState, useMemo, useRef, useEffect } from 'react';

interface SliderConfig {
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
  format: (v: number) => string;
  logarithmic?: boolean;
}

const SERVICE_MAP_DOC_SIZE_BYTES = 104;
const PROMETHEUS_BYTES_PER_SAMPLE = 2;
const AGGREGATION_WINDOW_SECONDS = 60;
const SERVICE_MAP_WINDOW_SECONDS = 180;
const RED_SERIES_PER_OPERATION = 16;
const OPENSEARCH_INDEX_OVERHEAD = 2.0;

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes.toFixed(0)} B`;
}

const sliders: Record<string, SliderConfig> = {
  spansPerMonth: {
    label: 'Spans ingested / month',
    min: 1_000_000,
    max: 10_000_000_000,
    step: 1_000_000,
    default: 10_000_000,
    unit: 'spans',
    format: formatCompact,
    logarithmic: true,
  },
  avgSpanSizeKB: {
    label: 'Avg span payload size',
    min: 0.1,
    max: 50,
    step: 0.1,
    default: 0.5,
    unit: 'KB',
    format: (v) => `${v.toFixed(1)} KB`,
  },
  spansPerTrace: {
    label: 'Avg spans per trace',
    min: 1,
    max: 1000,
    step: 1,
    default: 8,
    unit: 'spans/trace',
    format: (v) => formatCompact(v),
  },
  services: {
    label: 'Number of services',
    min: 1,
    max: 1000,
    step: 1,
    default: 10,
    unit: 'services',
    format: (v) => formatCompact(v),
  },
  opsPerService: {
    label: 'Avg operations per service',
    min: 1,
    max: 1000,
    step: 1,
    default: 5,
    unit: 'operations',
    format: (v) => formatCompact(v),
  },
  retentionDays: {
    label: 'Retention period',
    min: 1,
    max: 365,
    step: 1,
    default: 15,
    unit: 'days',
    format: (v) => `${v} days`,
  },
};

type SliderKey = keyof typeof sliders;

function toLog(value: number, min: number, max: number): number {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return ((Math.log(value) - logMin) / (logMax - logMin)) * 1000;
}

function fromLog(position: number, min: number, max: number, step: number): number {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const raw = Math.exp(logMin + (position / 1000) * (logMax - logMin));
  return Math.round(raw / step) * step;
}

function Slider({
  config,
  value,
  onChange,
}: {
  config: SliderConfig;
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isLog = config.logarithmic;
  const effectiveMax = value > config.max ? value : config.max;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = () => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      const clamped = Math.max(config.min, parsed);
      onChange(clamped);
    }
    setEditing(false);
  };

  const sliderValue = isLog
    ? toLog(value, config.min, effectiveMax)
    : value;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    if (isLog) {
      onChange(fromLog(raw, config.min, effectiveMax, config.step));
    } else {
      onChange(raw);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-medium text-slate-300">
          {config.label}
        </label>
        <div className="flex items-center gap-2">
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-28 px-2 py-0.5 text-sm font-mono text-cyan-400 bg-slate-800 border border-cyan-500 rounded text-right outline-none"
              step={config.step}
            />
          ) : (
            <>
              <span className="text-sm font-mono text-cyan-400">
                {config.format(value)}
              </span>
              <button
                onClick={() => {
                  setDraft(String(value));
                  setEditing(true);
                }}
                className="text-xs text-slate-500 hover:text-cyan-400 transition-colors"
                title="Edit value directly"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      <input
        type="range"
        min={isLog ? 0 : config.min}
        max={isLog ? 1000 : effectiveMax}
        step={isLog ? 1 : config.step}
        value={sliderValue}
        onChange={handleSliderChange}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-cyan-500"
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-500">
          {config.format(config.min)}
        </span>
        <span className="text-xs text-slate-500">
          {config.format(effectiveMax)}
        </span>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  formula,
  highlight,
}: {
  label: string;
  value: string;
  formula?: string;
  highlight?: boolean;
}) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-sm text-slate-400">{label}</span>
        <span
          className={`text-sm font-mono ${highlight ? 'text-cyan-400 font-semibold' : 'text-slate-200'}`}
        >
          {value}
        </span>
      </div>
      {formula && (
        <div className="text-xs font-mono text-slate-600 mt-0.5 pl-2 border-l border-slate-800">
          {formula}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-700 pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function calculateUsage(values: Record<SliderKey, number>) {
  const {
    spansPerMonth,
    avgSpanSizeKB,
    spansPerTrace,
    services,
    opsPerService,
    retentionDays,
  } = values;

  // Span storage
  const tracesPerMonth = spansPerMonth / spansPerTrace;
  const retainedSpans = spansPerMonth * (retentionDays / 30);
  const spanRawBytes = retainedSpans * avgSpanSizeKB * 1024;
  const spanStorageBytes = spanRawBytes * OPENSEARCH_INDEX_OVERHEAD;

  // Service map (directed edges: A→B ≠ B→A)
  const edges = Math.max(0, services * (services - 1));
  const emitsPerDay = (24 * 3600) / SERVICE_MAP_WINDOW_SECONDS;
  const serviceMapDocsPerMonth = edges * emitsPerDay * 30;
  const serviceMapRetainedDocs = serviceMapDocsPerMonth * (retentionDays / 30);
  const serviceMapRawBytes =
    serviceMapRetainedDocs * SERVICE_MAP_DOC_SIZE_BYTES;
  const serviceMapStorageBytes = serviceMapRawBytes * OPENSEARCH_INDEX_OVERHEAD;

  // RED metrics (Prometheus) — pushed via OTLP, not scraped
  // Per operation: request count + error count + fault count + ~12 histogram bucket series + _sum + _count
  const redSeries = services * opsPerService * RED_SERIES_PER_OPERATION;
  const samplesPerSeriesPerMonth =
    (30 * 24 * 3600) / AGGREGATION_WINDOW_SECONDS;
  const samplesPerMonth = redSeries * samplesPerSeriesPerMonth;
  const promRetainedSamples = samplesPerMonth * (retentionDays / 30);
  const promStorageBytes = promRetainedSamples * PROMETHEUS_BYTES_PER_SAMPLE;

  // Totals
  const totalOpenSearchBytes = spanStorageBytes + serviceMapStorageBytes;
  const totalDocsPerDay =
    (spansPerMonth + serviceMapDocsPerMonth) / 30;
  const ingestRate = totalDocsPerDay / 86400;

  return {
    tracesPerMonth,
    retainedSpans,
    spanStorageBytes,
    edges,
    serviceMapDocsPerMonth,
    serviceMapRetainedDocs,
    serviceMapStorageBytes,
    redSeries,
    samplesPerMonth,
    promRetainedSamples,
    promStorageBytes,
    totalOpenSearchBytes,
    totalDocsPerDay,
    ingestRate,
  };
}

function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-8 bg-slate-900 rounded-lg border border-slate-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <h2 className="text-lg font-semibold text-white">
          How These Calculations Work
        </h2>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-6 space-y-6 text-sm text-slate-300 leading-relaxed">
          {/* Data flow overview */}
          <div>
            <h3 className="text-white font-semibold mb-2">APM Data Flow</h3>
            <div className="font-mono text-xs text-slate-400 bg-slate-950 rounded p-3 overflow-x-auto">
              App (OTel SDK) &rarr; OTel Collector &rarr; Data Prepper &rarr; OpenSearch (spans + service map)<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&rarr; Prometheus (RED metrics)
            </div>
            <p className="mt-2">
              Each instrumented request generates a <strong>trace</strong> composed of multiple <strong>spans</strong>.
              A span is one unit of work (an HTTP handler, a database call, a tool invocation).
              Spans are the primary storage unit in APM.
            </p>
          </div>

          {/* Span storage */}
          <div>
            <h3 className="text-white font-semibold mb-2">1. Span Storage</h3>
            <p className="mb-2">
              Every span is stored as an individual JSON document in OpenSearch
              (index pattern: <code className="text-cyan-400">otel-v1-apm-span-*</code>).
              Each document contains the trace ID, span ID, service name, operation name,
              start/end timestamps, duration, status code, and dynamic attributes.
            </p>
            <div className="font-mono text-xs bg-slate-950 rounded p-3 space-y-1">
              <div><span className="text-slate-500">Traces/month</span> = spans_per_month / avg_spans_per_trace</div>
              <div><span className="text-slate-500">Retained spans</span> = spans_per_month * (retention_days / 30)</div>
              <div><span className="text-slate-500">Storage</span> = retained_spans * avg_span_size_kb * 1024 * 2.0x index overhead</div>
            </div>
            <p className="mt-2 text-slate-400">
              The default 0.5 KB per span is measured from a live stack. Spans with many custom attributes,
              exception events, or large resource metadata can be 5-50 KB. Adjust the slider to match your payload.
            </p>
          </div>

          {/* Service map */}
          <div>
            <h3 className="text-white font-semibold mb-2">2. Service Map</h3>
            <p className="mb-2">
              Data Prepper's <code className="text-cyan-400">service_map_stateful</code> processor
              extracts service-to-service relationships from spans and writes them to OpenSearch
              (index pattern: <code className="text-cyan-400">otel-v2-apm-service-map-*</code>).
              Each document records a source service, target service, and the operation connecting them.
            </p>
            <div className="font-mono text-xs bg-slate-950 rounded p-3 space-y-1">
              <div><span className="text-slate-500">Edges</span> = services * (services - 1) &nbsp; <span className="text-slate-600">[directed: A&rarr;B &ne; B&rarr;A]</span></div>
              <div><span className="text-slate-500">Docs/month</span> = edges * 480/day * 30 &nbsp; <span className="text-slate-600">[3 min window (DEFAULT_WINDOW_DURATION)]</span></div>
              <div><span className="text-slate-500">Storage</span> = retained_docs * 104 bytes * 2.0x &nbsp; <span className="text-slate-600">[index overhead]</span></div>
            </div>
            <p className="mt-2 text-slate-400">
              Service map edges are directed (A&rarr;B and B&rarr;A are separate documents with distinct
              sourceNode/targetNode fields). The edge count uses the worst case (every service calls
              every other). In practice, your graph is sparser, so actual storage will be lower.
            </p>
          </div>

          {/* RED metrics */}
          <div>
            <h3 className="text-white font-semibold mb-2">3. RED Metrics (Prometheus)</h3>
            <p className="mb-2">
              Data Prepper computes RED metrics per service-operation pair and pushes them
              to Prometheus via OTLP (not pull/scrape). Each operation generates multiple
              time-series: request count, error count, fault count, and a latency histogram
              (~12 bucket boundaries + _sum + _count).
            </p>
            <div className="font-mono text-xs bg-slate-950 rounded p-3 space-y-1">
              <div><span className="text-slate-500">Active series</span> = services * operations * 16 &nbsp; <span className="text-slate-600">[req + err + fault + ~12 hist + _sum + _count]</span></div>
              <div><span className="text-slate-500">Samples/month</span> = series * (30 * 24 * 3600 / 60s aggregation window)</div>
              <div><span className="text-slate-500">Storage</span> = retained_samples * 2 bytes &nbsp; <span className="text-slate-600">[Prometheus TSDB compression]</span></div>
            </div>
            <p className="mt-2 text-slate-400">
              The multiplier of 16 accounts for the actual Prometheus series produced: request_count,
              error_count, fault_count, and latency_seconds_bucket with ~12 histogram boundaries
              plus _sum and _count. Prometheus TSDB compresses samples to ~1-2 bytes each.
            </p>
          </div>

          {/* Constants */}
          <div>
            <h3 className="text-white font-semibold mb-2">Constants Used</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
              <span className="text-slate-400">Avg service map doc size</span>
              <span className="text-slate-200">104 bytes</span>
              <span className="text-slate-400">OpenSearch index overhead</span>
              <span className="text-slate-200">2.0x raw size</span>
              <span className="text-slate-400">Prometheus bytes/sample</span>
              <span className="text-slate-200">2 bytes</span>
              <span className="text-slate-400">Aggregation window (OTLP push)</span>
              <span className="text-slate-200">60 seconds</span>
              <span className="text-slate-400">Service map window</span>
              <span className="text-slate-200">180 seconds (3 min)</span>
              <span className="text-slate-400">RED series per operation</span>
              <span className="text-slate-200">16 (req + err + fault + histogram)</span>
            </div>
            <p className="mt-2 text-slate-400">
              These constants are derived from measurements on a live observability stack
              running the OpenTelemetry demo application.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function APMUsageCalculator() {
  const defaults = Object.fromEntries(
    Object.entries(sliders).map(([key, config]) => [key, config.default])
  ) as Record<SliderKey, number>;

  const [values, setValues] = useState(defaults);

  const update = (key: SliderKey) => (v: number) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const usage = useMemo(() => calculateUsage(values), [values]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Sliders */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-6">
            Workload Parameters
          </h2>
          {(Object.entries(sliders) as [SliderKey, SliderConfig][]).map(
            ([key, config]) => (
              <Slider
                key={key}
                config={config}
                value={values[key]}
                onChange={update(key)}
              />
            )
          )}
        </div>

        {/* Right: Usage Breakdown */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-6">
            Estimated Resource Consumption
          </h2>

          <Section title="Span Storage (OpenSearch)">
            <MetricRow
              label="Traces / month"
              value={formatCompact(usage.tracesPerMonth)}
              formula={`= ${formatCompact(values.spansPerMonth)} spans / ${values.spansPerTrace} spans-per-trace`}
            />
            <MetricRow
              label="Spans retained"
              value={formatCompact(usage.retainedSpans)}
              formula={`= ${formatCompact(values.spansPerMonth)} spans/mo * (${values.retentionDays} / 30) retention`}
            />
            <MetricRow
              label="Storage (with index overhead)"
              value={formatBytes(usage.spanStorageBytes)}
              formula={`= ${formatCompact(usage.retainedSpans)} retained * ${values.avgSpanSizeKB.toFixed(1)} KB * ${OPENSEARCH_INDEX_OVERHEAD}x index overhead`}
              highlight
            />
          </Section>

          <Section title="Service Map (OpenSearch)">
            <MetricRow
              label="Directed service edges"
              value={usage.edges.toString()}
              formula={`= ${values.services} * (${values.services} - 1)  [directed: A\u2192B \u2260 B\u2192A]`}
            />
            <MetricRow
              label="Docs / month"
              value={formatCompact(usage.serviceMapDocsPerMonth)}
              formula={`= ${usage.edges} edges * 480 emits/day * 30 days  [every 3 min window]`}
            />
            <MetricRow
              label="Storage"
              value={formatBytes(usage.serviceMapStorageBytes)}
              formula={`= ${formatCompact(usage.serviceMapRetainedDocs)} retained docs * 104 B * ${OPENSEARCH_INDEX_OVERHEAD}x overhead`}
              highlight
            />
          </Section>

          <Section title="RED Metrics (Prometheus)">
            <MetricRow
              label="Active time-series"
              value={formatCompact(usage.redSeries)}
              formula={`= ${values.services} services * ${values.opsPerService} ops * ${RED_SERIES_PER_OPERATION}  [req + err + fault + ~12 histogram + _sum + _count]`}
            />
            <MetricRow
              label="Samples / month"
              value={formatCompact(usage.samplesPerMonth)}
              formula={`= ${formatCompact(usage.redSeries)} series * ${formatCompact((30 * 24 * 3600) / AGGREGATION_WINDOW_SECONDS)} samples/series/mo  [60s aggregation window]`}
            />
            <MetricRow
              label="Storage"
              value={formatBytes(usage.promStorageBytes)}
              formula={`= ${formatCompact(usage.promRetainedSamples)} retained samples * 2 B/sample  [TSDB compressed]`}
              highlight
            />
          </Section>

          <Section title="Totals">
            <MetricRow
              label="OpenSearch storage"
              value={formatBytes(usage.totalOpenSearchBytes)}
              formula="= span storage + service map storage"
              highlight
            />
            <MetricRow
              label="Prometheus storage"
              value={formatBytes(usage.promStorageBytes)}
              formula="= RED metric samples * 2 bytes (TSDB)"
              highlight
            />
            <MetricRow
              label="Docs ingested / day"
              value={formatCompact(usage.totalDocsPerDay)}
              formula="= (spans/mo + service map docs/mo) / 30"
            />
            <MetricRow
              label="Avg ingest rate"
              value={`~${usage.ingestRate.toFixed(1)} docs/s`}
              formula="= docs/day / 86,400 seconds"
            />
          </Section>
        </div>
      </div>

      {/* How It Works — collapsible reference */}
      <HowItWorks />
    </div>
  );
}
