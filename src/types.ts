export interface Rule {
  id: string;
  clauseText: string;
  appliesTo: string;
  scopeProvenance: "explicit" | "inherited_from_section" | "unstated";
}

export interface Dimension {
  name: string;
  kind: "categorical" | "numeric" | "datetime";
  values: string[];
}

export interface Finding {
  id: string;
  severity: "major" | "minor";
  kind: "contradiction" | "scope_ambiguity" | "missing_outcome" | "boundary_collision" | "counterfactual_parity";
  title: string;
  originalText: string;
  occurrence: number;
  replacementText: string;
  explanation: string;
  conflictsWith: string | null;
  evidenceCaseIds: string[];
  status?: "open" | "fixed" | "unverified";
  rulesInvolved?: string[];
}

export interface Case {
  caseId: string;
  attributes: Record<string, string>;
  description: string;
  status: "pass" | string;
}

export interface CategoryItem {
  categoryName: string;
  definedInClause: string;
}

export interface CoverageMatrixItem {
  category: string;
  topic: string;
  coveringRuleId: string;
}

export interface ThresholdItem {
  thresholdValue: string;
  clauseText: string;
  dimension: string;
}

export interface UnscopedSentenceItem {
  sentenceText: string;
  parentSectionScope: string;
}

export interface OutcomeFactorItem {
  factorName: string;
  isLegitimateBasis: boolean;
}

export interface PassStats {
  categoriesChecked: number;
  topicsChecked: number;
  thresholdsChecked: number;
  unscopedSentencesChecked: number;
  outcomeFactorsChecked: number;
}

export interface AnalysisResponse {
  documentTitle: string;
  originalText: string;
  casesRun: number;
  score: number;
  findings: Finding[];
  cases: Case[];
  rules: Rule[];
  evaluationCode: string;
  dimensions: Dimension[];
  categories: CategoryItem[];
  coverageMatrix: CoverageMatrixItem[];
  thresholds: ThresholdItem[];
  unscopedSentences: UnscopedSentenceItem[];
  outcomeFactors: OutcomeFactorItem[];
  passStats: PassStats;
}
