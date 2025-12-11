/**
 * AI Service - OpenAI Implementation
 * Handles all LLM interactions using OpenAI's API
 */

import { ItineraryData, Competitor, SavedCompetitor, AnalysisRecord, ChatMessage, GeoLocation } from '../types';

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Models
const CHAT_MODEL = 'gpt-4o';  // Main model for complex tasks
const FAST_MODEL = 'gpt-4o-mini';  // Faster model for simpler tasks
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Make a request to OpenAI Chat API
 */
async function chatCompletion(
    messages: { role: 'system' | 'user' | 'assistant'; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[],
    options: {
        model?: string;
        temperature?: number;
        jsonMode?: boolean;
    } = {}
): Promise<string> {
    const { model = CHAT_MODEL, temperature = 0.7, jsonMode = false } = options;

    if (!OPENAI_API_KEY) {
        throw new Error('API key is missing. Please provide a valid API key.');
    }

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            ...(jsonMode && { response_format: { type: 'json_object' } })
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Generate embeddings using OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
    if (!OPENAI_API_KEY) {
        throw new Error('API key is missing for embeddings.');
    }

    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text.substring(0, 8000) // Limit input length
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
}

/**
 * Analyze itinerary and extract structured data
 */
export const analyzeItinerary = async (itineraryText: string, language: string): Promise<ItineraryData> => {
    const isImage = itineraryText.startsWith('data:image');
    
    const systemPrompt = `You are a travel itinerary analyzer. Extract information from the provided itinerary and return it as a JSON object with this exact structure:
{
  "tourName": "string - name of the tour",
  "duration": "string - e.g. '8 Days / 7 Nights'",
  "destinations": ["array of destination cities/countries"],
  "pricing": [{"period": "string", "price": number, "currency": "string"}],
  "flights": [{"flightNumber": "string", "origin": "string", "destination": "string", "departureTime": "string", "arrivalTime": "string", "flightTime": "string"}],
  "inclusions": ["array of included items"],
  "exclusions": ["array of excluded items"],
  "dailyBreakdown": [{"day": number, "title": "string", "activities": "string", "meals": ["array"], "locations": ["array"]}]
}
Respond ONLY with valid JSON. The response should be in ${language}.`;

    let messages: any[];
    
    if (isImage) {
        const mimeType = itineraryText.substring(5, itineraryText.indexOf(';'));
        messages = [
            { role: 'system', content: systemPrompt },
            { 
                role: 'user', 
                content: [
                    { type: 'image_url', image_url: { url: itineraryText } },
                    { type: 'text', text: 'Analyze this travel itinerary image and extract the information.' }
                ]
            }
        ];
    } else {
        messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this itinerary:\n\n${itineraryText}` }
        ];
    }

    const response = await chatCompletion(messages, { 
        model: CHAT_MODEL, 
        temperature: 0.3,
        jsonMode: true 
    });

    try {
        return JSON.parse(response);
    } catch (e) {
        console.error("Failed to parse JSON from OpenAI response:", response);
        throw new Error("The AI response was not in the expected format. Please try again.");
    }
};

/**
 * Compare multiple itineraries
 */
export const getComparison = async (competitors: (Competitor | SavedCompetitor)[], language: string): Promise<string> => {
    const competitorDetails = competitors.map(c => {
        const contentSnippet = c.itineraryText.startsWith('data:image') 
            ? "[Image Content Analyzed]" 
            : c.itineraryText.substring(0, 1000) + "...";
        return `### ${c.name}\nContent Snippet: ${contentSnippet}\n\nANALYSIS:\n${JSON.stringify(c.analysis, null, 2)}`;
    }).join('\n\n---\n\n');

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a travel industry analyst. Compare travel itineraries and provide detailed analysis in markdown format. Respond in ${language}.`
        },
        { 
            role: 'user' as const, 
            content: `Compare these travel itineraries. Create a detailed comparison table covering Duration, Destinations, Key Activities, Inclusions, Exclusions, Pricing, and Flights. End with a "### Conclusion" summarizing key differences, strengths and weaknesses.

${competitorDetails}`
        }
    ];

    return await chatCompletion(messages, { model: CHAT_MODEL });
};

/**
 * Generate strategic recommendations
 */
export const getRecommendations = async (
    analyzedCompetitors: (Competitor | SavedCompetitor)[], 
    pastAnalyses: AnalysisRecord[],
    language: string
): Promise<string> => {
    const currentAnalysisSummary = analyzedCompetitors.map(c => 
        `### ${c.name}\n${JSON.stringify(c.analysis, null, 2)}`
    ).join('\n\n');

    const pastAnalysesSummary = pastAnalyses.slice(0, 5).map(record => 
        `- ${new Date(record.createdAt).toLocaleDateString()}: ${record.competitors.map(c => c.name).join(' vs ')}`
    ).join('\n');

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a strategic travel consultant. Provide insights and recommendations based on itinerary analysis. Respond in ${language} using markdown format.`
        },
        { 
            role: 'user' as const, 
            content: `Based on this analysis, provide strategic recommendations:

