import { OpenSearchClient, AddDirectQueryDataSourceCommand, DeleteDirectQueryDataSourceCommand, GetDirectQueryDataSourceCommand } from '@aws-sdk/client-opensearch';

const client = new OpenSearchClient();

export async function handler(event: any): Promise<any> {
  const { DataSourceName, DataSourceType, Description } = event.ResourceProperties;
  const requestType = event.RequestType;

  if (requestType === 'Create' || requestType === 'Update') {
    try {
      const resp = await client.send(new AddDirectQueryDataSourceCommand({
        DataSourceName,
        DataSourceType: {
          Prometheus: DataSourceType.Prometheus,
        },
        Description,
      }));
      return { PhysicalResourceId: DataSourceName, Data: { DataSourceArn: resp.DataSourceArn } };
    } catch (e: any) {
      if (e.name === 'ConflictException' || e.message?.includes('already exists')) {
        // Idempotent — fetch existing
        const existing = await client.send(new GetDirectQueryDataSourceCommand({ DataSourceName }));
        return { PhysicalResourceId: DataSourceName, Data: { DataSourceArn: existing.DataSourceArn } };
      }
      throw e;
    }
  }

  if (requestType === 'Delete') {
    try {
      await client.send(new DeleteDirectQueryDataSourceCommand({ DataSourceName: event.PhysicalResourceId }));
    } catch (e: any) {
      if (e.name === 'ResourceNotFoundException' || e.message?.includes('not found')) return;
      throw e;
    }
  }

  return { PhysicalResourceId: event.PhysicalResourceId };
}
