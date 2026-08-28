import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CallbackPage() {
  const [status, setStatus] = useState('working');
  const navigate = useNavigate();

  useEffect(() => {
    document.querySelector('meta[name="referrer"]')?.setAttribute('content', 'no-referrer');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    window.history.replaceState({}, '', '/auth/callback');

    if (!token) {
      setStatus('missing');
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/magic-link/consume', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setStatus('failed');
          return;
        }
        await res.json().catch(() => ({}));
        // Architecture: onboarded=0 → /app/onboarding, else /app/meals/weeks.
        // /app/onboarding is PR-9, so land on weeks until that route exists.
        navigate('/app/meals/weeks', { replace: true });
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Signing in</h1>
      {status === 'working' && <p>One moment.</p>}
      {status === 'missing' && <p>This sign-in link is missing a token. Request a new one.</p>}
      {status === 'failed' && (
        <p>
          This sign-in link is invalid or already used.{' '}
          <a href="/auth/request">Request a new link</a>.
        </p>
      )}
    </main>
  );
}
