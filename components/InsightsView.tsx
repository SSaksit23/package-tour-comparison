import React, { useState } from 'react';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { LanguageIcon } from './icons/LanguageIcon';

interface InsightsViewProps {
  recommendations: string | null;
  isLoading: boolean;
  ragUsed?: boolean; // Whether RAG context was used
  ragDocCount?: number; // Number of KB documents used
}

// Detect if text contains Thai characters
const containsThai = (text: string): boolean => {
    return /[\u0E00-\u0E7F]/.test(text);
};

// Get appropriate font class based on text content
const getFontClass = (text: string): string => {
    if (containsThai(text)) {
        // If mostly Thai, use Thai font
        const thaiChars = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
        const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
        if (thaiChars > latinChars) {
            return 'font-thai';
        }
        return 'font-mixed';
    }
    return 'font-montserrat';
};

// Icons for different sections
const SectionIcons: Record<string, string> = {
    'product positioning': '🎯',
    'pricing': '💰',
    'unique selling': '⭐',
    'improvement': '📈',
    'market': '🌍',
    'competitive': '⚔️',
    'strength': '💪',
    'weakness': '⚠️',
    'opportunity': '🚀',
    'threat': '🛡️',
    'recommendation': '💡',
    'insight': '🔍',
    'analysis': '📊',
    'summary': '📋',
    'overview': '👁️',
    'conclusion': '✅',
    'target': '🎪',
    'audience': '👥',
    'value': '💎',
    'feature': '✨',
};

const getSectionIcon = (title: string): string => {
    const lowerTitle = title.toLowerCase();
    for (const [key, icon] of Object.entries(SectionIcons)) {
        if (lowerTitle.includes(key)) return icon;
    }
    return '📌';
};

// Parse markdown table rows into cells
const parseTableRow = (row: string): string[] => {
    // Remove leading/trailing pipes and split
    return row
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(cell => cell.trim());
};

// Check if a line is a table separator (|---|---|)
const isTableSeparator = (line: string): boolean => {
    return /^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(line);
};

