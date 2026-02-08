import React from 'react';
import { Twitter, Instagram, Linkedin } from 'lucide-react';

const Footer = () => {
    return (
        <footer className="py-12 px-6 border-t border-slate-200/60 bg-white/30 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="text-slate-500 text-sm">
                    © {new Date().getFullYear()} FamilyAI Inc. All rights reserved.
                </div>

                <div className="flex gap-6">
                    <a href="#" className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-indigo-600">
                        <Twitter className="w-5 h-5" />
                    </a>
                    <a href="#" className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-pink-600">
                        <Instagram className="w-5 h-5" />
                    </a>
                    <a href="#" className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-blue-600">
                        <Linkedin className="w-5 h-5" />
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
