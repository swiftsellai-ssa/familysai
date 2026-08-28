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
          Loved dinners are for a parent who is already signed in. There is no
          login on this page. Local dogfood: set cookie{' '}
          <code>fk_session=sess_dogfood_local</code> (raw session id until HMAC
          wrapping in a later change). See seeds/dogfood/README.md.
        </p>
      </div>
    </div>
  );
}

function qtyLine(ing) {
  const parts = [ing.item];
  if (ing.qty != null && ing.unit) parts.push(`— ${ing.qty} ${ing.unit}`);
  else if (ing.qty != null) parts.push(`— ${ing.qty}`);
  return parts.join(' ');
}

export default function CanonPage() {
  const [status, setStatus] = useState('loading');
  const [meals, setMeals] = useState([]);

  useEffect(() => {
    document.documentElement.classList.add('fk-meals');
    ensureKitFonts();
    return () => document.documentElement.classList.remove('fk-meals');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/meals/canon', { credentials: 'include' });
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
        setMeals(Array.isArray(data.meals) ? data.meals : []);
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
        <p className="fk-meals-kicker">Loading loved dinners…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fk-meals-desk">
        <div className="fk-meals-note">
          <h1>Canon unavailable</h1>
          <p>Loved dinners could not be loaded. Try again from a parent session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fk-meals-desk">
      <header className="fk-meals-mast">
        <p className="fk-meals-kicker">Meal canon</p>
        <nav className="fk-meals-nav">
          <Link to="/app/meals/weeks">Labelled weeks</Link>
        </nav>
      </header>
      <div className="fk-meals-stage">
        <div className="fk-meals-clip" aria-hidden="true">
          <div className="fk-meals-clip-top" />
          <div className="fk-meals-clip-wire" />
        </div>
        <section className="fk-meals-card">
          <h1>Loved dinners</h1>
          <p className="fk-meals-lede">
            The household canon. Weeks pick from this list. Not a recipe editor.
          </p>
          {meals.length === 0 ? (
            <p className="fk-meals-empty">No dinners in the canon yet.</p>
          ) : (
            meals.map((m) => (
              <div className="fk-meals-dinner" key={m.id}>
                <strong>{m.title}</strong>
                {Array.isArray(m.ingredients) && m.ingredients.length > 0 ? (
                  <ul className="fk-meals-ings">
                    {m.ingredients.map((ing, i) => (
                      <li key={`${m.id}-${i}`}>{qtyLine(ing)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
          <p className="fk-meals-card-foot">Frozen canon · weeks are labelled rarely</p>
        </section>
      </div>
    </div>
  );
}
