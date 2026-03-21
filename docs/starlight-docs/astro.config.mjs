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
							label: 'AI Agents',
							items: [
								{ label: 'Overview', link: '/send-data/ai-agents/' },
								{ label: 'Python SDK', link: '/send-data/ai-agents/python/' },
								{ label: 'Integrations', link: '/send-data/ai-agents/integrations/' },
								{ label: 'TypeScript SDK', link: '/send-data/ai-agents/typescript/' },
							],
						},
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
					label: 'Investigate',
					collapsed: true,
					autogenerate: { directory: 'investigate' },
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
					label: 'AI Observability',
					collapsed: true,
					items: [
						{ label: 'Overview', link: '/ai-observability/' },
						{ label: 'Getting Started', link: '/ai-observability/getting-started/' },
						{ label: 'Agent Tracing', link: '/ai-observability/agent-tracing/' },
						{ label: 'Agent Graph & Path', link: '/ai-observability/agent-tracing/graph/' },
						{ label: 'Evaluation & Scoring', link: '/ai-observability/evaluation/' },
					],
				},
				{
					label: 'Agent Health',
					collapsed: true,
					autogenerate: { directory: 'agent-health' },
				},
				{
					label: 'MCP Server',
					collapsed: true,
					autogenerate: { directory: 'mcp' },
				},
				{
					label: 'Alerting',
					collapsed: true,
					autogenerate: { directory: 'alerting' },
				},
				{
					label: 'Anomaly Detection',
					collapsed: true,
					autogenerate: { directory: 'anomaly-detection' },
				},
				{
					label: 'Forecasting',
					collapsed: true,
					autogenerate: { directory: 'forecasting' },
				},
			],
		}),
	],
});
