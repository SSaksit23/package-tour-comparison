import React, { useState } from 'react';
import { Competitor } from '../types';
import DataComparisonTable from './DataComparisonTable';
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

// Enhanced section rendering for AI insights
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

interface ComparisonViewProps {
    comparison: string;
    competitors: Competitor[];
    isLoading: boolean;
}

type ViewMode = 'data' | 'ai';

const ComparisonView: React.FC<ComparisonViewProps> = ({ comparison, competitors, isLoading }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('data');
    
    const analyzedCompetitors = competitors.filter(c => c.analysis);
    const hasAnalyzedData = analyzedCompetitors.length > 0;
    const hasAIComparison = comparison && comparison.length > 0;
    
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
  
    if (!hasAnalyzedData && !hasAIComparison) {
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

    // Determine primary font based on content
    const fontClass = getFontClass(comparison || '');
    
    return (
        <div className={`p-6 ${fontClass}`}>
            {/* Header with view toggle */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <span className="text-xl text-white">⚖️</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800 tracking-tight font-slab">Comparison Analysis</h2>
                        <p className="text-sm text-gray-500 font-slab">Side-by-side itinerary comparison</p>
                    </div>
                </div>
                
                {/* View Mode Toggle */}
                {hasAnalyzedData && hasAIComparison && (
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('data')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                viewMode === 'data'
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <span>📊</span> Stored Data
                            </span>
                        </button>
                        <button
                            onClick={() => setViewMode('ai')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                viewMode === 'ai'
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <span>✨</span> AI Analysis
                            </span>
                        </button>
                    </div>
                )}
            </div>

            {/* Content based on view mode */}
            {viewMode === 'data' && hasAnalyzedData ? (
                <div className="space-y-6">
                    {/* Data-driven comparison table */}
                    <DataComparisonTable competitors={competitors} />
                    
                    {/* Quick summary */}
                    {analyzedCompetitors.length > 1 && (
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                            <h4 className="font-semibold text-indigo-800 mb-2 flex items-center gap-2">
                                <span>💡</span> Quick Summary
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div className="bg-white rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-indigo-600">{analyzedCompetitors.length}</div>
                                    <div className="text-gray-500">Products Compared</div>
                                </div>
                                <div className="bg-white rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-green-600">
                                        {(() => {
                                            const prices = analyzedCompetitors
                                                .filter(c => c.analysis?.pricing?.[0]?.price)
                                                .map(c => c.analysis!.pricing[0].price);
                                            return prices.length > 0 
                                                ? `${Math.min(...prices).toLocaleString()} THB`
                                                : 'N/A';
                                        })()}
                                    </div>
                                    <div className="text-gray-500">Lowest Price</div>
                                </div>
                                <div className="bg-white rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-amber-600">
                                        {(() => {
                                            const destinations = analyzedCompetitors
                                                .filter(c => c.analysis?.destinations)
                                                .map(c => c.analysis!.destinations.length);
                                            return destinations.length > 0 
                                                ? Math.max(...destinations)
                                                : 0;
                                        })()}
                                    </div>
                                    <div className="text-gray-500">Max Destinations</div>
                                </div>
                                <div className="bg-white rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-purple-600">
                                        {(() => {
                                            const durations = analyzedCompetitors
                                                .filter(c => c.analysis?.duration)
                                                .map(c => {
                                                    const match = c.analysis!.duration.match(/(\d+)/);
                                                    return match ? parseInt(match[1]) : 0;
                                                })
                                                .filter(d => d > 0);
                                            if (durations.length === 0) return 'N/A';
                                            const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
                                            return `${avg} days`;
                                        })()}
                                    </div>
                                    <div className="text-gray-500">Avg Duration</div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Hint to switch to AI view */}
                    {hasAIComparison && (
                        <div className="text-center">
                            <button 
                                onClick={() => setViewMode('ai')}
                                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium inline-flex items-center gap-2"
                            >
                                <span>✨</span> View AI-generated analysis for deeper insights
                            </button>
                        </div>
                    )}
                </div>
            ) : hasAIComparison ? (
                <div className="space-y-6">
                    <div className="prose prose-sm max-w-none text-gray-700 bg-white rounded-xl p-6 border border-gray-100">
                        {renderMarkdown(comparison)}
                    </div>
                    {renderEnhancedSection(comparison.includes('### ') ? comparison : '')}
                    
                    {/* Hint to switch to data view */}
                    {hasAnalyzedData && (
                        <div className="text-center">
                            <button 
                                onClick={() => setViewMode('data')}
                                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium inline-flex items-center gap-2"
                            >
                                <span>📊</span> View structured data comparison
                            </button>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${viewMode === 'data' ? 'bg-green-400' : 'bg-blue-400'}`} />
                    {viewMode === 'data' ? 'Data from stored analysis' : 'AI-Enhanced Comparison'}
                </span>
                <span>{viewMode === 'data' ? 'Reliable & Consistent' : 'Powered by Gemini 2.0'}</span>
            </div>
        </div>
    );
};

export default ComparisonView;
