/**
 * DataComparisonTable - Renders comparison table directly from stored analysis data
 * No AI regeneration needed - consistent and reliable
 */

import React from 'react';
import { Competitor, ItineraryData } from '../types';

interface DataComparisonTableProps {
    competitors: Competitor[];
}

// Helper to extract days from duration string
const extractDays = (duration: string): number => {
    if (!duration || duration === 'Not specified') return 0;
    const match = duration.match(/(\d+)\s*[Dd]ay/i) || duration.match(/(\d+)\s*D/i) || duration.match(/^(\d+)d/i);
    return match ? parseInt(match[1]) : 0;
};

// Helper to format price
const formatPrice = (pricing: ItineraryData['pricing']): string => {
    if (!pricing || pricing.length === 0) return 'N/A';
    const p = pricing[0];
    if (!p || typeof p.price !== 'number') return 'N/A';
    return `${p.price.toLocaleString()} ${p.currency || 'THB'}`;
};

// Helper to calculate price per day
const getPricePerDay = (pricing: ItineraryData['pricing'], duration: string): string => {
    if (!pricing || pricing.length === 0) return 'N/A';
    const p = pricing[0];
    if (!p || typeof p.price !== 'number') return 'N/A';
    const days = extractDays(duration);
    if (days === 0) return 'N/A';
    const pricePerDay = Math.round(p.price / days);
    return `~${pricePerDay.toLocaleString()} ${p.currency || 'THB'}`;
};

// Helper to get unique meals
const getMeals = (dailyBreakdown: ItineraryData['dailyBreakdown']): string => {
    if (!dailyBreakdown || dailyBreakdown.length === 0) return 'N/A';
    const allMeals = dailyBreakdown.flatMap(d => d.meals || []);
    const uniqueMeals = [...new Set(allMeals)].filter(m => m);
    return uniqueMeals.length > 0 ? uniqueMeals.join(',') : 'N/A';
};

// Helper to determine activity level
const getActivityLevel = (dailyBreakdown: ItineraryData['dailyBreakdown']): string => {
    if (!dailyBreakdown || dailyBreakdown.length === 0) return 'N/A';
    const avgActivitiesPerDay = dailyBreakdown.reduce((sum, d) => {
        const activities = d.activities?.split(/[,;。，]/).length || 0;
        return sum + activities;
    }, 0) / dailyBreakdown.length;
    
    if (avgActivitiesPerDay >= 4) return 'High';
    if (avgActivitiesPerDay >= 2) return 'Med';
    return 'Low';
};

// Helper to determine flight quality
const getFlightQuality = (flights: ItineraryData['flights']): string => {
    if (!flights || flights.length === 0) return 'N/A';
    // Check for international flight codes
    const hasIntl = flights.some(f => 
        f.flightNumber?.match(/^(TG|CX|SQ|EK|QR|BA|LH)/i) // Major international carriers
    );
    const hasRegional = flights.some(f =>
        f.flightNumber?.match(/^(SC|SL|FD|AK|TR)/i) // Regional/budget carriers
    );
    if (hasIntl) return 'Intl';
    if (hasRegional) return 'Regional';
    return 'Standard';
};

// Helper to get accommodation level from inclusions
const getAccomLevel = (inclusions: string[]): string => {
    if (!inclusions || inclusions.length === 0) return 'N/A';
    const text = inclusions.join(' ').toLowerCase();
    if (text.includes('5 star') || text.includes('5-star') || text.includes('luxury')) return '5-star';
    if (text.includes('4 star') || text.includes('4-star') || text.includes('4★')) return '4-star';
    if (text.includes('3 star') || text.includes('3-star') || text.includes('3★')) return '3-star';
    if (text.includes('hotel') || text.includes('โรงแรม')) return 'Standard';
    return 'Not Specified';
};

// Color coding for values
const getValueColor = (value: string, type: 'activity' | 'flight' | 'accom' | 'default'): string => {
    const lowerVal = value.toLowerCase();
    
    if (type === 'activity') {
        if (lowerVal === 'high') return 'bg-green-100 text-green-800';
        if (lowerVal === 'med') return 'bg-amber-100 text-amber-800';
        if (lowerVal === 'low') return 'bg-red-100 text-red-800';
    }
    
    if (type === 'flight') {
        if (lowerVal === 'intl') return 'bg-blue-100 text-blue-800';
        if (lowerVal === 'regional') return 'bg-gray-100 text-gray-800';
    }
    
    if (type === 'accom') {
        if (lowerVal.includes('5')) return 'bg-purple-100 text-purple-800';
        if (lowerVal.includes('4')) return 'bg-blue-100 text-blue-800';
    }
    
    return '';
};

