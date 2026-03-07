// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
	site: 'https://observability.opensearch.org',
	base: '/docs',
	integrations: [
		mermaid({
			autoTheme: true,
		}),
		starlight({
			title: 'OpenSearch - Observability Stack',
			logo: {
				src: './src/assets/opensearch-logo-darkmode.svg',
			},
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/opensearch-project/observability-stack' }],
			components: {
				Header: './src/components/CustomHeader.astro',
			},
			sidebar: [
				{
					label: 'Get Started',
					autogenerate: { directory: 'get-started' },
				},
				{
					label: 'Send Data',
					autogenerate: { directory: 'send-data' },
				},
				{
					label: 'Investigate',
					autogenerate: { directory: 'investigate' },
				},
				{
					label: 'Application Monitoring',
					autogenerate: { directory: 'apm' },
				},
				{
					label: 'Dashboards & Visualize',
					autogenerate: { directory: 'dashboards' },
				},
				{
					label: 'AI Observability',
					autogenerate: { directory: 'ai-observability' },
				},
				{
					label: 'MCP Server',
					autogenerate: { directory: 'mcp' },
				},
				{
					label: 'Alerting',
					autogenerate: { directory: 'alerting' },
				},
				{
					label: 'Anomaly Detection',
					autogenerate: { directory: 'anomaly-detection' },
				},
				{
					label: 'Forecasting',
					autogenerate: { directory: 'forecasting' },
				},
				{
					label: 'SDKs & API',
					autogenerate: { directory: 'sdks' },
				},
			],
		}),
	],
});
