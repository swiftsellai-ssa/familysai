import React from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

const Hero = () => {
    return (
        <section className="pt-32 pb-20 px-6 min-h-[90vh] flex items-center justify-center relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200/50 rounded-full blur-3xl -z-10 mix-blend-multiply animate-pulse-slow"></div>
            <div className="absolute bottom-20 right-10 w-72 h-72 bg-cyan-200/50 rounded-full blur-3xl -z-10 mix-blend-multiply animate-pulse-slow delay-1000"></div>

            <div className="max-w-4xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 border border-white/50 backdrop-blur-sm mb-8 animate-fade-in-up">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium text-slate-600">Trusted by 2,000+ early access parents</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight tracking-tight text-slate-800 animate-fade-in-up delay-100">
                    Parenting is chaotic. <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                        Your home shouldn't be.
                    </span>
                </h1>

                <p className="text-xl md:text-2xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
                    Meet your new AI co-parent. It anticipates needs, organizes chaos, and gives you back your mental space.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up delay-300">
                    <button className="w-full sm:w-auto px-8 py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 group">
                        Join the Waitlist
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button className="w-full sm:w-auto px-8 py-4 rounded-xl glass-button text-slate-700 font-semibold text-lg hover:bg-white/60">
                        See How It Works
                    </button>
                </div>
            </div>
        </section>
    );
};

export default Hero;
