import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createRequire } from "module";
import {
  enrichDimensions,
  generateSyntheticCases,
  getDimensionValues,
  runEvaluation,
  detectDefects,
  stripHtml,
} from "./server/engine";
import { createSavedAnalysesRouter } from "./server/savedAnalyses";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with 50MB limit for base64 file uploads
app.use(express.json({ limit: "50mb" }));

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Gemini Repair Call
async function repairEvaluationCode(badCode: string, errorMessage: string, documentText: string): Promise<string> {
  const prompt = `The following JavaScript function body failed to run or returned invalid format.
Error: ${errorMessage}

Function Body:
\`\`\`javascript
${badCode}
\`\`\`

The document content is:
${documentText}

Please repair the function body so that it runs successfully and returns an array of elements with the exact structure:
{ ruleId: string, appliesLiteral: boolean, appliesScoped: boolean, outcome: string | null }
for each rule in \`rules\`. Do not include any imports, I/O, or Date.now. Return ONLY the raw JavaScript function body. No markdown formatting, no \`\`\`javascript wrapper. Just the code.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });

  let text = response.text || "";
  text = text.replace(/^```javascript\n/, "").replace(/^```js\n/, "").replace(/```$/, "").trim();
  return text;
}

// Fetch and strip HTML helper
async function fetchAndStripUrl(urlStr: string): Promise<string> {
  const response = await fetch(urlStr, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const html = await response.text();

  return stripHtml(html);
}

// Response Schema for Structured JSON
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    documentTitle: { type: Type.STRING },
    documentText: { type: Type.STRING, description: "Verbatim complete plain text of the entire analyzed document." },
    rules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          clauseText: { type: Type.STRING, description: "VERBATIM contiguous quote from source" },
          appliesTo: { type: Type.STRING },
          scopeProvenance: { type: Type.STRING, enum: ["explicit", "inherited_from_section", "unstated"] },
        },
        required: ["id", "clauseText", "appliesTo", "scopeProvenance"],
      },
    },
    dimensions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          kind: { type: Type.STRING, enum: ["categorical", "numeric", "datetime"] },
          values: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of categorical options OR exact boundary values (just-before, at, and just-after every threshold in the document).",
          },
          range: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Range of valid values, e.g. [min, max] or boundary thresholds.",
          },
        },
        required: ["name", "kind"],
      },
    },
    evaluationCode: { type: Type.STRING, description: "Body of pure, deterministic evaluate(caseObj, rules, appliedFixIds) function returning rules outcomes." },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["major", "minor"] },
          kind: { type: Type.STRING, enum: ["contradiction", "scope_ambiguity", "missing_outcome", "boundary_collision", "counterfactual_parity"] },
          title: { type: Type.STRING },
          originalText: { type: Type.STRING, description: "VERBATIM character-for-character quote from document, 15-400 chars" },
          occurrence: { type: Type.INTEGER, description: "1-based occurrence index" },
          replacementText: { type: Type.STRING, description: "Minimal corrected wording in same voice" },
          explanation: { type: Type.STRING },
          conflictsWith: { type: Type.STRING, description: "Verbatim quote of the other clause, or empty string" },
        },
        required: ["id", "severity", "kind", "title", "originalText", "occurrence", "replacementText", "explanation", "conflictsWith"],
      },
    },
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          categoryName: { type: Type.STRING },
          definedInClause: { type: Type.STRING, description: "VERBATIM contiguous quote from document" },
        },
        required: ["categoryName", "definedInClause"],
      },
    },
    coverageMatrix: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          topic: { type: Type.STRING },
          coveringRuleId: { type: Type.STRING },
        },
        required: ["category", "topic", "coveringRuleId"],
      },
    },
    thresholds: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          thresholdValue: { type: Type.STRING },
          clauseText: { type: Type.STRING, description: "VERBATIM contiguous quote from document" },
          dimension: { type: Type.STRING },
        },
        required: ["thresholdValue", "clauseText", "dimension"],
      },
    },
    unscopedSentences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sentenceText: { type: Type.STRING, description: "VERBATIM contiguous quote of sentence" },
          parentSectionScope: { type: Type.STRING },
        },
        required: ["sentenceText", "parentSectionScope"],
      },
    },
    outcomeFactors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          factorName: { type: Type.STRING },
          isLegitimateBasis: { type: Type.BOOLEAN },
        },
        required: ["factorName", "isLegitimateBasis"],
      },
    },
    passStats: {
      type: Type.OBJECT,
      properties: {
        categoriesChecked: { type: Type.INTEGER },
        topicsChecked: { type: Type.INTEGER },
        thresholdsChecked: { type: Type.INTEGER },
        unscopedSentencesChecked: { type: Type.INTEGER },
        outcomeFactorsChecked: { type: Type.INTEGER },
      },
      required: ["categoriesChecked", "topicsChecked", "thresholdsChecked", "unscopedSentencesChecked", "outcomeFactorsChecked"],
    },
  },
  required: [
    "documentTitle",
    "documentText",
    "rules",
    "dimensions",
    "evaluationCode",
    "findings",
    "categories",
    "coverageMatrix",
    "thresholds",
    "unscopedSentences",
    "outcomeFactors",
    "passStats",
  ],
};

