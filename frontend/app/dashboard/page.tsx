"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, LogOut, Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import VrmStage from "@/components/vrm/VrmStage";
import { streamManager } from "@/lib/stream-manager";

// Configuration
const VIDEO_FPS = Number(process.env.NEXT_PUBLIC_VIDEO_FPS) || 15;
const VIDEO_INTERVAL_MS = 1000 / VIDEO_FPS;

export default function Dashboard() {
  const router = useRouter();
  
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [aiState, setAiState] = useState("idle"); // idle, thinking, speaking
  const [transcript, setTranscript] = useState("Waiting for connection...");
  const [emotion, setEmotion] = useState("neutral");

  // Refs
  const stageRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFrameTime = useRef(0);

  // ---------------------------------------------------------
  // 1. INITIALIZATION & CLEANUP
  // ---------------------------------------------------------
  useEffect(() => {
    // Check Auth
    const userJson = localStorage.getItem("user");
    if (!userJson) {
      router.push("/");
      return;
    }
    const user = JSON.parse(userJson);

    // Initialize Stream Manager Handlers
    streamManager.onStatusChange = (status) => {
      setAiState(status); // e.g. "listening", "thinking"
      if (status === "thinking") setTranscript("Avaani is thinking...");
    };

    streamManager.onTextReceived = (text) => {
      setTranscript(text);
      setAiState("speaking");
      // Trigger lip sync animation start (approximate)
      stageRef.current?.triggerMouthPop(); 
    };

    streamManager.onEmotionUpdate = (newEmotion) => {
      console.log("Expression:", newEmotion);
      setEmotion(newEmotion);
      // Update VRM Expression
      if (stageRef.current?.setExpression) {
        stageRef.current.setExpression(newEmotion.toLowerCase());
      }
    };

    // Connect WebSocket
    streamManager.connect(user.id, user.username);
    setIsConnected(true);

    return () => {
      stopMedia();
    };
  }, [router]);

  // ---------------------------------------------------------
  // 2. MEDIA HANDLING (Camera & Mic)
  // ---------------------------------------------------------
  const startMedia = async () => {
    try {
      // 1. Get Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: VIDEO_FPS }, // Low res for speed
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;

      // 2. Setup Video Preview (Hidden)
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // 3. Setup Audio Worklet (Microphone Processor)
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      await audioCtx.audioWorklet.addModule("/audio-processor.js");
      
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "audio-processor");
      
      // Listen for raw PCM chunks from worklet
      worklet.port.onmessage = (event) => {
        if (!isMicOn) return; // Mute logic
        // Send Float32Array to Stream Manager
        streamManager.sendAudioChunk(event.data);
      };

      source.connect(worklet);
      // Note: Don't connect worklet to destination, or you'll hear yourself!
      
      workletNodeRef.current = worklet;
      setIsMicOn(true);
      
      // 4. Start Video Loop
      requestAnimationFrame(processVideoFrame);

    } catch (err) {
      console.error("Media Error:", err);
      setTranscript("Error accessing camera/mic. Please allow permissions.");
    }
  };

  const stopMedia = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    setIsMicOn(false);
  };

  // ---------------------------------------------------------
  // 3. VIDEO PROCESSING LOOP
  // ---------------------------------------------------------
  const processVideoFrame = (timestamp: number) => {
    if (!isMicOn) return; // Stop loop if muted

    // Throttle FPS
    if (timestamp - lastFrameTime.current >= VIDEO_INTERVAL_MS) {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
          // Draw video to canvas
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          // Extract JPEG Base64 (Quality 0.5 for speed)
          const base64 = canvas.toDataURL("image/jpeg", 0.5);
          
          // Send to Brain
          // Remove "data:image/jpeg;base64," prefix
          const cleanBase64 = base64.split(",")[1];
          streamManager.sendVideoFrame(cleanBase64);
        }
      }
      lastFrameTime.current = timestamp;
    }

    requestAnimationFrame(processVideoFrame);
  };

  // ---------------------------------------------------------
  // 4. RENDER UI
  // ---------------------------------------------------------
  return (
    <main className="fixed inset-0 bg-[#0a0a0a] overflow-hidden flex flex-col">
      
      {/* --- HIDDEN MEDIA ELEMENTS --- */}
      <div className="absolute opacity-0 pointer-events-none">
        <video ref={videoRef} muted playsInline />
        <canvas ref={canvasRef} />
      </div>

      {/* --- 3D SCENE --- */}
      <div className="absolute inset-0 z-10">
        {/* Pass emotion to VRM if your component supports it */}
        <VrmStage ref={stageRef} emotion={emotion} />
      </div>

      {/* --- HUD: TOP BAR --- */}
      <div className="absolute top-0 left-0 w-full z-30 p-6 flex justify-between items-start pointer-events-none">
        {/* Status Indicator */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
              aiState === "thinking" ? "bg-yellow-400" :
              aiState === "speaking" ? "bg-green-400" :
              isConnected ? "bg-blue-400" : "bg-red-500"
            }`} />
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">
              {aiState === "idle" ? "READY" : aiState}
            </span>
          </div>
          
          {/* Emotion Debug (Optional) */}
          <div className="bg-black/20 backdrop-blur-sm px-3 py-1 rounded-full border border-white/5 self-start">
            <span className="text-[10px] text-purple-300 font-mono">EMOTION: {emotion.toUpperCase()}</span>
          </div>
        </div>

        {/* Logout Button */}
        <button 
          onClick={() => {
            localStorage.clear();
            router.push("/");
          }}
          className="pointer-events-auto p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all active:scale-95 group"
        >
          <LogOut size={20} className="text-white/60 group-hover:text-rose-400 transition-colors" />
        </button>
      </div>

      {/* --- HUD: SUBTITLES --- */}
      <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-30 transition-all duration-500 max-w-[90vw] md:max-w-2xl text-center pointer-events-none ${transcript ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
        <div className="bg-black/60 backdrop-blur-xl px-8 py-4 rounded-2xl border border-white/10 shadow-2xl">
          <p className="text-lg md:text-xl font-medium text-white/90 leading-relaxed text-shadow-sm">
            {transcript}
          </p>
        </div>
      </div>

      {/* --- HUD: BOTTOM CONTROLS --- */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 flex items-center gap-6">
        
        {/* Connection Pulse */}
        <div className={`absolute -z-10 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl transition-opacity duration-1000 ${isMicOn ? "opacity-100 animate-pulse" : "opacity-0"}`} />

        <button
          onClick={() => {
            if (isMicOn) stopMedia();
            else startMedia();
          }}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all duration-300 active:scale-95 shadow-2xl ${
            isMicOn 
              ? "bg-cyan-500 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.4)] scale-110" 
              : "bg-white/10 border-white/20 hover:bg-white/20"
          }`}
        >
          {isMicOn ? (
            <Activity className="text-black animate-pulse" size={32} />
          ) : (
            <Mic className="text-white" size={32} />
          )}
        </button>

      </div>
    </main>
  );
}