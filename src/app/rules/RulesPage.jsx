import { useEffect, useState } from 'react';
import { houseMdToHtml } from './md.js';
import './rules.css';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

function ensureFonts() {
  if (document.getElementById('fk-rules-fonts')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = 'anonymous';
  const link = document.createElement('link');
  link.id = 'fk-rules-fonts';
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.append(pre1, pre2, link);
}

export default function RulesPage() {
  const [status, setStatus] = useState('loading');
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.classList.add('fk-rules');
    ensureFonts();
    return () => document.documentElement.classList.remove('fk-rules');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/rules', { credentials: 'include' });
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
        setDraft(typeof data.body_md === 'string' ? data.body_md : '');
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    setSaveState('saving');
    setError('');
    try {
      const res = await fetch('/api/v1/rules', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_md: draft }),
      });
      if (res.status === 401) {
        setStatus('unauthenticated');
        setSaveState('idle');
        return;
      }
      if (!res.ok) {
        setSaveState('error');
        setError('Could not save.');
        return;
      }
      const data = await res.json();
      if (typeof data.body_md === 'string') setDraft(data.body_md);
      setSaveState('saved');
    } catch {
      setSaveState('error');
      setError('Could not save.');
    }
  };

  const onPrint = () => {
    window.print();
  };

  if (status === 'unauthenticated') {
    return (
      <div className="fk-rules-desk">
        <div className="fk-rules-note">
          <h1>Open this on a parent session</h1>
          <p>
            This card is for a parent who is already signed in. There is no
            login on this page. Local dogfood: set cookie{' '}
            <code>fk_session=sess_dogfood_local</code> (raw session id until
            HMAC wrapping in a later change). See seeds/dogfood/README.md.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="fk-rules-desk">
        <p className="fk-rules-kicker">Loading the card…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fk-rules-desk">
        <div className="fk-rules-note">
          <h1>Card unavailable</h1>
          <p>The rules could not be loaded. Try again from a parent session.</p>
        </div>
      </div>
    );
  }

  const html = houseMdToHtml(draft);
  const saveLabel =
    saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : 'Save';

  return (
    <div className="fk-rules-desk">
      <header className="fk-rules-mast no-print">
        <p className="fk-rules-kicker">Kitchen / study notice</p>
        <div className="fk-rules-actions">
          <span className="fk-rules-status" aria-live="polite">
            {saveState === 'saved' ? 'Saved to this household.' : error}
          </span>
          <button
            type="button"
            className="fk-rules-btn"
            onClick={onSave}
            disabled={saveState === 'saving'}
          >
            {saveLabel}
          </button>
          <button type="button" className="fk-rules-btn print" onClick={onPrint}>
            Print
          </button>
        </div>
      </header>

      <div className="fk-rules-stage">
        <div className="fk-rules-clip" aria-hidden="true">
          <div className="fk-rules-clip-top" />
          <div className="fk-rules-clip-wire" />
        </div>
        <section className="fk-rules-card">
          <div className="fk-rules-stamp">Adult stays in the room</div>
          <div
            className="fk-rules-article"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <p className="fk-rules-card-foot">Print and pin · fridge or homework table</p>
        </section>
      </div>

      <div className="fk-rules-editor no-print">
        <label htmlFor="fk-rules-md">Edit the card (markdown)</label>
        <textarea
          id="fk-rules-md"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (saveState !== 'idle') setSaveState('idle');
          }}
          spellCheck="true"
        />
      </div>
    </div>
  );
}