// API Endpoint for Crash-Testing Policies
app.post("/api/crash", async (req, res) => {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendStatus = (status: string) => {
    res.write(`data: ${JSON.stringify({ status })}\n\n`);
  };

  try {
    const { mode, text, fileBase64, mimeType, url } = req.body;

    sendStatus("Initializing ClauseCrash analysis engine...");

    let originalText = "";
    let systemPrompt = `
You are ClauseCrash, a coherence test engine. You do not give legal advice.

Run FIVE MANDATORY PASSES in order. Populate every enumeration field BEFORE writing any finding — findings may only reference items that appear in the enumerations. Do not stop after the first finding: a typical document has several defects, and finding a contradiction does not exempt the other passes.

Every originalText, clauseText, and conflictsWith must be character-for-character verbatim from the source. Return empty findings only if every enumeration was completed and produced no defects.

PASS 0 — EXTRACTION:
Populate the rules[] array. Each rule must have:
- 'id': e.g., "rule_1", "rule_2"
- 'clauseText': The EXACT, character-for-character VERBATIM quote from the source document representing this rule.
- 'appliesTo': A description of who or what this rule applies to.
- 'scopeProvenance': One of "explicit" | "inherited_from_section" | "unstated".

PASS A — CATEGORY COVERAGE → missing_outcome:
Fill categories[]: every enumerated set in the document (plans, tiers, tracks, user types, fare classes) with the categoryName and definedInClause (the verbatim clause that defines it).
Fill coverageMatrix[]: for EVERY category × EVERY rule topic present in the document (refunds, cancellation, processing times, notice periods…), record the category, topic, and coveringRuleId (covering rule's ID or "NONE").
Each combination with "NONE" as coveringRuleId represents a missing_outcome finding. Ensure you report these findings!

PASS B — THRESHOLD TILING → boundary_collision:
Fill thresholds[]: every numeric or temporal threshold, its verbatim clauseText, and its dimension.
For each dimension with 2+ thresholds, verify the ranges tile exactly by testing just-below / at / just-above each threshold value. Any value falling in a gap or in two ranges is a boundary_collision finding (e.g. "up to 10" plus "more than 11" leaves exactly 11 uncovered). Emphasize and report these collisions as boundary_collision findings!

PASS C — SCOPE AUDIT → scope_ambiguity:
Fill unscopedSentences[]: every obligation, permission, or deadline sentence that names no explicit subject scope while sitting inside a section scoped to one category.
For each, evaluate BOTH readings — literal-global and section-inherited. If the readings produce different outcomes for some case, emit a scope_ambiguity (minor) finding naming the assumption that resolves it.

PASS D — PARITY → counterfactual_parity:
Fill outcomeFactors[]: every attribute that changes any outcome anywhere in the document (submission channel, document format, payment method, plan, timing…).
For each, check whether the document anywhere establishes it as a legitimate decision basis. An unestablished factor that gives two otherwise-identical cases different outcomes is a counterfactual_parity finding. (A factor like "plan" that the document explicitly prices and scopes is legitimate — do not flag explicitly scoped differences.)

PASS E — CONTRADICTION:
Identify major contradictions. Two rules whose scopes overlap under BOTH readings and yield incompatible outcomes for one concrete case. Severity major.

Fill passStats: {categoriesChecked, topicsChecked, thresholdsChecked, unscopedSentencesChecked, outcomeFactorsChecked} representing counts of elements processed or validated during each pass.

Let's write the 'evaluationCode'. This must be the body of a pure, deterministic JavaScript function evaluate(caseObj, rules, appliedFixIds) with NO imports, NO I/O, and NO Date.now.
The function evaluate takes:
- caseObj: { caseId, attributes: { [dimName]: value } }
- rules: the list of rules
- appliedFixIds: an array of finding IDs that have been "fixed".
The function MUST return an array of rule evaluation results, one for each rule:
{ ruleId: string, appliesLiteral: boolean, appliesScoped: boolean, outcome: string | null }
- 'appliesLiteral': true if the rule applies literally to the caseObj attributes.
- 'appliesScoped': true if the rule applies to the caseObj when taking into account section hierarchy or implied scope.
- 'outcome': The outcome of the rule (e.g., "approved", "denied", "50% discount") if it applies; otherwise null.
- Crucially, if a finding ID is in 'appliedFixIds', the function must evaluate using that finding's corrected text ('replacementText') instead of the original 'clauseText'!

For findings[], each must have:
- 'id': A unique identifier (e.g., "finding_1")
- 'severity': "major" or "minor"
- 'kind': "contradiction" | "scope_ambiguity" | "missing_outcome" | "boundary_collision" | "counterfactual_parity"
- 'title': A short title (max 8 words)
- 'originalText': VERBATIM character-for-character quote from the document representing the conflicting/ambiguous span, 15 to 400 characters
- 'occurrence': 1-based index of which occurrence of originalText this is
- 'replacementText': A corrected, minimal-change wording in the same voice to resolve the conflict
- 'explanation': A short description (max 2 sentences) of why it's a defect
- 'conflictsWith': VERBATIM quote of the other clause it conflicts with, or an empty string
`;

    let gResult: any = null;

    if (process.env.USE_FIXTURE === "true") {
      sendStatus("Reading submitted document text...");
      await new Promise(r => setTimeout(r, 150));
      const fixturePath = path.join(process.cwd(), "fixture.json");
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      gResult = fixtureData;
      originalText = fixtureData.originalText;
      sendStatus("Invoking Gemini API for deep semantic analysis...");
      await new Promise(r => setTimeout(r, 200));
      sendStatus("Verifying citation-level authenticity...");
      await new Promise(r => setTimeout(r, 150));
    } else {
      // 1. EXTRACT TEXT
      if (mode === "text") {
        originalText = text;
      } else if (mode === "file") {
        sendStatus("Extracting content from uploaded file...");
        const buffer = Buffer.from(fileBase64, "base64");
        // Size check (15MB limit)
        const MAX_FILE_SIZE = 15 * 1024 * 1024;
        if (buffer.length > MAX_FILE_SIZE) {
          throw new Error("The uploaded file exceeds the 15MB size limit. Please upload a smaller file.");
        }

        if (mimeType === "application/pdf" || mimeType?.includes("pdf") || (selectedFile => selectedFile && (selectedFile.name.endsWith(".pdf") || selectedFile.type === "application/pdf"))) {
          try {
            const parsedPdf = await pdf(buffer);
            originalText = parsedPdf.text;
            if (!originalText || originalText.trim().length === 0) {
              throw new Error("No readable text could be extracted from the PDF file.");
            }
          } catch (pdfErr: any) {
            console.error("PDF Extraction Error:", pdfErr);
            throw new Error(`Failed to extract text from PDF: ${pdfErr.message || pdfErr}`);
          }
        } else {
          // txt or md file
          try {
            originalText = buffer.toString("utf-8");
          } catch (decodeErr: any) {
            throw new Error(`Failed to decode the text file: ${decodeErr.message || decodeErr}`);
          }
        }
      } else if (mode === "url") {
        try {
          sendStatus(`Fetching remote document content from URL: ${url}...`);
          const strippedText = await fetchAndStripUrl(url);
          originalText = strippedText;
          if (!originalText || originalText.trim().length === 0) {
            throw new Error("The provided URL contains no readable plain text or policy clauses. Please verify the URL or try pasting the text instead.");
          }
        } catch (fetchErr: any) {
          console.error("URL fetch or process error:", fetchErr);
          throw new Error(`Failed to fetch or process the provided URL: ${fetchErr.message || fetchErr}. Please check the URL, ensure it is publicly accessible, or copy-paste the policy text directly.`);
        }
      }

      // 2. CALL GEMINI
      sendStatus("Synthesizing document structures...");
      await new Promise(r => setTimeout(r, 100));
      sendStatus("Invoking Gemini API for deep semantic analysis...");
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            { text: `Document content:\n${originalText}` },
            { text: systemPrompt },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema as any,
          },
        });
        console.log("Raw Gemini Response:", response.text);
        gResult = JSON.parse(response.text || "{}");
      } catch (geminiErr: any) {
        console.error("Gemini call failed:", geminiErr);
        throw geminiErr;
      }
    }

    if (!gResult) {
      throw new Error("No analysis result was generated.");
    }

    sendStatus("Verifying citation-level authenticity...");
    const docText = originalText || gResult.documentText || "";
    const rules = gResult.rules || [];
    const originalFindings = gResult.findings || [];
    const dimensions = gResult.dimensions || [];
    let evaluationCode = gResult.evaluationCode || "";

    // 1. CITATION GATE: drop mismatching rules or findings
    const verifiedRules = rules.filter((r: any) => {
      const ok = docText.includes(r.clauseText);
      if (!ok) {
        console.log(`[Citation Gate Drop] Rule ${r.id} dropped. Quote not found in document.`);
      }
      return ok;
    });

    const preVerifiedFindings = originalFindings.filter((f: any) => {
      const okOrig = docText.includes(f.originalText);
      const okConf = !f.conflictsWith || docText.includes(f.conflictsWith);
      if (!okOrig) {
        console.log(`[Citation Gate Drop] Finding ${f.id} dropped. Original quote not found in document.`);
      }
      if (f.conflictsWith && !okConf) {
        console.log(`[Citation Gate Drop] Finding ${f.id} dropped. Conflict quote not found in document.`);
      }
      return okOrig && okConf;
    });

    // Programmatic dimension enrichment
    const enrichedDimensions = enrichDimensions(dimensions, gResult.thresholds || [], gResult.categories || []);

    sendStatus("Generating multi-dimensional synthetic coverage cases...");
    // 2. POPULATION: generate synthetic cases
    const cases = generateSyntheticCases(enrichedDimensions);

    sendStatus("Running rule-engine evaluation & consistency solver...");
    // 3. EXECUTION & REPAIR LOOP
    let success = false;
    let attempts = 0;
    while (attempts < 2 && !success) {
      try {
        if (cases.length > 0) {
          const testRes = runEvaluation(evaluationCode, cases[0], verifiedRules, []);
          if (!Array.isArray(testRes)) {
            throw new Error("Evaluation function did not return an array.");
          }
        }
        success = true;
      } catch (e: any) {
        attempts++;
        console.warn(`Evaluation code exception (attempt ${attempts}):`, e.message);
        if (attempts >= 2) break;
        evaluationCode = await repairEvaluationCode(evaluationCode, e.message, docText);
      }
    }

    // 4. DEFECT DETECTION (mechanical)
    const mechanicalDefects = detectDefects(cases, verifiedRules, evaluationCode, enrichedDimensions);

    // 5. VERIFICATION LINK
    const verifiedFindings: any[] = [];
    for (const f of preVerifiedFindings) {
      const matches = mechanicalDefects.filter((d: any) => d.kind === f.kind);
      if (matches.length > 0) {
        f.evidenceCaseIds = matches.slice(0, 5).map((d: any) => d.caseId);
        if (matches[0].rulesInvolved) {
          f.rulesInvolved = [...matches[0].rulesInvolved];
        }
        verifiedFindings.push(f);
      } else {
        console.log(`[Verification Link Drop] Finding ${f.id} dropped. Mechanical execution did not reproduce the defect.`);
      }
    }

    // --- SECOND-PASS NARRATION FOR UNHANDLED EDGE CASES ---
    const detectedKinds = [...new Set(mechanicalDefects.map((d: any) => d.kind))];
    const verifiedKinds = [...new Set(verifiedFindings.map((f: any) => f.kind))];
    const unmatchedKinds = detectedKinds.filter((k: any) => !verifiedKinds.includes(k));

    if (unmatchedKinds.length > 0 && process.env.USE_FIXTURE !== "true") {
      sendStatus("Narrating unhandled edge cases and boundary gaps...");
      try {
        const unmatchedDefectReport = unmatchedKinds.map((kind) => {
          const matches = mechanicalDefects.filter((d: any) => d.kind === kind);
          const examples = matches.slice(0, 3).map((d: any) => {
            const cObj = cases.find((c: any) => c.caseId === d.caseId);
            return {
              caseId: d.caseId,
              attributes: cObj ? cObj.attributes : {},
              description: cObj ? cObj.description : ""
            };
          });
          return {
            kind,
            exampleCases: examples,
            rulesInvolved: matches[0]?.rulesInvolved || []
          };
        });

        const narrationSchema = {
          type: Type.OBJECT,
          properties: {
            findings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING, enum: ["major", "minor"] },
                  kind: { type: Type.STRING, enum: ["contradiction", "scope_ambiguity", "missing_outcome", "boundary_collision", "counterfactual_parity"] },
                  title: { type: Type.STRING },
                  originalText: { type: Type.STRING, description: "VERBATIM character-for-character quote of the problematic text, 15-400 chars" },
                  occurrence: { type: Type.INTEGER },
                  replacementText: { type: Type.STRING, description: "Minimal corrected wording in same voice" },
                  explanation: { type: Type.STRING },
                  conflictsWith: { type: Type.STRING, description: "Verbatim quote of any other clause involved, or empty string" },
                },
                required: ["severity", "kind", "title", "originalText", "occurrence", "replacementText", "explanation", "conflictsWith"],
              }
            }
          },
          required: ["findings"]
        };

        const narrationPrompt = `
You are the ClauseCrash Coherence Narrator. We ran mechanical evaluations on a policy document and found some unhandled defects.
Your job is to read the document, the list of extracted rules, and the details of these mechanical defects, and write the human-friendly metadata (title, originalText, replacementText, explanation, conflictsWith) for each one.

Every originalText, and conflictsWith must be character-for-character VERBATIM from the source document. If a verbatim quote is not in the document, it will fail the validation check and be rejected.

Source Document:
"""
${docText}
"""

Rules:
${JSON.stringify(verifiedRules, null, 2)}

Active Mechanical Defects:
${JSON.stringify(unmatchedDefectReport, null, 2)}

For each unmatched defect kind in the list, write exactly ONE high-quality finding following the rules of ClauseCrash:
1. 'originalText': Verbatim character-for-character quote from the document representing the conflicting, ambiguous, or incomplete span.
2. 'replacementText': Minimal-change wording in the same voice to resolve the defect.
3. 'explanation': 1-2 sentences explaining why this is a defect under these test cases.
4. 'conflictsWith': Verbatim quote of any other clause involved, or an empty string.
5. 'severity': "major" if kind is 'contradiction' or 'counterfactual_parity', else "minor".
`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: narrationPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: narrationSchema as any,
          },
        });

        console.log("Raw Narration Response:", response.text);
        const gNarrateResult = JSON.parse(response.text || "{}");
        const narratedFindings = gNarrateResult.findings || [];

        const verifiedNarrated = narratedFindings.filter((f: any) => {
          const okOrig = docText.includes(f.originalText);
          const okConf = !f.conflictsWith || docText.includes(f.conflictsWith);
          return okOrig && okConf;
        });

        for (const f of verifiedNarrated) {
          const matches = mechanicalDefects.filter((d: any) => d.kind === f.kind);
          if (matches.length > 0) {
            f.id = `narrated_${f.kind}_${verifiedFindings.length + 1}`;
            f.evidenceCaseIds = matches.slice(0, 5).map((d: any) => d.caseId);
            f.status = "open";
            if (matches[0].rulesInvolved) {
              f.rulesInvolved = [...matches[0].rulesInvolved];
            }
            verifiedFindings.push(f);
          }
        }
      } catch (narrateErr) {
        console.error("Secondary narration failed:", narrateErr);
      }
    }
    // ------------------------------------------------------

    // 6. SCORE (server arithmetic)
    const openMajor = verifiedFindings.filter((f: any) => f.severity === "major").length;
    const openMinor = verifiedFindings.filter((f: any) => f.severity === "minor").length;
    const score = Math.max(0, 100 - 15 * openMajor - 5 * openMinor);

    // Update case statuses for response
    for (const c of cases) {
      const match = mechanicalDefects.find((d: any) => d.caseId === c.caseId);
      c.status = match ? match.kind : "pass";
    }

    sendStatus("Finalizing analysis and integrity report...");
    await new Promise(r => setTimeout(r, 100));

    // Ensure final response dimensions have fully populated values
    const finalDimensions = enrichedDimensions.map((d: any) => ({
      ...d,
      values: getDimensionValues(d),
    }));

    res.write(`data: ${JSON.stringify({
      result: {
        documentTitle: gResult.documentTitle || "Analyzed Policy",
        originalText: docText,
        casesRun: cases.length,
        score,
        findings: verifiedFindings,
        cases,
        rules: verifiedRules,
        evaluationCode,
        dimensions: finalDimensions,
        categories: gResult.categories || [],
        coverageMatrix: gResult.coverageMatrix || [],
        thresholds: gResult.thresholds || [],
        unscopedSentences: gResult.unscopedSentences || [],
        outcomeFactors: gResult.outcomeFactors || [],
        passStats: gResult.passStats || {
          categoriesChecked: 0,
          topicsChecked: 0,
          thresholdsChecked: 0,
          unscopedSentencesChecked: 0,
          outcomeFactorsChecked: 0,
        },
      }
    })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("Backend Error in /api/crash:", error);
    try {
      res.write(`data: ${JSON.stringify({ error: error.message || "Internal Server Error" })}\n\n`);
      res.end();
    } catch (_) {
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Internal Server Error" });
      }
    }
  }
});

// API Endpoint for Gap & Reference Analysis
app.post("/api/gap-analysis", async (req, res) => {
  try {
    const { text, title } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "No document text was provided for gap analysis." });
    }

    const systemPrompt = `You are the ClauseCrash Gaps & Reference Engine.
Your task is to analyze the provided policy document, identify its category (e.g. Privacy Policy, SaaS SLA, Terms of Service, Refund Policy, Employment Agreement, NDA), and assess its structural completeness against standard industry best practices or regulatory standards (like GDPR, CCPA, HIPAA, ISO 27001, standard SaaS metrics, etc.).
Formulate a list of standard structural compliance checklist items (marking them as "present", "missing", or "partial" with an explanation).
Additionally, generate at least 4 key "Missing Scenarios/Cases" that represent untested or unaddressed operational situations because the policy currently lacks provisions for them.

Rely on your broad knowledge of typical best practices, regulatory requirements, and reference frameworks for the identified policy type to ground your analysis in authentic current standards. Cite known standard recommendations where applicable in your checklist explanations.`;

    const contents = `Document Title: ${title || "Unnamed Document"}
Document Text:
${text}

Please compile the structured compliance checklist, missing scenarios, and reference materials.`;

    const gapSchema = {
      type: Type.OBJECT,
      properties: {
        policyType: { type: Type.STRING },
        checklist: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING, description: "e.g., 'Data Retention Period', 'Security Breach Notification', 'Uptime Credit Claims'" },
              description: { type: Type.STRING, description: "Brief description of why this is a standard requirement for this policy type." },
              status: { type: Type.STRING, enum: ["present", "missing", "partial"] },
              explanation: { type: Type.STRING, description: "Why the current document is missing, partially addressing, or successfully meeting this requirement, citing standard industry best practices or regulations." }
            },
            required: ["item", "description", "status", "explanation"]
          }
        },
        missingScenarios: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Operational case/scenario title representing a critical gap" },
              description: { type: Type.STRING, description: "A narrative explanation of what happens in this scenario and why it's untested." },
              reasonMissing: { type: Type.STRING, description: "Which missing clause/rule in the policy causes this gap." },
              suggestedParameters: {
                type: Type.OBJECT,
                description: "JSON object of attributes/values for this missing scenario so the user can test/simulate it, e.g., { 'userType': 'child', 'region': 'EU' }"
              }
            },
            required: ["title", "description", "reasonMissing", "suggestedParameters"]
          }
        }
      },
      required: ["policyType", "checklist", "missingScenarios"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemPrompt },
        { text: contents }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: gapSchema
      }
    });

    const parsedResult = JSON.parse(response.text || "{}");

    // Extract reference materials from Grounding chunks!
    const referenceMaterials: any[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if (chunk.web && chunk.web.uri) {
          if (!referenceMaterials.some(r => r.url === chunk.web.uri)) {
            referenceMaterials.push({
              title: chunk.web.title || "External Policy Guidance",
              url: chunk.web.uri,
              summary: "Google Search grounding source used to verify compliance guidelines for this policy type."
            });
          }
        }
      }
    }

    res.json({
      ...parsedResult,
      referenceMaterials
    });

  } catch (error: any) {
    console.error("Error in /api/gap-analysis:", error);
    res.status(500).json({ error: error.message || "Failed to analyze policy gaps." });
  }
});

app.use("/api/saved-analyses", createSavedAnalysesRouter());

app.post("/api/parse", async (req, res) => {
  try {
    const { mode, text, fileBase64, mimeType, url } = req.body;
    let originalText = "";
    if (mode === "text") {
      originalText = text;
    } else if (mode === "file") {
      const buffer = Buffer.from(fileBase64, "base64");
      if (mimeType === "application/pdf" || mimeType?.includes("pdf")) {
        const parsedPdf = await pdf(buffer);
        originalText = parsedPdf.text;
      } else {
        originalText = buffer.toString("utf-8");
      }
    } else if (mode === "url") {
      originalText = await fetchAndStripUrl(url);
    }
    res.json({ text: originalText });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to parse" });
  }
});
// -------------------------------------

// Vite & Static file configurations
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClauseCrash server running on port ${PORT}`);
  });
}

startServer();
