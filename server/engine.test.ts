import {describe, expect, it} from 'vitest';
import {
  detectDefects,
  enrichDimensions,
  generateSyntheticCases,
  getDimensionValues,
  mulberry32,
  runEvaluation,
  stripHtml,
} from './engine';

describe('mulberry32', () => {
  it('is deterministic for a fixed seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({length: 20}, () => a());
    const seqB = Array.from({length: 20}, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA[0]).toBeCloseTo(0.6011037519201636, 12);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(7)()).not.toBe(seqA[0]);
  });
});

describe('getDimensionValues', () => {
  it('sweeps each numeric boundary at n-1, n, n+1 without duplicates', () => {
    expect(getDimensionValues({kind: 'numeric', values: ['50']})).toEqual(['49', '50', '51']);
    expect(getDimensionValues({kind: 'numeric', values: ['10'], range: ['11']})).toEqual([
      '9',
      '10',
      '11',
      '12',
    ]);
  });

  it('falls back to defaults when a numeric dimension has no numbers', () => {
    expect(getDimensionValues({kind: 'numeric', values: ['many']})).toEqual([
      '0',
      '5',
      '10',
      '11',
      '50',
      '100',
    ]);
  });

  it('falls back to defaults for empty datetime and categorical dimensions', () => {
    expect(getDimensionValues({kind: 'datetime'})).toEqual([
      '2026-01-01T00:00:00Z',
      '2026-07-17T00:00:00Z',
    ]);
    expect(getDimensionValues({kind: 'categorical', values: []})).toEqual(['default']);
  });

  it('deduplicates categorical values from values and range', () => {
    expect(
      getDimensionValues({kind: 'categorical', values: ['pro', 'free'], range: ['pro']}),
    ).toEqual(['pro', 'free']);
  });
});

describe('enrichDimensions', () => {
  it('adds a numeric dimension for an unknown numeric threshold', () => {
    const dims = enrichDimensions([], [{dimension: ' seats ', thresholdValue: '10'}], []);
    expect(dims).toEqual([{name: 'seats', kind: 'numeric', values: ['10'], range: ['10']}]);
  });

  it('adds a datetime dimension for a date-like threshold', () => {
    const dims = enrichDimensions([], [{dimension: 'deadline', thresholdValue: '2026-03-01'}], []);
    expect(dims[0].kind).toBe('datetime');
  });

  it('matches existing dimensions case-insensitively without duplicating values', () => {
    const existing = [{name: 'Seats', kind: 'numeric', values: ['10'], range: ['10']}];
    const dims = enrichDimensions(
      existing,
      [
        {dimension: 'seats', thresholdValue: '10'},
        {dimension: 'SEATS', thresholdValue: '25'},
      ],
      [],
    );
    expect(dims).toHaveLength(1);
    expect(dims[0].values).toEqual(['10', '25']);
    expect(dims[0].range).toEqual(['10', '25']);
  });

  it('ignores thresholds missing a dimension or value', () => {
    expect(enrichDimensions([], [{dimension: 'x'}, {thresholdValue: '3'}], [])).toEqual([]);
  });

  it('creates a categorical plan dimension from categories', () => {
    const dims = enrichDimensions(
      [],
      [],
      [{categoryName: ' Enterprise '}, {categoryName: 'Standard'}, {categoryName: 'Enterprise'}, {}],
    );
    expect(dims).toEqual([
      {name: 'plan', kind: 'categorical', values: ['Enterprise', 'Standard'], range: []},
    ]);
  });
});

describe('generateSyntheticCases', () => {
  const dims = [
    {name: 'seats', kind: 'numeric', values: ['10']},
    {name: 'plan', kind: 'categorical', values: ['standard', 'enterprise']},
  ];

  it('returns no cases without dimensions', () => {
    expect(generateSyntheticCases([])).toEqual([]);
  });

  it('returns 500 deterministic, sequentially numbered cases', () => {
    const cases = generateSyntheticCases(dims);
    expect(cases).toHaveLength(500);
    expect(cases.map((c: any) => c.caseId)).toEqual(
      Array.from({length: 500}, (_, i) => `case-${i + 1}`),
    );
    expect(generateSyntheticCases(dims)).toEqual(cases);
  });

  it('covers every boundary value of every dimension', () => {
    const cases = generateSyntheticCases(dims);
    for (const d of dims) {
      const seen = new Set(cases.map((c: any) => c.attributes[d.name]));
      for (const v of getDimensionValues(d)) {
        expect(seen.has(v)).toBe(true);
      }
    }
    // Coverage cases come first: one per boundary value, in order.
    expect(cases.slice(0, 3).map((c: any) => c.attributes.seats)).toEqual(['9', '10', '11']);
  });

  it('builds plain-English descriptions from the attributes', () => {
    const [first] = generateSyntheticCases(dims);
    expect(first.description).toBe(
      `A test case scenario where seats is "${first.attributes.seats}" and plan is "${first.attributes.plan}".`,
    );
  });
});

