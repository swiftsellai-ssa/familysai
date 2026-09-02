import React from 'react';
import { Calendar, BrainCircuit, HeartHandshake } from 'lucide-react';

const features = [
    {
        icon: <Calendar className="w-8 h-8 text-purple-600" />,
        title: "Meal weeks",
        description: "Canon of dinners you already like. Pick a labelled week. Export a named text list for any shop.",
        color: "bg-purple-100"
    },
    {
        icon: <BrainCircuit className="w-8 h-8 text-blue-600" />,
        title: "Homework gate",
        description: "Printable rules. Kid fills title / used AI for / checked against. You Accept on your phone.",
        color: "bg-blue-100"
    },
    {
        icon: <HeartHandshake className="w-8 h-8 text-pink-600" />,
        title: "Adult in the room",
        description: "No kid account. No companion chat. Optional home LLM is a parent button and fails open.",
        color: "bg-pink-100"
    }
];

const FeatureCards = () => {
    return (
        <section id="features" className="py-20 px-6 bg-white/30 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 text-slate-800">
                    Two jobs. One household.
                </h2>

                <div className="grid md:grid-cols-3 gap-8">
                    {features.map((feature, idx) => (
                        <div key={idx} className="group p-8 rounded-3xl glass-panel hover:bg-white/50 transition-all duration-300 hover:-translate-y-2">
                            <div className={`w-16 h-16 rounded-2xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">{feature.title}</h3>
                            <p className="text-slate-600 leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FeatureCards;
