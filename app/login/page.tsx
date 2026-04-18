'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError('Email ou password incorretos.');
      return;
    }
    router.push(params.get('callbackUrl') ?? '/dashboard');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(240 23% 96%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2.5rem 2rem', width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'hsl(13 100% 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>YB</div>
            <span style={{ fontWeight: 700, fontSize: 20, color: 'hsl(235 21% 21%)' }}>YourBox</span>
          </div>
          <p style={{ color: 'hsl(235 15% 46%)', fontSize: 14, marginTop: 6 }}>Dashboard interno</p>
        </div>

        <form onSubmit={handleSubmit}>
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
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid hsl(240 10% 88%)', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'hsl(235 21% 21%)', background: '#fff' }}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid hsl(240 10% 88%)', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'hsl(235 21% 21%)', background: '#fff' }}
              onFocus={(e) => e.target.style.borderColor = 'hsl(13 100% 65%)'}
              onBlur={(e) => e.target.style.borderColor = 'hsl(240 10% 88%)'}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#dc2626', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '11px', background: loading ? 'hsl(13 100% 75%)' : 'hsl(13 100% 65%)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer', transition: 'background .15s' }}
          >
            {loading ? 'A entrar...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginForm />
    </Suspense>
  );
}
