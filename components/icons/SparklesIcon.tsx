
import React from 'react';

export const SparklesIcon: React.FC<{className?: string}> = ({className}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6.343 17.657l-2.828 2.828M17.657 6.343l2.828-2.828m-12.728 0l2.828 2.828M3 21v-4m4 0H3m18-4a3 3 0 100-6 3 3 0 000 6zM12 6a3 3 0 110-6 3 3 0 010 6z" />
  </svg>
);
