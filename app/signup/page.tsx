'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SignupPage() {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.success) {
      setError(data.error ?? 'Erro ao criar conta');
      return;
    }
    setDone(true);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, fontSize: 14, outline: 'none',
    boxSizing: 'border-box', color: 'var(--yb-fg)',
    background: 'var(--yb-input)',
    colorScheme: 'inherit' as const,
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--yb-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: 'var(--yb-card)', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: '2.5rem 2rem', width: '100%', maxWidth: 380,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yourbox-leads-icon.svg" alt="YourBox" style={{ width: 56, height: 56, display: 'block', margin: '0 auto 12px', borderRadius: 14 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--yb-fg)' }}>dashboard <span style={{ color: '#00bcd4' }}>LEADS</span></span>
          <p style={{ color: 'var(--yb-subtle)', fontSize: 13, marginTop: 4 }}>Criar conta</p>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, margin: '0 auto 16px', color: '#10b981',
            }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--yb-fg)', marginBottom: 8 }}>
              Conta criada com sucesso
            </p>
            <p style={{ fontSize: 13, color: 'var(--yb-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              A tua conta está a aguardar aprovação pelo administrador.<br />
              Receberás acesso em breve.
            </p>
            <Link href="/login" style={{
              display: 'block', textAlign: 'center',
              padding: '10px', borderRadius: 8,
              background: 'var(--yb-cyan)', color: '#fff',
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--yb-muted)', marginBottom: 6 }}>
                Nome
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="O teu nome"
                style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(0,188,212,0.5)'; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--yb-muted)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@yourbox.pt"
                style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(0,188,212,0.5)'; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--yb-muted)', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(0,188,212,0.5)'; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '10px 12px',
                fontSize: 13, color: '#f87171', marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: loading ? 'rgba(0,188,212,0.5)' : '#00bcd4',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
                transition: 'opacity .15s',
              }}
            >
              {loading ? 'A criar conta...' : 'Criar conta'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--yb-subtle)' }}>
              Já tens conta?{' '}
              <Link href="/login" style={{ color: '#00bcd4', fontWeight: 600, textDecoration: 'none' }}>
                Entrar
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
