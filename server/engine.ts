import vm from "node:vm";

// Mulberry32 PRNG (Fixed Seed)
export function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helper to extract or generate dimension values from either values or range with full boundary sweeps
export function getDimensionValues(dim: any): string[] {
  const vals: string[] = [];
  const rawSources = [...(dim.values || []), ...(dim.range || [])];
  
  if (dim.kind === "numeric") {
    const numbers = rawSources.map((v: any) => parseFloat(v)).filter((n: any) => !isNaN(n));
    if (numbers.length > 0) {
      numbers.forEach((n: number) => {
        vals.push(String(n - 1));
        vals.push(String(n));
        vals.push(String(n + 1));
      });
    } else {
      vals.push("0", "5", "10", "11", "50", "100");
    }
    return [...new Set(vals)];
  } else if (dim.kind === "datetime") {
    rawSources.forEach((r: any) => {
      vals.push(String(r));
    });
    if (vals.length === 0) {
      vals.push("2026-01-01T00:00:00Z", "2026-07-17T00:00:00Z");
    }
    return [...new Set(vals)];
  } else {
    // categorical
    rawSources.forEach((r: any) => {
      vals.push(String(r));
    });
    if (vals.length === 0) {
      vals.push("default");
    }
    return [...new Set(vals)];
  }
}

// Programmatically enrich dimensions from extracted thresholds and categories to maximize recall
export function enrichDimensions(dimensions: any[], thresholds: any[], categories: any[]): any[] {
  const dims = [...(dimensions || [])];

  // 1. Enrich from thresholds
  if (thresholds && thresholds.length > 0) {
    thresholds.forEach(t => {
      if (!t.dimension || !t.thresholdValue) return;
      const dimName = t.dimension.trim();
      let d = dims.find(x => x.name.toLowerCase() === dimName.toLowerCase());
      if (!d) {
        // Create new numeric/datetime dimension
        const isDate = String(t.thresholdValue).includes("-") || String(t.thresholdValue).includes(":") || isNaN(Number(t.thresholdValue));
        d = {
          name: dimName,
          kind: isDate ? "datetime" : "numeric",
          values: [],
          range: []
        };
        dims.push(d);
      }
      
      // Make sure the threshold value is in values / range
      if (!d.values) d.values = [];
      if (!d.range) d.range = [];
      
      const valStr = String(t.thresholdValue).trim();
      if (!d.values.includes(valStr)) {
        d.values.push(valStr);
      }
      if (!d.range.includes(valStr)) {
        d.range.push(valStr);
      }
    });
  }

  // 2. Enrich from categories
  if (categories && categories.length > 0) {
    let planDim = dims.find(x => x.kind === "categorical" || x.name.toLowerCase() === "plan" || x.name.toLowerCase() === "tier");
    if (!planDim) {
      planDim = {
        name: "plan",
        kind: "categorical",
        values: [],
        range: []
      };
      dims.push(planDim);
    }
    if (!planDim.values) planDim.values = [];
    categories.forEach(c => {
      if (!c.categoryName) return;
      const catVal = c.categoryName.trim();
      if (!planDim.values.includes(catVal)) {
        planDim.values.push(catVal);
      }
    });
  }

  return dims;
}

// Generate synthetic cases ensuring boundary coverage
export function generateSyntheticCases(dimensions: any[]) {
  const rng = mulberry32(42);
  const cases: any[] = [];
  const targetCount = 500;

  if (!dimensions || dimensions.length === 0) {
    return [];
  }

  // Create guaranteed coverage cases first
  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const vals = getDimensionValues(dim);
    for (const val of vals) {
      const attrs: any = {};
      for (let j = 0; j < dimensions.length; j++) {
        if (i === j) {
          attrs[dimensions[j].name] = val;
        } else {
          const otherVals = getDimensionValues(dimensions[j]);
          const idx = Math.floor(rng() * otherVals.length);
          attrs[dimensions[j].name] = otherVals[idx] || "";
        }
      }
      cases.push({
        caseId: `case-${cases.length + 1}`,
        attributes: attrs,
      });
    }
  }

  // Generate remaining cases up to targetCount
  while (cases.length < targetCount) {
    const attrs: any = {};
    for (const dim of dimensions) {
      const vals = getDimensionValues(dim);
      const idx = Math.floor(rng() * vals.length);
      attrs[dim.name] = vals[idx] || "";
    }
    cases.push({
      caseId: `case-${cases.length + 1}`,
      attributes: attrs,
    });
  }

  // Generate plain-English descriptions (never the model)
  for (const c of cases) {
    const parts = Object.entries(c.attributes).map(([k, v]) => `${k} is "${v}"`);
    c.description = `A test case scenario where ${parts.join(" and ")}.`;
  }

  return cases;
}

// Run evaluation code in vm sandbox
export function runEvaluation(code: string, caseObj: any, rules: any[], appliedFixIds: string[], timeoutMs = 5000) {
  const sandbox = {
    caseObj,
    rules,
    appliedFixIds,
    result: null as any,
  };
  const context = vm.createContext(sandbox);
  const codeToRun = `
    (function() {
      const evaluate = (caseObj, rules, appliedFixIds) => {
        ${code}
      };
      result = evaluate(caseObj, rules, appliedFixIds);
    })();
  `;
  const script = new vm.Script(codeToRun);
  script.runInContext(context, { timeout: timeoutMs });
  return sandbox.result;
}

