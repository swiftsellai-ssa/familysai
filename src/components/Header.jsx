import React, { useState } from 'react';
import { Menu, X, Sparkles } from 'lucide-react';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
            <div className="mx-4 mt-4 rounded-2xl glass-panel md:mx-auto md:max-w-4xl">
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-600/10 rounded-lg">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                            FamilyAI
                        </span>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-slate-600 hover:text-indigo-600 transition-colors">Features</a>
                        <a href="#mental-load" className="text-slate-600 hover:text-indigo-600 transition-colors">Why Us</a>
                        <button className="px-6 py-2 rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-shadow shadow-lg shadow-indigo-200">
                            Get Early Access
                        </button>
                    </nav>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 text-slate-600 hover:text-indigo-600"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <X /> : <Menu />}
                    </button>
                </div>

                {/* Mobile Navigation */}
                {isMenuOpen && (
                    <div className="md:hidden border-t border-white/20 p-4 space-y-4 animate-fadeIn">
                        <a href="#features" className="block text-slate-600 py-2" onClick={() => setIsMenuOpen(false)}>Features</a>
                        <a href="#mental-load" className="block text-slate-600 py-2" onClick={() => setIsMenuOpen(false)}>Why Us</a>
                        <button className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium shadow-md">
                            Get Early Access
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
