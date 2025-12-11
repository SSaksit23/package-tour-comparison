
import React from 'react';

export const LogoIcon: React.FC<{className?: string}> = ({className}) => (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" rx="20" fill="currentColor"/>
        <path d="M30 75V35C30 32.2386 32.2386 30 35 30H51M69 25V65C69 67.7614 66.7614 70 64 70H48" stroke="white" strokeWidth="8" strokeLinecap="round"/>
        <path d="M41 40L51 30L61 40" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M58 60L48 70L38 60" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
