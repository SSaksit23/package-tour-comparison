/**
 * Web Research View Component
 * 
 * Displays results from the agentic web research module,
 * showing comparable tour packages found online.
 */

import React from 'react';
import { WebFoundPackage, WebResearchResult } from '../services/webResearchService';

interface WebResearchViewProps {
    result: WebResearchResult | null;
    isLoading: boolean;
    onAddToComparison?: (pkg: WebFoundPackage) => void;
}

export const WebResearchView: React.FC<WebResearchViewProps> = ({
    result,
    isLoading,
    onAddToComparison
}) => {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="relative">
                    {/* Animated search icon */}
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse flex items-center justify-center">
                        <svg className="w-8 h-8 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    {/* Orbiting dots */}
                    <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
                        <div className="absolute top-0 left-1/2 w-2 h-2 bg-blue-400 rounded-full transform -translate-x-1/2 -translate-y-4"></div>
                        <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-purple-400 rounded-full transform -translate-x-1/2 translate-y-4"></div>
                    </div>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-gray-800">🔍 AI Agents Searching...</h3>
                <p className="mt-2 text-sm text-gray-500 text-center max-w-md">
                    Our AI agents are searching the web for comparable tour packages.
                    This may take a moment.
                </p>
                <div className="mt-4 flex gap-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full animate-pulse">
                        🤖 Query Generator
                    </span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}>
                        🌐 Web Researcher
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full animate-pulse" style={{ animationDelay: '1s' }}>
                        📊 Data Synthesizer
                    </span>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="text-center py-12 px-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-800">Web Research</h3>
                <p className="mt-2 text-sm text-gray-500">
                    Click "Find Competitors" to search for similar packages online
                </p>
            </div>
        );
    }

    if (!result.success) {
        return (
            <div className="text-center py-12 px-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-800">Search Failed</h3>
                <p className="mt-2 text-sm text-red-500">{result.error}</p>
            </div>
        );
    }

    const packages = result.found_packages || [];

    if (packages.length === 0) {
        return (
            <div className="text-center py-12 px-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-yellow-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-800">No Packages Found</h3>
                <p className="mt-2 text-sm text-gray-500">
                    The AI agents couldn't find comparable packages. Try adjusting your itinerary details.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                        🌐 Web Found Packages ({packages.length})
                    </h3>
                    {result.search_summary && (
                        <p className="text-xs text-gray-500 mt-1">
                            Found in {result.elapsed_seconds?.toFixed(1) || '?'}s • 
                            Mode: {result.search_summary.mode || 'auto'}
                        </p>
                    )}
                </div>
            </div>

            {/* Packages Grid */}
            <div className="grid gap-4 md:grid-cols-2">
                {packages.map((pkg, index) => (
                    <PackageCard 
                        key={index} 
                        package={pkg} 
                        onAdd={onAddToComparison}
                    />
                ))}
            </div>

            {/* Search Summary */}
            {result.search_summary && result.search_summary.queries_used.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-500 mb-2">Search Queries Used:</p>
                    <div className="flex flex-wrap gap-2">
                        {result.search_summary.queries_used.slice(0, 5).map((q, i) => (
                            <span key={i} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">
                                {q.length > 50 ? q.substring(0, 50) + '...' : q}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

interface PackageCardProps {
    package: WebFoundPackage;
    onAdd?: (pkg: WebFoundPackage) => void;
}

const PackageCard: React.FC<PackageCardProps> = ({ package: pkg, onAdd }) => {
    const confidenceColors = {
        high: 'bg-green-100 text-green-700',
        medium: 'bg-yellow-100 text-yellow-700',
        low: 'bg-red-100 text-red-700'
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-800 truncate" title={pkg.name}>
                        {pkg.name}
                    </h4>
                    {pkg.operator && (
                        <p className="text-xs text-gray-500 mt-0.5">{pkg.operator}</p>
                    )}
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-full ${confidenceColors[pkg.confidence]}`}>
                    {pkg.confidence}
                </span>
            </div>

            {/* Details */}
            <div className="mt-3 space-y-2">
                {pkg.destinations.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">📍</span>
                        <span className="text-sm text-gray-600 truncate">
                            {pkg.destinations.slice(0, 3).join(', ')}
                            {pkg.destinations.length > 3 && ` +${pkg.destinations.length - 3}`}
                        </span>
                    </div>
                )}
                {pkg.duration && (
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">📅</span>
                        <span className="text-sm text-gray-600">{pkg.duration}</span>
                    </div>
                )}
                {pkg.price_range && (
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">💰</span>
                        <span className="text-sm font-medium text-green-600">
                            {pkg.price_range} {pkg.currency}
                        </span>
                    </div>
                )}
            </div>

            {/* Inclusions */}
            {pkg.inclusions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                    {pkg.inclusions.slice(0, 4).map((inc, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                            {inc}
                        </span>
                    ))}
                    {pkg.inclusions.length > 4 && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                            +{pkg.inclusions.length - 4}
                        </span>
                    )}
                </div>
            )}

            {/* Highlights */}
            {pkg.highlights.length > 0 && pkg.highlights[0] && (
                <p className="mt-3 text-xs text-gray-500 line-clamp-2">
                    {pkg.highlights[0]}
                </p>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center justify-between">
                {pkg.source_url && (
                    <a
                        href={pkg.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Source
                    </a>
                )}
                {onAdd && (
                    <button
                        onClick={() => onAdd(pkg)}
                        className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add to Compare
                    </button>
                )}
            </div>
        </div>
    );
};

export default WebResearchView;
