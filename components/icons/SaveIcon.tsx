
import React from 'react';

export const SaveIcon: React.FC<{className?: string}> = ({className}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v4a2 2 0 01-2 2H9a2 2 0 01-2-2V3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 13h10" />
  </svg>
);
