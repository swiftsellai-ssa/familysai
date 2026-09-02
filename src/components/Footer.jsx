import React from 'react';

const Footer = () => {
    return (
        <footer className="py-12 px-6 border-t border-slate-200/60 bg-white/30 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto text-center">
                <div className="text-slate-500 text-sm">
                    © {new Date().getFullYear()} Family Kit. Software is the clipboard.
                </div>
            </div>
        </footer>
    );
};

export default Footer;
