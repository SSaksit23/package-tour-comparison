/**
 * Gemini AI Service - Google's Gemini Implementation
 * Handles all LLM interactions using Google's Gemini API
 * 
 * Benefits over OpenAI:
 * - 1 Million token context window (vs 128K)
 * - Higher rate limits on free tier
 * - ~4x cheaper than GPT-4o
 */

import { ItineraryData, Competitor, SavedCompetitor, AnalysisRecord, ChatMessage, GeoLocation } from '../types';

// Gemini API configuration
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Models - Use latest Gemini models (2.0 Flash is fast and capable)
// See: https://ai.google.dev/gemini-api/docs/models
const GEMINI_PRO_MODEL = 'gemini-2.0-flash';  // Fast, multimodal, 1M context
const GEMINI_FLASH_MODEL = 'gemini-2.0-flash';  // Same model for consistency
const EMBEDDING_MODEL = 'text-embedding-004';

// Debug: Log API key status
if (GEMINI_API_KEY) {
    console.log('🔑 Gemini API Key loaded:', GEMINI_API_KEY.substring(0, 7) + '...' + GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 4));
} else {
    console.warn('⚠️ Gemini API Key is NOT SET. Add VITE_GEMINI_API_KEY to your .env file');
}

/**
 * Check if Gemini is configured
 */
export function isGeminiConfigured(): boolean {
    return !!GEMINI_API_KEY;
}

/**
 * Make a request to Gemini API with automatic retry for rate limits
 */
