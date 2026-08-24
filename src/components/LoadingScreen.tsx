import React from "react";
import { motion } from "motion/react";
import { FileSearch } from "lucide-react";

interface LoadingScreenProps {
  loadingPhrase: string;
  analysisStatus: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  loadingPhrase,
  analysisStatus,
}) => {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center py-20 px-6 text-center max-w-xl mx-auto w-full"
    >
      <motion.div
        animate={{ 
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="mb-8"
      >
        <FileSearch className="w-20 h-20 text-black" />
      </motion.div>

      <motion.p
        key={loadingPhrase}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="text-4xl font-black uppercase tracking-tighter leading-none mb-8"
      >
        {loadingPhrase}
      </motion.p>
      
      {analysisStatus && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-xs font-mono tracking-widest uppercase font-bold opacity-50"
        >
          {analysisStatus}
        </motion.div>
      )}
    </motion.div>
  );
};