## Current Analysis
${currentAnalysisSummary}

${pastAnalyses.length > 0 ? `## Past Analyses\n${pastAnalysesSummary}` : ''}

Focus on competitive advantages, market trends, improvements, and unique selling propositions.`
        }
    ];

    return await chatCompletion(messages, { model: CHAT_MODEL });
};

/**
 * Geocode locations
 */
export const getCoordinatesForLocations = async (locations: string[]): Promise<Record<string, { lat: number; lng: number }>> => {
    if (locations.length === 0) return {};

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a geocoding assistant. Return coordinates as a JSON array: [{"name": "location", "lat": number, "lng": number}]. Only include locations you can accurately geocode.`
        },
        { 
            role: 'user' as const, 
            content: `Provide coordinates for these locations: ${locations.join(', ')}`
        }
    ];

    const response = await chatCompletion(messages, { 
        model: FAST_MODEL, 
        temperature: 0,
        jsonMode: true 
    });

    try {
        const parsed = JSON.parse(response);
        const results = Array.isArray(parsed) ? parsed : parsed.locations || [];
        const coordinatesMap: Record<string, { lat: number; lng: number }> = {};
        
        for (const item of results) {
            if (item.name && typeof item.lat === 'number' && typeof item.lng === 'number') {
                coordinatesMap[item.name] = { lat: item.lat, lng: item.lng };
            }
        }
        return coordinatesMap;
    } catch (e) {
        console.error("Failed to parse coordinates:", response);
        throw new Error("The AI response for coordinates was not in the expected format.");
    }
};

/**
 * Calculate route details
 */
export const getRouteDetailsForDay = async (locations: GeoLocation[]): Promise<{ distance: string; duration: string }> => {
    if (locations.length < 2) return { distance: '', duration: '' };

    const route = locations.map(loc => `${loc.name} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`).join(' -> ');

    const messages = [
        { 
            role: 'system' as const, 
            content: 'You are a route calculator. Return JSON: {"distance": "X km", "duration": "X hours Y minutes"}'
        },
        { 
            role: 'user' as const, 
            content: `Calculate approximate driving distance and duration for: ${route}`
        }
    ];

    const response = await chatCompletion(messages, { 
        model: FAST_MODEL, 
        temperature: 0,
        jsonMode: true 
    });

    try {
        return JSON.parse(response);
    } catch (e) {
        console.error("Failed to parse route details:", response);
        return { distance: 'Unknown', duration: 'Unknown' };
    }
};

/**
 * Generate text embeddings for RAG
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (text.startsWith('data:image')) {
        throw new Error("Image embeddings are not currently supported. Please upload PDF or Text files.");
    }
    return await getEmbedding(text);
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
    const historyMessages = chatHistory.slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
    }));

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a helpful travel assistant. Answer questions based on the provided documents. If the answer is not in the documents, say so. Respond in ${language}.

## Available Documents
${contextText}`
        },
        ...historyMessages,
        { role: 'user' as const, content: question }
    ];

    return await chatCompletion(messages, { model: CHAT_MODEL });
};

