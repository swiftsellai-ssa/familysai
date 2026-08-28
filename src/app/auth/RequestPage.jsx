import { useState } from 'react';

export default function RequestPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch('/api/v1/auth/magic-link', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Same copy either way — no enumeration.
    }
    setDone(true);
    setBusy(false);
  };

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Request a sign-in link</h1>
      <p style={{ marginTop: '0.75rem' }}>
        Local dogfood: if this address may sign in, the Worker logs the URL
        (MAILER=log) or emails it (Resend).
      </p>
      {done ? (
        <p style={{ marginTop: '1rem' }}>
          If that address can sign in, a link is on its way.
        </p>
      ) : (
        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block' }}>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: 8 }}
            />
          </label>
          <button type="submit" disabled={busy} style={{ marginTop: 12, padding: '8px 14px' }}>
            {busy ? 'Sending…' : 'Send link'}
          </button>
        </form>
      )}
    </main>
  );
}
