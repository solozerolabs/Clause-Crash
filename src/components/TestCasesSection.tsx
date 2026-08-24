import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { PanelRightClose, AlertCircle, Check, RefreshCw, Play, Sparkles, AlertTriangle } from "lucide-react";
import { Case, Finding, Rule } from "../types";

interface TestCasePanelProps {
  analysisData: any;
  isSandboxMode: boolean;
  setIsSandboxMode: (mode: boolean) => void;
  sandboxJsonText: string;
  setSandboxJsonText: (text: string) => void;
  sandboxJsonError: string | null;
  setSandboxJsonError: (error: string | null) => void;
  handleApplySandboxJson: () => void;
  caseFilter: "all" | "failing" | "passing";
  setCaseFilter: (filter: "all" | "failing" | "passing") => void;
  handleReRunAllCases: () => void;
  isReRunningAll: boolean;
  isReRunningFailed: boolean;
  handleReRunFailedCases: () => void;
  liveCases: Case[];
  handleAddCustomCase: () => void;
  selectedCaseId: string | null;
  setSelectedCaseId: (id: string | null) => void;
  highlightedCaseId: string | null;
  setHighlightedCaseId: (id: string | null) => void;
  caseRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  runEvaluationLocally: (c: any, rules: Rule[], appliedFixIds: string[]) => any[];
  appliedFixIds: string[];
  caseDrafts: Record<string, Record<string, string>>;
  setCaseDrafts: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  handleReRunCase: (cid: string) => void;
  runningCases: Record<string, boolean>;
}

