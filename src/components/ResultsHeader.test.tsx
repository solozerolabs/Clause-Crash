// @vitest-environment jsdom
import type {ComponentProps} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {AnimatedScore} from './AnimatedScore';
import {ResultsHeader} from './ResultsHeader';

function renderHeader(overrides: Partial<ComponentProps<typeof ResultsHeader>> = {}) {
  const props = {
    currentScore: 72,
    majorCount: 2,
    majorHighCount: 1,
    majorLowCount: 1,
    minorCount: 1,
    minorHighCount: 1,
    minorLowCount: 0,
    casesRun: 500,
    handleFixAll: vi.fn(),
    copyFixedDocument: vi.fn(),
    resetAnalysis: vi.fn(),
    handleSaveAnalysis: vi.fn(),
    ...overrides,
  };
  render(<ResultsHeader {...props} />);
  return props;
}

describe('ResultsHeader', () => {
  it('shows the score, case count and pluralised risk counts', () => {
    renderHeader();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('500 CASES')).toBeInTheDocument();
    expect(screen.getByText('2 MAJOR RISKS')).toBeInTheDocument();
    expect(screen.getByText('1 MINOR RISK')).toBeInTheDocument();
  });

  it('uses singular and plural labels the other way round', () => {
    renderHeader({majorCount: 1, minorCount: 0});
    expect(screen.getByText('1 MAJOR RISK')).toBeInTheDocument();
    expect(screen.getByText('0 MINOR RISKS')).toBeInTheDocument();
  });

  it('offers Fix All below a perfect score and wires the action buttons', () => {
    const props = renderHeader();
    expect(screen.queryByRole('button', {name: /copy fixed/i})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Fix All'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    fireEvent.click(screen.getByRole('button', {name: 'Back'}));
    expect(props.handleFixAll).toHaveBeenCalledTimes(1);
    expect(props.handleSaveAnalysis).toHaveBeenCalledTimes(1);
    expect(props.resetAnalysis).toHaveBeenCalledTimes(1);
    expect(props.copyFixedDocument).not.toHaveBeenCalled();
  });

  it('offers Copy fixed instead of Fix All at a perfect score', () => {
    const props = renderHeader({currentScore: 100});
    expect(screen.queryByRole('button', {name: 'Fix All'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /copy fixed/i}));
    expect(props.copyFixedDocument).toHaveBeenCalledTimes(1);
    expect(props.handleFixAll).not.toHaveBeenCalled();
  });
});

describe('AnimatedScore', () => {
  it('renders its initial value immediately', () => {
    const {container} = render(<AnimatedScore value={42} />);
    expect(container.textContent).toBe('42');
  });
});
