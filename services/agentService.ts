/**
 * Agent Service - Integration with AI Agents Backend
 * 
 * Provides:
 * - CrewAI multi-agent analysis
 * - Web search for real-time data
 * - Persistent memory for personalization
 */

const BACKEND_URL = process.env.PDF_EXTRACTOR_URL || 'http://localhost:5001';

interface AgentStatus {
    agents_available: boolean;
    memory_agent: { available: boolean; using_mem0: boolean };
    web_search_agent: { available: boolean };
    travel_crew: { available: boolean; status?: any };
}

interface CrewAnalysisRequest {
    itineraries: Array<{ name: string; content: string }>;
    analysis_focus?: 'competitive' | 'pricing' | 'value' | 'all';
    include_web_search?: boolean;
    user_id?: string;
}

interface CrewAnalysisResponse {
    success: boolean;
    analysis?: string;
    error?: string;
    itinerary_count?: number;
    agents_used?: string[];
}

interface ProductAnalysisResponse {
    success: boolean;
    analysis?: string;
    error?: string;
    timestamp?: string;
}

interface ConsultationResponse {
    success: boolean;
    consultation?: string;
    error?: string;
    analysis_count?: number;
    timestamp?: string;
}

interface WebSearchRequest {
    query: string;
    num_results?: number;
    search_type?: 'travel' | 'prices' | 'reviews' | 'competitors';
}

interface MemoryRequest {
    content: string;
    user_id?: string;
    memory_type?: 'preference' | 'analysis' | 'feedback' | 'general';
}

/**
 * Check agent status
 */
export async function getAgentStatus(): Promise<AgentStatus | null> {
    try {
        const response = await fetch(`${BACKEND_URL}/agents/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            console.warn('⚠️ Agent status check failed:', response.status);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.warn('⚠️ Agent service not available:', error);
        return null;
    }
}

/**
 * Analyze itineraries using CrewAI multi-agent system
 */
export async function analyzeWithCrewAI(
    itineraries: Array<{ name: string; content: string }>,
    options: {
        analysis_focus?: 'competitive' | 'pricing' | 'value' | 'all';
        include_web_search?: boolean;
        user_id?: string;
    } = {}
): Promise<CrewAnalysisResponse> {
    try {
        // First, check if backend is available
        try {
            const healthCheck = await fetch(`${BACKEND_URL}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000) // 5 second timeout for health check
            });
            if (!healthCheck.ok) {
                throw new Error('Backend health check failed');
            }
        } catch (healthError) {
            console.warn('⚠️ Backend not responding, CrewAI unavailable');
            return {
                success: false,
                error: 'Backend service is not available. Please ensure the backend is running on port 5001.'
            };
        }
        
        const request: CrewAnalysisRequest = {
            itineraries,
            analysis_focus: options.analysis_focus || 'competitive',
            include_web_search: options.include_web_search ?? true,
            user_id: options.user_id || 'default'
        };
        
        console.log('🤖 Starting CrewAI analysis...', {
            itinerary_count: itineraries.length,
            focus: request.analysis_focus,
            web_search: request.include_web_search
        });
        
        // Create AbortController for timeout
        // Reduced timeout to 3 minutes - if backend doesn't respond by then, it's likely stuck
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout (was 10 minutes)
        
        try {
            const response = await fetch(`${BACKEND_URL}/agents/crew/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Agent analysis failed (${response.status}): ${error}`);
            }
            
            const result: CrewAnalysisResponse = await response.json();
        
        if (result.success) {
            console.log('✅ CrewAI analysis completed', {
                agents: result.agents_used,
                length: result.analysis?.length
            });
        }
        
            return result;
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                console.error('❌ CrewAI analysis timed out after 3 minutes');
                return {
                    success: false,
                    error: 'Analysis timed out after 3 minutes. The CrewAI backend may not be responding. Please disable agentic analysis (uncheck 🤖 Crew) and try again with standard AI analysis.'
                };
            }
            
            throw fetchError;
        }
    } catch (error) {
        console.error('❌ CrewAI analysis error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Search web for travel information
 */
export async function searchWeb(
    query: string,
    searchType: 'travel' | 'prices' | 'reviews' | 'competitors' = 'travel',
    numResults: number = 5
): Promise<any> {
    try {
        let endpoint = `${BACKEND_URL}/agents/search/web`;
        
        // Use specialized endpoints for specific search types
        if (searchType === 'prices') {
            endpoint = `${BACKEND_URL}/agents/search/prices?destination=${encodeURIComponent(query)}&travel_type=tour package`;
        } else if (searchType === 'reviews') {
            endpoint = `${BACKEND_URL}/agents/search/reviews?destination=${encodeURIComponent(query)}`;
        } else if (searchType === 'competitors') {
            endpoint = `${BACKEND_URL}/agents/search/competitors?destination=${encodeURIComponent(query)}&tour_type=package tour`;
        }
        
        const response = await fetch(endpoint, {
            method: searchType === 'travel' ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: searchType === 'travel' ? JSON.stringify({ query, num_results: numResults }) : undefined
        });
        
        if (!response.ok) {
            throw new Error(`Web search failed: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.warn('⚠️ Web search not available:', error);
        return { success: false, results: [] };
    }
}

/**
 * Add memory (user preference, analysis result, etc.)
 */
export async function addMemory(
    content: string,
    user_id: string = 'default',
    memory_type: 'preference' | 'analysis' | 'feedback' | 'general' = 'general'
): Promise<boolean> {
    try {
        const response = await fetch(`${BACKEND_URL}/agents/memory/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, user_id, memory_type })
        });
        
        if (!response.ok) return false;
        
        const result = await response.json();
        return result.success === true;
    } catch (error) {
        console.warn('⚠️ Memory agent not available:', error);
        return false;
    }
}

