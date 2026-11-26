/** OTLP/HTTP JSON payloads the end-to-end test sends: logs, spans with events and links, and a gauge. */

export const SPANS = 20;
/** Spans 0-4 carry span events (one an exception with a long stack trace); spans 5-9 carry links. */
export const SPANS_WITH_EVENTS = 5;

const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');
const resource = (service: string) => ({ attributes: [{ key: 'service.name', value: { stringValue: service } }] });

export function otlpLogs(service: string, nowNanos: bigint) {
  const logRecords = Array.from({ length: SPANS }, (_, i) => ({
    timeUnixNano: String(nowNanos + BigInt(i)),
    severityText: 'INFO',
    body: { stringValue: `e2e log ${i}` },
    traceId: hex(i + 1, 32),
    spanId: hex(i + 1, 16),
  }));
  return { resourceLogs: [{ resource: resource(service), scopeLogs: [{ logRecords }] }] };
}

export function otlpSpans(service: string, nowNanos: bigint) {
  const spans = Array.from({ length: SPANS }, (_, i) => {
    const start = nowNanos + BigInt(i) * 1_000_000n;
    const span: Record<string, unknown> = {
      traceId: hex(i + 1, 32), spanId: hex(i + 1, 16), name: `e2e-op-${i}`, kind: 2,
      startTimeUnixNano: String(start), endTimeUnixNano: String(start + 5_000_000n), status: {},
    };
    if (i < SPANS_WITH_EVENTS) {
      span.events = [
        { timeUnixNano: String(start + 1000n), name: 'cache.miss', attributes: [{ key: 'key', value: { stringValue: `k${i}` } }] },
        { timeUnixNano: String(start + 2000n), name: 'exception', attributes: [
          { key: 'exception.type', value: { stringValue: 'TimeoutError' } },
          { key: 'exception.stacktrace', value: { stringValue: `Traceback\n${'  at frame\n'.repeat(400)}` } },
        ] },
      ];
    } else if (i < 2 * SPANS_WITH_EVENTS) {
      span.links = [0, 1].map((n) => ({ traceId: hex(100 + i, 32), spanId: hex(200 + n, 16), attributes: [] }));
    }
    return span;
  });
  return { resourceSpans: [{ resource: resource(service), scopeSpans: [{ spans }] }] };
}

export function otlpMetrics(service: string, nowNanos: bigint) {
  const dataPoints = [{ asDouble: 1, timeUnixNano: String(nowNanos) }];
  return { resourceMetrics: [{ resource: resource(service), scopeMetrics: [{ metrics: [{ name: 'e2e_check_value', gauge: { dataPoints } }] }] }] };
}
