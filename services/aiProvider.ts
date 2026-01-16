/**
 * AI Provider - Unified interface for OpenAI and Gemini
 * 
 * Allows switching between AI providers via environment variable:
 * - VITE_AI_PROVIDER=openai
 * - VITE_AI_PROVIDER=gemini (Google AI Studio - recommended)
 * - VITE_AI_PROVIDER=auto (default - auto-detect)
 * 
 * Priority in auto mode: Gemini > OpenAI
 */

import * as openaiService from './aiService';
import * as geminiService from './geminiService';
import { ItineraryData, Competitor, SavedCompetitor, AnalysisRecord, ChatMessage, GeoLocation } from '../types';

// Provider configuration
export type AIProvider = 'openai' | 'gemini' | 'auto';

const CONFIGURED_PROVIDER = (process.env.VITE_AI_PROVIDER as AIProvider) || 'auto';

/**
 * Get the active AI provider based on configuration and available API keys
 */
export function getActiveProvider(): 'openai' | 'gemini' {
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
    
    // Auto mode: prefer Gemini API > OpenAI
    if (geminiService.isGeminiConfigured()) {
        console.log('🤖 Auto-selected Gemini API (works with API keys, higher rate limits)');
        return 'gemini';
    }
    
    console.log('🤖 Auto-selected OpenAI');
    return 'openai';
}

/**
 * Get provider display info
 */
export function getProviderInfo(): { name: string; icon: string; contextLimit: string } {
    const provider = getActiveProvider();
    
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
    if (provider === 'gemini') return geminiService;
    return openaiService;
}

/**
 * Analyze itinerary and extract structured data
 */
export const analyzeItinerary = async (itineraryText: string, language: string): Promise<ItineraryData> => {
    const provider = getActiveProvider();
    console.log(`📊 Analyzing itinerary with ${provider === 'gemini' ? 'Gemini' : 'OpenAI'}...`);
    return getService().analyzeItinerary(itineraryText, language);
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
