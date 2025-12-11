

import React from 'react';
import { renderMarkdown } from '../utils/markdownRenderer';

const renderMarkdownTable = (markdown: string) => {
    // 1. Basic cleanup and filtering
    const allLines = markdown.trim().split('\n');
    const tableLines = allLines.filter(line => line.trim().startsWith('|'));
    const contentLines = tableLines.filter(line => !line.includes('---'));

    if (contentLines.length < 1) return null;

    // 2. Helper to parse a single markdown row into an array of strings
    const parseRow = (rowString: string): string[] => {
        let s = rowString.trim();
        // Remove leading pipe
        if (s.startsWith('|')) {
            s = s.substring(1);
        }
        // Remove trailing pipe if it exists
        if (s.endsWith('|')) {
            s = s.substring(0, s.length - 1);
        }
        return s.split('|').map(cell => cell.trim());
    };

    // 3. Extract header and body rows
    const headerCells = parseRow(contentLines[0]);
    if (headerCells.length === 0) return null;
    
    const bodyRows = contentLines.slice(1).map(parseRow);

    // 4. Sanitize body rows to match header column count
    const sanitizedBodyRows = bodyRows.map(row => {
        if (row.length === headerCells.length) {
            return row;
        }
        // If a row has too many cells (e.g., a '|' was in the content), merge the extra cells
        if (row.length > headerCells.length) {
            const validPart = row.slice(0, headerCells.length - 1);
            const excessPart = row.slice(headerCells.length - 1).join(' | ');
            return [...validPart, excessPart];
        }
        // If a row has too few, pad with empty strings
        return [...row, ...Array(headerCells.length - row.length).fill('')];
    }).filter(row => row.some(cell => cell.trim() !== '')); // Remove completely empty rows

    if (sanitizedBodyRows.length === 0 && headerCells.every(c => !c)) return null;


    return (
        <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
            <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                    <tr className="bg-gray-50">
                        {headerCells.map((cell, i) => (
                            <th 
                                key={i} 
                                className="p-3 border-b border-gray-300 text-left font-bold text-on-surface whitespace-nowrap"
                                style={{ width: i === 0 ? '20%' : 'auto' }}
                            >
                                {cell}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sanitizedBodyRows.map((row, i) => (
                        <tr key={i} className="bg-white hover:bg-gray-50/50">
                           {row.map((cell, j) => (
                                <td key={j} className="p-3 border-t border-gray-200 align-top text-on-surface-variant">
                                    {renderMarkdown(cell)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const ComparisonView: React.FC<{ comparison: string; isLoading: boolean }> = ({ comparison, isLoading }) => {
    if (isLoading) {
        return (
            <div className="space-y-2 animate-pulse-fast">
                <div className="h-12 bg-gray-200 rounded w-full"></div>
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 bg-gray-200 rounded w-full mt-2"></div>
                ))}
            </div>
        )
    }
  
    if (!comparison) {
        return null;
    }

    const separator = '### Conclusion';
    let tableMarkdown = comparison;
    let conclusionMarkdown = '';

    const conclusionIndex = comparison.indexOf(separator);

    if (conclusionIndex !== -1) {
        tableMarkdown = comparison.substring(0, conclusionIndex).trim();
        conclusionMarkdown = comparison.substring(conclusionIndex).trim();
    }
  
    const table = renderMarkdownTable(tableMarkdown);

    if (table) {
        return (
            <div className="space-y-6">
                {table}
                {conclusionMarkdown && renderMarkdown(conclusionMarkdown)}
            </div>
        );
    }

    // Fallback for non-table content (e.g., single itinerary message or malformed response)
    return (
        <div className="prose prose-sm max-w-none text-on-surface">
            {renderMarkdown(comparison)}
        </div>
    );
};

export default ComparisonView;