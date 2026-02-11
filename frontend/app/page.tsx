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
        background: 'radial-gradient(circle at 50% 30%, #1e1b4b 0%, #000 80%)'
      }} />

      {/* --- HALO GLOW EFFECT (PORTRAIT CENTERED) --- */}
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

      {/* --- 3D MODEL LAYER --- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        <VrmStage />
      </div>

      {/* --- PREMIUM GLASSMORPHIC DOCK --- */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '550px',
        zIndex: 100,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px 10px 24px',
          borderRadius: '999px',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(30px) saturate(160%)',
          WebkitBackdropFilter: 'blur(30px) saturate(160%)',
          // Specular highlights
          borderTop: '1px solid rgba(255, 255, 255, 0.35)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.4)',
          boxShadow: isFocused 
            ? '0 25px 50px rgba(0,0,0,0.8)' 
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
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        body { background: black !important; margin: 0; }
        header, nav, .top-bar { display: none !important; }
      `}</style>
    </div>
  );
}