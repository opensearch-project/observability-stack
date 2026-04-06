import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import APMUsageCalculator, { calculateUsage } from './APMUsageCalculator';

const defaults = {
  spansPerMonth: 10_000_000,
  avgSpanSizeKB: 0.5,
  spansPerTrace: 8,
  services: 10,
  opsPerService: 5,
  retentionDays: 15,
};

describe('calculateUsage', () => {
  it('computes traces from spans and spans-per-trace', () => {
    const result = calculateUsage(defaults);
    expect(result.tracesPerMonth).toBe(10_000_000 / 8);
  });

  it('computes retained spans based on retention', () => {
    const result = calculateUsage(defaults);
    expect(result.retainedSpans).toBe(10_000_000 * (15 / 30));
  });

  it('computes span storage in bytes with index overhead', () => {
    const result = calculateUsage(defaults);
    const rawBytes = 10_000_000 * (15 / 30) * 0.5 * 1024;
    expect(result.spanStorageBytes).toBe(rawBytes * 2.0);
  });

  it('computes directed service map edges as n*(n-1)', () => {
    const result = calculateUsage(defaults);
    expect(result.edges).toBe(10 * 9);
  });

  it('computes 0 edges for 1 service', () => {
    const result = calculateUsage({ ...defaults, services: 1 });
    expect(result.edges).toBe(0);
  });

  it('computes RED series as services * ops * 16', () => {
    const result = calculateUsage(defaults);
    expect(result.redSeries).toBe(10 * 5 * 16);
  });

  it('computes prometheus samples per month', () => {
    const result = calculateUsage(defaults);
    const redSeries = 10 * 5 * 16;
    const samplesPerSeriesPerMonth = (30 * 24 * 3600) / 60;
    expect(result.samplesPerMonth).toBe(redSeries * samplesPerSeriesPerMonth);
  });

  it('scales storage linearly with retention', () => {
    const r15 = calculateUsage({ ...defaults, retentionDays: 15 });
    const r30 = calculateUsage({ ...defaults, retentionDays: 30 });
    expect(r30.spanStorageBytes).toBe(r15.spanStorageBytes * 2);
  });

  it('ingest rate is positive', () => {
    const result = calculateUsage(defaults);
    expect(result.ingestRate).toBeGreaterThan(0);
  });
});

describe('APMUsageCalculator component', () => {
  it('renders slider labels', () => {
    render(<APMUsageCalculator />);
    expect(screen.getByText('Spans ingested / month')).toBeTruthy();
    expect(screen.getByText('Avg span payload size')).toBeTruthy();
    expect(screen.getByText('Number of services')).toBeTruthy();
    expect(screen.getByText('Retention period')).toBeTruthy();
  });

  it('renders usage sections', () => {
    render(<APMUsageCalculator />);
    expect(screen.getByText('Span Storage (OpenSearch)')).toBeTruthy();
    expect(screen.getByText('Service Map (OpenSearch)')).toBeTruthy();
    expect(screen.getByText('RED Metrics (Prometheus)')).toBeTruthy();
    expect(screen.getByText('Totals')).toBeTruthy();
  });
});
