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

  // Initialize Speech Recognition with Mobile Prefixes
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Fix for Mobile Safari/Chrome
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

        // On mobile, recognition often auto-stops on silence
        recognition.onend = () => {
          // Logic to handle auto-stop if needed
        };

        recognitionRef.current = recognition;
      }
    }
    return () => {
        recognitionRef.current?.stop();
        streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startListening = async () => {
    // Mobile browsers require this to be inside a user-originated click event
    if (typeof window === "undefined" || !navigator.mediaDevices) {
        alert("Your browser does not support speech features.");
        return;
    }

    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } 
      });
      streamRef.current = stream;

      // START RECOGNITION
      // Note: On some Androids, recognitionRef needs to start BEFORE MediaRecorder
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn("Recognition already started or failed", e);
      }

      // START MEDIA RECORDER
      const recorder = new MediaRecorder(stream);
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
        
        // Ensure tracks are stopped to release the hardware mic icon on mobile
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Mobile Mic Error:", err);
      alert("Please allow microphone access in your settings.");
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    // Explicitly stop recognition for mobile
    try {
        recognitionRef.current?.stop();
    } catch (e) {}
    
    setIsListening(false);
  };

  const sendAudioToBackend = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      if(data.text) setTranscript(data.text);
    } catch (err) {
      console.error("Backend Error:", err);
    }
  };

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-[9999] select-none font-sans">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_40%,#2d1b2d_0%,#000_75%)]" />

      <div className={`absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[80px] z-10 transition-all duration-1000 ${
          isListening ? "bg-rose-400/20 scale-125" : "bg-pink-500/10 scale-100"
        } animate-pulse`} 
      />

      <div className="absolute inset-0 z-20 pointer-events-none">
        <VrmStage />
      </div>

      <div className={`absolute top-10 left-1/2 -translate-x-1/2 z-40 w-[85%] max-w-md transition-all duration-700 ${
        transcript || isListening ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      }`}>
        <div className="relative px-5 py-3 rounded-2xl bg-pink-900/10 backdrop-blur-xl border border-pink-200/20 shadow-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
          <div className="flex flex-col gap-0.5 relative z-10">
            <div className="flex items-center gap-1.5 justify-center">
              <Heart size={10} className={`${isListening ? "fill-rose-400 text-rose-400 animate-pulse" : "text-pink-300/40"}`} />
              <span className="text-[9px] uppercase tracking-[0.3em] text-pink-200/50 font-semibold text-center">
                {isListening ? "Listening" : "Message"}
              </span>
            </div>
            <p className="text-pink-50/90 text-base font-light leading-snug text-center break-words">
              {transcript || (isListening ? "..." : "")}
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-5">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          // Added touch-padding for mobile usability
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 backdrop-blur-3xl border border-pink-100/20 shadow-xl touch-none ${
              isListening ? "bg-rose-500/30 scale-110 shadow-rose-500/20" : "bg-white/5"
          } ${isProcessing ? "opacity-50" : "cursor-pointer active:scale-90"}`}
        >
          {isListening && <div className="absolute inset-0 rounded-full border border-rose-300/40 animate-ping" />}
          {isProcessing ? <Loader2 size={28} className="text-pink-100 animate-spin" /> : 
           isListening ? <Square size={24} className="text-rose-100 fill-rose-100" /> : 
           <Mic size={28} className="text-pink-200/70" />}
        </button>

        <p className={`text-[9px] tracking-[0.5em] uppercase font-bold transition-all duration-300 ${isListening ? "text-rose-300" : "text-pink-200/20"}`}>
          {isProcessing ? "Wait..." : isListening ? "Live" : "Talk to me"}
        </p>
      </div>
    </main>
  );
}