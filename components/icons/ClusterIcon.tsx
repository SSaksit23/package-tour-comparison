import React from 'react';

interface IconProps {
    className?: string;
}

export const ClusterIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
    <svg 
        className={className} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {/* Main cluster circles */}
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="18" r="3" />
        
        {/* Center connecting point */}
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        
        {/* Connection lines */}
        <line x1="8.5" y1="7.5" x2="10.5" y2="10.5" />
        <line x1="15.5" y1="7.5" x2="13.5" y2="10.5" />
        <line x1="8.5" y1="16.5" x2="10.5" y2="13.5" />
        <line x1="15.5" y1="16.5" x2="13.5" y2="13.5" />
    </svg>
);
