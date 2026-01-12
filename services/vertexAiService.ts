/**
 * Vertex AI Service - Google Cloud's Enterprise AI Platform
 * 
 * More reliable than Google AI Studio with:
 * - Higher rate limits
 * - Better consistency
 * - Enterprise SLA
 * 
 * Setup required:
 * 1. Create Google Cloud project
 * 2. Enable Vertex AI API
 * 3. Create service account with Vertex AI User role
 * 4. Download JSON key file or use Application Default Credentials
 */

import { ItineraryData, Competitor, SavedCompetitor, AnalysisRecord, ChatMessage, GeoLocation } from '../types';

// Vertex AI Configuration
const VERTEX_PROJECT_ID = process.env.VITE_VERTEX_PROJECT_ID || '';
// Clean location: remove spaces and parentheses, use only region code
// e.g., "asia-southeast1 (singapore)" -> "asia-southeast1"
const VERTEX_LOCATION_RAW = process.env.VITE_VERTEX_LOCATION || 'us-central1';
const VERTEX_LOCATION = VERTEX_LOCATION_RAW.split(' ')[0].split('(')[0].trim();
const VERTEX_API_KEY = process.env.VITE_VERTEX_API_KEY || ''; // API key for simple auth

// Models
// Note: Model availability varies by region
// Gemini models are typically only available in us-central1 and europe-west4
// Use gemini-1.5-pro or gemini-1.5-flash for better compatibility
// gemini-2.0-flash-001 may not be available in all regions
const VERTEX_MODEL = process.env.VITE_VERTEX_MODEL || 'gemini-1.5-pro'; // or 'gemini-1.5-flash' for faster responses
const VERTEX_EMBEDDING_MODEL = 'text-embedding-004';

// Supported regions for Gemini models (most models are only in these regions)
const SUPPORTED_GEMINI_REGIONS = ['us-central1', 'europe-west4'];

// API Base URL
const getVertexUrl = (model: string, method: string = 'generateContent') => {
    // VERTEX_LOCATION is already cleaned (no spaces/parentheses)
    return `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${model}:${method}`;
};

// Debug logging
if (VERTEX_PROJECT_ID && VERTEX_API_KEY) {
    const isSupportedRegion = SUPPORTED_GEMINI_REGIONS.includes(VERTEX_LOCATION);
    console.log('🔑 Vertex AI configured:', {
        project: VERTEX_PROJECT_ID,
        location: VERTEX_LOCATION,
        model: VERTEX_MODEL,
        apiKey: VERTEX_API_KEY.substring(0, 10) + '...',
        regionSupported: isSupportedRegion ? '✅' : '⚠️ (Gemini models typically only available in us-central1 and europe-west4)'
    });
    
    if (!isSupportedRegion) {
        console.warn(`⚠️ Region "${VERTEX_LOCATION}" may not support Gemini models. Consider using "us-central1" or "europe-west4".`);
    }
} else {
    console.warn('⚠️ Vertex AI not configured. Set VITE_VERTEX_PROJECT_ID and VITE_VERTEX_API_KEY');
}

/**
 * Check if Vertex AI is configured
 * Note: Vertex AI REST API requires service account credentials, not API keys
 * API keys that start with "AQ." are not valid for Vertex AI REST API
 */
export function isVertexConfigured(): boolean {
    // Check if both project ID and API key are set
    if (!VERTEX_PROJECT_ID || !VERTEX_API_KEY) {
        return false;
    }
    
    // API keys for Vertex AI REST API don't work - they require service account JSON
    // API keys that start with "AQ." are typically Gemini API keys, not Vertex AI service account keys
    // Service account keys are JSON objects, not simple strings
    // For now, we'll still return true if configured, but the error handling will catch it
    // In a production setup, you'd validate that it's a proper service account JSON
    
    // If the "API key" looks like a Gemini API key (starts with AQ. or AIza), it's not valid for Vertex AI
    if (VERTEX_API_KEY.startsWith('AQ.') || VERTEX_API_KEY.startsWith('AIza')) {
        console.warn('⚠️ Vertex AI API key looks like a Gemini API key. Vertex AI requires service account credentials. Use Gemini API (VITE_GEMINI_API_KEY) instead.');
        return false; // Don't consider it configured if it's clearly not a service account key
    }
    
    return true;
}

/**
 * Make authenticated request to Vertex AI
 */
