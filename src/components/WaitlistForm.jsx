import React, { useState } from 'react';
import { Send, CheckCircle } from 'lucide-react';

const WaitlistForm = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');

        try {
            const response = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    access_key: "ff55b387-3925-4b8e-9709-732d79b594fa", // Placeholder
                    email: email,
                    message: message,
                    subject: "New Waitlist Submission (FamilyAI)"
                })
            });

            const data = await response.json();

            if (data.success) {
                setStatus('success');
                setEmail('');
                setMessage('');
            } else {
                console.error("Submission failed", data);
                setStatus('error');
            }
        } catch (error) {
            console.error("Submission error", error);
            setStatus('error');
        }
    };

    return (
        <section className="py-24 px-6 relative overflow-hidden" id="waitlist">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-50/50 -z-10"></div>

            <div className="max-w-2xl mx-auto text-center glass-panel p-8 md:p-14 rounded-[2rem]">
                <h2 className="text-3xl md:text-4xl font-bold mb-6 text-slate-800">
                    Ready to reclaim your peace?
                </h2>
                <p className="text-lg text-slate-600 mb-8">
                    Join 2,000+ parents on the waitlist for early access.
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

                        <button
                            type="submit"
                            disabled={status === 'loading'}
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
