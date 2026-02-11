"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Loader2, Heart } from "lucide-react";
import Script from "next/script";
import VrmStage from "@/components/vrm/VrmStage";

declare global {
  interface Window {
    puter: any;
  }
}

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveSpeech, setLiveSpeech] = useState("");
  const [emotion, setEmotion] = useState("neutral");

  const recognitionRef = useRef<any>(null);

  // --- STABLE VOICE LOGIC FOR PRODUCTION ---
  const speakAnimeVoice = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // 1. Cancel any pending speech
    window.speechSynthesis.cancel();

    // 2. Clean text: No symbols, no bracketed tags
    const speechText = text
      .replace(/\[.*?\]/g, "")
      .replace(/[^\w\s?.!,]/g, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(speechText);
    
    // Girly Tuning
    utterance.pitch = 1.7; 
    utterance.rate = 1.1;
    utterance.volume = 1.0;

    // 3. Find Voice (Ensures it works even if getVoices() is delayed)
    const getBestVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = ["Google UK English Female", "Samantha", "Microsoft Zira", "Mei-Jia", "Female"];
      return voices.find(v => preferred.some(p => v.name.includes(p))) || voices[0];
    };

    utterance.voice = getBestVoice();

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setTimeout(() => setEmotion("neutral"), 800);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // Initialize voices for browsers like Chrome/Safari that load them late
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
      }
    }
  }, []);

  // --- SPEECH RECOGNITION SETUP ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let current = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          setLiveSpeech(current);
        };

        recognition.onend = () => {
          if (isListening) {
            try { recognition.start(); } catch(e) {}
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [isListening]);

  const getGrokResponse = async (text: string) => {
    if (!text) return;
    setIsProcessing(true);
    setTranscript("");

    try {
      const response = await window.puter.ai.chat(
        `User: "${text}". Respond as a cute, bubbly anime girl. Max 12 words. 
        Add exactly one tag at the end: [happy], [sad], [surprised], or [relaxed].`,
        { model: 'x-ai/grok-4.1-fast' }
      );

      const rawContent = response.message.content;

      // Extract emotion and clean the display text
      const emotionMatch = rawContent.match(/\[(.*?)\]/);
      const detectedEmotion = emotionMatch ? emotionMatch[1].toLowerCase() : "neutral";
      const cleanText = rawContent.replace(/\[.*?\]/g, "").trim();

      setEmotion(detectedEmotion);
      setTranscript(cleanText);
      
      // Trigger voice
      speakAnimeVoice(cleanText);

    } catch (err) {
      setTranscript("Baka! My connection is fuzzy... 🎀");
    } finally {
      setIsProcessing(false);
    }
  };

  const startListening = async () => {
    // Chrome/Safari requirement: Speak an empty string to "unlock" audio context
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    
    setTranscript("");
    setLiveSpeech("");
    setEmotion("neutral");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (err) {
      alert("Please allow mic access! 🎤");
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    if (liveSpeech) getGrokResponse(liveSpeech);
  };

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-[9999] font-sans select-none">
      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
      
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#3d1a3d_0%,#000_80%)]" />

      {/* VRM Model Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <VrmStage currentEmotion={emotion} isSpeaking={isSpeaking} />
      </div>

      {/* TRANSCRIPT BUBBLE */}
      <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-40 w-[85%] max-w-[280px] transition-all duration-500 ${
        (transcript || liveSpeech) ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}>
        <div className="px-4 py-2.5 rounded-2xl bg-pink-400/10 backdrop-blur-xl border border-pink-200/30 shadow-[0_0_20px_rgba(255,182,193,0.15)]">
          <div className="flex flex-col items-center">
            <Heart size={8} className={`mb-1 ${isListening ? "fill-rose-400 text-rose-400 animate-pulse" : "text-pink-300/20"}`} />
            <p className="text-pink-50 text-[13px] font-medium text-center leading-tight">
              {isListening ? (liveSpeech || "...") : transcript}
            </p>
          </div>
        </div>
      </div>

      {/* MIC DOCK */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border ${
            isListening 
              ? "bg-rose-500/20 border-rose-300 scale-110 shadow-[0_0_20px_rgba(244,63,94,0.4)]" 
              : "bg-white/5 border-white/10 active:scale-95"
          }`}
        >
          {isProcessing ? (
            <Loader2 className="animate-spin text-pink-200" size={24} />
          ) : isListening ? (
            <Square className="text-white fill-white" size={18} />
          ) : (
            <Mic className="text-pink-100" size={26} />
          )}
        </button>
      </div>
    </main>
  );
}