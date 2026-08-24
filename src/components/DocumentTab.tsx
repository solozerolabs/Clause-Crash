import React, { useMemo } from "react";
import { Check, Info, FileText, Download, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Finding } from "../types";

interface DocumentTabProps {
  analysisData: any;
  liveFindings: Finding[];
  appliedFixIds: string[];
  openNoteIds: Record<string, boolean>;
  setOpenNoteIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleOpenCase: (cid: string) => void;
  removeFix: (fid: string) => void;
  applyFix: (fid: string) => void;
}

export const DocumentTab: React.FC<DocumentTabProps> = ({
  analysisData,
  liveFindings,
  appliedFixIds,
  openNoteIds,
  setOpenNoteIds,
  handleOpenCase,
  removeFix,
  applyFix,
}) => {
  const annotatedDocument = useMemo(() => {
    let doc = analysisData.originalText;
    
    const sortedFindings = [...liveFindings].sort((a, b) => b.originalText.length - a.originalText.length);
    
    const processPass = (findings: Finding[], tag: string) => {
      for (const f of findings) {
        if (!doc.includes(f.originalText)) continue;
        
        const isFixed = appliedFixIds.includes(f.id);
        const isOpen = f.status === "open";
        
        const annotationHtml = `
          <span class="relative group inline-block font-sans ${isOpen ? "bg-red-50 text-red-900 border-b-2 border-red-500 hover:bg-red-100 cursor-pointer" : "bg-green-50 text-green-900 border-b-2 border-green-500"} transition-colors" data-finding-id="${f.id}">
            ${isFixed ? `<del class="opacity-50">${f.originalText}</del> <ins class="no-underline font-bold text-green-700 bg-green-100">${f.replacementText}</ins>` : f.originalText}
            ${isOpen ? `<span class="absolute -top-2 -right-2 w-3 h-3 bg-red-500 rounded-full animate-ping" style="animation-duration: 2s;"></span>` : ''}
          </span>
        `;
        doc = doc.replace(f.originalText, annotationHtml);
      }
    };
    
    processPass(sortedFindings, "general");
    
    return doc;
  }, [analysisData.originalText, liveFindings, appliedFixIds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      {/* Left Column: Document Viewer */}
      <div className="lg:col-span-8 bg-white border-4 border-black p-8 md:p-12 max-h-[800px] overflow-y-auto">
        <div className="mb-8 border-b-4 border-black pb-4 flex justify-between items-end">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400">Source Document</span>
            <h2 className="text-2xl font-black uppercase tracking-tight text-black mt-1">{analysisData.documentTitle}</h2>
          </div>
          <button
            onClick={() => {
              const element = document.createElement("a");
              const file = new Blob([analysisData.originalText], {type: 'text/plain'});
              element.href = URL.createObjectURL(file);
              element.download = "original_policy.txt";
              document.body.appendChild(element);
              element.click();
            }}
            className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 hover:text-black transition flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Source
          </button>
        </div>
        
        <div 
          className="prose prose-sm md:prose-base max-w-none font-serif text-neutral-800 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: annotatedDocument }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const findingSpan = target.closest('[data-finding-id]');
            if (findingSpan) {
              const fid = findingSpan.getAttribute('data-finding-id');
              if (fid) {
                setOpenNoteIds(prev => ({ ...prev, [fid]: true }));
                const el = document.getElementById(`finding-${fid}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          }}
        />
      </div>

      {/* Right Column: Active Defect Notes */}
      <div className="lg:col-span-4 space-y-6">
        <div className="flex justify-between items-center pb-2 border-b-4 border-black">
          <span className="text-[12px] font-black uppercase tracking-widest text-black opacity-40">Active Defects</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-white bg-black px-2 py-0.5">
            {liveFindings.filter(f => f.status === "open").length} Remaining
          </span>
        </div>

        <div className="space-y-4 max-h-[750px] overflow-y-auto pr-2 pb-10">
          {liveFindings.map(f => {
            const isFixed = appliedFixIds.includes(f.id);
            const isExpanded = openNoteIds[f.id];
            const isMajor = f.severity === "major";

            return (
              <div 
                key={f.id} 
                id={`finding-${f.id}`}
                className={`border-4 transition-none rounded-none ${
                  isFixed 
                    ? "border-green-400 bg-green-50 opacity-70" 
                    : isMajor 
                    ? "border-red-500 bg-white" 
                    : "border-amber-400 bg-white"
                }`}
              >
                <div 
                  className={`p-4 cursor-pointer select-none flex justify-between items-start gap-3 ${
                    isFixed ? "" : "hover:bg-gray-100"
                  }`}
                  onClick={() => setOpenNoteIds(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      {isFixed ? (
                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-green-200 text-green-800">
                          RESOLVED
                        </span>
                      ) : (
                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 ${
                          isMajor ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {f.severity}
                        </span>
                      )}
                      <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400 font-mono">
                        {f.kind.replace(/_/g, " ")}
                      </span>
                    </div>
                    
                    <h4 className={`text-xs font-black uppercase tracking-wider ${isFixed ? "text-green-800 line-through decoration-green-300" : "text-neutral-900"}`}>
                      {f.title}
                    </h4>
                  </div>
                  
                  {isFixed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <ShieldAlert className={`w-5 h-5 shrink-0 ${isMajor ? "text-red-500" : "text-amber-500"}`} />
                  )}
                </div>

                {(isExpanded || (f.status === "open" && isMajor)) && (
                  <div className="p-4 border-t border-neutral-100 bg-neutral-50 text-xs font-sans">
                    <p className="text-neutral-600 mb-4 italic leading-relaxed">{f.explanation}</p>
                    
                    {!isFixed && f.evidenceCaseIds && f.evidenceCaseIds.length > 0 && (
                      <div className="mb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block mb-1">
                          Test Case Evidence:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {f.evidenceCaseIds.map(cid => (
                            <button
                              key={cid}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCase(cid);
                              }}
                              className="px-1.5 py-0.5 border border-neutral-300 bg-white text-[9px] font-mono font-bold text-neutral-600 hover:border-black hover:text-black transition cursor-pointer"
                            >
                              #{cid.replace("case-", "")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="p-3 bg-red-50/50 border border-red-100">
                        <span className="text-[8px] font-black uppercase tracking-widest text-red-400 block mb-1">Original Text</span>
                        <p className="font-serif italic text-red-900 line-through decoration-red-300 text-[11px]">"{f.originalText}"</p>
                      </div>
                      
                      <div className="p-3 bg-green-50/50 border border-green-100 relative">
                        <span className="text-[8px] font-black uppercase tracking-widest text-green-500 block mb-1">Suggested Rewrite</span>
                        <p className="font-serif italic text-green-900 font-medium text-[11px]">"{f.replacementText}"</p>
                        <Sparkles className="w-3 h-3 text-green-400 absolute top-2 right-2 opacity-50" />
                      </div>
                    </div>

                    <div className="mt-5">
                      {isFixed ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFix(f.id);
                          }}
                          className="w-full py-4 bg-black hover:bg-white text-xs font-black uppercase tracking-widest text-white hover:text-black transition-none cursor-pointer rounded-none border-4 border-black"
                        >
                          Revert Fix
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            applyFix(f.id);
                          }}
                          className="w-full py-4 bg-black hover:bg-white text-xs font-black uppercase tracking-widest text-white hover:text-black transition-none cursor-pointer flex items-center justify-center gap-1.5 rounded-none border-4 border-black"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Apply Quick Fix
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          {liveFindings.length === 0 && (
            <div className="text-center py-12 px-4 border-4 border-dashed border-black bg-white">
              <h4 className="text-xl font-black uppercase tracking-widest text-black">Zero Defects Found</h4>
              <p className="text-xs text-black mt-2 font-bold uppercase tracking-wider opacity-60">The document passed all mechanical tests.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Sparkles(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}
