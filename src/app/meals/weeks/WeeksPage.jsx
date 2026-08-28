import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureKitFonts } from '../fonts.js';
import '../meals.css';

function SessionNote() {
  return (
    <div className="fk-meals-desk">
      <div className="fk-meals-note">
        <h1>Open this on a parent session</h1>
        <p>
          Sunday list is for a parent who is already signed in. There is no
          login on this page. Local dogfood: set cookie{' '}
          <code>fk_session=sess_dogfood_local</code> (raw session id until HMAC
          wrapping in a later change). See seeds/dogfood/README.md.
        </p>
      </div>
    </div>
  );
}

export default function WeeksPage() {
  const [status, setStatus] = useState('loading');
  const [weeks, setWeeks] = useState([]);

  useEffect(() => {
    document.documentElement.classList.add('fk-meals');
    ensureKitFonts();
    return () => document.documentElement.classList.remove('fk-meals');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/meals/weeks', { credentials: 'include' });
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
        setWeeks(Array.isArray(data.weeks) ? data.weeks : []);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'unauthenticated') return <SessionNote />;

  if (status === 'loading') {
    return (
      <div className="fk-meals-desk">
        <p className="fk-meals-kicker">Loading labelled weeks…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fk-meals-desk">
        <div className="fk-meals-note">
          <h1>Weeks unavailable</h1>
          <p>Labelled weeks could not be loaded. Try again from a parent session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fk-meals-desk">
      <header className="fk-meals-mast">
        <p className="fk-meals-kicker">Sunday list</p>
        <nav className="fk-meals-nav">
          <Link to="/app/meals/canon">Loved dinners</Link>
        </nav>
      </header>
      <div className="fk-meals-stage">
        <div className="fk-meals-clip" aria-hidden="true">
          <div className="fk-meals-clip-top" />
          <div className="fk-meals-clip-wire" />
        </div>
        <section className="fk-meals-card">
          <h1>Pick a labelled week</h1>
          <p className="fk-meals-lede">
            Canon is frozen. Daily use is pick a week and copy the named list.
            Paste into Woolies, Coles, Bring, or Notes. Subtract pantry by hand.
            The adult stays in the room.
          </p>
          {weeks.length === 0 ? (
            <p className="fk-meals-empty">No labelled weeks yet.</p>
          ) : (
            <ul className="fk-meals-list">
              {weeks.map((w) => (
                <li key={w.id}>
                  <Link className="fk-meals-week" to={`/app/meals/weeks/${w.id}`}>
                    <span className="fk-meals-week-name">{w.list_name || w.title}</span>
                    <span className="fk-meals-week-meta">
                      {(w.dinners || []).length} dinner
                      {(w.dinners || []).length === 1 ? '' : 's'}
                      {w.flex ? ` · flex ${w.flex}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="fk-meals-card-foot">Clipboard, not a generated meal plan</p>
        </section>
      </div>
    </div>
  );
}
