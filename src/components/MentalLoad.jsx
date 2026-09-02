import React from 'react';
import { Check, X } from 'lucide-react';

const MentalLoad = () => {
    return (
        <section id="mental-load" className="py-20 px-6">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-800">
                        What we refuse to automate
                    </h2>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        The chaos is real. A guardian app is the wrong fix.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-center">
                    {/* Default/Chaos Mode */}
                    <div className="p-8 rounded-3xl bg-red-50/50 border border-red-100/50 relative overflow-hidden group hover:border-red-200 transition-all">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-200/20 rounded-full blur-2xl -z-10"></div>
                        <h3 className="text-2xl font-semibold text-slate-700 mb-6 flex items-center gap-2">
                            <span className="p-2 bg-red-100 rounded-lg text-red-600">
                                <X className="w-5 h-5" />
                            </span>
                            Without this
                        </h3>
                        <ul className="space-y-4">
                            {[
                                "School note in the bag, nobody type it in",
                                "5pm — What's for dinner, with an empty list",
                                "Kid used ChatGPT and you find out at submit time",
                                "One parent is the household secretary",
                                "Homework in the bedroom, phone in bed"
                            ].map((item, idx) => (
                                <li key={idx} className="flex items-center gap-3 text-slate-600 opacity-80 decoration-slate-400">
                                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Solution/Calm Mode */}
                    <div className="p-8 rounded-3xl glass-panel relative overflow-hidden transform md:-translate-y-4 shadow-2xl ring-1 ring-white/50">
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-200/30 rounded-full blur-2xl -z-10"></div>
                        <h3 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
                            <span className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                                <Check className="w-5 h-5" />
                            </span>
                            With Family Kit
                        </h3>
                        <ul className="space-y-4">
                            {[
                                "Labelled week -> shopping list you subtract from",
                                "House-rules card you can print",
                                "Three-field stamp before anything is submitted",
                                "Parent glance on the phone, kid never has login",
                                "Quiet hours as a reminder, not surveillance"
                            ].map((item, idx) => (
                                <li key={idx} className="flex items-start gap-3 text-slate-800 font-medium">
                                    <div className="p-1 bg-emerald-100 rounded-full mt-0.5">
                                        <Check className="w-3 h-3 text-emerald-600" />
                                    </div>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default MentalLoad;
