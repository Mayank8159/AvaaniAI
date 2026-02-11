"use client";

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2, Heart } from "lucide-react";
import VrmStage from "@/components/vrm/VrmStage";

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Speech Recognition with robust Mobile support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };

        // Handle auto-disconnects common on mobile
        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') alert("Please enable Microphone in browser settings.");
          console.error("SR Error:", event.error);
        };

        recognitionRef.current = recognition;
      }
    }
    return () => cleanupStreams();
  }, []);

  const cleanupStreams = () => {
    recognitionRef.current?.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startListening = async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices) return;
    setTranscript("");

    try {
      // 1. Get Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      streamRef.current = stream;

      // 2. Start Speech Recognition FIRST (Fix for Chrome/Brave Mobile)
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      }

      // 3. Sequential Start for MediaRecorder (Prevents hardware lock)
      setTimeout(() => {
        if (!streamRef.current) return;
        
        const recorder = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsProcessing(true);
          await sendAudioToBackend(audioBlob);
          setIsProcessing(false);
          cleanupStreams();
        };

        recorder.start();
        setIsListening(true);
      }, 200); // 200ms buffer is critical for mobile Chromium browsers

    } catch (err) {
      console.error("Mic Error:", err);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const sendAudioToBackend = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await response.json();
      if(data.text) setTranscript(data.text);
    } catch (err) {
      console.error("Backend Error:", err);
    }
  };

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-[9999] select-none font-sans">
      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_40%,#2d1b2d_0%,#000_75%)]" />
      <div className={`absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[100px] z-10 transition-all duration-1000 ${
          isListening ? "bg-rose-400/20 scale-125" : "bg-pink-500/10 scale-100"
        } animate-pulse`} 
      />

      <div className="absolute inset-0 z-20 pointer-events-none">
        <VrmStage />
      </div>

      {/* COMPACT GIRLY TRANSCRIPT BOX */}
      <div className={`absolute top-10 left-1/2 -translate-x-1/2 z-40 w-[85%] max-w-sm animate-float transition-all duration-500 ${
        transcript || isListening ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      }`}>
        <div className="relative px-4 py-3 rounded-2xl bg-pink-950/20 backdrop-blur-xl border border-pink-200/20 shadow-md overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
          <div className="flex flex-col gap-1 relative z-10 items-center">
            <div className="flex items-center gap-1.5">
              <Heart size={10} className={`${isListening ? "fill-rose-400 text-rose-400 animate-heartbeat" : "text-pink-300/30"}`} />
              <span className="text-[8px] uppercase tracking-[0.4em] text-pink-200/40 font-bold">
                {isListening ? "Listening" : "Message"}
              </span>
            </div>
            <p className="text-pink-50/90 text-sm font-light leading-snug text-center break-words max-h-24 overflow-y-auto">
              {transcript || (isListening ? "..." : "")}
            </p>
          </div>
        </div>
      </div>

      {/* INTERACTION DOCK */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500 backdrop-blur-3xl border border-pink-100/10 shadow-xl touch-none ${
              isListening ? "bg-rose-500/30 scale-110 shadow-rose-500/10" : "bg-white/5 active:scale-90"
          } ${isProcessing ? "opacity-40" : "cursor-pointer"}`}
        >
          {isListening && <div className="absolute inset-0 rounded-full border border-rose-300/30 animate-ripple" />}
          
          {isProcessing ? (
            <Loader2 size={24} className="text-pink-100 animate-spin" />
          ) : isListening ? (
            <Square size={20} className="text-rose-100 fill-rose-100" />
          ) : (
            <Mic size={26} className="text-pink-200/60" />
          )}
        </button>

        <p className={`text-[8px] tracking-[0.6em] uppercase font-black transition-all duration-300 ${isListening ? "text-rose-300" : "text-pink-200/20"}`}>
          {isProcessing ? "Wait" : isListening ? "Live" : "Talk"}
        </p>
      </div>
    </main>
  );
}