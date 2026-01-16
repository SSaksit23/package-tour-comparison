import React from 'react';

interface MarketIntelligenceIconProps {
    className?: string;
}

export const MarketIntelligenceIcon: React.FC<MarketIntelligenceIconProps> = ({ className = "h-6 w-6" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Brain outline */}
        <path 
            d="M12 4C9.79 4 8 5.79 8 8C8 8.55 8.11 9.07 8.31 9.54C7.51 10.04 7 10.94 7 12C7 12.79 7.29 13.51 7.77 14.08C7.29 14.65 7 15.37 7 16.17C7 17.88 8.36 19.28 10.05 19.36C10.27 20.32 11.13 21 12.15 21H12C14.76 21 17 18.76 17 16V8C17 5.79 15.21 4 13 4H12Z" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        />
        {/* Neural connections */}
        <circle cx="10" cy="8" r="1" fill="currentColor"/>
        <circle cx="14" cy="9" r="1" fill="currentColor"/>
        <circle cx="11" cy="12" r="1" fill="currentColor"/>
        <circle cx="13" cy="15" r="1" fill="currentColor"/>
        <path d="M10 8L11 12M11 12L14 9M11 12L13 15" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        {/* Data bars */}
        <path d="M3 20V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M6 20V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M18 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M21 20V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
);

export default MarketIntelligenceIcon;
