/** The result a custom resource handler returns; the same shape as a CDK Provider onEvent handler. */
export interface HandlerResult {
  PhysicalResourceId?: string;
  Data?: Record<string, unknown>;
}

export interface CfnEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
}

export interface LambdaContext {
  logStreamName: string;
  getRemainingTimeInMillis(): number;
}

// CloudFormation waits up to an hour for a response that never comes, so answer before Lambda times out.
const TIMEOUT_MARGIN_MS = 10_000;

/**
 * Wraps a handler so CloudFormation can invoke the function directly (ServiceToken is the function ARN)
 * and gets its response on the pre-signed ResponseURL. Templates can then inline the bundle as ZipFile.
 */
export function withCfnResponse<E>(fn: (event: E, context: LambdaContext) => Promise<HandlerResult | void>) {
  return async (event: E & CfnEvent, context: LambdaContext): Promise<void> => {
    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let reason = `See CloudWatch log stream ${context.logStreamName}`;
    let result: HandlerResult | void = undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out before the function finished')),
          Math.max(context.getRemainingTimeInMillis() - TIMEOUT_MARGIN_MS, 1000));
      });
      result = await Promise.race([fn(event, context), timeout]);
    } catch (e) {
      console.error(e);
      status = 'FAILED';
      reason = `${e instanceof Error ? e.message : String(e)}`.slice(0, 1000);
    } finally {
      clearTimeout(timer);
    }
    const body = JSON.stringify({
      Status: status,
      Reason: reason,
      // A Delete answers for the resource CloudFormation named, which after a failed Create is the log stream.
      PhysicalResourceId: (event.RequestType === 'Delete' && event.PhysicalResourceId)
        || (result?.PhysicalResourceId ?? event.PhysicalResourceId ?? context.logStreamName),
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: result?.Data,
    });
    // The pre-signed URL isn't signed for a content type, so send none.
    const resp = await fetch(event.ResponseURL, { method: 'PUT', body, headers: { 'content-type': '' } });
    if (!resp.ok) throw new Error(`ResponseURL returned ${resp.status}`);
  };
}
