import React from 'react';
import { renderMarkdown } from '../utils/markdownRenderer';

// Detect if text contains Thai characters
const containsThai = (text: string): boolean => {
    return /[\u0E00-\u0E7F]/.test(text);
};

// Get appropriate font class based on text content
const getFontClass = (text: string): string => {
    if (containsThai(text)) {
        const thaiChars = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
        const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
        if (thaiChars > latinChars) {
            return 'font-thai';
        }
        return 'font-mixed';
    }
    return 'font-slab';
};

// Enhanced table rendering with beautiful styling
const renderMarkdownTable = (markdown: string) => {
    const allLines = markdown.trim().split('\n');
    const tableLines = allLines.filter(line => line.trim().startsWith('|'));
    const contentLines = tableLines.filter(line => !line.includes('---'));

    if (contentLines.length < 1) return null;

    const parseRow = (rowString: string): string[] => {
        let s = rowString.trim();
        if (s.startsWith('|')) s = s.substring(1);
        if (s.endsWith('|')) s = s.substring(0, s.length - 1);
        return s.split('|').map(cell => cell.trim());
    };

    const headerCells = parseRow(contentLines[0]);
    if (headerCells.length === 0) return null;
    
    const bodyRows = contentLines.slice(1).map(parseRow);

    const sanitizedBodyRows = bodyRows.map(row => {
        if (row.length === headerCells.length) return row;
        if (row.length > headerCells.length) {
            const validPart = row.slice(0, headerCells.length - 1);
            const excessPart = row.slice(headerCells.length - 1).join(' | ');
            return [...validPart, excessPart];
        }
        return [...row, ...Array(headerCells.length - row.length).fill('')];
    }).filter(row => row.some(cell => cell.trim() !== ''));

    if (sanitizedBodyRows.length === 0 && headerCells.every(c => !c)) return null;

    // Color coding for different metrics
    const getScoreColor = (value: string): string => {
        const lowerVal = value.toLowerCase();
        if (lowerVal.includes('excellent') || lowerVal.includes('best') || lowerVal.includes('high')) {
            return 'bg-green-50 text-green-800';
        }
        if (lowerVal.includes('good') || lowerVal.includes('strong')) {
            return 'bg-blue-50 text-blue-800';
        }
        if (lowerVal.includes('average') || lowerVal.includes('moderate')) {
            return 'bg-amber-50 text-amber-800';
        }
        if (lowerVal.includes('weak') || lowerVal.includes('low') || lowerVal.includes('poor')) {
            return 'bg-red-50 text-red-800';
        }
        return '';
    };

    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
            <table className="w-full min-w-[800px] border-collapse">
                <thead>
                    <tr className="bg-gradient-to-r from-indigo-50 to-purple-50">
                        {headerCells.map((cell, i) => (
                            <th 
                                key={i} 
                                className="p-4 border-b-2 border-indigo-100 text-left font-bold text-indigo-900 whitespace-nowrap"
                                style={{ width: i === 0 ? '18%' : 'auto' }}
                            >
                                <div className="flex items-center gap-2">
                                    {i === 0 && <span className="text-indigo-500">📊</span>}
                                    {cell}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {sanitizedBodyRows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            {row.map((cell, j) => {
                                const scoreColor = j > 0 ? getScoreColor(cell) : '';
                                const cellFont = containsThai(cell) ? 'font-thai' : '';
                                return (
                                    <td key={j} className={`p-4 align-top ${j === 0 ? 'font-medium text-gray-800 bg-gray-50/50' : 'text-gray-600'} ${cellFont}`}>
                                        <div className={scoreColor ? `inline-block px-2 py-1 rounded-lg ${scoreColor}` : ''}>
                                            {renderMarkdown(cell)}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Enhanced section rendering
const renderEnhancedSection = (markdown: string) => {
    if (!markdown) return null;

    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Section headers
        if (trimmed.startsWith('### ')) {
            const title = trimmed.replace(/^###\s+/, '');
            const icon = title.toLowerCase().includes('conclusion') ? '✅' 
                       : title.toLowerCase().includes('summary') ? '📋'
                       : title.toLowerCase().includes('recommendation') ? '💡'
                       : '📌';
            elements.push(
                <div key={key++} className="mt-8 mb-4">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-2xl">{icon}</span>
                        {title}
                    </h3>
                    <div className="h-0.5 w-full bg-gradient-to-r from-indigo-200 to-transparent mt-2" />
                </div>
            );
            continue;
        }

        // List items
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const content = trimmed.replace(/^[-*]\s+/, '');
            elements.push(
                <div key={key++} className="flex items-start gap-3 my-2 ml-4">
                    <span className="text-indigo-500 mt-1">●</span>
                    <span className="text-gray-700" dangerouslySetInnerHTML={{ 
                        __html: content.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
                    }} />
                </div>
            );
            continue;
        }

        // Regular text
        elements.push(
            <p key={key++} className="text-gray-700 leading-relaxed my-2" dangerouslySetInnerHTML={{ 
                __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
            }} />
        );
    }

    return <div className="mt-6">{elements}</div>;
};

const ComparisonView: React.FC<{ comparison: string; isLoading: boolean }> = ({ comparison, isLoading }) => {
    if (isLoading) {
        return (
            <div className="p-6 space-y-4">
                <div className="animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-indigo-200 rounded-lg" />
                        <div className="h-6 bg-gray-200 rounded w-48" />
                    </div>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="h-12 bg-gradient-to-r from-indigo-100 to-purple-100" />
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-16 bg-gray-50 border-t border-gray-100" />
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-indigo-600 mt-6">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="ml-2 text-sm font-medium">Comparing itineraries...</span>
                </div>
            </div>
        );
    }
  
    if (!comparison) {
        return (
            <div className="h-full flex flex-col justify-center items-center text-center p-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-6">
                    <span className="text-4xl">⚖️</span>
                </div>
                <h3 className="font-bold text-xl text-gray-800 mb-2">Comparison Results Will Appear Here</h3>
                <p className="text-gray-500 max-w-md leading-relaxed">
                    Upload two or more itineraries and click "Analyze & Compare" to see a detailed side-by-side comparison.
                </p>
            </div>
        );
    }

    // Split table from conclusion
    const separator = '### Conclusion';
    let tableMarkdown = comparison;
    let conclusionMarkdown = '';

    const conclusionIndex = comparison.indexOf(separator);
    if (conclusionIndex !== -1) {
        tableMarkdown = comparison.substring(0, conclusionIndex).trim();
        conclusionMarkdown = comparison.substring(conclusionIndex).trim();
    }
  
    const table = renderMarkdownTable(tableMarkdown);

    // Determine primary font based on content
    const fontClass = getFontClass(comparison);
    
    return (
        <div className={`p-6 ${fontClass}`}>
            {/* Header */}
            <div className="mb-6 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <span className="text-xl text-white">⚖️</span>
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 tracking-tight font-slab">Comparison Analysis</h2>
                    <p className="text-sm text-gray-500 font-slab">Side-by-side itinerary comparison</p>
                </div>
            </div>

            {/* Table or fallback */}
            {table ? (
                <div className="space-y-6">
                    {table}
                    {conclusionMarkdown && renderEnhancedSection(conclusionMarkdown)}
                </div>
            ) : (
                <div className="prose prose-sm max-w-none text-gray-700 bg-white rounded-xl p-6 border border-gray-100">
                    {renderMarkdown(comparison)}
                </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    RAG-Enhanced Comparison
                </span>
                <span>Powered by GPT-4o</span>
            </div>
        </div>
    );
};

export default ComparisonView;
