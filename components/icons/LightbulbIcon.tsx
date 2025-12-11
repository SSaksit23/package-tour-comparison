import React from 'react';

export const LightbulbIcon: React.FC<{className?: string}> = ({className}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-7.07 7.07a5 5 0 01-7.071-7.071l7.07-7.07zM12 21a9 9 0 110-18 9 9 0 010 18z" />
  </svg>
);
