// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://anirudha.github.io',
	base: '/opensearch-agentops-website/docs',
	integrations: [
		starlight({
			title: 'OpenSearch - Observability Stack',
			logo: {
				src: './src/assets/opensearch-logo-darkmode.svg',
			},
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/anirudha/opensearch-agentops-website' }],
			components: {
				Header: './src/components/CustomHeader.astro',
			},
			sidebar: [
				{
					label: '🚀 Get Started',
					autogenerate: { directory: 'get-started' },
				},
				{
					label: '📡 Send Data',
					autogenerate: { directory: 'send-data' },
				},
				{
					label: '🔍 Investigate',
					autogenerate: { directory: 'investigate' },
				},
				{
					label: '🗺️ Service Map & APM',
					autogenerate: { directory: 'apm' },
				},
				{
					label: '📊 Dashboards & Visualize',
					autogenerate: { directory: 'dashboards' },
				},
				{
					label: '🔔 Alerts & Notifications',
					autogenerate: { directory: 'alerts' },
				},
				{
					label: '🎯 SLOs & SLIs',
					autogenerate: { directory: 'slos' },
				},
				{
					label: '📋 Logs',
					autogenerate: { directory: 'logs' },
				},
				{
					label: '📈 Metrics',
					autogenerate: { directory: 'metrics' },
				},
				{
					label: '🔗 Traces',
					autogenerate: { directory: 'traces' },
				},
				{
					label: '🤖 AI Observability',
					autogenerate: { directory: 'ai-observability' },
				},
				{
					label: '🔌 Integrations',
					autogenerate: { directory: 'integrations' },
				},
				{
					label: '📦 SDKs & API',
					autogenerate: { directory: 'sdks' },
				},
				{
					label: '⚙️ Configure',
					autogenerate: { directory: 'configure' },
				},
			],
		}),
	],
});
