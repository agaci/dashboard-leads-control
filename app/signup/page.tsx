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
    border: '1.5px solid hsl(240 10% 88%)',
    borderRadius: 8, fontSize: 14, outline: 'none',
    boxSizing: 'border-box', color: 'hsl(235 21% 21%)', background: '#fff',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'hsl(240 23% 96%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        padding: '2.5rem 2rem', width: '100%', maxWidth: 380,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_original_simples.png" alt="YourBox" style={{ height: 48, width: 'auto', display: 'block', margin: '0 auto 10px' }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: 'hsl(235 21% 21%)' }}>dashboard <span style={{ color: 'hsl(13 100% 65%)' }}>LEADS</span></span>
          <p style={{ color: 'hsl(235 15% 46%)', fontSize: 13, marginTop: 4 }}>Criar conta</p>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#f0fdf4', border: '2px solid #bbf7d0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, margin: '0 auto 16px',
            }}>✓</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'hsl(235 21% 21%)', marginBottom: 8 }}>
              Conta criada com sucesso
            </p>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
              A tua conta está a aguardar aprovação pelo administrador.<br />
              Receberás acesso em breve.
            </p>
            <Link href="/login" style={{
              display: 'block', textAlign: 'center',
              padding: '10px', borderRadius: 8,
              background: 'hsl(13 100% 65%)', color: '#fff',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'hsl(235 21% 21%)', marginBottom: 6 }}>
                Nome
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="O teu nome"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'hsl(13 100% 65%)'}
                onBlur={(e) => e.target.style.borderColor = 'hsl(240 10% 88%)'}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'hsl(235 21% 21%)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@yourbox.pt"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'hsl(13 100% 65%)'}
                onBlur={(e) => e.target.style.borderColor = 'hsl(240 10% 88%)'}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'hsl(235 21% 21%)', marginBottom: 6 }}>
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
                onFocus={(e) => e.target.style.borderColor = 'hsl(13 100% 65%)'}
                onBlur={(e) => e.target.style.borderColor = 'hsl(240 10% 88%)'}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '10px 12px',
                fontSize: 13, color: '#dc2626', marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: loading ? 'hsl(13 100% 75%)' : 'hsl(13 100% 65%)',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                transition: 'background .15s',
              }}
            >
              {loading ? 'A criar conta...' : 'Criar conta'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#888' }}>
              Já tens conta?{' '}
              <Link href="/login" style={{ color: 'hsl(13 100% 65%)', fontWeight: 600, textDecoration: 'none' }}>
                Entrar
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
