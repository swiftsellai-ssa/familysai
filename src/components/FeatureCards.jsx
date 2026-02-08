import React from 'react';
import { Calendar, BrainCircuit, HeartHandshake } from 'lucide-react';

const features = [
    {
        icon: <Calendar className="w-8 h-8 text-purple-600" />,
        title: "Smart Scheduling",
        description: "Connects with everyone's calendars to find conflicts and suggest optimal times for family fun.",
        color: "bg-purple-100"
    },
    {
        icon: <BrainCircuit className="w-8 h-8 text-blue-600" />,
        title: "Proactive Suggestions",
        description: "Notices when you're stressed and suggests quick wins: a 5-minute easy dinner or a quiet activity for the kids.",
        color: "bg-blue-100"
    },
    {
        icon: <HeartHandshake className="w-8 h-8 text-pink-600" />,
        title: "Fair Share",
        description: "Visibly tracks household contributions to ensure labor is shared fairly, reducing resentment.",
        color: "bg-pink-100"
    }
];

const FeatureCards = () => {
    return (
        <section id="features" className="py-20 px-6 bg-white/30 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 text-slate-800">
                    Features designed for sanity
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
