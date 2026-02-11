"use client";

import React, { useState, useRef, useEffect } from "react";
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
  const [transcript, setTranscript] = useState("");
  const [liveSpeech, setLiveSpeech] = useState("");
  
  const recognitionRef = useRef<any>(null);

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
          if (isListening) recognition.start();
        };

        recognitionRef.current = recognition;
      }
    }
  }, [isListening]);

  const getGrokResponse = async (text: string) => {
    if (!text) return;
    setIsProcessing(true);
    try {
      const response = await window.puter.ai.chat(
        `The user said: "${text}". Respond as a cute anime girl. Max 12 words.`,
        { model: 'x-ai/grok-4.1-fast' }
      );
      setTranscript(response.message.content);
    } catch (err) {
      setTranscript("Oopsie! Try again? 🎀");
    } finally {
      setIsProcessing(false);
    }
  };

  const startListening = async () => {
    setTranscript("");
    setLiveSpeech("");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (err) {
      alert("I need mic access! 🎤");
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    if (liveSpeech) {
      getGrokResponse(liveSpeech);
    }
  };

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-[9999] font-sans select-none">
      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
      
      {/* Soft Pink Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#3d1a3d_0%,#000_80%)]" />

      {/* VRM Model Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <VrmStage />
      </div>

      {/* COMPACT TOP BUBBLE - Only shows when there is actual text */}
      <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-40 w-[80%] max-w-[280px] transition-all duration-500 ${
        (transcript || liveSpeech) ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}>
        <div className="px-4 py-2.5 rounded-2xl bg-pink-400/10 backdrop-blur-xl border border-pink-200/30 shadow-[0_0_15px_rgba(255,182,193,0.2)]">
          <div className="flex flex-col items-center">
            <Heart size={8} className={`mb-1 ${isListening ? "fill-rose-400 text-rose-400 animate-pulse" : "text-pink-300/20"}`} />
            <p className="text-pink-50 text-[13px] font-medium text-center leading-tight">
              {isListening ? liveSpeech : transcript}
            </p>
          </div>
        </div>
      </div>

      {/* MIC DOCK AT BOTTOM */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6">
        <div className={`flex items-end gap-1 h-4 transition-opacity ${isListening ? "opacity-100" : "opacity-0"}`}>
          <div className="wave-bar bg-pink-300" style={{ animationDelay: '0.1s' }} />
          <div className="wave-bar bg-rose-400" style={{ animationDelay: '0.3s' }} />
        </div>

        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border ${
            isListening 
              ? "bg-rose-500/20 border-rose-300 scale-110 shadow-[0_0_20px_rgba(244,63,94,0.4)]" 
              : "bg-white/5 border-white/10 active:scale-90"
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

        <div className={`flex items-end gap-1 h-4 transition-opacity ${isListening ? "opacity-100" : "opacity-0"}`}>
          <div className="wave-bar bg-rose-400" style={{ animationDelay: '0.2s' }} />
          <div className="wave-bar bg-pink-300" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </main>
  );
}