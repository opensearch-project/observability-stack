import { createHash } from 'crypto';

/** OSIS pipeline names: 3 to 28 characters, lowercase letters, digits and hyphens. */
export const MAX_PIPELINE_NAME_LENGTH = 28;
const HASH_LENGTH = 6;

/**
 * The OSIS pipeline name for a stack: `obs-stack-<stack name>`, lowercased with other
 * characters turned into hyphens. When that fits it is used as is, so existing deployments keep
 * their pipeline. When it is too long, a cut stem plus a short hash of the full stack name keeps
 * names from different stacks (prefixes) apart instead of cutting them to the same 28 characters.
 */
export function pipelineNameFor(stackName: string): string {
  const full = `obs-stack-${stackName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (full.length <= MAX_PIPELINE_NAME_LENGTH) return full;
  const hash = createHash('sha256').update(stackName).digest('hex').slice(0, HASH_LENGTH);
  const stem = full.slice(0, MAX_PIPELINE_NAME_LENGTH - HASH_LENGTH - 1).replace(/-+$/, '');
  return `${stem}-${hash}`;
}