// Enhanced markdown renderer with beautiful styling
const renderEnhancedMarkdown = (markdown: string) => {
    if (!markdown) return null;

    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let inList = false;
    let key = 0;

    const flushList = () => {
        if (currentList.length > 0) {
            elements.push(
                <ul key={key++} className="space-y-3 my-5 ml-2">
                    {currentList.map((item, idx) => {
                        const itemFont = containsThai(item) ? 'font-thai' : '';
                        return (
                            <li key={idx} className={`flex items-start gap-3 text-gray-700 leading-relaxed ${itemFont}`}>
                                <span className="text-indigo-500 mt-2 text-xs flex-shrink-0">●</span>
                                <span className="text-base" dangerouslySetInnerHTML={{ 
                                    __html: item
                                        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-800">$1</strong>')
                                        .replace(/\*(.*?)\*/g, '<em class="text-gray-600">$1</em>')
                                }} />
                            </li>
                        );
                    })}
                </ul>
            );
            currentList = [];
        }
        inList = false;
    };

    // Render a markdown table
    const renderTable = (tableLines: string[]): React.ReactNode => {
        if (tableLines.length < 2) return null;
        
        const headerRow = parseTableRow(tableLines[0]);
        const dataRows: string[][] = [];
        
        // Skip separator line (index 1) and parse data rows
        for (let j = 2; j < tableLines.length; j++) {
            if (tableLines[j].includes('|')) {
                dataRows.push(parseTableRow(tableLines[j]));
            }
        }
        
        return (
            <div key={key++} className="my-6 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                            {headerRow.map((cell, idx) => (
                                <th 
                                    key={idx} 
                                    className="px-4 py-3 text-left font-semibold whitespace-nowrap border-r border-indigo-400 last:border-r-0"
                                    dangerouslySetInnerHTML={{ 
                                        __html: cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                    }}
                                />
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {dataRows.map((row, rowIdx) => (
                            <tr 
                                key={rowIdx} 
                                className={`${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}
                            >
                                {row.map((cell, cellIdx) => (
                                    <td 
                                        key={cellIdx} 
                                        className={`px-4 py-3 border-b border-gray-200 border-r last:border-r-0 ${
                                            cellIdx === 0 ? 'font-medium text-gray-800 bg-gray-50' : 'text-gray-600'
                                        }`}
                                        dangerouslySetInnerHTML={{ 
                                            __html: cell
                                                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                        }}
                                    />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for markdown table (starts with |)
        if (line.startsWith('|') && line.includes('|')) {
            flushList();
            
            // Collect all table lines
            const tableLines: string[] = [line];
            let j = i + 1;
            
            while (j < lines.length) {
                const nextLine = lines[j].trim();
                if (nextLine.startsWith('|') || isTableSeparator(nextLine)) {
                    tableLines.push(nextLine);
                    j++;
                } else if (nextLine === '') {
                    // Allow one empty line, but check next
                    j++;
                    if (j < lines.length && lines[j].trim().startsWith('|')) {
                        continue;
                    }
                    break;
                } else {
                    break;
                }
            }
            
            // Only render if we have header + separator + at least one data row
            if (tableLines.length >= 3 && isTableSeparator(tableLines[1])) {
                elements.push(renderTable(tableLines));
                i = j - 1; // Skip processed lines
                continue;
            }
        }
        
        // Skip empty lines
        if (!line) {
            flushList();
            continue;
        }

        // Main title (# or ##)
        if (line.startsWith('# ') || line.startsWith('## ')) {
            flushList();
            const title = line.replace(/^#{1,2}\s+/, '');
            elements.push(
                <div key={key++} className="mb-8">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">
                        {title}
                    </h1>
                    <div className="h-1 w-24 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mt-3" />
                </div>
            );
            continue;
        }

        // Section headers (###)
        if (line.startsWith('### ')) {
            flushList();
            const title = line.replace(/^###\s+/, '');
            const icon = getSectionIcon(title);
            elements.push(
                <div key={key++} className="mt-10 mb-5">
                    <h2 className="text-xl font-semibold text-indigo-900 flex items-center gap-3 tracking-tight">
                        <span className="text-2xl">{icon}</span>
                        {title}
                    </h2>
                    <div className="h-0.5 w-full bg-gradient-to-r from-indigo-200 to-transparent mt-3" />
                </div>
            );
            continue;
        }

        // Numbered sections (1. Product Positioning) or standalone numbers with emoji
        const numberedMatch = line.match(/^(\d+)\s*\.?\s*(.+)$/);
        if (numberedMatch && line.length > 3) {
            const [, num, rest] = numberedMatch;
            // Check if this is a section header (has emoji or bold text)
            const hasEmoji = /^[📌💰💎🌍📈⭐🎯⚔️💪⚠️🚀🛡️💡🔍📊📋👁️✅🎪👥✨]/.test(rest.trim());
            const isBold = rest.includes('**');
            
            if (hasEmoji || isBold || rest.length > 20) {
                flushList();
                // Clean up the title - remove emoji at start and bold markers
                let cleanTitle = rest.trim()
                    .replace(/^[📌💰💎🌍📈⭐🎯⚔️💪⚠️🚀🛡️💡🔍📊📋👁️✅🎪👥✨]\s*/, '')
                    .replace(/\*\*/g, '');
                const emoji = rest.match(/^([📌💰💎🌍📈⭐🎯⚔️💪⚠️🚀🛡️💡🔍📊📋👁️✅🎪👥✨])/)?.[1] || '';
                const icon = emoji || getSectionIcon(cleanTitle);
                
                elements.push(
                    <div key={key++} className="mt-6 mb-4 flex items-start gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border-l-4 border-indigo-500">
                        <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center shadow-lg text-base">
                            {num}
                        </span>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <span className="text-xl">{icon}</span>
                                <span dangerouslySetInnerHTML={{ 
                                    __html: cleanTitle.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                }} />
                            </h3>
                        </div>
                    </div>
                );
                continue;
            }
        }

        // Group headers (like "Group 1: Incomplete Data...")
        const groupMatch = line.match(/^(Group\s+\d+)\s*:?\s*(.+)$/i);
        if (groupMatch) {
            flushList();
            const [, groupLabel, description] = groupMatch;
            // Clean up the description - remove ** markers
            const cleanDesc = description.replace(/\*\*/g, '').replace(/\(([^)]+)\)/g, '<span class="text-gray-500 text-sm">($1)</span>');
            elements.push(
                <div key={key++} className="mt-8 mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                    <h3 className="font-bold text-blue-900 text-lg flex items-center gap-2">
                        <span className="px-2 py-1 bg-blue-500 text-white text-sm rounded-lg">{groupLabel}</span>
                        <span dangerouslySetInnerHTML={{ __html: cleanDesc }} />
                    </h3>
                </div>
            );
            continue;
        }
        
        // Product/Tour name headers (all caps or specific patterns, or Thai text headers)
        if ((/^[A-Z0-9]{2,}[-\s]/.test(line) || containsThai(line.substring(0, 20))) && !line.startsWith('-') && !line.startsWith('*') && line.length < 80) {
            flushList();
            const headerFont = containsThai(line) ? 'font-thai' : '';
            // Clean bold markers
            const cleanLine = line.replace(/\*\*/g, '');
            elements.push(
                <div key={key++} className="mt-7 mb-4 px-5 py-3 bg-gradient-to-r from-slate-50 to-indigo-50 border-l-4 border-indigo-500 rounded-r-xl shadow-sm">
                    <h3 className={`font-semibold text-indigo-900 tracking-wide text-lg ${headerFont}`}>{cleanLine}</h3>
                </div>
            );
            continue;
        }

        // Horizontal rule
        if (line === '---' || line === '***') {
            flushList();
            elements.push(
                <hr key={key++} className="my-6 border-t border-gray-200" />
            );
            continue;
        }

        // List items (handle various bullet styles including Unicode bullets)
        if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ') || 
            line.startsWith('● ') || line.startsWith('○ ') || line.startsWith('▪ ') ||
            line.match(/^[•●○▪▸►]\s*/)) {
            inList = true;
            currentList.push(line.replace(/^[-*•●○▪▸►]\s*/, ''));
            continue;
        }
        
        // Also handle lines that start with bullet inside (like "•●text")
        if (line.match(/^[•●]\s*[•●]?\s*/)) {
            inList = true;
            currentList.push(line.replace(/^[•●]\s*[•●]?\s*/, ''));
            continue;
        }

        // Bold labels (like "Position:", "Audience:")
        if (line.includes(':') && line.indexOf(':') < 30) {
            flushList();
            const [label, ...rest] = line.split(':');
            const value = rest.join(':').trim();
            
            if (value) {
                elements.push(
                    <div key={key++} className="flex flex-wrap gap-3 my-3 items-baseline">
                        <span className="font-semibold text-indigo-800 bg-indigo-50 px-3 py-1 rounded-lg text-sm">
                            {label.replace(/\*\*/g, '')}
                        </span>
                        <span className="text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ 
                            __html: value
                                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-medium text-gray-800">$1</strong>')
                        }} />
                    </div>
                );
                continue;
            }
        }

        // Regular paragraph
        flushList();
        if (line.length > 0) {
            const paraFont = containsThai(line) ? 'font-thai' : '';
            elements.push(
                <p key={key++} className={`text-gray-700 leading-relaxed my-3 text-base ${paraFont}`} dangerouslySetInnerHTML={{ 
                    __html: line
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-800">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                }} />
            );
        }
    }

    flushList();
    return elements;
};

const InsightsView: React.FC<InsightsViewProps> = ({ recommendations, isLoading, ragUsed = false, ragDocCount = 0 }) => {
    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="animate-pulse space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-200 to-purple-200 rounded-xl" />
                        <div className="h-8 bg-gray-200 rounded-lg w-64" />
                    </div>
                    <div className="h-1 w-24 bg-gray-200 rounded-full" />
                    <div className="space-y-3 mt-6">
                        <div className="h-4 bg-gray-200 rounded w-full" />
                        <div className="h-4 bg-gray-200 rounded w-5/6" />
                        <div className="h-4 bg-gray-200 rounded w-4/6" />
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-48 mt-8" />
                    <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded w-full" />
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                    </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-indigo-600 mt-8">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="ml-2 text-sm font-medium">Generating insights with RAG...</span>
                </div>
            </div>
        );
    }

    if (!recommendations) {
        return (
            <div className="h-full flex flex-col justify-center items-center text-center p-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6">
                    <LightbulbIcon className="w-10 h-10 text-amber-500"/>
                </div>
                <h3 className="font-bold text-xl text-gray-800 mb-2">AI Insights Will Appear Here</h3>
                <p className="text-gray-500 max-w-md leading-relaxed">
                    After analyzing your itineraries, I'll generate strategic recommendations 
                    powered by your Knowledge Base for deeper insights.
                </p>
                <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span>RAG-Enhanced Analysis Ready</span>
                </div>
            </div>
        );
    }

    // Determine primary font based on content
    const fontClass = getFontClass(recommendations);
    const [translatedText, setTranslatedText] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [showTranslated, setShowTranslated] = useState(false);
    
    const handleTranslate = async () => {
        if (translatedText) {
            setShowTranslated(!showTranslated);
            return;
        }
        
        setIsTranslating(true);
        try {
            const isCurrentlyThai = containsThai(recommendations);
            const targetLang = isCurrentlyThai ? 'English' : 'Thai';
            
            const response = await fetch(`${import.meta.env.VITE_PDF_EXTRACTOR_URL || 'http://localhost:5001'}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: recommendations, target_language: targetLang })
            });
            
            if (response.ok) {
                const data = await response.json();
                setTranslatedText(data.translated_text);
                setShowTranslated(true);
            }
        } catch (error) {
            console.error('Translation failed:', error);
        } finally {
            setIsTranslating(false);
        }
    };
    
    const displayText = showTranslated && translatedText ? translatedText : recommendations;
    const displayFontClass = getFontClass(displayText);
    
    return (
        <div className={`p-4 sm:p-6 max-w-4xl ${displayFontClass}`}>
            {/* Translation button */}
            <div className="flex justify-end mb-4">
                <button
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                >
                    <LanguageIcon className="w-4 h-4" />
                    {isTranslating ? 'Translating...' : (showTranslated ? 'Show Original' : (containsThai(recommendations) ? 'Translate to English' : 'แปลเป็นไทย'))}
                </button>
            </div>
            
            <div className="bg-white rounded-2xl">
                {renderEnhancedMarkdown(displayText)}
            </div>
            
            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-2">
                    {ragUsed ? (
                        <>
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="text-green-600 font-medium">RAG Enhanced</span>
                            <span className="text-gray-400">({ragDocCount} docs)</span>
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 bg-amber-400 rounded-full" />
                            <span className="text-amber-600">Analysis Only</span>
                        </>
                    )}
                </span>
                <span className="font-montserrat">Powered by Gemini 2.0</span>
            </div>
        </div>
    );
};

export default InsightsView;
