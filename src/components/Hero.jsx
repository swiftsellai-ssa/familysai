import React from 'react';
import { ShieldCheck } from 'lucide-react';

const Hero = () => {
    return (
        <section className="pt-32 pb-20 px-6 min-h-[90vh] flex items-center justify-center relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200/50 rounded-full blur-3xl -z-10 mix-blend-multiply animate-pulse-slow"></div>
            <div className="absolute bottom-20 right-10 w-72 h-72 bg-cyan-200/50 rounded-full blur-3xl -z-10 mix-blend-multiply animate-pulse-slow delay-1000"></div>

            <div className="max-w-4xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 border border-white/50 backdrop-blur-sm mb-8 animate-fade-in-up">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium text-slate-600">A clipboard for the house. The adult stays in the room.</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight tracking-tight text-slate-800 animate-fade-in-up delay-100">
                    Sunday list. <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                        Not another AI co-parent.
                    </span>
                </h1>

                <p className="text-xl md:text-2xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
                    Family Kit holds the dinners you already cook and the homework rules you already have. No child chatbot. No generated week of meals. The model can be unplugged and Sunday still works.
                </p>

            </div>
        </section>
    );
};

export default Hero;
