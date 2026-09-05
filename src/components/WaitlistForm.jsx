import React, { useState, useEffect, useRef } from 'react';
import { Send, CheckCircle } from 'lucide-react';

// Sitekey: Vite `import.meta.env.VITE_TURNSTILE_SITE_KEY` (see `.env`), which must
// mirror wrangler.jsonc `vars.TURNSTILE_SITE_KEY`. The committed value is Cloudflare's
// dummy always-pass sitekey for local/dev only — not a production widget key.
// Production: set VITE_TURNSTILE_SITE_KEY at build to the real sitekey and
// `npx wrangler secret put TURNSTILE_SECRET_KEY`. Never put the secret in the SPA.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

const WaitlistForm = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
    const [turnstileToken, setTurnstileToken] = useState('');
    const widgetContainerRef = useRef(null);
    const widgetIdRef = useRef(null);
    const turnstileTokenRef = useRef('');

    const formVisible = status !== 'success';

    const setToken = (token) => {
        const next = typeof token === 'string' ? token : '';
        turnstileTokenRef.current = next;
        setTurnstileToken(next);
    };

    const readTurnstileToken = () => {
        try {
            if (widgetIdRef.current != null && window.turnstile?.getResponse) {
                const live = window.turnstile.getResponse(widgetIdRef.current);
                if (typeof live === 'string' && live) {
                    turnstileTokenRef.current = live;
                    return live;
                }
            }
        } catch {
            // Widget not ready yet.
        }
        const hidden = widgetContainerRef.current
            ?.querySelector('input[name="cf-turnstile-response"]')
            ?.value;
        if (typeof hidden === 'string' && hidden) {
            turnstileTokenRef.current = hidden;
            return hidden;
        }
        return turnstileTokenRef.current;
    };

    useEffect(() => {
        if (!formVisible || !TURNSTILE_SITE_KEY) return undefined;

        let cancelled = false;
        let widgetId = null;

        const renderWidget = () => {
            if (cancelled || widgetId != null) return;
            if (!widgetContainerRef.current || !window.turnstile?.render) return;
            const id = window.turnstile.render(widgetContainerRef.current, {
                sitekey: TURNSTILE_SITE_KEY,
                action: 'waitlist',
                theme: 'light',
                appearance: 'always',
                size: 'flexible',
                callback: (token) => {
                    if (!cancelled) setToken(token);
                },
                'expired-callback': () => {
                    if (!cancelled) setToken('');
                },
                'timeout-callback': () => {
                    if (!cancelled) setToken('');
                },
                'error-callback': () => {
                    if (cancelled) return;
                    setToken('');
                    setStatus((current) => (current === 'success' ? current : 'error'));
                },
                'retry-callback': () => {
                    if (!cancelled) setToken('');
                },
            });
            if (id == null) return;
            widgetId = id;
            widgetIdRef.current = id;
        };

        const onScriptLoad = () => renderWidget();
        let script = document.querySelector(
            'script[data-fk-turnstile], script[src*="challenges.cloudflare.com/turnstile"]',
        );
        if (window.turnstile?.render) {
            renderWidget();
        } else if (script) {
            script.addEventListener('load', onScriptLoad);
            if (script.readyState === 'complete' || script.readyState === 'loaded') {
                renderWidget();
            }
        } else {
            script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.dataset.fkTurnstile = '1';
            script.addEventListener('load', onScriptLoad);
            document.head.appendChild(script);
        }

        return () => {
            cancelled = true;
            if (script) script.removeEventListener('load', onScriptLoad);
            if (widgetId != null && window.turnstile?.remove) {
                window.turnstile.remove(widgetId);
            }
            if (widgetIdRef.current === widgetId) {
                widgetIdRef.current = null;
            }
            turnstileTokenRef.current = '';
        };
    }, [formVisible]);

    const resetTurnstile = () => {
        setToken('');
        if (widgetIdRef.current != null && window.turnstile?.reset) {
            window.turnstile.reset(widgetIdRef.current);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = readTurnstileToken();
        if (!token) {
            setStatus('error');
            return;
        }

        setStatus('loading');

        try {
            const payload = {
                email,
                turnstileToken: token,
            };
            if (message.trim()) {
                payload.message = message.trim();
            }

            const response = await fetch('/api/v1/waitlist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (response.ok && data.ok === true) {
                setStatus('success');
                setEmail('');
                setMessage('');
                setToken('');
            } else {
                setStatus('error');
                resetTurnstile();
            }
        } catch {
            setStatus('error');
            resetTurnstile();
        }
    };

    return (
        <section className="py-24 px-6 relative overflow-hidden" id="waitlist">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-50/50 -z-10"></div>

            <div className="max-w-2xl mx-auto text-center glass-panel p-8 md:p-14 rounded-[2rem]">
                <h2 className="text-3xl md:text-4xl font-bold mb-6 text-slate-800">
                    Want Sunday and school night on one origin?
                </h2>
                <p className="text-lg text-slate-600 mb-8">
                    Leave an email. Dogfood is one household first.
                </p>

                {status === 'success' ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-green-50/50 rounded-2xl border border-green-100 animate-fade-in-up">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">You're on the list!</h3>
                        <p className="text-slate-600 text-lg max-w-md mx-auto">
                            We'll reach out soon to help you reclaim your mental space.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg mx-auto">
                        <div className="flex flex-col text-left">
                            <label htmlFor="email" className="sr-only">Email Address</label>
                            <input
                                id="email"
                                type="email"
                                placeholder="Your email address"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-6 py-4 rounded-xl border border-slate-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-lg min-h-[56px]"
                                disabled={status === 'loading'}
                            />
                        </div>

                        <div className="flex flex-col text-left">
                            <label htmlFor="message" className="sr-only">Your #1 Review Stressor</label>
                            <textarea
                                id="message"
                                placeholder="What is your #1 parenting stressor?"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full px-6 py-4 rounded-xl border border-slate-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-lg min-h-[120px] resize-none"
                                disabled={status === 'loading'}
                            />
                        </div>

                        <div className="flex justify-center" aria-hidden={!TURNSTILE_SITE_KEY}>
                            <div ref={widgetContainerRef} />
                        </div>

                        <button
                            type="submit"
                            disabled={status === 'loading' || !turnstileToken}
                            className="w-full px-8 py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg shadow-lg hover:bg-indigo-700 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[56px]"
                        >
                            {status === 'loading' ? (
                                <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    Join the Waitlist <Send className="w-5 h-5" />
                                </>
                            )}
                        </button>

                        {status === 'error' && (
                            <p className="text-red-500 text-sm mt-2">
                                Something went wrong. Please try again.
                            </p>
                        )}
                    </form>
                )}

                <p className="mt-8 text-sm text-slate-500">
                    No spam, ever. Unsubscribe anytime.
                </p>
            </div>
        </section>
    );
};

export default WaitlistForm;
