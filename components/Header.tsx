import React from 'react';
import { LogoIcon } from './icons/LogoIcon';

const Header: React.FC = () => {
  return (
    <header className="bg-surface shadow-sm sticky top-0 z-20">
      <div className="max-w-screen-2xl mx-auto px-4 md:px-8 py-3 flex items-center gap-4">
        <LogoIcon className="h-10 w-10 text-primary"/>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Travel Itinerary Analyzer</h1>
          <p className="text-sm text-on-surface-variant">Compare & Analyze Documents with AI</p>
        </div>
      </div>
    </header>
  );
};

export default Header;