export const TestCasesSection: React.FC<TestCasePanelProps> = ({
  analysisData,
  isSandboxMode,
  setIsSandboxMode,
  sandboxJsonText,
  setSandboxJsonText,
  sandboxJsonError,
  setSandboxJsonError,
  handleApplySandboxJson,
  caseFilter,
  setCaseFilter,
  handleReRunAllCases,
  isReRunningAll,
  isReRunningFailed,
  handleReRunFailedCases,
  liveCases,
  handleAddCustomCase,
  selectedCaseId,
  setSelectedCaseId,
  highlightedCaseId,
  setHighlightedCaseId,
  caseRefs,
  runEvaluationLocally,
  appliedFixIds,
  caseDrafts,
  setCaseDrafts,
  handleReRunCase,
  runningCases
}) => {
  return (
    <div id="test-cases-section" className="w-full bg-white border-t-8 border-black">
      <div className="w-full bg-white flex flex-col">
        <div className="p-6 border-b-4 border-black flex items-center justify-between max-w-[1400px] mx-auto w-full">
          <div>
            <h3 className="text-xl font-black uppercase tracking-[0.2em] text-black">Synthetic Scenarios</h3>
            <p className="text-sm font-bold tracking-wider text-black opacity-50 uppercase mt-1">{analysisData.casesRun} test cases run</p>
          </div>
          <button
            onClick={() => setIsSandboxMode(!isSandboxMode)}
            className="px-4 py-2 hover:bg-black hover:text-white transition-none cursor-pointer border-4 border-black text-black font-black uppercase tracking-wider text-xs"
          >
            {isSandboxMode ? "View List" : "JSON Sandbox"}
          </button>
        </div>

        <div className="px-6 py-2.5 bg-neutral-100 border-b border-gray-200 flex justify-between items-center">
          <span className="text-[9px] font-black tracking-widest uppercase text-neutral-500">Editor Mode:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setIsSandboxMode(false)}
              className={"px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded-none cursor-pointer border " + (
                !isSandboxMode
                  ? "bg-black text-white border-black"
                  : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
              )}
            >
              Interactive Form
            </button>
            <button
              onClick={() => {
                setIsSandboxMode(true);
                setSandboxJsonText(JSON.stringify(liveCases, null, 2));
                setSandboxJsonError(null);
              }}
              className={"px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded-none cursor-pointer border " + (
                isSandboxMode
                  ? "bg-black text-white border-black"
                  : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
              )}
            >
              JSON Sandbox
            </button>
          </div>
        </div>

        {isSandboxMode ? (
          <div className="flex-1 p-6 flex flex-col gap-4 bg-neutral-900 text-neutral-100 overflow-y-auto font-mono">
            <div className="text-[10px] text-neutral-400 font-sans uppercase tracking-widest leading-relaxed">
              Edit the scenarios array in raw JSON format to freely add, clone, delete, or parameterize cases.
            </div>
            
            <textarea
              value={sandboxJsonText}
              onChange={(e) => {
                const val = e.target.value;
                setSandboxJsonText(val);
                try {
                  const parsed = JSON.parse(val);
                  if (!Array.isArray(parsed)) {
                    setSandboxJsonError("Root of JSON must be a valid list/array [] of scenarios.");
                  } else {
                    const invalidItem = parsed.find((item: any) => {
                      return !item.caseId || !item.attributes || typeof item.attributes !== "object";
                    });
                    if (invalidItem) {
                      setSandboxJsonError("Each item must have a 'caseId' (string) and 'attributes' (object) key.");
                    } else {
                      setSandboxJsonError(null);
                    }
                  }
                } catch (err: any) {
                  setSandboxJsonError(`JSON Syntax Error: ${err.message}`);
                }
              }}
              className="flex-1 min-h-[350px] bg-neutral-950 text-[#00FF66] font-mono p-4 border border-neutral-800 text-xs focus:outline-none resize-none leading-relaxed rounded-none"
            />

            {sandboxJsonError ? (
              <div className="p-3 bg-red-950 border border-red-800 text-red-200 text-[11px] font-sans rounded-none flex items-start gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>{sandboxJsonError}</div>
              </div>
            ) : (
              <div className="p-2.5 bg-green-950 border border-green-800 text-green-200 text-[10px] font-sans rounded-none flex items-center gap-1.5 shrink-0">
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span>JSON is valid and formatted correctly!</span>
              </div>
            )}

            <div className="flex gap-3 mt-2 shrink-0">
              <button
                onClick={() => {
                  try {
                    const parsed = JSON.parse(sandboxJsonText);
                    setSandboxJsonText(JSON.stringify(parsed, null, 2));
                    setSandboxJsonError(null);
                  } catch (err: any) {
                    setSandboxJsonError(`Cannot format. JSON Syntax Error: ${err.message}`);
                  }
                }}
                className="flex-1 py-2 border border-neutral-700 hover:border-neutral-500 text-[10px] font-black uppercase text-neutral-300 hover:bg-neutral-800 transition tracking-widest cursor-pointer rounded-none font-sans"
              >
                Format JSON
              </button>
              
              <button
                onClick={handleApplySandboxJson}
                disabled={!!sandboxJsonError}
                className="flex-1 py-2 bg-[#00FF66] hover:bg-green-400 disabled:opacity-40 text-[10px] font-black uppercase text-black transition tracking-widest cursor-pointer rounded-none font-sans"
              >
                Apply & Run Sandbox Cases
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 bg-[#F7F7F7] border-b border-gray-200 flex gap-4">
              {(["all", "failing", "passing"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setCaseFilter(tab)}
                  className={"text-[10px] font-bold tracking-widest uppercase transition cursor-pointer " + (
                    caseFilter === tab
                      ? "text-black underline decoration-2 underline-offset-4"
                      : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="px-6 py-3 border-b border-gray-200 flex justify-between gap-3 bg-neutral-50">
              <button
                onClick={handleReRunAllCases}
                disabled={isReRunningAll || isReRunningFailed}
                className="flex-1 py-1.5 border border-black text-[9px] font-black uppercase text-black hover:bg-black hover:text-white disabled:opacity-50 transition tracking-widest flex items-center justify-center gap-1.5 cursor-pointer rounded-none"
              >
                {isReRunningAll ? (
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                )}
                {isReRunningAll ? "RE-RUNNING ALL..." : "RE-RUN ALL CASES"}
              </button>
              <button
                onClick={handleReRunFailedCases}
                disabled={isReRunningAll || isReRunningFailed || !liveCases.some(c => c.status !== "pass")}
                className="flex-1 py-1.5 border border-red-600 text-[9px] font-black uppercase text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-40 transition tracking-widest flex items-center justify-center gap-1.5 cursor-pointer rounded-none"
              >
                {isReRunningFailed ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {isReRunningFailed ? "RE-RUNNING FAILED..." : "RE-RUN FAILED CASES"}
              </button>
            </div>

            <div className="px-6 py-2 border-b border-gray-200 bg-white">
              <button
                onClick={handleAddCustomCase}
                className="w-full py-1.5 border border-dashed border-neutral-400 text-[9px] font-black uppercase text-neutral-600 hover:border-black hover:text-black transition tracking-widest flex items-center justify-center gap-1.5 cursor-pointer rounded-none"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
                ADD CUSTOM CASE
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {liveCases
                .filter(c => {
                  if (caseFilter === "failing") return c.status !== "pass";
                  if (caseFilter === "passing") return c.status === "pass";
                  return true;
                })
                .map(c => {
                  const isExpanded = selectedCaseId === c.caseId;
                  const isHighlighted = highlightedCaseId === c.caseId;
                  
                  const outcomes = runEvaluationLocally(c, analysisData.rules, appliedFixIds);
                  const appliedLiterals = outcomes.filter((o: any) => o.appliesLiteral);

                  const isFailing = c.status !== "pass";
                  const isAmbiguity = c.status === "scope_ambiguity" || c.status === "ambiguity";
                  
                  let itemBg = "bg-white";
                  let borderLeft = "border-l-4 border-transparent";
                  
                  if (isFailing) {
                    if (isAmbiguity) {
                      itemBg = "bg-amber-50/60 hover:bg-amber-50";
                      borderLeft = "border-l-4 border-amber-500";
                    } else {
                      itemBg = "bg-red-50/60 hover:bg-red-50";
                      borderLeft = "border-l-4 border-red-600";
                    }
                  } else {
                    itemBg = "bg-white hover:bg-neutral-50/50";
                  }
                  
                  if (isHighlighted) {
                    itemBg = isFailing 
                      ? (isAmbiguity ? "bg-amber-50" : "bg-red-50") 
                      : "bg-neutral-50";
                  }

                  return (
                    <div
                      key={c.caseId}
                      ref={el => { caseRefs.current[c.caseId] = el; }}
                      className={`p-6 transition-colors ${itemBg} ${borderLeft}`}
                    >
                      <div
                        onClick={() => {
                          setSelectedCaseId(isExpanded ? null : c.caseId);
                          setHighlightedCaseId(c.caseId);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-[10px] font-mono font-bold text-neutral-400">
                            #{c.caseId.replace("case-", "")}
                          </span>
                          
                          <span className={"text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider text-white " + (
                            c.status === "pass"
                              ? "bg-green-600"
                              : (isAmbiguity ? "bg-amber-500" : "bg-red-600")
                          )}>
                            {c.status === "pass" ? "Pass" : c.status.replace(/_/g, " ")}
                          </span>
                        </div>

                        <p className="text-xs leading-snug font-medium text-neutral-800 mt-2">
                          {c.description}
                        </p>

                        <div className="flex flex-wrap gap-1 mt-3">
                          {Object.entries(c.attributes).map(([k, v]) => (
                            <span key={k} className="text-[9px] font-bold border border-gray-300 px-1.5 py-0.5 uppercase tracking-wide text-neutral-600 bg-white/40">
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-neutral-150 text-xs font-sans space-y-3">
                          <div className="p-4 bg-neutral-50 border border-neutral-200">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-700">Edit Case Parameters</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReRunCase(c.caseId);
                                }}
                                disabled={runningCases[c.caseId]}
                                className="px-2.5 py-1 bg-black text-[9px] font-black uppercase text-white hover:bg-neutral-800 disabled:opacity-50 transition tracking-widest flex items-center gap-1 cursor-pointer rounded-none border-0"
                              >
                                {runningCases[c.caseId] ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Play className="w-3 h-3 text-white fill-white" />
                                )}
                                {runningCases[c.caseId] ? "RUNNING..." : "RUN CASE"}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(c.attributes).map(([key, val]) => {
                                const draftVal = caseDrafts[c.caseId]?.[key] ?? String(val);
                                return (
                                  <div key={key} className="flex flex-col">
                                    <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{key}</label>
                                    <input
                                      type="text"
                                      value={draftVal}
                                      onChange={(e) => {
                                        const valText = e.target.value;
                                        setCaseDrafts(prev => ({
                                          ...prev,
                                          [c.caseId]: {
                                            ...(prev[c.caseId] || {}),
                                            [key]: valText
                                          }
                                        }));
                                      }}
                                      className="p-1.5 text-xs bg-white border border-neutral-300 focus:outline-none focus:border-black font-mono font-medium rounded-none"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="font-bold text-neutral-700">Evaluation Outcomes:</div>
                          <div className="space-y-2">
                            {outcomes.map((o: any) => {
                              const matchedRule = analysisData.rules.find((r: Rule) => r.id === o.ruleId);
                              return (
                                <div key={o.ruleId} className="flex justify-between items-start gap-4 bg-white/60 p-2.5 rounded-none border border-neutral-200">
                                  <div>
                                    <div className="font-bold text-neutral-800 font-mono text-[10px]">
                                      {o.ruleId.toUpperCase()} {o.appliesLiteral && "⚡"}
                                    </div>
                                    <p className="text-neutral-500 text-[11px] italic mt-1">
                                      "{matchedRule?.clauseText}"
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-mono font-bold uppercase tracking-wider text-[10px] text-neutral-400">Outcome</div>
                                    <div className="font-semibold text-neutral-900 mt-0.5">{o.outcome || "N/A"}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {c.status !== "pass" && appliedLiterals.length >= 2 && (
                            <div className="mt-3 bg-red-100/30 p-4 rounded-none border border-red-200 space-y-2">
                              <div className="font-bold text-red-800 text-[11px] uppercase tracking-wider">Crossover Conflict:</div>
                              <div className="grid grid-cols-2 gap-3 text-[11px] leading-relaxed">
                                {appliedLiterals.slice(0, 2).map((al: any) => {
                                  const rule = analysisData.rules.find((r: Rule) => r.id === al.ruleId);
                                  return (
                                    <div key={al.ruleId} className="space-y-1">
                                      <span className="font-mono font-bold text-red-700">{al.ruleId.toUpperCase()}</span>
                                      <p className="text-neutral-600 italic">"{rule?.clauseText}"</p>
                                      <div className="text-[10px] text-neutral-500 font-semibold mt-1">Yields: {al.outcome}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
