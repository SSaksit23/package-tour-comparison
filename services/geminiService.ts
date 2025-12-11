/**
 * AI Service - Re-exports from aiService for backward compatibility
 * The actual implementation now uses OpenAI
 */

export {
    analyzeItinerary,
    getComparison,
    getRecommendations,
    getCoordinatesForLocations,
    getRouteDetailsForDay,
    embedText,
    generateAnswer
} from './aiService';
