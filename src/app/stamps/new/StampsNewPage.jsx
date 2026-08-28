import { useEffect, useState } from 'react';
import './stamps.css';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

const AI_OPTIONS = [
  { value: 'outline', label: 'Outline' },
  { value: 'wording', label: 'Wording' },
  { value: 'image', label: 'Image' },
  { value: 'none', label: 'None' },
];

function ensureFonts() {
  if (document.getElementById('fk-kit-fonts')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = 'anonymous';
  const link = document.createElement('link');
  link.id = 'fk-kit-fonts';
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.append(pre1, pre2, link);
}

export default function StampsNewPage() {
  const [status, setStatus] = useState('loading');
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [title, setTitle] = useState('');
  const [used, setUsed] = useState([]);
  const [checkedAgainst, setCheckedAgainst] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState('idle');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    document.documentElement.classList.add('fk-stamp');
    ensureFonts();
    return () => document.documentElement.classList.remove('fk-stamp');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/household/members', {
          credentials: 'include',
        });
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
        const list = Array.isArray(data.members) ? data.members : [];
        setMembers(list);
        const children = list.filter((m) => m.role === 'child');
        if (children.length === 1) setMemberId(children[0].id);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleUsed = (value) => {
    setUsed((prev) => {
      if (value === 'none') {
        return prev.includes('none') ? [] : ['none'];
      }
      const withoutNone = prev.filter((v) => v !== 'none');
      if (withoutNone.includes(value)) {
        return withoutNone.filter((v) => v !== value);
      }
      return [...withoutNone, value];
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitState('saving');
    setError('');
    try {
      const body = {
        title: title.trim(),
        used_ai_for: used,
        checked_against: checkedAgainst.trim(),
        member_id: memberId,
      };
      if (due.trim()) body.due = due.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch('/api/v1/stamps', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setStatus('unauthenticated');
        setSubmitState('idle');
        return;
      }
      if (!res.ok) {
        setSubmitState('error');
        setError('Could not file the stamp. Check the three fields and the child label.');
        return;
      }
      const data = await res.json();
      setCreated(data);
      setSubmitState('done');
    } catch {
      setSubmitState('error');
      setError('Could not file the stamp.');
    }
  };

  if (status === 'unauthenticated') {
    return (
      <div className="fk-stamp-desk">
        <div className="fk-stamp-note">
          <h1>Open this on a parent session</h1>
          <p>
            This slip is for a parent who is already signed in. There is no
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
      <div className="fk-stamp-desk">
        <p className="fk-stamp-kicker">Loading the slip…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fk-stamp-desk">
        <div className="fk-stamp-note">
          <h1>Slip unavailable</h1>
          <p>The stamp form could not be loaded. Try again from a parent session.</p>
        </div>
      </div>
    );
  }

  const children = members.filter((m) => m.role === 'child');

  if (created) {
    return (
      <div className="fk-stamp-desk">
        <header className="fk-stamp-mast">
          <p className="fk-stamp-kicker">Homework gate slip</p>
        </header>
        <div className="fk-stamp-stage">
          <div className="fk-stamp-clip" aria-hidden="true">
            <div className="fk-stamp-clip-top" />
            <div className="fk-stamp-clip-wire" />
          </div>
          <section className="fk-stamp-card">
            <div className="fk-stamp-mark">Pending</div>
            <h1>Stamp filed</h1>
            <p className="fk-stamp-lede">
              Three fields in. A parent glance happens later on the phone.
            </p>
            <dl className="fk-stamp-dl">
              <div>
                <dt>Id</dt>
                <dd>
                  <code>{created.id}</code>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{created.status}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{created.title}</dd>
              </div>
            </dl>
            <p className="fk-stamp-card-foot">Clipboard, not a tutor · adult stays in the room</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="fk-stamp-desk">
      <header className="fk-stamp-mast">
        <p className="fk-stamp-kicker">Homework gate slip</p>
      </header>

      <div className="fk-stamp-stage">
        <div className="fk-stamp-clip" aria-hidden="true">
          <div className="fk-stamp-clip-top" />
          <div className="fk-stamp-clip-wire" />
        </div>
        <section className="fk-stamp-card">
          <div className="fk-stamp-mark">Bones first</div>
          <h1>Stamp</h1>
          <p className="fk-stamp-lede">
            Three fields. Software is the clipboard. The adult stays in the
            room.
          </p>

          <form className="fk-stamp-form" onSubmit={onSubmit}>
            <label className="fk-stamp-field">
              <span>Child (label)</span>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select which child
                </option>
                {children.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.id})
                  </option>
                ))}
              </select>
            </label>

            <label className="fk-stamp-field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoComplete="off"
              />
            </label>

            <fieldset className="fk-stamp-field">
              <legend>Used AI for</legend>
              <p className="fk-stamp-hint">Pick one or more. None cannot mix with the others.</p>
              <div className="fk-stamp-checks">
                {AI_OPTIONS.map((opt) => (
                  <label key={opt.value} className="fk-stamp-check">
                    <input
                      type="checkbox"
                      checked={used.includes(opt.value)}
                      onChange={() => toggleUsed(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="fk-stamp-field">
              <span>Checked against</span>
              <input
                type="text"
                value={checkedAgainst}
                onChange={(e) => setCheckedAgainst(e.target.value)}
                maxLength={2048}
                required
                autoComplete="off"
              />
            </label>

            <div className="fk-stamp-secondary">
              <p className="fk-stamp-hint">Optional on this study PC (dogfood). Visually second to the three fields.</p>
              <label className="fk-stamp-field">
                <span>Due</span>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <label className="fk-stamp-field">
                <span>Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={8192}
                />
              </label>
            </div>

            {error ? <p className="fk-stamp-error">{error}</p> : null}

            <button
              type="submit"
              className="fk-stamp-btn"
              disabled={submitState === 'saving' || used.length === 0 || !memberId}
            >
              {submitState === 'saving' ? 'Filing' : 'File stamp'}
            </button>
          </form>
          <p className="fk-stamp-card-foot">Pending until a parent glance on the phone</p>
        </section>
      </div>
    </div>
  );
}
