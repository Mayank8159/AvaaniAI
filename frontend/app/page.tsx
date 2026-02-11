"use client";

import React, { useState } from "react";
import { Mic } from "lucide-react";
import VrmStage from "@/components/vrm/VrmStage";

export default function Home() {
  const [isListening, setIsListening] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      overflow: 'hidden',
      zIndex: 9999
    }}>
      {/* --- LAYER 0: BACKGROUND --- */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(circle at 50% 30%, #1e1b4b 0%, #000 80%)'
      }} />

      {/* --- LAYER 1: HALO GLOW --- */}
      <div style={{
        position: 'absolute',
        top: '45%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%)',
        filter: 'blur(80px)',
        zIndex: 1,
        animation: 'pulseHalo 8s infinite ease-in-out'
      }} />

      {/* --- LAYER 2: 3D MODEL --- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        <VrmStage />
      </div>

      {/* --- LAYER 3: VOICE-ONLY DOCK --- */}
      <div style={{
        position: 'absolute',
        bottom: '60px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px'
      }}>
        <button 
          onClick={() => setIsListening(!isListening)}
          style={{
            position: 'relative',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isListening ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            borderTop: '1px solid rgba(255, 255, 255, 0.3)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.3)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            cursor: 'pointer',
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isListening ? 'scale(1.1)' : 'scale(1)',
            outline: 'none',
            color: isListening ? '#fff' : 'rgba(255,255,255,0.6)'
          }}
        >
          {/* Active Listening Ripple */}
          {isListening && (
            <div style={{
              position: 'absolute',
              inset: '-10px',
              borderRadius: '50%',
              border: '2px solid rgba(139, 92, 246, 0.5)',
              animation: 'ripple 1.5s infinite ease-out'
            }} />
          )}
          
          <Mic size={32} />
        </button>

        <p style={{
          color: 'rgba(255,255,255,0.4)',
          fontSize: '12px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontWeight: '500',
          animation: isListening ? 'pulseText 1.5s infinite' : 'none'
        }}>
          {isListening ? "Listening..." : "Tap to Speak"}
        </p>
      </div>

      <style jsx global>{`
        @keyframes pulseHalo {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes pulseText {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        body { background: black !important; margin: 0; padding: 0; overflow: hidden; }
      `}</style>
    </div>
  );
}