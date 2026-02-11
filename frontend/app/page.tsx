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

  // 1. Initialize with specific Chrome/Safari logic
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      // Chrome Mobile likes 'continuous' to be false sometimes to save battery
      recognition.continuous = true; 
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let current = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        setTranscript(current);
      };

      recognition.onerror = (e: any) => {
        console.error("Speech Error:", e.error);
        if (e.error === 'network') alert("Chrome needs internet for speech-to-text.");
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const startListening = async () => {
    // 2. Clear previous states
    setTranscript("");
    
    try {
      // 3. Requesting mic with high compatibility settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;

      // 4. Force Unlock Audio (Critical for Chrome/Brave)
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      // 5. Start Speech API
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      // 6. Start Recording with a delay so Chrome doesn't panic
      setTimeout(() => {
        if (!streamRef.current) return;
        const recorder = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsProcessing(true);
          await sendAudioToBackend(blob);
          setIsProcessing(false);
          // Release Hardware
          stream.getTracks().forEach(t => t.stop());
        };

        recorder.start();
        setIsListening(true);
      }, 300); // Longer delay for mobile browsers

    } catch (err) {
      console.error("Mic Access Denied:", err);
      alert("Mic blocked! Go to Site Settings in Chrome and allow Microphone.");
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    try {
        recognitionRef.current?.stop();
    } catch(e) {}
    setIsListening(false);
  };

  const sendAudioToBackend = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await res.json();
      if(data.text) setTranscript(data.text);
    } catch (err) {
      console.error("API Error", err);
    }
  };

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-[9999] font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#2d1b2d_0%,#000_75%)]" />

      {/* VRM Stage */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <VrmStage />
      </div>

      {/* Compact Glass Transcript */}
      <div className={`absolute top-10 left-1/2 -translate-x-1/2 z-40 w-[85%] max-w-sm transition-all duration-500 ${
        transcript || isListening ? "opacity-100" : "opacity-0"
      }`}>
        <div className="px-4 py-3 rounded-2xl bg-pink-900/10 backdrop-blur-xl border border-pink-200/20 shadow-md">
          <div className="flex flex-col items-center gap-1">
            <Heart size={10} className={`${isListening ? "text-rose-400 fill-rose-400 animate-pulse" : "text-pink-300/20"}`} />
            <p className="text-pink-50 text-sm font-light text-center leading-tight">
              {transcript || (isListening ? "Listening..." : "")}
            </p>
          </div>
        </div>
      </div>

      {/* Interaction Button */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`w-18 h-18 rounded-full flex items-center justify-center transition-all backdrop-blur-3xl border border-white/10 shadow-xl ${
            isListening ? "bg-rose-500/30 scale-110 shadow-rose-500/20" : "bg-white/5 active:scale-95"
          }`}
        >
          {isProcessing ? <Loader2 className="animate-spin text-pink-100" /> : 
           isListening ? <Square className="text-white fill-white" size={20} /> : 
           <Mic className="text-pink-100/70" size={24} />}
        </button>
        <span className="text-[8px] tracking-[0.4em] uppercase text-pink-200/30 font-bold">
            {isProcessing ? "Processing" : isListening ? "Stop" : "Talk"}
        </span>
      </div>
    </main>
  );
}