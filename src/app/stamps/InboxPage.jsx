import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureKitFonts } from '../meals/fonts.js';
import './new/stamps.css';

function SessionNote() {
  return (
    <div className="fk-stamp-desk">
      <div className="fk-stamp-note">
        <h1>Open this on a parent session</h1>
        <p>
          Inbox is for a parent already signed in on this phone. There is no
          login on this page. Local dogfood: set cookie{' '}
          <code>fk_session=sess_dogfood_local</code> (HMAC cookie from scripts
          wrapping in a later change). See seeds/dogfood/README.md.
        </p>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [status, setStatus] = useState('loading');
  const [stamps, setStamps] = useState([]);
  const [kiosk, setKiosk] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState("");
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.documentElement.classList.add('fk-stamp');
    ensureKitFonts();
    return () => document.documentElement.classList.remove('fk-stamp');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/v1/me', { credentials: 'include' });
        if (cancelled) return;
        if (meRes.status === 401) { setStatus('unauthenticated'); return; }
        if (!meRes.ok) { setStatus('error'); return; }
        const me = await meRes.json();
        if (me.kiosk === true) { setKiosk(true); setStatus('ready'); return; }
        const pinRes = await fetch('/api/v1/settings/kiosk-pin-status', { credentials: 'include' });
        if (pinRes.status === 401) { setStatus('unauthenticated'); return; }
        if (pinRes.ok) { const pinData = await pinRes.json(); setPinRequired(pinData.required === true); }
        const res = await fetch('/api/v1/stamps?status=pending', { credentials: 'include' });
        if (cancelled) return;
        if (res.status === 401) {
          setStatus('unauthenticated');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const data = await res.json();
        setStamps(Array.isArray(data.stamps) ? data.stamps : []);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  const decide = async (id, action) => {
    setActing(id + ':' + action);
    setError('');
    try {
      const res = await fetch('/api/v1/stamps/' + id + '/' + action, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.status === 401) { setStatus('unauthenticated'); return; }
      if (!res.ok) { setError('Could not update that stamp.'); setActing(''); return; }
      setStamps((prev) => prev.filter((s) => s.id !== id));
      setActing('');
    } catch {
      setError('Could not update that stamp.');
      setActing('');
    }
  };

  const onSetPin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/v1/settings/kiosk-pin', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 401) { setStatus('unauthenticated'); return; }
      if (!res.ok) { setError('PIN must be four digits.'); return; }
      setPinRequired(false);
      setPin('');
    } catch {
      setError('Could not set the PIN.');
    }
  };

  if (status === 'unauthenticated') return <SessionNote />;

  if (status === 'loading') {
    return (
      <div className="fk-stamp-desk">
        <p className="fk-stamp-kicker">Loading inbox…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fk-stamp-desk">
        <div className="fk-stamp-note">
          <h1>Inbox unavailable</h1>
          <p>Pending stamps could not be loaded. Try again from a parent session.</p>
        </div>
      </div>
    );
  }

  if (kiosk) {
    return (
      <div className="fk-stamp-desk">
        <div className="fk-stamp-note">
          <h1>Open inbox on your phone first.</h1>
          <p>Accept happens on the phone, not this study PC. File the three fields at /stamps/new.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fk-stamp-desk">
      <header className="fk-stamp-mast">
        <p className="fk-stamp-kicker">Parent inbox</p>
        <nav className="fk-stamp-nav">
          <Link to="/stamps/new">Study PC slip</Link>
        </nav>
      </header>
      <div className="fk-stamp-stage">
        <div className="fk-stamp-clip" aria-hidden="true">
          <div className="fk-stamp-clip-top" />
          <div className="fk-stamp-clip-wire" />
        </div>
        <section className="fk-stamp-card">
          <h1>Inbox</h1>
          <p className="fk-stamp-lede">
            Five-minute glance, not a line editor. Open inbox on your phone first. The study PC stays on the three fields.
          </p>
          {pinRequired ? (
            <form className="fk-stamp-form fk-inbox-pin" onSubmit={onSetPin}>
              <label className="fk-stamp-field">
                <span>Set school-night PIN</span>
                <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
              </label>
              <button type="submit" className="fk-stamp-btn" disabled={pin.length !== 4}>Save PIN</button>
            </form>
          ) : null}
          {error ? <p className="fk-stamp-error">{error}</p> : null}

          {stamps.length === 0 ? (
            <p className="fk-stamp-empty">No pending stamps.</p>
          ) : (
            <ul className="fk-stamp-list">
              {stamps.map((s) => (
                <li key={s.id}>
                  <div className="fk-inbox-item">
                    <p className="fk-inbox-title">{s.title}</p>
                    <p className="fk-inbox-meta">{s.member_label || s.member_id} · used {(s.used_ai_for || []).join(", ")} · {s.checked_against}</p>
                    <div className="fk-inbox-actions">
                      <button type="button" className="fk-stamp-btn" onClick={() => decide(s.id, "accept")}>Accept</button>
                      <button type="button" className="fk-stamp-btn fk-stamp-btn-ghost" onClick={() => decide(s.id, "request-changes")}>Request changes</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="fk-stamp-card-foot">Clipboard, not a tutor. Open inbox on your phone first.</p>
        </section>
      </div>
    </div>
  );
}
