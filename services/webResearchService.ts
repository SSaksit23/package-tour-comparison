/**
 * Web Research Service - Agentic Module Integration
 * 
 * This service provides integration with the Python-based CrewAI
 * agentic web research module for finding comparable tour packages.
 */

import { ItineraryData, Competitor } from '../types';

// Backend URL for the agentic crew API
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

export interface WebFoundPackage {
    name: string;
    operator: string | null;
    destinations: string[];
    duration: string;
    price_range: string | null;
    currency: string | null;
    inclusions: string[];
    exclusions: string[];
    highlights: string[];
    source_url: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface WebResearchResult {
    success: boolean;
    found_packages: WebFoundPackage[];
    search_summary?: {
        queries_used: string[];
        total_found: number;
        timestamp: string;
        mode?: string;
    };
    error?: string;
    elapsed_seconds?: number;
}

/**
 * Callback for progress updates during web research
 */
export type WebResearchProgressCallback = (stage: string, progress: number) => void;

/**
 * Run web research to find comparable tour packages
 * 
 * @param analysis - The analyzed itinerary data
 * @param mode - 'full' for complete crew analysis, 'fast' for quick search
 * @param onProgress - Optional callback for progress updates
 */
export async function runWebResearch(
    analysis: ItineraryData,
    mode: 'full' | 'fast' = 'fast',
    onProgress?: WebResearchProgressCallback
): Promise<WebResearchResult> {
    try {
        onProgress?.('Starting web research...', 10);
        
        // First, try using the backend API (which has agents available)
        const backendResult = await runWebResearchViaBackend(analysis, mode, onProgress);
        if (backendResult.success) {
            return backendResult;
        }
        
        // Fallback to direct EXA search via frontend
        onProgress?.('Using direct search fallback...', 50);
        return await runDirectSearch(analysis, onProgress);
        
    } catch (error) {
        console.error('Web research failed:', error);
        return {
            success: false,
            found_packages: [],
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Run web research via the backend API
 */
async function runWebResearchViaBackend(
    analysis: ItineraryData,
    mode: 'full' | 'fast',
    onProgress?: WebResearchProgressCallback
): Promise<WebResearchResult> {
    try {
        // Check if backend is available
        const healthCheck = await fetch(`${BACKEND_URL}/health`, { 
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!healthCheck.ok) {
            throw new Error('Backend not available');
        }
        
        onProgress?.('Connecting to research agents...', 20);
        
        // Prepare the request payload
        const payload = {
            itineraries: [{
                name: analysis.tourName || 'Primary Itinerary',
                content: JSON.stringify(analysis)
            }],
            analysis_focus: 'competitive',
            include_web_search: true,
            user_id: 'default'
        };
        
        onProgress?.('Running AI agents...', 40);
        
        // Call the crew analysis endpoint
        const response = await fetch(`${BACKEND_URL}/agents/crew/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Backend error: ${response.status}`);
        }
        
        onProgress?.('Processing results...', 80);
        
        const result = await response.json();
        
        // Transform backend result to our format
        if (result.success && result.web_packages) {
            return {
                success: true,
                found_packages: result.web_packages,
                search_summary: {
                    queries_used: result.queries_used || [],
                    total_found: result.web_packages.length,
                    timestamp: new Date().toISOString(),
                    mode
                },
                elapsed_seconds: result.elapsed_seconds
            };
        }
        
        // Fall through to direct search if no web packages found
        throw new Error('No web packages in backend response');
        
    } catch (error) {
        console.warn('Backend web research failed, falling back to direct search:', error);
        throw error;
    }
}

/**
 * Fallback: Direct search using EXA via the backend search endpoint
 */
async function runDirectSearch(
    analysis: ItineraryData,
    onProgress?: WebResearchProgressCallback
): Promise<WebResearchResult> {
    try {
        const destinations = analysis.destinations || [];
        const duration = analysis.duration || '';
        
        if (destinations.length === 0) {
            return {
                success: false,
                found_packages: [],
                error: 'No destinations found in analysis'
            };
        }
        
        // Build search query
        const mainDest = destinations[0];
        const query = `${mainDest} tour package ${duration} price itinerary 2025`;
        
        onProgress?.(`Searching for "${mainDest}" packages...`, 60);
        
        // Use the backend web search endpoint
        const response = await fetch(`${BACKEND_URL}/agents/search/web`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                num_results: 5,
                search_type: 'travel'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        const searchResult = await response.json();
        
        onProgress?.('Transforming results...', 90);
        
        // Transform search results to our package format
        const packages: WebFoundPackage[] = (searchResult.results || []).map((item: any) => ({
            name: item.title || 'Found Package',
            operator: null,
            destinations: destinations,
            duration: duration,
            price_range: null,
            currency: null,
            inclusions: [],
            exclusions: [],
            highlights: item.highlights || [item.text?.substring(0, 200) || ''],
            source_url: item.url || '',
            confidence: 'medium' as const
        }));
        
        return {
            success: true,
            found_packages: packages,
            search_summary: {
                queries_used: [query],
                total_found: packages.length,
                timestamp: new Date().toISOString(),
                mode: 'direct_search'
            }
        };
        
    } catch (error) {
        console.error('Direct search failed:', error);
        return {
            success: false,
            found_packages: [],
            error: error instanceof Error ? error.message : 'Direct search failed'
        };
    }
}

/**
 * Transform web-found packages into Competitor objects for comparison
 */
export function transformToCompetitors(
    packages: WebFoundPackage[],
    startId: number = 100
): Competitor[] {
    return packages.map((pkg, index) => ({
        id: `web-${startId + index}`,
        name: pkg.name || `Web Package ${index + 1}`,
        itineraryText: `
**Source:** ${pkg.source_url}
**Operator:** ${pkg.operator || 'Unknown'}
**Duration:** ${pkg.duration || 'Not specified'}
**Price:** ${pkg.price_range || 'Not specified'} ${pkg.currency || ''}

**Destinations:** ${pkg.destinations.join(', ')}

**Inclusions:** ${pkg.inclusions.join(', ') || 'Not specified'}

**Highlights:**
${pkg.highlights.map(h => `- ${h}`).join('\n')}
        `.trim(),
        analysis: {
            tourName: pkg.name,
            duration: pkg.duration,
            destinations: pkg.destinations,
            pricing: pkg.price_range ? [{
                period: 'Standard',
                price: parseFloat(pkg.price_range.replace(/[^0-9.]/g, '')) || 0,
                currency: pkg.currency || 'THB'
            }] : [],
            flights: [],
            inclusions: pkg.inclusions,
            exclusions: pkg.exclusions,
            dailyBreakdown: []
        },
        isFromWeb: true,
        webSource: pkg.source_url,
        confidence: pkg.confidence
    }));
}

/**
 * Search for competitor tours with specific parameters
 */
export async function searchCompetitorTours(
    destination: string,
    tourType: string = 'package tour',
    companyName?: string
): Promise<WebResearchResult> {
    try {
        const params = new URLSearchParams({
            destination,
            tour_type: tourType,
            ...(companyName && { company_name: companyName })
        });
        
        const response = await fetch(`${BACKEND_URL}/agents/search/competitors?${params}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Transform to our format
        const packages: WebFoundPackage[] = (result.results || []).map((item: any) => ({
            name: item.title || 'Competitor Package',
            operator: companyName || null,
            destinations: [destination],
            duration: null,
            price_range: null,
            currency: null,
            inclusions: [],
            exclusions: [],
            highlights: item.highlights || [item.snippet || ''],
            source_url: item.url || '',
            confidence: 'medium' as const
        }));
        
        return {
            success: true,
            found_packages: packages,
            search_summary: {
                queries_used: [`${destination} ${tourType}`],
                total_found: packages.length,
                timestamp: new Date().toISOString()
            }
        };
        
    } catch (error) {
        return {
            success: false,
            found_packages: [],
            error: error instanceof Error ? error.message : 'Search failed'
        };
    }
}

/**
 * Get the status of the web research agents
 */
export async function getAgentStatus(): Promise<{
    available: boolean;
    agents: {
        memory: boolean;
        webSearch: boolean;
        crew: boolean;
    };
}> {
    try {
        const response = await fetch(`${BACKEND_URL}/agents/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Backend not available');
        }
        
        const status = await response.json();
        
        return {
            available: status.agents_available,
            agents: {
                memory: status.memory_agent?.available || false,
                webSearch: status.web_search_agent?.available || false,
                crew: status.travel_crew?.available || false
            }
        };
        
    } catch (error) {
        return {
            available: false,
            agents: {
                memory: false,
                webSearch: false,
                crew: false
            }
        };
    }
}
