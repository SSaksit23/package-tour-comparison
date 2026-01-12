/**
 * AI Service - OpenAI Implementation
 * Handles all LLM interactions using OpenAI's API
 */

import { ItineraryData, Competitor, SavedCompetitor, AnalysisRecord, ChatMessage, GeoLocation } from '../types';

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Debug: Log API key status on load
if (OPENAI_API_KEY) {
    console.log('🔑 OpenAI API Key loaded:', OPENAI_API_KEY.substring(0, 7) + '...' + OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4));
} else {
    console.error('❌ OpenAI API Key is NOT SET! Embeddings will fail.');
    console.error('   Add OPENAI_API_KEY=sk-your-key to your .env file');
}

// Models
const CHAT_MODEL = 'gpt-4o';  // Main model for complex tasks
const FAST_MODEL = 'gpt-4o-mini';  // Faster model for simpler tasks
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Make a request to OpenAI Chat API with automatic retry for rate limits
 */
async function chatCompletion(
    messages: { role: 'system' | 'user' | 'assistant'; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[],
    options: {
        model?: string;
        temperature?: number;
        jsonMode?: boolean;
        maxRetries?: number;
    } = {}
): Promise<string> {
    const { model = CHAT_MODEL, temperature = 0.7, jsonMode = false, maxRetries = 3 } = options;

    if (!OPENAI_API_KEY) {
        throw new Error('API key is missing. Please provide a valid API key.');
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
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
                const errorMessage = error.error?.message || `OpenAI API error: ${response.status}`;
                
                // Handle rate limiting with exponential backoff
                if (response.status === 429) {
                    // Extract wait time from error message if available (e.g., "Please try again in 7.874s")
                    const waitTimeMatch = errorMessage.match(/try again in (\d+\.?\d*)s/i);
                    let waitTime = waitTimeMatch 
                        ? Math.ceil(parseFloat(waitTimeMatch[1]) * 1000) + 500 // Add 500ms buffer
                        : Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s
                    
                    if (attempt < maxRetries) {
                        console.log(`⏳ Rate limited (attempt ${attempt}/${maxRetries}). Waiting ${(waitTime/1000).toFixed(1)}s before retry...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                }
                
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (attempt > 1) {
                console.log(`✅ Request succeeded on attempt ${attempt}`);
            }
            return data.choices[0].message.content;
            
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            // For non-rate-limit errors, still retry with backoff
            const waitTime = 1000 * attempt;
            console.log(`⚠️ Request failed (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.log(`⏳ Retrying in ${waitTime}ms...`);
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
    
    throw new Error('All API request attempts failed');
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw error;
    }
}

/**
 * Generate embeddings using OpenAI with timeout and retry
 */
async function getEmbedding(text: string, retries: number = 2): Promise<number[]> {
    if (!OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY is missing! Check your .env file.');
        throw new Error('API key is missing for embeddings. Please set OPENAI_API_KEY in .env');
    }

    const cleanText = text.substring(0, 8000).trim();
    if (!cleanText) {
        console.warn('⚠️ Empty text provided for embedding');
        return [];
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`🔄 Embedding attempt ${attempt}/${retries}...`);
            
            const response = await fetchWithTimeout(`${OPENAI_BASE_URL}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: EMBEDDING_MODEL,
                    input: cleanText
                })
            }, 30000); // 30 second timeout

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                const errorMsg = error.error?.message || `Embedding API error: ${response.status}`;
                console.error(`❌ Embedding failed: ${errorMsg}`);
                
                // Rate limit - wait and retry
                if (response.status === 429) {
                    const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
                    console.log(`⏳ Rate limited, waiting ${waitTime}ms...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                }
                
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log(`✅ Embedding generated successfully`);
            return data.data[0].embedding;
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Embedding attempt ${attempt} failed: ${errorMsg}`);
            
            if (attempt < retries) {
                const waitTime = 1000 * attempt;
                console.log(`⏳ Retrying in ${waitTime}ms...`);
                await new Promise(r => setTimeout(r, waitTime));
            } else {
                throw error;
            }
        }
    }
    
    throw new Error('All embedding attempts failed');
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
 * Compare multiple itineraries with RAG-enhanced analysis
 */
export const getComparison = async (
    competitors: (Competitor | SavedCompetitor)[], 
    language: string,
    ragContext?: string // Optional RAG context for market comparison
): Promise<string> => {
    const competitorDetails = competitors.map(c => {
        const contentSnippet = c.itineraryText.startsWith('data:image') 
            ? "[Image Content Analyzed]" 
            : c.itineraryText.substring(0, 1000) + "...";
        return `### ${c.name}\nContent Snippet: ${contentSnippet}\n\nANALYSIS:\n${JSON.stringify(c.analysis, null, 2)}`;
    }).join('\n\n---\n\n');

    // Enhanced context from knowledge base
    const ragSection = ragContext 
        ? `\n## Market Reference Data\n${ragContext}\n` 
        : '';

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a senior travel industry analyst with expertise in competitive analysis. 
            
Your analysis should be:
- Data-driven and specific (use numbers, percentages, days)
- Comparative (highlight relative strengths/weaknesses)  
- Actionable (what can be improved based on comparison)
- Market-aware (reference industry standards when available)

Respond in ${language} using professional markdown format.`
        },
        { 
            role: 'user' as const, 
            content: `Perform a comprehensive comparison of these travel products:

${competitorDetails}
${ragSection}

Create a detailed analysis with:

## 1. Product Comparison Matrix
| Aspect | ${competitors.map(c => c.name).join(' | ')} |
Include: Duration, Price/day, Destinations count, Included meals, Activities, Flight quality, Accommodation level

## 2. Value Analysis
Compare price-to-value ratio for each product

## 3. Strengths & Weaknesses
For each product, list top 3 strengths and areas for improvement

## 4. Target Customer Profile
Who is the ideal customer for each product?

## 5. Competitive Insights
- Which product offers best value?
- Which has unique differentiators?
- Market positioning recommendations

### Conclusion
Summarize key findings and strategic recommendations.`
        }
    ];

    return await chatCompletion(messages, { model: CHAT_MODEL });
};

/**
 * Generate strategic recommendations with RAG-enhanced context
 */
export const getRecommendations = async (
    analyzedCompetitors: (Competitor | SavedCompetitor)[], 
    pastAnalyses: AnalysisRecord[],
    language: string,
    ragContext?: string // Optional RAG context from knowledge base
): Promise<string> => {
    const currentAnalysisSummary = analyzedCompetitors.map(c => 
        `### ${c.name}\n${JSON.stringify(c.analysis, null, 2)}`
    ).join('\n\n');

    const pastAnalysesSummary = pastAnalyses.slice(0, 5).map(record => 
        `- ${new Date(record.createdAt).toLocaleDateString()}: ${record.competitors.map(c => c.name).join(' vs ')}`
    ).join('\n');

    // Enhanced prompt with RAG context
    const ragSection = ragContext 
        ? `\n## Industry Knowledge Base Context\n${ragContext}\n` 
        : '';

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a strategic travel consultant with deep industry expertise. Provide comprehensive, actionable insights and recommendations based on itinerary analysis. 
            
When analyzing:
1. Consider market positioning and competitive differentiation
2. Identify pricing strategies and value propositions
3. Analyze destination choices and route optimization
4. Evaluate service inclusions vs. market standards
5. Suggest specific improvements with business impact
6. Reference similar products from the knowledge base when relevant

Respond in ${language} using markdown format with clear sections.`
        },
        { 
            role: 'user' as const, 
            content: `Provide strategic deep-dive recommendations for these travel products:

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
6. **Competitive Threats** - What competitors are doing better?`
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
 * Truncate text to approximate token limit (rough estimate: 4 chars = 1 token)
 */
function truncateToTokenLimit(text: string, maxTokens: number = 15000): string {
    const maxChars = maxTokens * 4; // Rough approximation
    if (text.length <= maxChars) return text;
    
    console.warn(`⚠️ Truncating context from ${text.length} to ${maxChars} chars (~${maxTokens} tokens)`);
    return text.substring(0, maxChars) + '\n\n[Context truncated due to size limit...]';
}

/**
 * Generate answer for Q&A
 */
export const generateAnswer = async (
    chatHistory: ChatMessage[], 
    contextText: string, 
    question: string,
    language: string
): Promise<string> => {
    // Limit chat history to last 5 messages to save tokens
    const historyMessages = chatHistory.slice(-5).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.substring(0, 2000) // Truncate long messages
    }));

    // Truncate context to fit within token limits (~15k tokens for context)
    const truncatedContext = truncateToTokenLimit(contextText, 15000);

    const messages = [
        { 
            role: 'system' as const, 
            content: `You are a helpful travel assistant. Answer questions based on the provided documents. If the answer is not in the documents, say so. Respond in ${language}.

## Available Documents
${truncatedContext}`
        },
        ...historyMessages,
        { role: 'user' as const, content: question.substring(0, 2000) }
    ];

    return await chatCompletion(messages, { model: CHAT_MODEL });
};

