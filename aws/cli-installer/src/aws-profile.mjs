/**
 * Select the shared AWS configuration profile used by AWS clients and SigV4
 * signers through the SDK default credential chain.
 */
export function configureAwsProfile(profile) {
  const normalized = profile?.trim() || '';
  if (normalized) process.env.AWS_PROFILE = normalized;
  return normalized;
}

/**
 * Return the profile already selected through the standard AWS environment.
 */
export function environmentAwsProfile() {
  return process.env.AWS_PROFILE || process.env.AWS_DEFAULT_PROFILE || '';
}
