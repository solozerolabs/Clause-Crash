import express from "express";

// --- Saved Analyses DB (In-Memory, one store per router) ---
export function createSavedAnalysesRouter() {
  let savedAnalyses: any[] = [];
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(savedAnalyses);
  });

  router.post("/", (req, res) => {
    const { id, title, text, analysisData } = req.body;
    if (!title || !text || !analysisData) {
      return res.status(400).json({ error: "Missing title, text, or analysisData" });
    }
    
    if (id) {
      const existingIndex = savedAnalyses.findIndex(d => d.id === id);
      if (existingIndex >= 0) {
        savedAnalyses[existingIndex] = {
          ...savedAnalyses[existingIndex],
          title,
          text,
          analysisData,
          lastUpdated: Date.now()
        };
        
        // Cascade to downstreams
        savedAnalyses.forEach(doc => {
          if (doc.upstreamId === id) {
            doc.lastUpdated = Date.now();
            // Add a dummy finding to show the cascade effect
            if (!doc.analysisData.findings.some((f: any) => f.id === "F-CASCADE")) {
               doc.analysisData.findings.push({
                 id: "F-CASCADE",
                 severity: "major",
                 kind: "boundary_collision",
                 title: "Cascade Update from Upstream",
                 originalText: doc.text.substring(0, 30),
                 occurrence: 1,
                 replacementText: "Updated due to upstream change.",
                 explanation: "An upstream linked document was updated, which may affect clauses in this document.",
                 evidenceCaseIds: [],
                 status: "open"
               });
               doc.analysisData.score = Math.max(0, doc.analysisData.score - 15);
            }
          }
        });
        return res.status(200).json(savedAnalyses[existingIndex]);
      }
    }

    const newId = "sa_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const newDoc = {
      id: newId,
      title,
      text,
      analysisData,
      lastUpdated: Date.now()
    };
    
    savedAnalyses.push(newDoc);
    res.status(201).json(newDoc);
  });

  router.put("/:id/link", (req, res) => {
    const { id } = req.params;
    const { upstreamId } = req.body;
    
    const doc = savedAnalyses.find(d => d.id === id);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    doc.upstreamId = upstreamId;
    res.json(doc);
  });

  router.delete("/:id", (req, res) => {
    const { id } = req.params;
    savedAnalyses = savedAnalyses.filter(d => d.id !== id);
    res.json({ success: true });
  });

  return router;
}
