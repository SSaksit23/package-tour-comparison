
import React from 'react';
import { AppState, SavedCompetitor, ItineraryData, Competitor } from '../types';
import ComparisonView from './ComparisonView';
import StructuredDataView from './StructuredDataView';
import { LogoIcon } from './icons/LogoIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { UserIcon } from './icons/UserIcon';
import { renderMarkdown } from '../utils/markdownRenderer';

const PrintLayout: React.FC<AppState> = ({ competitors, comparison, chatHistory, recommendations }) => {
    const analyzedCompetitors = competitors.filter(
        (c): c is (Competitor & { analysis: ItineraryData }) => c.analysis !== null
    );
    const hasComparison = comparison && !comparison.startsWith('Single itinerary loaded');
    const hasQnA = chatHistory.length > 1;

    return (
        <div className="bg-white p-8 font-sans" style={{ width: '210mm' }}>
            <header className="flex items-center gap-4 pb-4 border-b border-gray-300 mb-8">
                <LogoIcon className="h-12 w-12 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold text-on-surface">Travel Analysis Report</h1>
                    <p className="text-md text-on-surface-variant">Generated on: {new Date().toLocaleDateString()}</p>
                </div>
            </header>

            <main className="space-y-12">
                {analyzedCompetitors.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold text-on-surface mb-4 pb-2 border-b-2 border-primary">Structured Data Analysis</h2>
                        <StructuredDataView competitors={analyzedCompetitors.map(c => ({...c, file: null, isParsing: false, parseError: null}))} isLoading={false} />
                    </section>
                )}

                {recommendations && (
                    <section>
                         <h2 className="text-xl font-bold text-on-surface mb-4 pb-2 border-b-2 border-primary">Strategic Insights & Recommendations</h2>
                         <div className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                            {renderMarkdown(recommendations)}
                         </div>
                    </section>
                )}

                {hasComparison && (
                    <section>
                        <h2 className="text-xl font-bold text-on-surface mb-4 pb-2 border-b-2 border-primary">Comparison Report</h2>
                        <ComparisonView comparison={comparison} isLoading={false} />
                    </section>
                )}

                {hasQnA && (
                    <section>
                        <h2 className="text-xl font-bold text-on-surface mb-4 pb-2 border-b-2 border-primary">Q&A History</h2>
                        <div className="space-y-4 text-sm">
                            {chatHistory.map((msg, index) => (
                                <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-white">
                                            <SparklesIcon className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-2xl rounded-xl px-4 py-3 border ${
                                            msg.role === 'user'
                                            ? 'bg-blue-50 border-blue-200 text-blue-900'
                                            : 'bg-gray-100 border-gray-200 text-on-surface'
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-600">
                                            <UserIcon className="w-5 h-5"/>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};

export default PrintLayout;