async function geminiCompletion(
    prompt: string,
    options: {
        model?: string;
        temperature?: number;
        jsonMode?: boolean;
        systemInstruction?: string;
        maxRetries?: number;
        imageData?: string; // Base64 image data
    } = {}
): Promise<string> {
    const { 
        model = GEMINI_PRO_MODEL, 
        temperature = 0.7, 
        jsonMode = false, 
        systemInstruction,
        maxRetries = 3,
        imageData
    } = options;

    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key is missing. Please set VITE_GEMINI_API_KEY in your .env file.');
    }

    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    // Build the content parts
    const parts: any[] = [];
    
    if (imageData) {
        // Extract mime type and base64 data
        const mimeMatch = imageData.match(/data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
        
        parts.push({
            inline_data: {
                mime_type: mimeType,
                data: base64Data
            }
        });
    }
    
    parts.push({ text: prompt });

    const requestBody: any = {
        contents: [{ parts }],
        generationConfig: {
            temperature,
            maxOutputTokens: 8192,
        }
    };

    // Add system instruction if provided
    if (systemInstruction) {
        requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    // Enable JSON mode
    if (jsonMode) {
        requestBody.generationConfig.responseMimeType = 'application/json';
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                const errorMessage = error.error?.message || `Gemini API error: ${response.status}`;
                
                // Handle rate limiting
                if (response.status === 429) {
                    const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
                    if (attempt < maxRetries) {
                        console.log(`⏳ Gemini rate limited (attempt ${attempt}/${maxRetries}). Waiting ${(waitTime/1000).toFixed(1)}s...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                }
                
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            // Extract text from response
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error('No content in Gemini response');
            }
            
            if (attempt > 1) {
                console.log(`✅ Gemini request succeeded on attempt ${attempt}`);
            }
            
            return text;
            
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            const waitTime = 1000 * attempt;
            console.log(`⚠️ Gemini request failed (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}`);
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
    
    throw new Error('All Gemini API request attempts failed');
}

/**
 * Generate embeddings using Gemini
 */
async function getGeminiEmbedding(text: string, retries: number = 2): Promise<number[]> {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key is missing for embeddings.');
    }

    const cleanText = text.substring(0, 10000).trim(); // Gemini supports longer text
    if (!cleanText) {
        console.warn('⚠️ Empty text provided for embedding');
        return [];
    }

    const url = `${GEMINI_BASE_URL}/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`🔄 Gemini embedding attempt ${attempt}/${retries}...`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: `models/${EMBEDDING_MODEL}`,
                    content: {
                        parts: [{ text: cleanText }]
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                const errorMsg = error.error?.message || `Gemini Embedding API error: ${response.status}`;
                
                if (response.status === 429) {
                    const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
                    console.log(`⏳ Rate limited, waiting ${waitTime}ms...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                }
                
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log(`✅ Gemini embedding generated successfully`);
            return data.embedding?.values || [];
            
        } catch (error) {
            console.error(`❌ Gemini embedding attempt ${attempt} failed:`, error);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            } else {
                throw error;
            }
        }
    }
    
    throw new Error('All Gemini embedding attempts failed');
}

/**
 * Create default/empty itinerary data structure
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
 * Validate and fix extracted itinerary data
 */
const validateItineraryData = (data: any, sourceName: string): ItineraryData => {
    const result = createDefaultItinerary(sourceName);
    
    try {
        // Validate each field with fallbacks
        result.tourName = data?.tourName || sourceName || 'Unknown Tour';
        result.duration = data?.duration || 'Not specified';
        result.destinations = Array.isArray(data?.destinations) ? data.destinations : [];
        result.pricing = Array.isArray(data?.pricing) ? data.pricing.filter((p: any) => p && typeof p.price === 'number') : [];
        result.flights = Array.isArray(data?.flights) ? data.flights : [];
        result.inclusions = Array.isArray(data?.inclusions) ? data.inclusions : [];
        result.exclusions = Array.isArray(data?.exclusions) ? data.exclusions : [];
        result.dailyBreakdown = Array.isArray(data?.dailyBreakdown) ? data.dailyBreakdown : [];
        
        // Log extraction quality
        const hasData = result.destinations.length > 0 || result.pricing.length > 0 || result.dailyBreakdown.length > 0;
        if (!hasData) {
            console.warn(`⚠️ Extraction for "${sourceName}" returned minimal data`);
        } else {
            console.log(`✅ Extracted: ${result.destinations.length} destinations, ${result.pricing.length} prices, ${result.dailyBreakdown.length} days`);
        }
    } catch (e) {
        console.error('Error validating itinerary data:', e);
    }
    
    return result;
};

/**
 * Analyze itinerary and extract structured data
 */
export const analyzeItinerary = async (itineraryText: string, language: string): Promise<ItineraryData> => {
    const isImage = itineraryText.startsWith('data:image');
    
    // Check for empty or very short content
    if (!isImage && (!itineraryText || itineraryText.trim().length < 50)) {
        console.error('❌ Document content too short or empty:', itineraryText?.length || 0, 'chars');
        return createDefaultItinerary('Empty Document');
    }
    
    console.log(`📊 Analyzing ${isImage ? 'image' : 'text'} document (${isImage ? 'image' : itineraryText.length + ' chars'})...`);
    
    const systemPrompt = `You are an expert travel itinerary analyzer specializing in extracting structured data from travel documents.

CRITICAL INSTRUCTIONS:
1. Extract EVERYTHING you can find - even partial information is valuable
2. For any missing field, still include it with empty array [] or "Not specified"
3. Look for: tour codes, dates, prices in any currency, city names, hotel names, flight numbers
4. Thai text: Look for prices like "25,999 บาท" or "THB", dates, and location names
5. Infer duration from daily breakdown if not explicitly stated (count the days)
6. For pricing, extract the number only (e.g., 25999 not "25,999")

REQUIRED JSON OUTPUT:
{
  "tourName": "string - tour name/code from document header",
  "duration": "string - e.g., '7 Days / 6 Nights' or '7D/6N'",
  "destinations": ["list ALL cities/places mentioned as stops"],
  "pricing": [{"period": "date range or season", "price": 25999, "currency": "THB"}],
  "flights": [{"flightNumber": "XX123", "origin": "BKK", "destination": "TAO", "departureTime": "08:00", "arrivalTime": "13:00", "flightTime": "4h 30m"}],
  "inclusions": ["hotels", "meals", "transfers", "guides", "entrance fees", etc.],
  "exclusions": ["tips", "personal expenses", "optional tours", etc.],
  "dailyBreakdown": [{"day": 1, "title": "Day 1 Title", "activities": "detailed activities", "meals": ["B","L","D"], "locations": ["Place1", "Place2"]}]
}

Response language: ${language}`;

    const userPrompt = isImage 
        ? `Analyze this travel itinerary image. Extract ALL visible text and data including:
- Tour name/code (usually at top)
- Duration (days/nights)
- All destinations and cities
- All prices shown
- Flight details if visible
- Daily schedule/activities
- What's included and excluded

Be thorough - extract every detail visible in the image.`
        : `Extract all travel itinerary information from this document:

---
${itineraryText.substring(0, 30000)}
---

Find and extract: tour name, duration, destinations, pricing, flights, inclusions, exclusions, and daily breakdown.`;

    try {
        const response = await geminiCompletion(userPrompt, {
            model: GEMINI_PRO_MODEL,
            temperature: 0.2, // Lower temperature for more consistent extraction
            jsonMode: true,
            systemInstruction: systemPrompt,
            imageData: isImage ? itineraryText : undefined
        });

        const parsed = JSON.parse(response);
        return validateItineraryData(parsed, parsed?.tourName || 'Extracted');
        
    } catch (e) {
        console.error("❌ Extraction failed:", e);
        
        // Try a simpler extraction as fallback
        try {
            console.log("🔄 Attempting simplified extraction...");
            const simplePrompt = isImage
                ? "List all text you can see in this image as JSON: {\"tourName\": \"\", \"duration\": \"\", \"destinations\": [], \"pricing\": [], \"flights\": [], \"inclusions\": [], \"exclusions\": [], \"dailyBreakdown\": []}"
                : `Extract basic info as JSON: {"tourName": "", "duration": "", "destinations": [], "pricing": [], "flights": [], "inclusions": [], "exclusions": [], "dailyBreakdown": []}\n\nDocument:\n${itineraryText.substring(0, 5000)}`;
            
            const fallbackResponse = await geminiCompletion(simplePrompt, {
                model: GEMINI_FLASH_MODEL,
                temperature: 0.1,
                jsonMode: true,
                imageData: isImage ? itineraryText : undefined
            });
            
            const fallbackParsed = JSON.parse(fallbackResponse);
            return validateItineraryData(fallbackParsed, 'Partial Extraction');
        } catch (fallbackError) {
            console.error("❌ Fallback extraction also failed:", fallbackError);
            return createDefaultItinerary('Extraction Failed');
        }
    }
};

/**
 * Compare multiple itineraries with RAG-enhanced analysis
 */
export const getComparison = async (
    competitors: (Competitor | SavedCompetitor)[], 
    language: string,
    ragContext?: string
): Promise<string> => {
    // Build structured competitor data for cleaner comparison
    const competitorData = competitors.map(c => ({
        name: c.name,
        tourName: c.analysis?.tourName || 'N/A',
        duration: c.analysis?.duration || 'N/A',
        destinations: c.analysis?.destinations?.join(', ') || 'N/A',
        destinationCount: c.analysis?.destinations?.length || 0,
        pricing: c.analysis?.pricing?.map(p => `${p.price} ${p.currency} (${p.period})`).join('; ') || 'N/A',
        avgPrice: c.analysis?.pricing?.[0]?.price || 0,
        inclusions: c.analysis?.inclusions?.slice(0, 5).join(', ') || 'N/A',
        exclusions: c.analysis?.exclusions?.slice(0, 3).join(', ') || 'N/A',
        meals: c.analysis?.dailyBreakdown?.flatMap(d => d.meals || []).filter((v, i, a) => a.indexOf(v) === i).join(',') || 'N/A',
        flights: c.analysis?.flights?.map(f => `${f.flightNumber}: ${f.origin}-${f.destination}`).join('; ') || 'N/A',
        daysCount: c.analysis?.dailyBreakdown?.length || 0
    }));

    const competitorSummaries = competitorData.map(c => 
        `### ${c.name}
- Tour: ${c.tourName}
- Duration: ${c.duration} (${c.daysCount} days)
- Destinations (${c.destinationCount}): ${c.destinations}
- Pricing: ${c.pricing}
- Meals included: ${c.meals}
- Key inclusions: ${c.inclusions}
- Flights: ${c.flights}`
    ).join('\n\n');

    const ragSection = ragContext 
        ? `\n## Market Reference Data from Knowledge Base\n${ragContext}\n` 
        : '';

    // Use all competitors for comparison
    const columnHeaders = competitors.map(c => c.name).join(' | ');

    const systemPrompt = `You are a senior travel industry analyst with expertise in competitive analysis.

CRITICAL TABLE FORMATTING RULES:
1. Create a MARKDOWN TABLE with EXACTLY ${competitors.length + 1} columns (Aspect + ${competitors.length} competitors)
2. Each row must have the SAME number of cells separated by |
3. Keep cell values SHORT (max 20 characters per cell, use abbreviations when needed)
4. Use these abbreviations: B=Breakfast, L=Lunch, D=Dinner, THB=Thai Baht, d=days, n=nights
5. For tables with many columns (${competitors.length}+), ensure all values are concise

Your analysis should be:
- Data-driven and specific (use numbers, percentages, days)
- Comparative (highlight relative strengths/weaknesses)
- Actionable (what can be improved)
${ragContext ? '- Reference the market data from Knowledge Base when relevant' : ''}

Respond in ${language} using professional markdown format.`;

    const userPrompt = `Compare these ${competitors.length} travel products:

${competitorSummaries}
${ragSection}

Create a comparison with:

## 1. Product Comparison Matrix

Create a table with these EXACT columns: | Aspect | ${columnHeaders} |

Include these rows (keep values SHORT, max 20 chars):
- Duration (e.g., "7D/6N")
- Total Price (e.g., "25,999 THB")
- Price/Day (e.g., "~3,714 THB")
- Dest. Count (e.g., "6")
- Incl. Meals (e.g., "B,L,D")
- Activities (e.g., "High/Med/Low")
- Flight Quality (e.g., "Regional/Intl")
- Accom. Level (e.g., "4-star")

## 2. Value Analysis
Brief price-to-value comparison (2-3 sentences per product)

## 3. Strengths & Weaknesses  
For each product: 2 strengths, 2 areas for improvement

## 4. Competitive Insights
- Best value product
- Key differentiators
- Recommendations

### Conclusion
2-3 sentence summary of key findings.`;

    return await geminiCompletion(userPrompt, { 
        model: GEMINI_PRO_MODEL,
        systemInstruction: systemPrompt
    });
};

/**
 * Generate strategic recommendations with RAG-enhanced context
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

    const pastAnalysesSummary = pastAnalyses.slice(0, 5).map(record => 
        `- ${new Date(record.createdAt).toLocaleDateString()}: ${record.competitors.map(c => c.name).join(' vs ')}`
    ).join('\n');

    const ragSection = ragContext 
        ? `\n## Industry Knowledge Base Context\n${ragContext}\n` 
        : '';

    const systemPrompt = `You are a strategic travel consultant with deep industry expertise. Provide comprehensive, actionable insights and recommendations based on itinerary analysis. 
            
When analyzing:
1. Consider market positioning and competitive differentiation
2. Identify pricing strategies and value propositions
3. Analyze destination choices and route optimization
4. Evaluate service inclusions vs. market standards
5. Suggest specific improvements with business impact
6. Reference similar products from the knowledge base when relevant

Respond in ${language} using markdown format with clear sections.`;

    const userPrompt = `Provide strategic deep-dive recommendations for these travel products:

## Current Analysis
${currentAnalysisSummary}
${ragSection}
${pastAnalyses.length > 0 ? `## Historical Context\n${pastAnalysesSummary}` : ''}

Please analyze:
1. **Product Positioning** - How does each product fit in the market?
2. **Pricing Analysis** - Is pricing competitive? Value for money?
3. **Unique Selling Points** - What makes each product stand out?
4. **Areas for Improvement** - Specific, actionable recommendations
5. **Market Opportunities** - Untapped potential or gaps
6. **Competitive Threats** - What competitors are doing better?`;

    return await geminiCompletion(userPrompt, { 
        model: GEMINI_PRO_MODEL,
        systemInstruction: systemPrompt
    });
};

/**
 * Geocode locations
 */
export const getCoordinatesForLocations = async (locations: string[]): Promise<Record<string, { lat: number; lng: number }>> => {
    if (locations.length === 0) return {};

    const systemPrompt = `You are a geocoding assistant. Return coordinates as a JSON array: [{"name": "location", "lat": number, "lng": number}]. Only include locations you can accurately geocode.`;
    
    const userPrompt = `Provide coordinates for these locations: ${locations.join(', ')}`;

    const response = await geminiCompletion(userPrompt, {
        model: GEMINI_FLASH_MODEL, // Use faster model for simple tasks
        temperature: 0,
        jsonMode: true,
        systemInstruction: systemPrompt
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

    const response = await geminiCompletion(
        `Calculate approximate driving distance and duration for: ${route}`,
        {
            model: GEMINI_FLASH_MODEL,
            temperature: 0,
            jsonMode: true,
            systemInstruction: 'You are a route calculator. Return JSON: {"distance": "X km", "duration": "X hours Y minutes"}'
        }
    );

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
    return await getGeminiEmbedding(text);
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
    // Build conversation history
    const historyText = chatHistory.slice(-5).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 2000)}`
    ).join('\n\n');

    const systemPrompt = `You are a helpful travel assistant. Answer questions based on the provided documents. If the answer is not in the documents, say so. Respond in ${language}.

## Available Documents
${contextText.substring(0, 100000)}`; // Gemini can handle much larger context

    const userPrompt = historyText 
        ? `Previous conversation:\n${historyText}\n\nNew question: ${question}`
        : question;

    return await geminiCompletion(userPrompt, {
        model: GEMINI_PRO_MODEL,
        systemInstruction: systemPrompt
    });
};