async function vertexRequest(
    url: string,
    body: any,
    maxRetries: number = 3
): Promise<any> {
    if (!VERTEX_PROJECT_ID || !VERTEX_API_KEY) {
        throw new Error('Vertex AI not configured. Set VITE_VERTEX_PROJECT_ID and VITE_VERTEX_API_KEY');
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(`${url}?key=${VERTEX_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                const errorMessage = error.error?.message || `Vertex AI error: ${response.status}`;
                
                // Handle 404 - Model not found or API key auth issue
                if (response.status === 404) {
                    const detailedError = error.error?.message || error.message || '';
                    if (detailedError.includes('not found') || detailedError.includes('was not found')) {
                        // Model not found - could be wrong model name, region issue, or API key auth
                        const modelIssue = detailedError.includes('model') || detailedError.includes('Model');
                        const regionIssue = detailedError.includes('location') || detailedError.includes('not available in location');
                        
                        let errorMsg = 'Vertex AI error: ';
                        if (regionIssue) {
                            errorMsg += `Model "${VERTEX_MODEL}" is not available in region "${VERTEX_LOCATION}". `;
                            errorMsg += `Gemini models are typically only available in: ${SUPPORTED_GEMINI_REGIONS.join(', ')}. `;
                            errorMsg += `Solution: Set VITE_VERTEX_LOCATION=us-central1 or use a model available in ${VERTEX_LOCATION}. `;
                        } else if (modelIssue) {
                            errorMsg += `Model "${VERTEX_MODEL}" was not found in region "${VERTEX_LOCATION}". `;
                            errorMsg += `Try using "gemini-1.5-pro" or "gemini-1.5-flash" instead, or change region to us-central1. `;
                        }
                        errorMsg += 'Note: Vertex AI REST API requires service account authentication (not API keys). For API key authentication, use Gemini API (VITE_GEMINI_API_KEY) instead.';
                        throw new Error(errorMsg);
                    }
                    // Generic 404 - likely API key auth issue
                    throw new Error('Vertex AI REST API requires service account authentication, not API keys. Please use Gemini API (VITE_GEMINI_API_KEY) instead, or configure Vertex AI with service account credentials.');
                }
                
                // Handle rate limiting
                if (response.status === 429 || response.status === 503) {
                    const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
                    if (attempt < maxRetries) {
                        console.log(`⏳ Vertex AI rate limited (attempt ${attempt}/${maxRetries}). Waiting ${(waitTime/1000).toFixed(1)}s...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                }
                
                throw new Error(errorMessage);
            }

            return await response.json();
            
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            const waitTime = 1000 * attempt;
            console.log(`⚠️ Vertex AI request failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
    
    throw new Error('All Vertex AI request attempts failed');
}

/**
 * Generate content with Vertex AI
 */
async function vertexCompletion(
    prompt: string,
    options: {
        model?: string;
        temperature?: number;
        systemInstruction?: string;
        jsonMode?: boolean;
        imageData?: string;
    } = {}
): Promise<string> {
    const { 
        model = VERTEX_MODEL, 
        temperature = 0.7, 
        systemInstruction,
        jsonMode = false,
        imageData
    } = options;

    const url = getVertexUrl(model, 'generateContent');

    // Build content parts
    const parts: any[] = [];
    
    if (imageData) {
        const mimeMatch = imageData.match(/data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
        
        parts.push({
            inlineData: {
                mimeType,
                data: base64Data
            }
        });
    }
    
    parts.push({ text: prompt });

    const requestBody: any = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
            temperature,
            maxOutputTokens: 8192,
            topP: 0.95,
        }
    };

    if (systemInstruction) {
        requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    if (jsonMode) {
        requestBody.generationConfig.responseMimeType = 'application/json';
    }

    const response = await vertexRequest(url, requestBody);
    
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('No content in Vertex AI response');
    }
    
    return text;
}

/**
 * Generate embeddings with Vertex AI
 */
async function vertexEmbedding(text: string): Promise<number[]> {
    const cleanText = text.substring(0, 10000).trim();
    if (!cleanText) {
        console.warn('⚠️ Empty text provided for embedding');
        return [];
    }

    const url = getVertexUrl(VERTEX_EMBEDDING_MODEL, 'predict');
    
    const requestBody = {
        instances: [{ content: cleanText }],
        parameters: {
            outputDimensionality: 768
        }
    };

    const response = await vertexRequest(url, requestBody);
    
    const embedding = response.predictions?.[0]?.embeddings?.values;
    if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from Vertex AI');
    }
    
    console.log(`✅ Vertex embedding generated: ${embedding.length} dimensions`);
    return embedding;
}

/**
 * Create default itinerary structure
 */
const createDefaultItinerary = (tourName: string = 'Unknown'): ItineraryData => ({
    tourName,
    duration: 'Not specified',
    destinations: [],
    pricing: [],
    flights: [],
    inclusions: [],
    exclusions: [],
    dailyBreakdown: []
});

/**
 * Validate itinerary data
 */
const validateItineraryData = (data: any, sourceName: string): ItineraryData => {
    const result = createDefaultItinerary(sourceName);
    
    try {
        result.tourName = data?.tourName || sourceName || 'Unknown Tour';
        result.duration = data?.duration || 'Not specified';
        result.destinations = Array.isArray(data?.destinations) ? data.destinations : [];
        result.pricing = Array.isArray(data?.pricing) ? data.pricing.filter((p: any) => p && typeof p.price === 'number') : [];
        result.flights = Array.isArray(data?.flights) ? data.flights : [];
        result.inclusions = Array.isArray(data?.inclusions) ? data.inclusions : [];
        result.exclusions = Array.isArray(data?.exclusions) ? data.exclusions : [];
        result.dailyBreakdown = Array.isArray(data?.dailyBreakdown) ? data.dailyBreakdown : [];
        
        const hasData = result.destinations.length > 0 || result.pricing.length > 0;
        console.log(`✅ Vertex extracted: ${result.destinations.length} destinations, ${result.pricing.length} prices`);
        
        if (!hasData) {
            console.warn(`⚠️ Vertex extraction for "${sourceName}" returned minimal data`);
        }
    } catch (e) {
        console.error('Error validating itinerary data:', e);
    }
    
    return result;
};

/**
 * Analyze itinerary with Vertex AI
 */
export const analyzeItinerary = async (itineraryText: string, language: string): Promise<ItineraryData> => {
    const isImage = itineraryText.startsWith('data:image');
    
    if (!isImage && (!itineraryText || itineraryText.trim().length < 50)) {
        console.error('❌ Document content too short or empty');
        return createDefaultItinerary('Empty Document');
    }
    
    console.log(`📊 Vertex AI analyzing ${isImage ? 'image' : 'text'} (${isImage ? 'image' : itineraryText.length + ' chars'})...`);
    
    const systemPrompt = `You are an expert travel itinerary analyzer. Extract ALL information from this travel document.

OUTPUT JSON FORMAT:
{
  "tourName": "tour name or code",
  "duration": "7 Days / 6 Nights",
  "destinations": ["City1", "City2", "City3"],
  "pricing": [{"period": "Oct-Dec 2024", "price": 25999, "currency": "THB"}],
  "flights": [{"flightNumber": "SC8885", "origin": "BKK", "destination": "TAO", "departureTime": "08:00", "arrivalTime": "13:00", "flightTime": "4h 30m"}],
  "inclusions": ["hotel", "meals", "transfers"],
  "exclusions": ["tips", "personal expenses"],
  "dailyBreakdown": [{"day": 1, "title": "Day 1", "activities": "description", "meals": ["B","L","D"], "locations": ["Place1"]}]
}

RULES:
- Extract ALL prices (look for THB, บาท, numbers)
- Extract ALL cities/destinations mentioned
- For Thai text, preserve Thai characters
- Count days from daily breakdown if duration not explicit
- Return valid JSON only

Language: ${language}`;

    const userPrompt = isImage 
        ? 'Extract all travel itinerary information from this image. Include tour name, duration, destinations, prices, flights, inclusions, exclusions, and daily schedule.'
        : `Extract travel itinerary information:\n\n${itineraryText.substring(0, 30000)}`;

    try {
        const response = await vertexCompletion(userPrompt, {
            temperature: 0.2,
            jsonMode: true,
            systemInstruction: systemPrompt,
            imageData: isImage ? itineraryText : undefined
        });

        const parsed = JSON.parse(response);
        return validateItineraryData(parsed, parsed?.tourName || 'Extracted');
        
    } catch (e) {
        console.error("❌ Vertex extraction failed:", e);
        return createDefaultItinerary('Extraction Failed');
    }
};

/**
 * Compare itineraries with Vertex AI
 */
export const getComparison = async (
    competitors: (Competitor | SavedCompetitor)[], 
    language: string,
    ragContext?: string
): Promise<string> => {
    const competitorData = competitors.map(c => ({
        name: c.name,
        tourName: c.analysis?.tourName || 'N/A',
        duration: c.analysis?.duration || 'N/A',
        destinations: c.analysis?.destinations?.join(', ') || 'N/A',
        destinationCount: c.analysis?.destinations?.length || 0,
        pricing: c.analysis?.pricing?.map(p => `${p.price} ${p.currency}`).join('; ') || 'N/A',
        meals: c.analysis?.dailyBreakdown?.flatMap(d => d.meals || []).filter((v, i, a) => a.indexOf(v) === i).join(',') || 'N/A',
    }));

    const competitorSummaries = competitorData.map(c => 
        `### ${c.name}\n- Duration: ${c.duration}\n- Destinations (${c.destinationCount}): ${c.destinations}\n- Pricing: ${c.pricing}\n- Meals: ${c.meals}`
    ).join('\n\n');

    const ragSection = ragContext ? `\n## Knowledge Base Context\n${ragContext}\n` : '';
    
    // Use all competitors for comparison
    const columnHeaders = competitors.map(c => c.name).join(' | ');

    const systemPrompt = `You are a travel industry analyst. Create a comparison table.

TABLE FORMAT RULES:
- EXACTLY ${competitors.length + 1} columns: | Aspect | ${columnHeaders} |
- Keep cell values SHORT (max 20 chars, use abbreviations when needed)
- Use abbreviations: B=Breakfast, L=Lunch, D=Dinner, THB=Thai Baht
- For tables with many columns (${competitors.length}+), ensure all values are concise

Language: ${language}`;

    const userPrompt = `Compare these ${competitors.length} travel products:

${competitorSummaries}
${ragSection}

Create:

## 1. Comparison Table
| Aspect | ${columnHeaders} |
|--------|${competitors.map(() => '---').join('|')}|

Rows: Duration, Total Price, Price/Day, Dest. Count, Incl. Meals, Activities, Flight Quality, Accom. Level

## 2. Value Analysis
Brief comparison (2-3 sentences per product)

## 3. Recommendations
Key insights and suggestions`;

    return await vertexCompletion(userPrompt, { 
        temperature: 0.3,
        systemInstruction: systemPrompt
    });
};

