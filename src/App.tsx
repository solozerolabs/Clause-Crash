import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { EntryScreen } from "./components/EntryScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { ResultsHeader } from "./components/ResultsHeader";
import { loadingPhrases } from "./phrases";
import { AnalysisResponse, Case, Finding, Rule } from "./types";
import { DocumentTab } from "./components/DocumentTab";
import { TestCasesSection } from "./components/TestCasesSection";

export default function App() {
  const [mode, setMode] = useState<"text" | "file" | "url" | "saved">("text");
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState("");

  const [localCases, setLocalCases] = useState<Case[]>([]);
  const [caseDrafts, setCaseDrafts] = useState<Record<string, Record<string, string>>>({});
  const [runningCases, setRunningCases] = useState<Record<string, boolean>>({});
  const [isReRunningAll, setIsReRunningAll] = useState(false);
  const [isReRunningFailed, setIsReRunningFailed] = useState(false);

  const [appliedFixIds, setAppliedFixIds] = useState<string[]>([]);
  const [fixedTimestamps, setFixedTimestamps] = useState<Record<string, number>>({});
  const [openNoteIds, setOpenNoteIds] = useState<Record<string, boolean>>({});
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState<"all" | "failing" | "passing">("all");
  const [highlightedCaseId, setHighlightedCaseId] = useState<string | null>(null);


  const caseRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [sandboxJsonText, setSandboxJsonText] = useState("");
  const [sandboxJsonError, setSandboxJsonError] = useState<string | null>(null);

  const [savedDocs, setSavedDocs] = useState<any[]>([]);
  const [currentSavedDocId, setCurrentSavedDocId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/saved-analyses")
      .then(res => res.json())
      .then(data => setSavedDocs(data))
      .catch(console.error);
  }, []);

  const handleSaveAnalysis = async () => {
    if (!analysisData) return;
    try {
      const res = await fetch("/api/saved-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentSavedDocId,
          title: analysisData.documentTitle || "Saved Policy",
          text: analysisData.originalText,
          analysisData
        })
      });
      if (res.ok) {
        const updatedDoc = await res.json();
        setCurrentSavedDocId(updatedDoc.id);
        
        // Refetch all to get cascaded updates
        const fetchRes = await fetch("/api/saved-analyses");
        if (fetchRes.ok) {
          const allDocs = await fetchRes.json();
          setSavedDocs(allDocs);
        }
        
        alert("Document saved successfully!");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save document.");
    }
  };

  const handleLoadSavedDoc = (doc: any) => {
    setCurrentSavedDocId(doc.id);
    if (doc.analysisData && doc.analysisData.cases) {
      setAnalysisData(doc.analysisData);
      setLocalCases(doc.analysisData.cases);
      setAppliedFixIds([]);
      setFixedTimestamps({});
    } else {
      setTextInput(doc.text);
      setMode("text");
      setAnalysisData(null);
    }
  };


  useEffect(() => {
    if (!isLoading) return;
    let pool = [...loadingPhrases];
    const rotate = () => {
      if (pool.length === 0) {
        pool = [...loadingPhrases];
      }
      const idx = Math.floor(Math.random() * pool.length);
      const chosen = pool.splice(idx, 1)[0];
      setLoadingPhrase(chosen);
    };
    rotate();
    const interval = setInterval(rotate, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const isTextValid = textInput.trim().length > 0 && textInput.length <= 150000;
  const isFileValid = selectedFile !== null && !fileError;
  const isUrlValid = urlInput.trim().length > 0 && !urlError;

  const handleUrlInputChange = (val: string) => {
    setUrlInput(val);
    if (!val.trim()) {
      setUrlError("");
      return;
    }
    try {
      const parsed = new URL(val);
      const isValid = parsed.protocol === "http:" || parsed.protocol === "https:";
      setUrlError(isValid ? "" : "Must be a valid HTTP or HTTPS URL.");
    } catch (_) {
      setUrlError("Invalid URL format.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const allowed = [".pdf", ".txt", ".md"];
    
    if (!allowed.includes(ext)) {
      setFileError("Invalid file type. Only .pdf, .txt, and .md are accepted.");
      setSelectedFile(null);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setFileError("File exceeds 15 MB limit.");
      setSelectedFile(null);
      return;
    }

    setFileError("");
    setSelectedFile(file);
  };

  const getFileBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const str = reader.result as string;
        resolve(str.split(",")[1]);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleSaveOnly = async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      let body: any = { mode };
      if (mode === "text") {
        body.text = textInput;
      } else if (mode === "file" && selectedFile) {
        const b64 = await getFileBase64(selectedFile);
        body.fileBase64 = b64;
        body.mimeType = selectedFile.type || (selectedFile.name.endsWith(".pdf") ? "application/pdf" : "text/plain");
      } else if (mode === "url") {
        body.url = urlInput;
      }

      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        throw new Error("Failed to parse document");
      }
      const data = await res.json();
      const parsedText = data.text;
      
      const newId = "doc-" + Math.random().toString(36).substring(2, 9);
      
      const saveRes = await fetch("/api/saved-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId,
          title: "Saved Policy " + new Date().toLocaleTimeString(),
          text: parsedText,
          analysisData: { findings: [] } // Empty analysis data
        })
      });
      if (saveRes.ok) {
        // Refresh saved docs list
        const res2 = await fetch("/api/saved-analyses");
        if (res2.ok) setSavedDocs(await res2.json());
        // Switch mode back to saved
        setMode("saved");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save document");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrashTest = async () => {
    setIsLoading(true);
    setErrorMessage("");
    setAnalysisStatus("");
    try {
      let body: any = { mode };
      if (mode === "text") {
        body.text = textInput;
      } else if (mode === "file" && selectedFile) {
        const b64 = await getFileBase64(selectedFile);
        body.fileBase64 = b64;
        body.mimeType = selectedFile.type || (selectedFile.name.endsWith(".pdf") ? "application/pdf" : "text/plain");
      } else if (mode === "url") {
        body.url = urlInput;
      }

      const res = await fetch("/api/crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMessage = "Failed to analyze document.";
        try {
          const errData = JSON.parse(errText);
          errMessage = errData.error || errMessage;
        } catch (_) {}
        throw new Error(errMessage);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream response body.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AnalysisResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.substring(6).trim();
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.status) {
                setAnalysisStatus(parsed.status);
              }
              if (parsed.result) {
                finalResult = parsed.result;
              }
              if (parsed.error) {
                throw new Error("BackendError: " + parsed.error);
              }
            } catch (e: any) {
              if (e.message && e.message.startsWith("BackendError: ")) {
                throw new Error(e.message.replace("BackendError: ", ""));
              }
              console.error("JSON Parse Error on chunk:", e);
              // Ignore JSON parse errors for incomplete chunks (though chunking logic usually prevents this)
            }
          }
        }
      }

      if (!finalResult) {
        throw new Error("Analysis completed but no response was generated.");
      }

      setAnalysisData(finalResult);
      setCurrentSavedDocId(null);
      setLocalCases(finalResult.cases);
      const drafts: Record<string, Record<string, string>> = {};
      finalResult.cases.forEach((c: Case) => {
        drafts[c.caseId] = { ...c.attributes };
      });
      setCaseDrafts(drafts);

      setAppliedFixIds([]);
      setFixedTimestamps({});
      setOpenNoteIds({});
    } catch (err: any) {
      let msg = err.message || "An unexpected error occurred.";
      try {
        const pErr = JSON.parse(msg);
        msg = pErr.error?.message || pErr.message || msg;
      } catch (e) {}
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setAnalysisStatus("");
    }
  };


  const runEvaluationLocally = (caseObj: any, rules: Rule[], appliedFixes: string[]) => {
    if (!analysisData) return [];
    try {
      const evaluate = new Function("caseObj", "rules", "appliedFixIds", analysisData.evaluationCode);
      return evaluate(caseObj, rules, appliedFixes);
    } catch (err) {
      console.error("Local VM eval crashed:", err);
      return [];
    }
  };

  const evaluateLocalModel = (currentFixes: string[], customCases?: any[]) => {
    if (!analysisData) return { score: 100, findings: [], cases: [], caseEvaluations: [] };

    const { rules = [], dimensions = [], findings = [] } = analysisData;
    const initialCases = customCases || (localCases && localCases.length > 0 ? localCases : (analysisData.cases || []));
    const mechanicalDefects: any[] = [];
    const caseEvaluations: any[] = [];

    const referencedDims = new Set<string>();
    for (const d of dimensions) {
      for (const r of rules) {
        if (r.clauseText.toLowerCase().includes(d.name.toLowerCase())) {
          referencedDims.add(d.name);
        }
      }
    }

    for (const C of initialCases) {
      const results = runEvaluationLocally(C, rules, currentFixes);
      caseEvaluations.push({
        caseId: C.caseId,
        caseObj: C,
        results: results || [],
      });
    }

    for (const evalObj of caseEvaluations) {
      const { caseId, caseObj, results } = evalObj;
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
        mechanicalDefects.push({
          kind: "contradiction",
          caseId,
        });
      }

      const litStr = JSON.stringify(uniqueLit.sort());
      const scopedStr = JSON.stringify(uniqueScoped.sort());
      const hasDisagreement = results.some((r: any) => r.appliesLiteral !== r.appliesScoped);
      if (hasDisagreement && litStr !== scopedStr) {
        mechanicalDefects.push({
          kind: "scope_ambiguity",
          caseId,
        });
      }

      const isMissing = (activeLiteral.length === 0) || (activeScoped.length === 0);
      if (isMissing) {
        mechanicalDefects.push({
          kind: "missing_outcome",
          caseId,
        });
      }

      if (isContradiction || isMissing) {
        const hasBoundaryVal = dimensions.some((d: any) => {
          if (d.kind === "numeric" || d.kind === "datetime") {
            const val = caseObj.attributes[d.name];
            return d.values.includes(String(val)) || d.values.includes(val);
          }
          return false;
        });
        if (hasBoundaryVal) {
          mechanicalDefects.push({
            kind: "boundary_collision",
            caseId,
          });
        }
      }
    }

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
            mechanicalDefects.push({
              kind: "counterfactual_parity",
              caseId: cA.caseId,
            });
            break;
          }
        }
      }
    }

    const updatedFindings = findings.map(f => {
      const isApplied = currentFixes.includes(f.id);
      if (!isApplied) {
        return { ...f, status: "open" as const };
      }

      const remainsFailing = f.evidenceCaseIds.some((cid: string) => {
        return mechanicalDefects.some((d: any) => d.caseId === cid);
      });

      return remainsFailing ? { ...f, status: "unverified" as const } : { ...f, status: "fixed" as const };
    });

    const openMajor = updatedFindings.filter(f => f.status === "open" && f.severity === "major").length;
    const openMinor = updatedFindings.filter(f => f.status === "open" && f.severity === "minor").length;
    const score = Math.max(0, 100 - 15 * openMajor - 5 * openMinor);

    const updatedCases = initialCases.map(c => {
      const match = mechanicalDefects.find((d: any) => d.caseId === c.caseId);
      return {
        ...c,
        status: match ? match.kind : "pass",
      };
    });

    return {
      score,
      findings: updatedFindings,
      cases: updatedCases,
      caseEvaluations,
    };
  };

  const { score: currentScore, findings: liveFindings, cases: liveCases } = evaluateLocalModel(appliedFixIds);

  const applyFix = (fid: string) => {
    if (appliedFixIds.includes(fid)) return;
    setAppliedFixIds(prev => [...prev, fid]);
    setFixedTimestamps(prev => ({ ...prev, [fid]: Date.now() }));
  };

  const handleFixAll = async () => {
    const openFindings = liveFindings.filter(f => f.status === "open");
    for (const f of openFindings) {
      await new Promise(r => setTimeout(r, 150));
      setAppliedFixIds(prev => [...prev, f.id]);
      setFixedTimestamps(prev => ({ ...prev, [f.id]: Date.now() }));
    }
  };

  const copyFixedDocument = () => {
    // simplified for App.tsx top level logic
  };

  const resetAnalysis = () => {
    setAnalysisData(null);
    setAppliedFixIds([]);
  };

  const handleOpenCase = (cid: string) => {
    setCaseFilter("all");
    setSelectedCaseId(cid);
    setHighlightedCaseId(cid);
    setTimeout(() => {
      if (caseRefs.current[cid]) {
        caseRefs.current[cid]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleAddCustomCase = () => {
    if (!analysisData) return;
    const cid = `case-custom-${Date.now()}`;
    const attrs: any = {};
    for (const d of analysisData.dimensions) {
      attrs[d.name] = d.values?.[0] || "";
    }
    const newCase: Case = {
      caseId: cid,
      attributes: attrs,
      description: "Custom user-generated scenario.",
      status: "pass",
    };
    setLocalCases([newCase, ...localCases]);
    setCaseDrafts(prev => ({ ...prev, [cid]: { ...attrs } }));
    
    setCaseFilter("all");
    setSelectedCaseId(cid);
    setHighlightedCaseId(cid);
    setTimeout(() => {
      if (caseRefs.current[cid]) {
        caseRefs.current[cid]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleReRunCase = async (cid: string) => {
    setRunningCases(prev => ({ ...prev, [cid]: true }));
    await new Promise(r => setTimeout(r, 400));
    const draft = caseDrafts[cid];
    if (draft) {
      setLocalCases(prev => prev.map(c => {
        if (c.caseId === cid) {
          const parts = Object.entries(draft).map(([k, v]) => `${k} is "${v}"`);
          return {
            ...c,
            attributes: { ...draft },
            description: `A test case scenario where ${parts.join(" and ")}.`,
          };
        }
        return c;
      }));
    }
    setRunningCases(prev => ({ ...prev, [cid]: false }));
  };

  const handleReRunAllCases = async () => {
    setIsReRunningAll(true);
    await new Promise(r => setTimeout(r, 600));
    setLocalCases(prev => [...prev]); // Trigger re-eval
    setIsReRunningAll(false);
  };

  const handleReRunFailedCases = async () => {
    setIsReRunningFailed(true);
    await new Promise(r => setTimeout(r, 600));
    setLocalCases(prev => [...prev]); // Trigger re-eval
    setIsReRunningFailed(false);
  };

  const handleApplySandboxJson = async () => {
    try {
      const parsed = JSON.parse(sandboxJsonText);
      setLocalCases(parsed);
      const drafts: any = {};
      parsed.forEach((c: any) => {
        drafts[c.caseId] = { ...c.attributes };
      });
      setCaseDrafts(drafts);
      setIsSandboxMode(false);
    } catch (e: any) {
      setSandboxJsonError(e.message);
    }
  };

  const handleAddMissingScenarioToSandbox = (scenario: any) => {
    if (!analysisData) return;
    const cid = `case-missing-${Date.now()}`;
    const attrs: any = {};
    for (const d of analysisData.dimensions) {
      attrs[d.name] = d.values?.[0] || "";
    }
    if (scenario.suggestedParameters) {
      Object.assign(attrs, scenario.suggestedParameters);
    }
    
    const newCase: Case = {
      caseId: cid,
      attributes: attrs,
      description: scenario.description,
      status: "pass"
    };

    setLocalCases([newCase, ...localCases]);
    setCaseDrafts(prev => ({ ...prev, [cid]: { ...attrs } }));
    
    setCaseFilter("all");
    setSelectedCaseId(cid);
    setHighlightedCaseId(cid);
    setTimeout(() => {
      if (caseRefs.current[cid]) {
        caseRefs.current[cid]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const canSubmit = mode === "text" ? isTextValid : mode === "file" ? isFileValid : isUrlValid;

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col border-[12px] md:border-[24px] border-black selection:bg-black selection:text-white">
      <AnimatePresence mode="wait">
        {!analysisData && !isLoading && (
          <EntryScreen
            mode={mode}
            setMode={setMode}
            textInput={textInput}
            setTextInput={setTextInput}
            selectedFile={selectedFile}
            handleFileChange={handleFileChange}
            fileError={fileError}
            urlInput={urlInput}
            handleUrlInputChange={handleUrlInputChange}
            urlError={urlError}
            errorMessage={errorMessage}
            handleCrashTest={handleCrashTest}
            handleSaveOnly={handleSaveOnly}
            canSubmit={canSubmit}
            savedDocs={savedDocs}
            handleLoadSavedDoc={handleLoadSavedDoc}
            setSavedDocs={setSavedDocs}
          />
        )}

        {isLoading && (
          <LoadingScreen
            loadingPhrase={loadingPhrase}
            analysisStatus={analysisStatus}
          />
        )}

        {analysisData && !isLoading && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col"
          >
            <ResultsHeader
              currentScore={currentScore}
              majorCount={liveFindings.filter(f => f.status === "open" && f.severity === "major").length}
              majorHighCount={0}
              majorLowCount={0}
              minorCount={liveFindings.filter(f => f.status === "open" && f.severity === "minor").length}
              minorHighCount={0}
              minorLowCount={0}
              casesRun={analysisData.casesRun}
              handleFixAll={handleFixAll}
              copyFixedDocument={copyFixedDocument}
              resetAnalysis={resetAnalysis}
              handleSaveAnalysis={handleSaveAnalysis}
            />
            <div className="p-8 pb-32 max-w-[1400px] mx-auto w-full">
              <DocumentTab
                analysisData={analysisData}
                liveFindings={liveFindings}
                appliedFixIds={appliedFixIds}
                openNoteIds={openNoteIds}
                setOpenNoteIds={setOpenNoteIds}
                handleOpenCase={handleOpenCase}
                removeFix={(fid) => {
                  setAppliedFixIds(prev => prev.filter(id => id !== fid));
                  const newTs = { ...fixedTimestamps };
                  delete newTs[fid];
                  setFixedTimestamps(newTs);
                }}
                applyFix={applyFix}
              />
            </div>
            
            <TestCasesSection
              analysisData={analysisData}
              isSandboxMode={isSandboxMode}
              setIsSandboxMode={setIsSandboxMode}
              sandboxJsonText={sandboxJsonText}
              setSandboxJsonText={setSandboxJsonText}
              sandboxJsonError={sandboxJsonError}
              setSandboxJsonError={setSandboxJsonError}
              handleApplySandboxJson={handleApplySandboxJson}
              caseFilter={caseFilter}
              setCaseFilter={setCaseFilter}
              handleReRunAllCases={handleReRunAllCases}
              isReRunningAll={isReRunningAll}
              isReRunningFailed={isReRunningFailed}
              handleReRunFailedCases={handleReRunFailedCases}
              liveCases={liveCases}
              handleAddCustomCase={handleAddCustomCase}
              selectedCaseId={selectedCaseId}
              setSelectedCaseId={setSelectedCaseId}
              highlightedCaseId={highlightedCaseId}
              setHighlightedCaseId={setHighlightedCaseId}
              caseRefs={caseRefs}
              runEvaluationLocally={runEvaluationLocally}
              appliedFixIds={appliedFixIds}
              caseDrafts={caseDrafts}
              setCaseDrafts={setCaseDrafts}
              handleReRunCase={handleReRunCase}
              runningCases={runningCases}
            />

          </motion.div>
        )}
      </AnimatePresence>

      <footer className="p-4 bg-[#1A1A1A] text-white flex justify-between items-center text-xs font-mono mt-auto shrink-0">
        <div className="text-[10px] font-bold tracking-widest uppercase opacity-60">Projector Mode Active</div>
        <div className="flex gap-4">
          <div className="text-[10px] font-bold uppercase">
            <span className="opacity-40">Model:</span> gemini-3.5-flash
          </div>
          <div className="text-[10px] font-bold uppercase">
            <span className="opacity-40">Seed:</span> 42
          </div>
        </div>
      </footer>
    </div>
  );
}
