/**
 * Pure helpers for the scheduled index pattern field re-sync.
 *
 * UI init stores each index pattern's fields once, from the mapping the ingestion pipeline's
 * templates create. Fields that real telemetry adds later (gen_ai.*, resource and span attributes)
 * are mapped dynamically and never reach the stored list, so dashboards that use them fail with
 * "Could not locate that index-pattern-field" until someone refreshes the list by hand.
 */

export interface PatternField {
  name: string;
  [key: string]: unknown;
}

/**
 * Returns the stored field list extended with any live fields it lacks, or undefined when
 * nothing needs to be written. Stored entries are kept as they are, so scripted fields, custom
 * labels and popularity a user set survive; only fields missing by name are appended.
 */
export function mergeFields(stored: PatternField[], live: PatternField[]): PatternField[] | undefined {
  const known = new Set(stored.map((f) => f.name));
  const added = live.filter((f) => !known.has(f.name));
  return added.length ? [...stored, ...added] : undefined;
}

/** Parses the `fields` attribute of an index pattern saved object; malformed or missing is empty. */
export function parseStoredFields(raw: unknown): PatternField[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.name === 'string') : [];
  } catch {
    return [];
  }
}