// Mechanical defect detection (Step 4) with robust dimension-isolated sweeps
export function detectDefects(cases: any[], rules: any[], currentCode: string, dimensions: any[]) {
  const defects: any[] = [];
  const caseEvaluations: any[] = [];

  const referencedDims = new Set<string>();
  for (const d of dimensions) {
    for (const r of rules) {
      if (r.clauseText.toLowerCase().includes(d.name.toLowerCase())) {
        referencedDims.add(d.name);
      }
    }
  }

  // Group rules by dimension they reference
  const dimRules = new Map<string, any[]>();
  for (const d of dimensions) {
    const list: any[] = [];
    const dName = d.name.toLowerCase();
    for (const r of rules) {
      const text = r.clauseText.toLowerCase();
      // Heuristic text matches for dimensions
      const matches = text.includes(dName) || 
                      (dName === "seats" && text.includes("seat")) || 
                      (dName === "plan" && (text.includes("plan") || text.includes("standard") || text.includes("enterprise") || text.includes("education"))) ||
                      (dName === "submission_channel" && (text.includes("portal") || text.includes("email") || text.includes("channel") || text.includes("submit"))) ||
                      (dName === "refundrequestedday" && (text.includes("refund") || text.includes("day") || text.includes("within")));
      if (matches) {
        list.push(r);
      }
    }
    dimRules.set(d.name, list);
  }

  for (const C of cases) {
    try {
      const results = runEvaluation(currentCode, C, rules, []);
      caseEvaluations.push({
        caseId: C.caseId,
        caseObj: C,
        results: results || [],
      });
    } catch (e: any) {
      // Log evaluation error
    }
  }

  for (const evalObj of caseEvaluations) {
    const { caseId, caseObj, results } = evalObj;
    
    // 1. CONTRADICTIONS (major)
    const activeLiteral = results.filter((r: any) => r.appliesLiteral);
    const activeScoped = results.filter((r: any) => r.appliesScoped);

    const litOutcomes = activeLiteral.map((r: any) => r.outcome).filter((o: any) => o !== null);
    const scopedOutcomes = activeScoped.map((r: any) => r.outcome).filter((o: any) => o !== null);

    const uniqueLit = [...new Set(litOutcomes)];
    const uniqueScoped = [...new Set(scopedOutcomes)];

    const isLitContradiction = uniqueLit.length > 1;
    const isScopedContradiction = uniqueScoped.length > 1;

    const isContradiction = isLitContradiction && isScopedContradiction;
    if (isContradiction) {
      defects.push({
        kind: "contradiction",
        caseId,
        rulesInvolved: results.filter((r: any) => r.appliesLiteral || r.appliesScoped).map((r: any) => r.ruleId),
      });
    }

    // 2. SCOPE AMBIGUITY (minor)
    const litStr = JSON.stringify(uniqueLit.sort());
    const scopedStr = JSON.stringify(uniqueScoped.sort());
    const hasDisagreement = results.some((r: any) => r.appliesLiteral !== r.appliesScoped);
    if (hasDisagreement && litStr !== scopedStr) {
      defects.push({
        kind: "scope_ambiguity",
        caseId,
        rulesInvolved: results.filter((r: any) => r.appliesLiteral !== r.appliesScoped).map((r: any) => r.ruleId),
      });
    }

    // 3. DIMENSION-ISOLATED MISSING OUTCOME & BOUNDARY COLLISION
    for (const d of dimensions) {
      const rList = dimRules.get(d.name) || [];
      if (rList.length === 0) continue; // No rules cover this dimension

      // Check if any rule associated with this dimension applies to this case
      const dResults = results.filter((r: any) => rList.some((rl: any) => rl.id === r.ruleId));
      const activeLitD = dResults.filter((r: any) => r.appliesLiteral);
      const activeScopedD = dResults.filter((r: any) => r.appliesScoped);

      const isMissingD = (activeLitD.length === 0) || (activeScopedD.length === 0);
      if (isMissingD) {
        // We found a gap for this dimension!
        defects.push({
          kind: "missing_outcome",
          caseId,
          rulesInvolved: [],
        });

        // If this dimension is numeric or datetime, and the value is a boundary value, flag as boundary_collision
        if (d.kind === "numeric" || d.kind === "datetime") {
          const val = caseObj.attributes[d.name];
          const vals = getDimensionValues(d);
          const isBoundary = vals.includes(String(val)) || vals.includes(val);
          if (isBoundary) {
            defects.push({
              kind: "boundary_collision",
              caseId,
              rulesInvolved: rList.map((r: any) => r.id),
            });
          }
        }
      }
    }
  }

  // 4. COUNTERFACTUAL PARITY (major)
  for (let i = 0; i < caseEvaluations.length; i++) {
    for (let j = i + 1; j < caseEvaluations.length; j++) {
      const cA = caseEvaluations[i];
      const cB = caseEvaluations[j];

      let differingDim = null;
      let diffCount = 0;
      for (const d of dimensions) {
        if (cA.caseObj.attributes[d.name] !== cB.caseObj.attributes[d.name]) {
          diffCount++;
          differingDim = d.name;
        }
      }

      if (diffCount === 1 && differingDim && !referencedDims.has(differingDim)) {
        const outA = JSON.stringify([...new Set(cA.results.filter((r: any) => r.appliesLiteral).map((r: any) => r.outcome).filter(Boolean))].sort());
        const outB = JSON.stringify([...new Set(cB.results.filter((r: any) => r.appliesLiteral).map((r: any) => r.outcome).filter(Boolean))].sort());

        if (outA !== outB) {
          defects.push({
            kind: "counterfactual_parity",
            caseId: cA.caseId,
            rulesInvolved: [],
          });
          break;
        }
      }
    }
  }

  return defects;
}

// Strip markup from fetched HTML, decode common entities and collapse whitespace
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
