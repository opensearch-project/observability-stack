// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import starlightLinksValidator from 'starlight-links-validator';

// https://astro.build/config
export default defineConfig({
	site: 'https://observability.opensearch.org',
	base: '/docs',
	redirects: {
		'/get-started': '/get-started/installation/',
		'/sdks/python': '/send-data/ai-agents/python/',
		'/sdks/javascript': '/send-data/ai-agents/typescript/',
		'/sdks/python-experiments': '/ai-observability/evaluation/',
		'/sdks/python-retrieval': '/ai-observability/evaluation/',
		'/sdks/faq': '/ai-observability/getting-started/',
		'/sdks': '/send-data/ai-agents/',
		'/send-data/ai-agents/javascript': '/send-data/ai-agents/typescript/',
	},
	integrations: [
		mermaid({
			autoTheme: true,
		}),
		starlight({
			title: 'OpenSearch - Observability Stack',
			head: [
				{
					tag: 'script',
					attrs: {
						async: true,
						src: 'https://www.googletagmanager.com/gtag/js?id=G-BQV14XK08F',
					},
				},
				{
					tag: 'script',
					content: `
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'G-BQV14XK08F');
					`,
				},
			],
			plugins: [starlightLinksValidator({
				errorOnLocalLinks: false,
			})],
			logo: {
				src: './src/assets/opensearch-logo-darkmode.svg',
			},
			editLink: {
				baseUrl: 'https://github.com/opensearch-project/observability-stack/edit/main/docs/starlight-docs/',
			},
			customCss: [
				'./src/styles/custom.css',
			],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/opensearch-project/observability-stack' }],
			components: {
				Header: './src/components/CustomHeader.astro',
				PageSidebar: './src/components/PageSidebar.astro',
				Sidebar: './src/components/Sidebar.astro',
			},
			sidebar: [
				{
					label: 'Overview',
					link: '/',
				},
				{
					label: 'Get Started',
					collapsed: true,
					items: [
						{ label: 'Installation', link: '/get-started/installation/' },
						{ label: 'Platform Overview', link: '/get-started/overview/' },
						{ label: 'Core Concepts', link: '/get-started/core-concepts/' },
						{
							label: 'Quickstart',
							items: [
								{ label: 'Ingest Your First Traces', link: '/get-started/quickstart/first-traces/' },
								{ label: 'Create Your First Dashboard', link: '/get-started/quickstart/first-dashboard/' },
							],
						},
					],
				},
				{
					label: 'Send Data',
					collapsed: true,
					items: [
						{ label: 'Overview', link: '/send-data/' },
						{
							label: 'OpenTelemetry',
							autogenerate: { directory: 'send-data/opentelemetry' },
						},
						{
							label: 'Applications',
							autogenerate: { directory: 'send-data/applications' },
						},
						{
							label: 'Infrastructure',
							autogenerate: { directory: 'send-data/infrastructure' },
						},
						{
							label: 'Data Pipeline',
							autogenerate: { directory: 'send-data/data-pipeline' },
						},
					],
				},
				{
					label: 'PPL - Query Language',
					collapsed: true,
					items: [
						{ label: 'Overview', link: '/ppl/' },
						{ label: 'Command Reference', link: '/ppl/commands/' },
						{
							label: 'Search & Filter',
							collapsed: true,
							items: [
								{ label: 'search', link: '/ppl/commands/search/' },
								{ label: 'where', link: '/ppl/commands/where/' },
							],
						},
						{
							label: 'Fields & Transformation',
							collapsed: true,
							items: [
								{ label: 'fields', link: '/ppl/commands/fields/' },
								{ label: 'eval', link: '/ppl/commands/eval/' },
								{ label: 'rename', link: '/ppl/commands/rename/' },
								{ label: 'fillnull', link: '/ppl/commands/fillnull/' },
								{ label: 'expand', link: '/ppl/commands/expand/' },
								{ label: 'flatten', link: '/ppl/commands/flatten/' },
							],
						},
						{
							label: 'Aggregation & Statistics',
							collapsed: true,
							items: [
								{ label: 'stats', link: '/ppl/commands/stats/' },
								{ label: 'eventstats', link: '/ppl/commands/eventstats/' },
								{ label: 'streamstats', link: '/ppl/commands/streamstats/' },
								{ label: 'timechart', link: '/ppl/commands/timechart/' },
								{ label: 'trendline', link: '/ppl/commands/trendline/' },
							],
						},
						{
							label: 'Sorting & Limiting',
							collapsed: true,
							items: [
								{ label: 'sort', link: '/ppl/commands/sort/' },
								{ label: 'head', link: '/ppl/commands/head/' },
								{ label: 'dedup', link: '/ppl/commands/dedup/' },
								{ label: 'top', link: '/ppl/commands/top/' },
								{ label: 'rare', link: '/ppl/commands/rare/' },
							],
						},
						{
							label: 'Text Extraction',
							collapsed: true,
							items: [
								{ label: 'parse', link: '/ppl/commands/parse/' },
								{ label: 'grok', link: '/ppl/commands/grok/' },
								{ label: 'rex', link: '/ppl/commands/rex/' },
								{ label: 'patterns', link: '/ppl/commands/patterns/' },
								{ label: 'spath', link: '/ppl/commands/spath/' },
							],
						},
						{
							label: 'Data Combination',
							collapsed: true,
							items: [
								{ label: 'join', link: '/ppl/commands/join/' },
								{ label: 'lookup', link: '/ppl/commands/lookup/' },
							],
						},
						{
							label: 'Machine Learning',
							collapsed: true,
							items: [
								{ label: 'ml', link: '/ppl/commands/ml/' },
							],
						},
						{
							label: 'Metadata',
							collapsed: true,
							items: [
								{ label: 'describe', link: '/ppl/commands/describe/' },
							],
						},
						{ label: 'Function Reference', link: '/ppl/functions/' },
						{ label: 'Observability Examples', link: '/ppl/examples/' },
					],
				},
				{
					label: 'Discover',
					collapsed: true,
					autogenerate: { directory: 'investigate' },
				},
				{
					label: 'Agent Observability',
					collapsed: true,
					items: [
						{ label: 'Overview', link: '/ai-observability/' },
						{ label: 'Getting Started', link: '/ai-observability/getting-started/' },
						{ label: 'Framework Integrations', link: '/send-data/ai-agents/integrations/' },
						{ label: 'Agent Tracing', link: '/ai-observability/agent-tracing/' },
						{ label: 'Agent Graph & Path', link: '/ai-observability/agent-tracing/graph/' },
						{ label: 'Evaluation & Scoring', link: '/ai-observability/evaluation/' },
						{ label: 'Evaluation Integrations', link: '/ai-observability/evaluation-integrations/' },
					],
				},
				{
					label: 'Application Monitoring',
					collapsed: true,
					autogenerate: { directory: 'apm' },
				},
				{
					label: 'Dashboards & Visualize',
					collapsed: true,
					autogenerate: { directory: 'dashboards' },
				},
				{
					label: 'Alerting',
					collapsed: true,
					items: [
						{ label: 'Alerting', link: '/alerting/' },
						{ label: 'Anomaly Detection', link: '/anomaly-detection/' },
						{ label: 'Forecasting', link: '/forecasting/' },
					],
				},
				{
					label: 'Agent Health',
					collapsed: true,
					autogenerate: { directory: 'agent-health' },
				},
				{
					label: 'SDKs, MCP & Clients',
					collapsed: true,
					items: [
						{ label: 'Python SDK', link: '/send-data/ai-agents/python/' },
						{ label: 'TypeScript SDK', link: '/send-data/ai-agents/typescript/' },
						{ label: 'MCP Server', link: '/mcp/' },
					],
				},
				{
					label: 'Claude Code',
					collapsed: true,
					autogenerate: { directory: 'claude-code' },
				},
			],
		}),
	],
});