// Build comparison data from analysis
const buildComparisonData = (competitors: Competitor[]): { headers: string[]; rows: { label: string; values: string[]; type: string }[] } => {
    const analyzed = competitors.filter(c => c.analysis);
    
    const headers = ['Aspect', ...analyzed.map(c => c.name)];
    
    const rows = [
        {
            label: 'Duration',
            values: analyzed.map(c => {
                const days = extractDays(c.analysis?.duration || '');
                return days > 0 ? `${days}d` : 'N/A';
            }),
            type: 'default'
        },
        {
            label: 'Total Price',
            values: analyzed.map(c => formatPrice(c.analysis?.pricing)),
            type: 'default'
        },
        {
            label: 'Price/Day',
            values: analyzed.map(c => getPricePerDay(c.analysis?.pricing, c.analysis?.duration || '')),
            type: 'default'
        },
        {
            label: 'Dest. Count',
            values: analyzed.map(c => {
                const count = c.analysis?.destinations?.length || 0;
                return count > 0 ? count.toString() : '0';
            }),
            type: 'default'
        },
        {
            label: 'Incl. Meals',
            values: analyzed.map(c => getMeals(c.analysis?.dailyBreakdown)),
            type: 'default'
        },
        {
            label: 'Activities',
            values: analyzed.map(c => getActivityLevel(c.analysis?.dailyBreakdown)),
            type: 'activity'
        },
        {
            label: 'Flight Quality',
            values: analyzed.map(c => getFlightQuality(c.analysis?.flights)),
            type: 'flight'
        },
        {
            label: 'Accom. Level',
            values: analyzed.map(c => getAccomLevel(c.analysis?.inclusions || [])),
            type: 'accom'
        }
    ];
    
    return { headers, rows };
};

const DataComparisonTable: React.FC<DataComparisonTableProps> = ({ competitors }) => {
    const analyzedCompetitors = competitors.filter(c => c.analysis);
    
    if (analyzedCompetitors.length === 0) {
        return (
            <div className="text-center text-gray-500 py-8 font-montserrat">
                No analyzed itineraries to compare
            </div>
        );
    }
    
    const { headers, rows } = buildComparisonData(analyzedCompetitors);
    
    // Truncate product names for cleaner display
    const truncateName = (name: string, maxLen: number = 12) => {
        if (name.length <= maxLen) return name;
        return name.substring(0, maxLen) + '...';
    };
    
    return (
        <div className="rounded-xl border border-gray-200 shadow-sm bg-white font-montserrat overflow-hidden">
            {/* Scrollable table container */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-gradient-to-r from-blue-50 to-indigo-50">
                            {headers.map((header, i) => (
                                <th 
                                    key={i} 
                                    className={`px-3 py-3 border-b border-blue-100 text-left font-semibold text-gray-800 ${
                                        i === 0 ? 'sticky left-0 bg-blue-50 z-10 min-w-[90px]' : 'min-w-[100px]'
                                    }`}
                                >
                                    {i === 0 ? (
                                        <span className="flex items-center gap-1.5">
                                            <span className="text-blue-500">⚖️</span>
                                            <span>{header}</span>
                                        </span>
                                    ) : (
                                        <span className="block truncate max-w-[120px]" title={header}>
                                            {truncateName(header, 15)}
                                        </span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-3 py-2.5 font-medium text-gray-700 bg-gray-50/80 sticky left-0 z-10 whitespace-nowrap text-xs">
                                    {row.label}
                                </td>
                                {row.values.map((value, colIdx) => {
                                    const colorClass = value !== 'N/A' ? getValueColor(value, row.type as any) : '';
                                    const isNA = value === 'N/A' || value === '0';
                                    return (
                                        <td key={colIdx} className={`px-3 py-2.5 text-center ${isNA ? 'text-gray-400' : 'text-gray-700'}`}>
                                            {colorClass ? (
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                                                    {value}
                                                </span>
                                            ) : (
                                                <span className="text-sm">{value}</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Footer */}
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                    Stored data
                </span>
                <span>{analyzedCompetitors.length} products</span>
            </div>
        </div>
    );
};

export default DataComparisonTable;

