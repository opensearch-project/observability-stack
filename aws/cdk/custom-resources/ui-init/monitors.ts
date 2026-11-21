/**
 * Alerting monitors: the definitions docker-compose and Helm create with init-stack-monitors.py and
 * init-otel-demo-monitors.py, created through the OpenSearch UI alerting API so they work on every backend.
 */

type Request = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; data: any }>;

/** Stack health: fires when the cluster is red (yellow is normal on a single-node domain). */
function stackMonitors(): Record<string, unknown>[] {
  return [{
    type: 'monitor',
    name: 'Observability Stack - Cluster Health Red',
    monitor_type: 'cluster_metrics_monitor',
    enabled: true,
    schedule: { period: { interval: 1, unit: 'MINUTES' } },
    inputs: [{ uri: { api_type: 'CLUSTER_HEALTH', path: '/_cluster/health', path_params: '', url: '' } }],
    triggers: [{
      query_level_trigger: {
        name: 'Cluster health is red',
        severity: '1',
        condition: { script: { source: "ctx.results != null && ctx.results.length > 0 && ctx.results[0].status == 'red'", lang: 'painless' } },
        actions: [],
      },
    }],
  }];
}

/** OpenTelemetry Demo services. `spans` and `logs` are the index expressions to query. */
function demoMonitors(spans: string, logs: string): Record<string, unknown>[] {
  const spanCount = (service: string) =>
    `source=${spans} | where serviceName='${service}' and endTime >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) | stats count() as cnt`;
  const ppl = (name: string, query: string, trigger: string, severity: string) => ({
    type: 'monitor',
    name,
    monitor_type: 'ppl_monitor',
    enabled: true,
    schedule: { period: { interval: 1, unit: 'MINUTES' } },
    inputs: [{ ppl_input: { query, query_language: 'ppl' } }],
    triggers: [{ ppl_trigger: { name: trigger, severity, type: 'custom', custom_condition: 'where cnt > 0', actions: [] } }],
  });
  return [
    ppl('OTel Demo - Checkout Errors', spanCount('checkout'), 'Checkout traces detected', '1'),
    {
      type: 'monitor',
      name: 'OTel Demo - Payment Failures',
      monitor_type: 'query_level_monitor',
      enabled: true,
      schedule: { period: { interval: 1, unit: 'MINUTES' } },
      inputs: [{
        search: {
          indices: [spans],
          query: { size: 0, query: { bool: { filter: [{ range: { endTime: { gte: 'now-10m' } } }, { term: { serviceName: 'payment' } }] } } },
        },
      }],
      triggers: [{
        query_level_trigger: {
          name: 'Payment traces detected',
          severity: '1',
          condition: { script: { source: 'ctx.results[0].hits.total.value > 0', lang: 'painless' } },
          actions: [],
        },
      }],
    },
    ppl('OTel Demo - Frontend Error Logs', `source=${logs} | where time >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) | stats count() as cnt`,
      'Log volume exceeds threshold', '2'),
    ppl('OTel Demo - Slow Frontend Responses', spanCount('frontend'), 'Frontend request volume detected', '3'),
    ppl('OTel Demo - Cart Service Errors', spanCount('cart'), 'Cart traces detected', '2'),
  ];
}

/**
 * The monitors for a stack. Serverless collections need exact index names; patterns match nothing there.
 */
export function monitorDefinitions(opts: { demo: boolean; exactIndexNames: boolean }): Record<string, unknown>[] {
  const spans = opts.exactIndexNames ? 'otel-v1-apm-span' : 'otel-v1-apm-span*';
  const logs = opts.exactIndexNames ? 'logs-otel-v1' : 'logs-otel-v1*';
  return [...stackMonitors(), ...(opts.demo ? demoMonitors(spans, logs) : [])];
}

/**
 * Creates each monitor that doesn't exist yet. A monitor the backend rejects (for example cluster health on
 * serverless) is skipped. Returns one line per monitor for the AlertMonitors output.
 */
export async function ensureMonitors(request: Request, dataSourceId: string | undefined, monitors: Record<string, unknown>[]) {
  const ds = dataSourceId ? `&dataSourceId=${dataSourceId}` : '';
  const results: string[] = [];
  for (const monitor of monitors) {
    const name = String(monitor.name);
    const list = await request('GET', `/api/alerting/monitors?from=0&size=50&search=${encodeURIComponent(name)}&sortField=name&sortDirection=asc&state=all${ds}`);
    if ((list.data?.monitors ?? []).some((m: any) => m.name === name)) {
      results.push(`${name}: exists`);
      continue;
    }
    // The route answers 200 with ok:false when the backend rejects the monitor.
    const created = await request('POST', `/api/alerting/monitors?${ds.slice(1)}`, monitor);
    if (created.status === 200 && created.data?.ok) {
      results.push(`${name}: created`);
    } else {
      const reason = String(created.data?.resp ?? created.data?.message ?? created.status).slice(0, 120);
      console.warn(`Monitor ${name} skipped: ${reason}`);
      results.push(`${name}: skipped (${reason})`);
    }
  }
  return results.join('; ');
}
