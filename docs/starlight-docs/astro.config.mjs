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
			},
			sidebar: [
				{
					label: 'Overview',
					link: '/',
				},
				{
					label: 'Get Started',
					collapsed: true,
					autogenerate: { directory: 'get-started' },
				},
				{
					label: 'Send Data',
					collapsed: true,
					autogenerate: { directory: 'send-data' },
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
					autogenerate: { directory: 'ai-observability' },
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
				{
					label: 'SDKs & API',
					collapsed: true,
					autogenerate: { directory: 'sdks' },
				},
			],
		}),
	],
});