describe('runEvaluation', () => {
  it('runs the function body in a sandbox and returns its result', () => {
    const result = runEvaluation(
      'return rules.map(r => ({ ruleId: r.id, n: Number(caseObj.attributes.seats) + appliedFixIds.length }));',
      {attributes: {seats: '4'}},
      [{id: 'R1'}],
      ['F1'],
    );
    expect(result).toEqual([{ruleId: 'R1', n: 5}]);
  });

  it('cannot reach Node globals', () => {
    expect(runEvaluation('return typeof process;', {}, [], [])).toBe('undefined');
  });

  it('propagates errors thrown by the body', () => {
    expect(() => runEvaluation('throw new Error("boom");', {}, [], [])).toThrow('boom');
  });

  it('stops a runaway body at the timeout', () => {
    expect(() => runEvaluation('while (true) {}', {}, [], [], 50)).toThrow(/timed out/);
  });
});

describe('detectDefects', () => {
  const allApply =
    'return rules.map(r => ({ ruleId: r.id, appliesLiteral: true, appliesScoped: true, outcome: r.outcome }));';
  const colorDims = [{name: 'color', kind: 'categorical', values: ['red']}];
  const redCases = [
    {caseId: 'case-1', attributes: {color: 'red'}},
    {caseId: 'case-2', attributes: {color: 'red'}},
  ];

  it('returns no defects for a consistent single-rule policy', () => {
    const rules = [{id: 'R1', clauseText: 'Refunds are issued.', outcome: 'refund'}];
    expect(detectDefects(redCases, rules, allApply, colorDims)).toEqual([]);
  });

  it('flags a contradiction when applying rules disagree on the outcome', () => {
    const rules = [
      {id: 'R1', clauseText: 'Refunds are issued.', outcome: 'refund'},
      {id: 'R2', clauseText: 'No refunds are issued.', outcome: 'no_refund'},
    ];
    const defects = detectDefects(redCases, rules, allApply, colorDims);
    expect(defects).toEqual([
      {kind: 'contradiction', caseId: 'case-1', rulesInvolved: ['R1', 'R2']},
      {kind: 'contradiction', caseId: 'case-2', rulesInvolved: ['R1', 'R2']},
    ]);
  });

  it('flags a missing outcome, plus a boundary collision on a boundary value', () => {
    const dims = [{name: 'seats', kind: 'numeric', values: ['10']}];
    const rules = [{id: 'R1', clauseText: 'More than 10 seats get a discount.', outcome: 'discount'}];
    const code =
      'const ok = Number(caseObj.attributes.seats) > 10; return rules.map(r => ({ ruleId: r.id, appliesLiteral: ok, appliesScoped: ok, outcome: r.outcome }));';
    const cases = [
      {caseId: 'at-boundary', attributes: {seats: '10'}},
      {caseId: 'above', attributes: {seats: '11'}},
      {caseId: 'off-boundary', attributes: {seats: '3'}},
    ];
    expect(detectDefects(cases, rules, code, dims)).toEqual([
      {kind: 'missing_outcome', caseId: 'at-boundary', rulesInvolved: []},
      {kind: 'boundary_collision', caseId: 'at-boundary', rulesInvolved: ['R1']},
      {kind: 'missing_outcome', caseId: 'off-boundary', rulesInvolved: []},
    ]);
  });
});

describe('stripHtml', () => {
  it('drops scripts, styles and tags, decodes entities and collapses whitespace', () => {
    const html = `<html><head><style>p { color: red; }</style><script>alert("x")</script></head>
      <body><h1>Terms</h1>\n<p>Fees &amp; charges&nbsp;apply &lt;always&gt; &quot;now&quot;</p></body></html>`;
    expect(stripHtml(html)).toBe('Terms Fees & charges apply <always> "now"');
  });
});
