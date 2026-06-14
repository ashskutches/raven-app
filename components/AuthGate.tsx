'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const SESSION_KEY = 'raven_auth';
const PASSWORD = process.env.NEXT_PUBLIC_RAVEN_PASSWORD ?? 'raven';

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored === 'true') setAuthenticated(true);
    setLoading(false);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setAuthenticated(true);
    } else {
      setError('Incorrect password.');
      setInput('');
    }
  };

  if (loading) return null;

  if (authenticated) return <>{children}</>;

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 20% 0%, rgba(99,102,241,0.15) 0%, transparent 60%)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{
          width: 360,
          background: 'rgba(18,16,42,0.9)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: 24,
          padding: 40,
          boxShadow: '0 0 80px rgba(99,102,241,0.2), 0 24px 48px rgba(0,0,0,0.4)',
          textAlign: 'center',
        }}
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          style={{ fontSize: 52, marginBottom: 16 }}
        >
          🦅
        </motion.div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, marginBottom: 6,
          background: 'linear-gradient(135deg, #fff 50%, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Raven
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 28 }}>
          Your personal AI life coach
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            placeholder="Enter password"
            autoFocus
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${error ? 'rgba(251,113,133,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
              padding: '12px 16px',
              color: 'white',
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              outline: 'none',
              textAlign: 'center',
              letterSpacing: 4,
              transition: 'border-color 0.2s',
            }}
            aria-label="Password"
          />
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: 13, color: '#fb7185' }}
            >
              {error}
            </motion.p>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              color: 'white',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
          >
            Enter →
          </button>
        </form>
      </motion.div>
    </div>
  );
}
