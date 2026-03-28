import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CyclingTagline } from './CyclingTagline';

describe('CyclingTagline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the first tagline initially', () => {
    render(<CyclingTagline />);
    expect(screen.getByText('Traces')).toBeInTheDocument();
    expect(screen.getByText(/Distributed tracing with auto-generated service maps/)).toBeInTheDocument();
  });

  it('should have cycling functionality with timers', () => {
    const { container } = render(<CyclingTagline />);
    
    // Initial state - first tagline should be visible
    expect(container.querySelector('.text-cyan-400')).toBeInTheDocument();
    
    // Component should set up interval
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('should apply correct color classes', () => {
    const { container } = render(<CyclingTagline />);
    const labelElement = container.querySelector('.text-cyan-400');
    expect(labelElement).toBeInTheDocument();
  });
});