/**
 * Get user context from memory for personalization
 */
export async function getUserContext(
    user_id: string = 'default',
    query: string = ''
): Promise<string> {
    try {
        const response = await fetch(
            `${BACKEND_URL}/agents/memory/${user_id}/context?query=${encodeURIComponent(query)}`,
            { method: 'GET' }
        );
        
        if (!response.ok) return '';
        
        const result = await response.json();
        return result.context || '';
    } catch (error) {
        console.warn('⚠️ Could not get user context:', error);
        return '';
    }
}

/**
 * Search memories
 */
export async function searchMemories(
    query: string,
    user_id: string = 'default',
    limit: number = 5
): Promise<any[]> {
    try {
        const response = await fetch(`${BACKEND_URL}/agents/memory/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, user_id, limit })
        });
        
        if (!response.ok) return [];
        
        const result = await response.json();
        return result.memories || [];
    } catch (error) {
        console.warn('⚠️ Memory search not available:', error);
        return [];
    }
}

/**
 * Analyze product for market positioning (Smart Product Launch Agent)
 */
export async function analyzeProductLaunch(
    itineraryData: any,
    marketContext?: string,
    competitorData?: any[]
): Promise<ProductAnalysisResponse> {
    try {
        const response = await fetch(`${BACKEND_URL}/agents/product-launch/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itinerary_data: itineraryData,
                market_context: marketContext,
                competitor_data: competitorData
            })
        });
        
        if (!response.ok) {
            throw new Error(`Product analysis failed: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ Product Launch Agent error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get strategic consultation (AI Consultant Agent with Memory)
 */
export async function getConsultation(
    currentAnalyses: any[],
    user_id: string = 'default',
    focusAreas?: string[]
): Promise<ConsultationResponse> {
    try {
        const response = await fetch(`${BACKEND_URL}/agents/consultant/consult`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_analyses: currentAnalyses,
                user_id: user_id,
                focus_areas: focusAreas
            })
        });
        
        if (!response.ok) {
            throw new Error(`Consultation failed: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ Consultant Agent error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

