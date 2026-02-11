"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Volume2, VolumeX, Sparkles, Settings } from 'lucide-react';

export const AvaniDock = () => {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 100 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[95%] md:max-w-[550px] z-50 px-4"
    >
      <div className="glass-surface rounded-[32px] p-2 flex items-center gap-2 group transition-all duration-500 hover:scale-[1.02]">
        
        {/* Toggle Actions */}
        <div className="flex items-center gap-1 pl-2">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {/* Input Area */}
        <div className="flex-1 relative flex items-center">
          <Sparkles size={16} className="absolute left-3 text-purple-400 opacity-50" />
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chat with Avani..."
            className="w-full bg-transparent border-none outline-none py-3 pl-10 pr-4 text-[16px] text-white placeholder-white/30 font-light"
          />
        </div>

        {/* Voice/Send Actions */}
        <div className="flex items-center gap-2 pr-1">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsRecording(!isRecording)}
            className={`p-3 rounded-full transition-all duration-300 relative ${
              isRecording ? 'bg-red-500/20 text-red-400' : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Mic size={20} />
            {isRecording && (
              <motion.div 
                layoutId="pulse"
                className="absolute inset-0 rounded-full border-2 border-red-500/50"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
          </motion.button>

          <AnimatePresence>
            {input.trim() && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="p-3 rounded-full bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-110 active:scale-95 transition-transform"
              >
                <Send size={18} fill="currentColor" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Subtle Label */}
      <motion.p 
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 4, repeat: Infinity }}
        className="text-center mt-4 text-[10px] tracking-[0.3em] uppercase font-bold text-white/40 pointer-events-none"
      >
        Neural Intelligence System
      </motion.p>
    </motion.div>
  );
};