"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import Script from "next/script";
import VrmStage from "@/components/vrm/VrmStage";

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveSpeech, setLiveSpeech] = useState("");
  
  const stageRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // --- 1. VOICE WARMUP ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const synth = window.speechSynthesis;
      const updateVoices = () => setAvailableVoices(synth.getVoices());
      updateVoices();
      if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = updateVoices;
    }
  }, []);

  // --- 2. CLEAN & SPEAK LOGIC ---
  const speakAnimeVoice = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    // Remove emojis and icons so they aren't read as words
    const cleanText = text
      .replace(/\[.*?\]/g, "") 
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/[✨🎀💖🌟⭐🌸💢💤💭]/g, "")
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.pitch = 1.45; 
    utterance.rate = 0.95; 

    const feminineVoice = availableVoices.find(v => 
      v.name.includes("Google") && v.name.includes("Female") || 
      v.name.includes("Microsoft Aria") || 
      v.name.includes("Samantha") || 
      v.name.includes("Zira")
    );

    if (feminineVoice) utterance.voice = feminineVoice;

    utterance.onboundary = (event) => {
      if (event.name === 'word') stageRef.current?.triggerMouthPop(); 
    };

    utterance.onend = () => stageRef.current?.stopMouth();
    window.speechSynthesis.speak(utterance);
  }, [availableVoices]);

  // --- 3. SPEECH RECOGNITION ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e: any) => {
          let str = "";
          for (let i = e.resultIndex; i < e.results.length; i++) str += e.results[i][0].transcript;
          setLiveSpeech(str);
        };
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const handleAI = async () => {
    if (!liveSpeech) return;
    if (!(window as any).puter) return;

    setIsProcessing(true);
    try {
      const res = await (window as any).puter.ai.chat(
        `You are a cute, caring anime girl. Use emojis in text but keep response short. Respond to: ${liveSpeech}`,
        { model: 'gpt-4o' } 
      );
      const clean = res.message.content.trim();
      setTranscript(clean);
      speakAnimeVoice(clean);
    } catch (err) {
      setTranscript("Connection error! Gomen... 🎀");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="fixed inset-0 bg-[#0a0a0a] overflow-hidden">
      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
      <div className="absolute inset-0 z-10"><VrmStage ref={stageRef} /></div>

      <div className={`absolute top-12 left-1/2 -translate-x-1/2 z-30 transition-all duration-500 ${transcript || liveSpeech ? "opacity-100" : "opacity-0"}`}>
        <div className="bg-pink-900/60 backdrop-blur-xl px-6 py-3 rounded-2xl border border-pink-400/30 text-white text-center shadow-2xl">
          <p className="text-sm font-medium">{isListening ? liveSpeech : transcript}</p>
        </div>
      </div>

      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={() => {
            if (isListening) {
              recognitionRef.current?.stop();
              setIsListening(false);
              handleAI();
            } else {
              setLiveSpeech(""); setTranscript("");
              recognitionRef.current?.start();
              setIsListening(true);
            }
          }}
          className={`w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all ${isListening ? "bg-rose-500/20 border-rose-400 scale-110 shadow-[0_0_40px_rgba(244,63,94,0.5)]" : "bg-white/5 border-white/10"}`}
        >
          {isProcessing ? <Loader2 className="animate-spin text-white" /> : isListening ? <Square className="text-white fill-white" size={20} /> : <Mic className="text-white" size={32} />}
        </button>
      </div>
    </main>
  );
}