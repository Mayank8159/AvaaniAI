"use client";

import React, { useState } from "react";
import { Mic, Send, Plus } from "lucide-react";
import VrmStage from "@/components/vrm/VrmStage";

export default function Home() {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);

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
      {/* --- BACKGROUND LAYER --- */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(circle at 50% 30%, #4c1d95 0%, #000 80%)'
      }} />

      {/* --- HALO GLOW EFFECT --- */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
        filter: 'blur(60px)',
        zIndex: 1,
        animation: 'pulseHalo 6s infinite ease-in-out'
      }} />

      {/* --- 3D MODEL LAYER --- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        <VrmStage />
      </div>

      {/* --- REAL GLASSMORPHIC DOCK --- */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '600px',
        zIndex: 100,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px 10px 24px',
          borderRadius: '999px',
          // Specular highlights: Brighter top border, darker bottom shadow
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          borderTop: '1px solid rgba(255, 255, 255, 0.3)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.3)',
          boxShadow: isFocused 
            ? '0 20px 50px rgba(0,0,0,0.7), 0 0 15px rgba(139, 92, 246, 0.2)' 
            : '0 10px 40px rgba(0,0,0,0.5)',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isFocused ? 'scale(1.02) translateY(-4px)' : 'scale(1)'
        }}>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            <Plus size={22} />
          </button>

          <input
            type="text"
            value={input}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Talk to Avani..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: '17px',
              padding: '12px 0',
              fontWeight: '300'
            }}
          />

          <button style={{ background: 'none', border: 'none', color: isFocused ? '#fff' : 'rgba(255,255,255,0.4)' }}>
            <Mic size={24} />
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulseHalo {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
        }
        body { background: black !important; margin: 0; }
        header, nav, .top-bar { display: none !important; }
      `}</style>
    </div>
  );
}