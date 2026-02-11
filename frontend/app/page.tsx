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
        recognitionRef.current = recognition;
      }
    }
    return () => recognitionRef.current?.stop();
  }, []);

  const startListening = async () => {
    if (!navigator.mediaDevices) return;
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recognitionRef.current?.start();
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsProcessing(true);
        await sendAudioToBackend(audioBlob);
        setIsProcessing(false);
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      setIsListening(true);
    } catch (err) { console.error(err); }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  };

  const sendAudioToBackend = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await response.json();
      if(data.text) setTranscript(data.text);
    } catch (err) { console.error(err); }
  };

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-[9999] select-none font-sans">
      {/* --- LAYER 0: SOFT PINK GRADIENT --- */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_40%,#2d1b2d_0%,#000_75%)]" />

      {/* --- LAYER 1: ROSE HALO --- */}
      <div className={`absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[120px] z-10 transition-all duration-1000 ${
          isListening ? "bg-rose-400/20 scale-125" : "bg-pink-500/10 scale-100"
        } animate-pulse`} 
      />

      {/* --- LAYER 2: 3D MODEL --- */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <VrmStage />
      </div>

      {/* --- LAYER 3: COMPACT GIRLY TRANSCRIPT BOX --- */}
      <div className={`absolute top-10 left-1/2 -translate-x-1/2 z-40 w-[85%] max-w-md animate-float transition-all duration-700 ${
        transcript || isListening ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      }`}>
        <div className="relative px-5 py-3 rounded-2xl bg-pink-900/10 backdrop-blur-xl border border-pink-200/20 shadow-lg overflow-hidden">
          {/* Shimmer Effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
          
          <div className="flex flex-col gap-0.5 relative z-10">
            <div className="flex items-center gap-1.5">
              <Heart size={10} className={`${isListening ? "fill-rose-400 text-rose-400 animate-beat" : "text-pink-300/40"}`} />
              <span className="text-[9px] uppercase tracking-[0.3em] text-pink-200/50 font-semibold">
                {isListening ? "Listening" : "Message"}
              </span>
            </div>
            <p className="text-pink-50/90 text-base font-light leading-snug text-center">
              {transcript || (isListening ? "..." : "")}
            </p>
          </div>
        </div>
      </div>

      {/* --- LAYER 4: PEARLY DOCK --- */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-5">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500 backdrop-blur-3xl border border-pink-100/20 shadow-xl ${
              isListening ? "bg-rose-500/30 scale-110 shadow-rose-500/20" : "bg-white/5 hover:bg-pink-400/10"
          } ${isProcessing ? "opacity-50" : "cursor-pointer"}`}
        >
          {isListening && (
            <div className="absolute inset-0 rounded-full border border-rose-300/40 animate-ripple" />
          )}
          
          {isProcessing ? (
            <Loader2 size={28} className="text-pink-100 animate-spin" />
          ) : isListening ? (
            <Square size={24} className="text-rose-100 fill-rose-100" />
          ) : (
            <Mic size={28} className="text-pink-200/70 hover:text-pink-100 transition-colors" />
          )}
        </button>

        <p className={`text-[9px] tracking-[0.5em] uppercase font-bold transition-all duration-300 ${isListening ? "text-rose-300" : "text-pink-200/20"}`}>
          {isProcessing ? "Wait..." : isListening ? "Live" : "Talk to me"}
        </p>
      </div>
    </main>
  );
}