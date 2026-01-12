/**
 * AI Provider - Unified interface for OpenAI, Gemini, and Vertex AI
 * 
 * Allows switching between AI providers via environment variable:
 * - VITE_AI_PROVIDER=openai
 * - VITE_AI_PROVIDER=gemini (Google AI Studio)
 * - VITE_AI_PROVIDER=vertex (Google Cloud Vertex AI - most reliable)
 * - VITE_AI_PROVIDER=auto (default - auto-detect)
 * 
 * Priority in auto mode: Vertex AI > Gemini > OpenAI
 */

import * as openaiService from './aiService';
import * as geminiService from './geminiService';
import * as vertexService from './vertexAiService';
import { ItineraryData, Competitor, SavedCompetitor, AnalysisRecord, ChatMessage, GeoLocation } from '../types';

// Provider configuration
export type AIProvider = 'openai' | 'gemini' | 'vertex' | 'auto';

const CONFIGURED_PROVIDER = (process.env.VITE_AI_PROVIDER as AIProvider) || 'auto';

/**
 * Get the active AI provider based on configuration and available API keys
 */
export function getActiveProvider(): 'openai' | 'gemini' | 'vertex' {
    // Explicit Vertex AI selection
    if (CONFIGURED_PROVIDER === 'vertex') {
        if (!vertexService.isVertexConfigured()) {
            console.warn('⚠️ Vertex AI selected but not properly configured (requires service account, not API keys). Falling back to Gemini.');
            if (geminiService.isGeminiConfigured()) return 'gemini';
            return 'openai';
        }
        return 'vertex';
    }
    
    // Explicit Gemini selection
    if (CONFIGURED_PROVIDER === 'gemini') {
        if (!geminiService.isGeminiConfigured()) {
            console.warn('⚠️ Gemini selected but not configured. Falling back to OpenAI.');
            return 'openai';
        }
        return 'gemini';
    }
    
    // Explicit OpenAI selection
    if (CONFIGURED_PROVIDER === 'openai') {
        return 'openai';
    }
    
    // Auto mode: prefer Gemini API (works with API keys) > Vertex AI > OpenAI
    // Note: Vertex AI REST API requires service account auth, not API keys
    // Gemini API is preferred when API keys are available
    if (geminiService.isGeminiConfigured()) {
        console.log('🤖 Auto-selected Gemini API (works with API keys, higher rate limits)');
        return 'gemini';
    }
    
    // Only use Vertex AI if Gemini is not available and Vertex AI is properly configured
    // (Vertex AI requires service account credentials, not API keys)
    if (vertexService.isVertexConfigured()) {
        console.log('🤖 Auto-selected Vertex AI (enterprise reliability, requires service account)');
        return 'vertex';
    }
    
    console.log('🤖 Auto-selected OpenAI');
    return 'openai';
}

/**
 * Get provider display info
 */
export function getProviderInfo(): { name: string; icon: string; contextLimit: string } {
    const provider = getActiveProvider();
    
    if (provider === 'vertex') {
        return {
            name: 'Google Vertex AI',
            icon: '☁️',
            contextLimit: '1M tokens (Enterprise)'
        };
    }
    
    if (provider === 'gemini') {
        return {
            name: 'Google Gemini 2.0',
            icon: '✨',
            contextLimit: '1M tokens'
        };
    }
    
    return {
        name: 'OpenAI GPT-4o',
        icon: '🧠',
        contextLimit: '128K tokens'
    };
}

// Get the active service module
function getService() {
    const provider = getActiveProvider();
    if (provider === 'vertex') return vertexService;
    if (provider === 'gemini') return geminiService;
    return openaiService;
}

/**
 * Analyze itinerary and extract structured data
 */
export const analyzeItinerary = async (itineraryText: string, language: string): Promise<ItineraryData> => {
    const provider = getActiveProvider();
    console.log(`📊 Analyzing itinerary with ${provider === 'gemini' ? 'Gemini' : provider === 'vertex' ? 'Vertex AI' : 'OpenAI'}...`);
    
    try {
        return await getService().analyzeItinerary(itineraryText, language);
    } catch (error: any) {
        // If Vertex AI fails with 404 (model not found, API key auth issue, etc.), fall back to Gemini
        if (provider === 'vertex' && (
            error?.message?.includes('service account') ||
            error?.message?.includes('not found') ||
            error?.message?.includes('was not found') ||
            error?.message?.includes('404')
        )) {
            console.warn('⚠️ Vertex AI failed (likely API key auth or model/region issue). Falling back to Gemini...');
            if (geminiService.isGeminiConfigured()) {
                return geminiService.analyzeItinerary(itineraryText, language);
            }
            // Fall back to OpenAI if Gemini not available
            console.warn('⚠️ Gemini not available. Falling back to OpenAI...');
            return openaiService.analyzeItinerary(itineraryText, language);
        }
        throw error;
    }
};

/**
 * Compare multiple itineraries
 */
export const getComparison = async (
    competitors: (Competitor | SavedCompetitor)[], 
    language: string,
    ragContext?: string
): Promise<string> => {
    return getService().getComparison(competitors, language, ragContext);
};

/**
 * Generate strategic recommendations
 */
export const getRecommendations = async (
    analyzedCompetitors: (Competitor | SavedCompetitor)[], 
    pastAnalyses: AnalysisRecord[],
    language: string,
    ragContext?: string
): Promise<string> => {
    return getService().getRecommendations(analyzedCompetitors, pastAnalyses, language, ragContext);
};

/**
 * Geocode locations
 */
export const getCoordinatesForLocations = async (locations: string[]): Promise<Record<string, { lat: number; lng: number }>> => {
    return getService().getCoordinatesForLocations(locations);
};

/**
 * Calculate route details
 */
export const getRouteDetailsForDay = async (locations: GeoLocation[]): Promise<{ distance: string; duration: string }> => {
    return getService().getRouteDetailsForDay(locations);
};

/**
 * Generate text embeddings for RAG
 */
export const embedText = async (text: string): Promise<number[]> => {
    return getService().embedText(text);
};

/**
 * Generate answer for Q&A
 */
export const generateAnswer = async (
    chatHistory: ChatMessage[], 
    contextText: string, 
    question: string,
    language: string
): Promise<string> => {
    return getService().generateAnswer(chatHistory, contextText, question, language);
};

