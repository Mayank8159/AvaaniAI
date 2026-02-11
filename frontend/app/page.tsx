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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveSpeech, setLiveSpeech] = useState("");
  const [emotion, setEmotion] = useState("neutral");

  const recognitionRef = useRef<any>(null);

  // --- ENHANCED ANIME VOICE LOGIC ---
  const speakAnimeVoice = (text: string) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    // Remove any remaining symbols or bracketed tags so she doesn't read them
    const speechText = text.replace(/\[.*?\]/g, "").replace(/[^\w\s?.!,]/g, "").trim();

    const utterance = new SpeechSynthesisUtterance(speechText);
    
    // High-pitched and bubbly settings
    utterance.pitch = 1.8; 
    utterance.rate = 1.15;
    utterance.volume = 1.0;

    // Find the best "Girl" voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = [
      "Google UK English Female",
      "Microsoft Zira",
      "Samantha",
      "Mei-Jia",
      "Female"
    ];

    const selectedVoice = voices.find(v => 
      preferredVoices.some(pv => v.name.includes(pv))
    );
    
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setTimeout(() => setEmotion("neutral"), 1000);
    };

    window.speechSynthesis.speak(utterance);
  };

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
        recognition.onend = () => { if (isListening) recognition.start(); };
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

      // 1. Logic to extract emotion and clean text for display
      const emotionMatch = rawContent.match(/\[(.*?)\]/);
      const detectedEmotion = emotionMatch ? emotionMatch[1].toLowerCase() : "neutral";
      const cleanText = rawContent.replace(/\[.*?\]/g, "").trim();

      setEmotion(detectedEmotion);
      setTranscript(cleanText);
      
      // 2. Speak the clean text (symbols filtered inside function)
      speakAnimeVoice(cleanText);

    } catch (err) {
      setTranscript("Baka! My connection is fuzzy... 🎀");
    } finally {
      setIsProcessing(false);
    }
  };

  const startListening = async () => {
    setTranscript("");
    setLiveSpeech("");
    setEmotion("neutral");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (err) {
      alert("I need your mic, darling! 🎤");
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#3d1a3d_0%,#000_80%)]" />

      <div className="absolute inset-0 z-10 pointer-events-none">
        <VrmStage currentEmotion={emotion} isSpeaking={isSpeaking} />
      </div>

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

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6">
        {isListening && <div className="flex items-end gap-1 h-4"><div className="wave-bar"/><div className="wave-bar"/></div>}
        <button
          onClick={isListening ? stopListening : startListening}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            isListening ? "bg-rose-500/20 border-rose-300 scale-110 shadow-lg" : "bg-white/5 border-white/10"
          }`}
        >
          {isProcessing ? <Loader2 className="animate-spin text-pink-200" size={24} /> : 
           isListening ? <Square className="text-white fill-white" size={18} /> : 
           <Mic className="text-pink-100" size={26} />}
        </button>
        {isListening && <div className="flex items-end gap-1 h-4"><div className="wave-bar"/><div className="wave-bar"/></div>}
      </div>
    </main>
  );
}