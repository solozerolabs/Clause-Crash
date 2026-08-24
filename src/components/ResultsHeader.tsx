import React from "react";
import { Copy } from "lucide-react";
import { AnimatedScore } from "./AnimatedScore";

interface ResultsHeaderProps {
  currentScore: number;
  majorCount: number;
  majorHighCount: number;
  majorLowCount: number;
  minorCount: number;
  minorHighCount: number;
  minorLowCount: number;
  casesRun: number;
  handleFixAll: () => void;
  copyFixedDocument: () => void;
  resetAnalysis: () => void;
  handleSaveAnalysis: () => void;
}

export const ResultsHeader: React.FC<ResultsHeaderProps> = ({
  currentScore,
  majorCount,
  majorHighCount,
  majorLowCount,
  minorCount,
  minorHighCount,
  minorLowCount,
  casesRun,
  handleFixAll,
  copyFixedDocument,
  resetAnalysis,
  handleSaveAnalysis,
}) => {
  return (
    <header className="bg-white border-b-4 border-black p-4 sm:p-6">
      <div className="max-w-[1400px] mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
        
        {/* Left: Logo + Score */}
        <div className="flex items-center gap-6 sm:gap-12 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter leading-none uppercase font-display text-neutral-900">
            ClauseCrash
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-4xl sm:text-5xl font-black leading-none tracking-tighter text-neutral-900 font-display">
              <AnimatedScore value={currentScore} />
            </span>
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 max-w-[60px] leading-tight">Trust Score</span>
          </div>
        </div>

        {/* Middle: Stats */}
        <div className="flex items-center flex-wrap gap-4 bg-white px-5 py-3 border-[3px] border-black">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-none bg-black" />
            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-black whitespace-nowrap">
              {majorCount} {majorCount === 1 ? "MAJOR RISK" : "MAJOR RISKS"}
            </span>
          </div>
          <div className="hidden sm:block h-6 w-0.5 bg-black" />
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-none border-[3px] border-black bg-white" />
            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-black whitespace-nowrap">
              {minorCount} {minorCount === 1 ? "MINOR RISK" : "MINOR RISKS"}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="bg-black text-white px-4 py-2.5 text-xs font-black tracking-widest uppercase cursor-default transition-none hidden md:block">
            {casesRun} CASES
          </div>
          
          {currentScore < 100 ? (
            <button
              onClick={handleFixAll}
              className="px-4 py-2.5 bg-black hover:bg-white text-xs font-black tracking-widest uppercase text-white hover:text-black transition-none cursor-pointer border-[3px] border-black"
            >
              Fix All
            </button>
          ) : (
            <button
              onClick={copyFixedDocument}
              className="px-4 py-2.5 bg-white hover:bg-black text-xs font-black tracking-widest uppercase text-black hover:text-white transition-none cursor-pointer border-[3px] border-black flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy fixed
            </button>
          )}
          
          <button
            onClick={handleSaveAnalysis}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-xs font-black tracking-widest uppercase text-white transition-none cursor-pointer border-[3px] border-black"
          >
            Save
          </button>
          <button
            onClick={resetAnalysis}
            className="px-4 py-2.5 border-[3px] border-black hover:bg-black text-xs font-black tracking-widest uppercase text-black hover:text-white transition-none cursor-pointer bg-white"
          >
            Back
          </button>
        </div>
      </div>
    </header>
  );
};
