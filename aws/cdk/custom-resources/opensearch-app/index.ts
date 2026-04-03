import { OpenSearchClient, CreateApplicationCommand, UpdateApplicationCommand, DeleteApplicationCommand, GetApplicationCommand, ListApplicationsCommand } from '@aws-sdk/client-opensearch';

const client = new OpenSearchClient();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitForEndpoint(appId: string, maxWaitMs = 300_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const app = await client.send(new GetApplicationCommand({ id: appId }));
    console.log('GetApplication:', JSON.stringify({ status: app.status, endpoint: app.endpoint }));
    if (app.endpoint) return app.endpoint;
    if (app.status === 'FAILED') {
      try { await client.send(new DeleteApplicationCommand({ id: appId })); } catch {}
      throw new Error(`Application ${appId} entered FAILED status`);
    }
    if (app.status === 'DELETING') throw new Error(`Application ${appId} is DELETING`);
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for application ${appId} endpoint`);
}

async function findExistingApp(name: string) {
  const list = await client.send(new ListApplicationsCommand({}));
  return list.ApplicationSummaries?.find(a => a.name === name);
}

export async function handler(event: any): Promise<any> {
  const requestType = event.RequestType;
  const { AppName, DomainDataSource, DqsDataSource } = event.ResourceProperties;

  if (requestType === 'Create' || requestType === 'Update') {
    // Clean up any leftover app
    const existing = await findExistingApp(AppName);
    if (existing) {
      const detail = await client.send(new GetApplicationCommand({ id: existing.id }));
      if (detail.status === 'ACTIVE' && detail.endpoint) {
        return { PhysicalResourceId: existing.id, Data: { AppId: existing.id, AppEndpoint: detail.endpoint } };
      }
      console.log(`Deleting existing app ${existing.id} (status: ${detail.status})`);
      try { await client.send(new DeleteApplicationCommand({ id: existing.id })); } catch {}
      for (let i = 0; i < 30; i++) {
        await sleep(5000);
        if (!(await findExistingApp(AppName))) break;
      }
    }

    // Create with domain only (DQS causes FAILED status if included at creation)
    let appId: string | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const resp = await client.send(new CreateApplicationCommand({
          name: AppName,
          dataSources: [{ dataSourceArn: DomainDataSource }],
          appConfigs: [
            { key: 'opensearchDashboards.dashboardAdmin.users', value: JSON.stringify(['*']) },
            { key: 'opensearchDashboards.dashboardAdmin.groups', value: JSON.stringify(['*']) },
          ],
          iamIdentityCenterOptions: { enabled: false },
        }));
        console.log('CreateApplication response:', JSON.stringify(resp));
        appId = resp.id;
        break;
      } catch (e: any) {
        if (e.name === 'ConflictException' || e.message?.includes('already exists')) {
          const found = await findExistingApp(AppName);
          if (found) { appId = found.id; break; }
          console.log(`Conflict on attempt ${attempt + 1}, retrying in 10s...`);
          await sleep(10000);
          continue;
        }
        throw e;
      }
    }

    const endpoint = await waitForEndpoint(appId!);

    // Now add DQS data source via update
    if (DqsDataSource) {
      try {
        await client.send(new UpdateApplicationCommand({
          id: appId,
          dataSources: [
            { dataSourceArn: DomainDataSource },
            { dataSourceArn: DqsDataSource },
          ],
        }));
        console.log('DQS data source associated');
      } catch (e: any) {
        console.log(`Warning: could not add DQS data source: ${e.message}`);
      }
    }

    return { PhysicalResourceId: appId, Data: { AppId: appId, AppEndpoint: endpoint } };
  }

  if (requestType === 'Delete') {
    const appId = event.PhysicalResourceId;
    if (!appId || appId === 'NONE') return { PhysicalResourceId: appId };
    try {
      await client.send(new DeleteApplicationCommand({ id: appId }));
    } catch (e: any) {
      if (e.name === 'ResourceNotFoundException' || e.message?.includes('not found')) return;
      throw e;
    }
  }

  return { PhysicalResourceId: event.PhysicalResourceId };
}
