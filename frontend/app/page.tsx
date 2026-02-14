"use client";
import React, { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle, User, Lock, ArrowRight, RefreshCw } from "lucide-react";

// Define the 5 required angles for biometric security
type FacePose = "front" | "left" | "right" | "up" | "down";
const POSES: FacePose[] = ["front", "left", "right", "up", "down"];

export default function AuthPage() {
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);
  
  // UI State
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  
  // Form State
  const [formData, setFormData] = useState({ username: "", password: "", fullName: "" });
  
  // Face Capture State
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState<File[]>([]);

  // ---------------------------------------------------------
  // 1. CAPTURE LOGIC
  // ---------------------------------------------------------
  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return;
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      // Convert Base64 to File object
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const file = new File([blob], `pose_${currentPoseIndex}.jpg`, { type: "image/jpeg" });
      
      setCapturedImages(prev => [...prev, file]);

      if (currentPoseIndex < POSES.length - 1) {
        // Move to next pose
        setCurrentPoseIndex(prev => prev + 1);
      } else {
        // All poses done -> Trigger Registration
        setIsCapturing(false);
        registerUser([...capturedImages, file]);
      }
    }
  }, [webcamRef, currentPoseIndex, capturedImages]);

  // ---------------------------------------------------------
  // 2. API CALLS
  // ---------------------------------------------------------
  const registerUser = async (finalImages: File[]) => {
    setLoading(true);
    setStatusMsg("Encrypting biometric data...");
    
    const data = new FormData();
    data.append("username", formData.username);
    data.append("password", formData.password);
    data.append("full_name", formData.fullName);
    
    finalImages.forEach((file) => data.append("images", file));

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/signup`, {
        method: "POST",
        body: data,
      });
      
      const json = await res.json();
      
      if (res.ok) {
        localStorage.setItem("user", JSON.stringify(json.user));
        router.push("/dashboard"); 
      } else {
        setStatusMsg(`❌ ${json.detail || "Registration failed"}`);
        // Reset capture on failure
        setCapturedImages([]);
        setCurrentPoseIndex(0);
      }
    } catch (e) {
      setStatusMsg("❌ Server unreachable");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg("Authenticating...");
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: formData.username, 
          password: formData.password 
        }),
      });

      const json = await res.json();

      if (res.ok) {
        localStorage.setItem("user", JSON.stringify(json.user));
        router.push("/dashboard");
      } else {
        setStatusMsg(`❌ ${json.detail || "Invalid credentials"}`);
      }
    } catch (e) {
      setStatusMsg("❌ Server unreachable");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // 3. RENDER UI
  // ---------------------------------------------------------
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black z-0 pointer-events-none" />
      
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl z-10 relative">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Avaani AI
          </h1>
          <p className="text-gray-400 text-sm">
            {mode === "login" ? "Welcome back, Traveler" : "Initialize Identity Sequence"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-black/20 p-1 rounded-xl mb-8">
          <button 
            onClick={() => { setMode("login"); setStatusMsg(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === "login" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Login
          </button>
          <button 
            onClick={() => { setMode("signup"); setStatusMsg(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === "signup" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Register
          </button>
        </div>

        {/* --- LOGIN FORM --- */}
        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-gray-500" size={18} />
              <input 
                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-600"
                placeholder="Username"
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />
              <input 
                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-600"
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
            
            {statusMsg && <p className="text-center text-sm font-medium text-rose-400 animate-pulse">{statusMsg}</p>}

            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="animate-spin" /> : <>ENTER <ArrowRight size={18} /></>}
            </button>
          </form>
        )}

        {/* --- REGISTRATION FORM --- */}
        {mode === "signup" && !isCapturing && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <input 
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
              placeholder="Username (lowercase)"
              value={formData.username}
              onChange={e => setFormData({...formData, username: e.target.value.toLowerCase()})}
            />
            <input 
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={e => setFormData({...formData, fullName: e.target.value})}
            />
            <input 
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
            
            <button 
              onClick={() => {
                if(formData.username && formData.password) setIsCapturing(true);
                else setStatusMsg("Please fill in all fields.");
              }}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-purple-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              START BIOMETRICS <Camera size={18} />
            </button>
            {statusMsg && <p className="text-center text-sm text-rose-400">{statusMsg}</p>}
          </div>
        )}

        {/* --- FACE CAPTURE UI --- */}
        {isCapturing && (
          <div className="animate-in zoom-in duration-300">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-4 border-2 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.4)]">
              <Webcam 
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
              />
              
              {/* Overlay Guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-64 border-2 border-white/30 rounded-full" />
              </div>

              {/* Progress Pills */}
              <div className="absolute top-4 left-0 w-full flex justify-center gap-2 px-4">
                {POSES.map((pose, idx) => (
                  <div 
                    key={pose}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                      idx < currentPoseIndex ? "bg-green-500" : idx === currentPoseIndex ? "bg-white" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="text-center space-y-4">
              <h3 className="text-2xl font-bold text-white uppercase tracking-wider">
                Look {POSES[currentPoseIndex]}
              </h3>
              <p className="text-gray-400 text-xs">
                Position your face clearly in the frame
              </p>
              
              <button 
                onClick={handleCapture}
                className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Camera size={20} /> CAPTURE
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}