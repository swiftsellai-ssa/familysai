import React, { useState } from 'react';
import { Send, CheckCircle } from 'lucide-react';

const WaitlistForm = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error

    const handleSubmit = (e) => {
        e.preventDefault();
        setStatus('loading');

        // Simulate API call
        setTimeout(() => {
            setStatus('success');
            setEmail('');
        }, 1500);
    };

    return (
        <section className="py-24 px-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-50/50 -z-10"></div>

            <div className="max-w-2xl mx-auto text-center glass-panel p-10 md:p-14 rounded-[2rem]">
                <h2 className="text-3xl md:text-4xl font-bold mb-6 text-slate-800">
                    Ready to reclaim your peace?
                </h2>
                <p className="text-lg text-slate-600 mb-8">
                    Join 2,000+ parents on the waitlist for early access.
                </p>

                {status === 'success' ? (
                    <div className="flex flex-col items-center justify-center p-6 bg-green-50 rounded-2xl border border-green-100 animate-fade-in-up">
                        <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                        <h3 className="text-xl font-semibold text-green-800">You're on the list!</h3>
                        <p className="text-green-600">We'll be in touch soon.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="email"
                            placeholder="Enter your email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="flex-1 px-6 py-4 rounded-xl border border-slate-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-lg"
                            disabled={status === 'loading'}
                        />
                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="px-8 py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg shadow-lg hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    Join Now <Send className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                )}

                <p className="mt-6 text-sm text-slate-500">
                    No spam, ever. Unsubscribe anytime.
                </p>
            </div>
        </section>
    );
};

export default WaitlistForm;
