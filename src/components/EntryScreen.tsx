import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Upload, Globe, AlertCircle } from "lucide-react";
import { SECTOR_PRESETS } from "../data";

interface EntryScreenProps {
  mode: "text" | "file" | "url" | "saved";
  setMode: (mode: "text" | "file" | "url" | "saved") => void;
  textInput: string;
  setTextInput: (text: string) => void;
  selectedFile: File | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileError: string;
  urlInput: string;
  handleUrlInputChange: (val: string) => void;
  urlError: string;
  errorMessage: string;
  handleCrashTest: () => void;
  handleSaveOnly?: () => void;
  canSubmit: boolean;
  savedDocs?: any[];
  handleLoadSavedDoc?: (doc: any) => void;
  setSavedDocs?: (docs: any[]) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  mode,
  setMode,
  textInput,
  setTextInput,
  selectedFile,
  handleFileChange,
  fileError,
  urlInput,
  handleUrlInputChange,
  urlError,
  errorMessage,
  handleCrashTest,
  handleSaveOnly,
  canSubmit,
  savedDocs = [],
  handleLoadSavedDoc,
  setSavedDocs
}) => {
  const aggregateErrors = savedDocs.reduce((acc, doc) => {
    const errors = doc.analysisData?.findings?.length || 0;
    return acc + errors;
  }, 0);

  return (
    <motion.div
      key="entry"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full px-6 py-20"
    >
      <div className="text-left mb-12">
        <h1 className="text-6xl sm:text-7xl font-black tracking-tighter leading-none uppercase mb-2">
          ClauseCrash
        </h1>
      </div>

      <div className="flex gap-0 border-4 border-black mb-12">
        {(["text", "file", "url", "saved"] as const).map(type => (
          <button
            key={type}
            onClick={() => setMode(type)}
            className={"flex-1 py-4 text-sm font-black uppercase tracking-widest transition-none cursor-pointer border-r-4 border-black last:border-r-0 flex items-center justify-center gap-2 " + (
              mode === type
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-gray-100"
            )}
          >
            {type}
            {type === "saved" && aggregateErrors > 0 && (
              <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 font-mono">{aggregateErrors}</span>
            )}
          </button>
        ))}
      </div>

      {mode !== "saved" && (
        <div className="mb-8 min-h-[160px]">
          {mode === "text" && (
            <div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste policy clauses, terms of service, membership rules or cancellation clauses..."
              className="w-full h-44 p-4 text-sm bg-white border-4 border-black rounded-none focus:outline-none focus:ring-0 font-sans leading-relaxed resize-none"
            />
            <div className="flex justify-between items-center mt-3 px-1">
              <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Max 150,000 characters</span>
              <span className={"text-xs font-mono font-bold " + (textInput.length > 150000 ? "text-red-600" : "text-neutral-700")}>
                {textInput.length.toLocaleString()} / 150,000
              </span>
            </div>
          </div>
        )}

        {mode === "file" && (
          <div className="flex flex-col items-center justify-center border-4 border-dashed border-black rounded-none bg-white p-8 text-center min-h-[176px] relative hover:bg-gray-100 transition-none cursor-pointer">
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className="w-8 h-8 text-neutral-400 mb-3" />
            <span className="text-sm font-black uppercase tracking-wider text-neutral-800">
              {selectedFile ? selectedFile.name : "Select Document"}
            </span>
            <span className="text-[10px] text-neutral-400 font-mono mt-1.5 uppercase tracking-widest">
              Accepts .pdf, .txt, .md (Max 15 MB)
            </span>
            {fileError && (
              <p className="text-xs text-red-600 mt-4 font-bold flex items-center gap-1.5 justify-center uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {fileError}
              </p>
            )}
          </div>
        )}

        {mode === "url" && (
          <div className="bg-white border-4 border-black rounded-none p-6">
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2.5">Policy URL</label>
            <div className="relative">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => handleUrlInputChange(e.target.value)}
                placeholder="https://example.com/membership-terms"
                className="w-full pl-10 pr-4 py-3 text-sm bg-white border-4 border-black rounded-none focus:outline-none focus:bg-gray-100 font-sans"
              />
              <Globe className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
            </div>
            {urlError && (
              <p className="text-xs text-red-600 mt-3 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {urlError}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {mode !== "saved" && errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-500 text-red-900 text-xs rounded-none font-bold flex items-start gap-3 uppercase tracking-wider">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {mode !== "saved" && (
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <button
            onClick={handleCrashTest}
            disabled={!canSubmit}
            className={"flex-[2] py-6 rounded-none text-2xl font-black uppercase transition-none flex items-center justify-center gap-2 border-4 border-black " + (
              canSubmit
                ? "bg-black hover:bg-white text-white hover:text-black cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
            )}
          >
            Crash Test
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleSaveOnly}
            disabled={!canSubmit}
            className={"flex-1 py-6 rounded-none text-2xl font-black uppercase transition-none flex items-center justify-center border-4 border-black " + (
              canSubmit
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
            )}
          >
            Save
          </button>
        </div>
      )}

      {mode !== "saved" && (
        <div className="mb-8 mt-2 border-t-4 border-black pt-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[12px] font-black uppercase tracking-widest text-black opacity-40">
              Select a Sector Preset Demo
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {SECTOR_PRESETS.map((p) => {
              const isSelected = mode === "text" && textInput === p.text;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setMode("text");
                    setTextInput(p.text);
                  }}
                  className={"text-left p-4 border-4 transition-none rounded-none flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer " + (
                    isSelected
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-black hover:bg-gray-100"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={"text-[10px] font-black font-mono uppercase tracking-widest px-2 py-1 border-2 " + (
                        isSelected
                          ? "bg-white text-black border-white"
                          : "bg-black text-white border-black"
                      )}>
                        {p.segment}: {p.tag}
                      </span>
                      <span className={"text-sm font-bold leading-tight " + (isSelected ? "text-white" : "text-black")}>
                        {p.title}
                      </span>
                    </div>
                    <p className={"text-[11px] uppercase tracking-wider font-bold " + (isSelected ? "opacity-60" : "opacity-50")}>
                      {p.description}
                    </p>
                  </div>
                  <ArrowRight className={"w-5 h-5 shrink-0 transition-none " + (
                    isSelected ? "text-white" : "text-black"
                  )} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === "saved" && savedDocs && (
        <div className="mb-8 mt-2">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[12px] font-black uppercase tracking-widest text-black opacity-40">
              Saved Documents
            </span>
          </div>
          {savedDocs.length === 0 ? (
            <div className="p-8 border-4 border-black border-dashed text-center text-neutral-500 font-bold uppercase tracking-widest text-xs">
              No saved documents yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {savedDocs.map(doc => {
                const errors = doc.analysisData?.findings?.length || 0;
                return (
                  <div
                    key={doc.id}
                    className="text-left p-4 border-4 transition-none rounded-none flex flex-col gap-3 bg-white text-black border-black"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1 flex-1">
                        <span className="text-sm font-bold leading-tight text-black flex items-center gap-2">
                          {doc.title}
                          {errors > 0 && (
                            <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 font-mono">{errors}</span>
                          )}
                        </span>
                        <p className="text-[11px] uppercase tracking-wider font-bold opacity-50">
                          Last Updated: {new Date(doc.lastUpdated).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleLoadSavedDoc && handleLoadSavedDoc(doc)}
                        className="bg-black text-white px-4 py-2 text-[10px] font-black tracking-widest uppercase hover:bg-neutral-800 transition-none"
                      >
                        Load Analysis
                      </button>
                    </div>
                    
                    <div className="pt-3 border-t-2 border-neutral-100 flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-neutral-400">Link Upstream:</span>
                      <select
                        value={doc.upstreamId || ""}
                        onChange={async (e) => {
                          const upstreamId = e.target.value;
                          try {
                            const res = await fetch(`/api/saved-analyses/${doc.id}/link`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ upstreamId: upstreamId || undefined })
                            });
                            if (res.ok) {
                              const updated = await res.json();
                              setSavedDocs && setSavedDocs(savedDocs.map(d => d.id === updated.id ? updated : d));
                            }
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="flex-1 text-[10px] bg-neutral-50 border-2 border-black p-1 uppercase font-bold font-mono focus:outline-none"
                      >
                        <option value="">None (Standalone)</option>
                        {savedDocs.filter(d => d.id !== doc.id).map(other => (
                          <option key={other.id} value={other.id}>{other.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
