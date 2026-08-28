import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ensureKitFonts } from '../fonts.js';
import '../meals.css';

const STORES = [
  { id: 'woolworths', label: 'Woolworths' },
  { id: 'coles', label: 'Coles' },
  { id: 'bring', label: 'Bring' },
  { id: 'notes', label: 'Notes' },
];

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

function titledText(listText, store) {
  if (!listText) return '';
  const nl = listText.indexOf('\n');
  const first = nl === -1 ? listText : listText.slice(0, nl);
  const rest = nl === -1 ? '' : listText.slice(nl);
  const found = STORES.find((s) => s.id === store);
  if (!found) return listText;
  return `${found.label} — ${first}${rest}`;
}

export default function WeekDetailPage() {
  const { id } = useParams();
  const [status, setStatus] = useState('loading');
  const [week, setWeek] = useState(null);
  const [list, setList] = useState(null);
  const [canon, setCanon] = useState({});
  const [store, setStore] = useState('woolworths');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    document.documentElement.classList.add('fk-meals');
    ensureKitFonts();
    return () => document.documentElement.classList.remove('fk-meals');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [weekRes, listRes, canonRes] = await Promise.all([
          fetch(`/api/v1/meals/weeks/${encodeURIComponent(id)}`, {
            credentials: 'include',
          }),
          fetch(`/api/v1/meals/weeks/${encodeURIComponent(id)}/list`, {
            credentials: 'include',
          }),
          fetch('/api/v1/meals/canon', { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (weekRes.status === 401 || listRes.status === 401) {
          setStatus('unauthenticated');
          return;
        }
        if (!weekRes.ok || !listRes.ok) {
          setStatus(weekRes.status === 404 || listRes.status === 404 ? 'missing' : 'error');
          return;
        }
        const weekJson = await weekRes.json();
        const listJson = await listRes.json();
        let titles = {};
        if (canonRes.ok) {
          const canonJson = await canonRes.json();
          for (const m of canonJson.meals || []) titles[m.id] = m.title;
        }
        setWeek(weekJson);
        setList(listJson);
        setCanon(titles);
        if (typeof listJson.store === 'string' && STORES.some((s) => s.id === listJson.store)) {
          setStore(listJson.store);
        }
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const exportText = useMemo(() => {
    if (!list || typeof list.text !== 'string') return '';
    return titledText(list.text, store);
  }, [list, store]);

  const onCopy = async () => {
    setCopied('');
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied('Copied. Paste into the store app and subtract pantry by hand.');
    } catch {
      setCopied('Could not copy. Select the list and copy it yourself.');
    }
  };

  const onDownload = () => {
    const name = (list?.list_name || 'list').replace(/[/\\?%*:|"<>]/g, '-');
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.txt`;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (status === 'unauthenticated') return <SessionNote />;

  if (status === 'loading') {
    return (
      <div className="fk-meals-desk">
        <p className="fk-meals-kicker">Loading the week…</p>
      </div>
    );
  }

  if (status === 'missing' || status === 'error') {
    return (
      <div className="fk-meals-desk">
        <div className="fk-meals-note">
          <h1>{status === 'missing' ? 'Week not found' : 'List unavailable'}</h1>
          <p>
            <Link to="/app/meals/weeks">Back to labelled weeks</Link>
          </p>
        </div>
      </div>
    );
  }

  const dinners = week?.dinners || [];

  return (
    <div className="fk-meals-desk">
      <header className="fk-meals-mast">
        <p className="fk-meals-kicker">Sunday list</p>
        <nav className="fk-meals-nav">
          <Link to="/app/meals/weeks">All weeks</Link>
          <Link to="/app/meals/canon">Loved dinners</Link>
        </nav>
      </header>
      <div className="fk-meals-stage">
        <div className="fk-meals-clip" aria-hidden="true">
          <div className="fk-meals-clip-top" />
          <div className="fk-meals-clip-wire" />
        </div>
        <section className="fk-meals-card">
          <h1>{list?.list_name || week?.title}</h1>
          <p className="fk-meals-lede">
            Named list for this labelled week. Same items for every store — only
            the first line changes. Never a Woolworths deep link.
          </p>
          <div>
            {dinners.map((mealId) => (
              <div className="fk-meals-dinner" key={mealId}>
                <strong>{canon[mealId] || mealId}</strong>
              </div>
            ))}
          </div>
          <div className="fk-meals-agg">
            <h2>Aggregated list</h2>
            <fieldset className="fk-meals-stores">
              <legend>Store title line</legend>
              {STORES.map((s) => (
                <label key={s.id}>
                  <input
                    type="radio"
                    name="fk-store"
                    value={s.id}
                    checked={store === s.id}
                    onChange={() => setStore(s.id)}
                  />
                  {s.label}
                </label>
              ))}
            </fieldset>
            <pre className="fk-meals-pre">{exportText}</pre>
            <div className="fk-meals-actions">
              <button type="button" className="fk-meals-btn" onClick={onCopy}>
                Copy text
              </button>
              <button type="button" className="fk-meals-btn" onClick={onDownload}>
                Export
              </button>
              {copied ? <p className="fk-meals-status">{copied}</p> : null}
            </div>
          </div>
          <p className="fk-meals-card-foot">Paste · subtract pantry in the store app</p>
        </section>
      </div>
    </div>
  );
}