/**
 * Generate recommendations with Vertex AI
 */
export const getRecommendations = async (
    analyzedCompetitors: (Competitor | SavedCompetitor)[], 
    pastAnalyses: AnalysisRecord[],
    language: string,
    ragContext?: string
): Promise<string> => {
    const currentAnalysisSummary = analyzedCompetitors.map(c => 
        `### ${c.name}\n${JSON.stringify(c.analysis, null, 2)}`
    ).join('\n\n');

    const ragSection = ragContext ? `\n## Knowledge Base Context\n${ragContext}\n` : '';

    const systemPrompt = `You are a strategic travel consultant. Provide actionable insights.
Language: ${language}`;

    const userPrompt = `Analyze these travel products:

${currentAnalysisSummary}
${ragSection}

Provide:
1. **Product Positioning** - Market fit
2. **Pricing Analysis** - Value comparison
3. **Unique Selling Points** - Differentiators
4. **Areas for Improvement** - Specific recommendations
5. **Market Opportunities** - Growth areas`;

    return await vertexCompletion(userPrompt, { 
        temperature: 0.4,
        systemInstruction: systemPrompt
    });
};

/**
 * Geocode locations with Vertex AI
 */
export const getCoordinatesForLocations = async (locations: string[]): Promise<Record<string, { lat: number; lng: number }>> => {
    if (locations.length === 0) return {};

    const response = await vertexCompletion(
        `Provide coordinates for: ${locations.join(', ')}`,
        {
            temperature: 0,
            jsonMode: true,
            systemInstruction: 'Return JSON array: [{"name": "location", "lat": number, "lng": number}]'
        }
    );

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
        console.error("Failed to parse coordinates:", e);
        return {};
    }
};

