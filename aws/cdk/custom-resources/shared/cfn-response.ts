import { AsyncLocalStorage } from 'node:async_hooks';

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

/** The physical ID of a resource whose Create failed. Its Delete has nothing to remove, so the handler doesn't run. */
export const CREATE_FAILED_ID = 'obs-stack::create-failed';

const invocation = new AsyncLocalStorage<AbortSignal>();

/**
 * Aborted once the running invocation has answered CloudFormation. Pass it to fetch: a handler that timed out
 * resumes in a later invocation of the same container, and its requests then fail instead of running again.
 */
export function invocationSignal(): AbortSignal | undefined {
  return invocation.getStore();
}

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
    const controller = new AbortController();
    if (!(event.RequestType === 'Delete' && event.PhysicalResourceId === CREATE_FAILED_ID)) {
      try {
        const run = invocation.run(controller.signal, () => fn(event, context));
        run.catch(() => {}); // still running after a timeout; its rejection must not end the runtime
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out before the function finished')),
            Math.max(context.getRemainingTimeInMillis() - TIMEOUT_MARGIN_MS, 1000));
        });
        result = await Promise.race([run, timeout]);
      } catch (e) {
        console.error(e);
        status = 'FAILED';
        reason = `${e instanceof Error ? e.message : String(e)}`.slice(0, 1000);
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    const failedCreate = status === 'FAILED' && event.RequestType === 'Create';
    const body = JSON.stringify({
      Status: status,
      Reason: reason,
      // A Delete answers for the resource CloudFormation named.
      PhysicalResourceId: failedCreate ? CREATE_FAILED_ID
        : (event.RequestType === 'Delete' && event.PhysicalResourceId)
          || (result?.PhysicalResourceId ?? event.PhysicalResourceId ?? context.logStreamName),
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: result?.Data,
    });
    await sendResponse(event.ResponseURL, body);
  };
}

/** PUTs the response, retrying: if it never arrives, CloudFormation waits an hour. */
export async function sendResponse(url: string, body: string, attempts = 5, delayMs = 500) {
  for (let i = 1; ; i++) {
    // The pre-signed URL isn't signed for a content type, so send none.
    const resp = await fetch(url, { method: 'PUT', body, headers: { 'content-type': '' } }).catch((e: Error) => e);
    if (!(resp instanceof Error) && resp.ok) return;
    const why = resp instanceof Error ? resp.message : `status ${resp.status}`;
    if (i >= attempts) throw new Error(`ResponseURL failed after ${attempts} attempts: ${why}`);
    console.warn(`ResponseURL attempt ${i} failed: ${why}`);
    await new Promise((r) => setTimeout(r, delayMs * i));
  }
}