/**
 * Calculate route details
 */
export const getRouteDetailsForDay = async (locations: GeoLocation[]): Promise<{ distance: string; duration: string }> => {
    if (locations.length < 2) return { distance: '', duration: '' };

    const route = locations.map(loc => `${loc.name} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`).join(' -> ');

    const response = await vertexCompletion(
        `Calculate driving distance and duration for: ${route}`,
        {
            temperature: 0,
            jsonMode: true,
            systemInstruction: 'Return JSON: {"distance": "X km", "duration": "X hours Y minutes"}'
        }
    );

    try {
        return JSON.parse(response);
    } catch (e) {
        return { distance: 'Unknown', duration: 'Unknown' };
    }
};

/**
 * Generate embeddings for RAG
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (text.startsWith('data:image')) {
        throw new Error("Image embeddings not supported");
    }
    return await vertexEmbedding(text);
};

/**
 * Generate Q&A answer
 */
export const generateAnswer = async (
    chatHistory: ChatMessage[], 
    contextText: string, 
    question: string,
    language: string
): Promise<string> => {
    const historyText = chatHistory.slice(-5).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 2000)}`
    ).join('\n\n');

    const systemPrompt = `You are a travel assistant. Answer based on provided documents. Language: ${language}

## Documents
${contextText.substring(0, 100000)}`;

    const userPrompt = historyText 
        ? `Previous conversation:\n${historyText}\n\nQuestion: ${question}`
        : question;

    return await vertexCompletion(userPrompt, {
        systemInstruction: systemPrompt
    });
};

