/**
 * Thai RAG Service
 * Language-aware RAG with OpenThaiGPT integration for Thai documents
 * Reference: https://github.com/OpenThaiGPT/openthairag
 */

import { Document, ChatMessage } from '../types';
import { embedText as openaiEmbed, generateAnswer } from './aiProvider';

// Thai character detection patterns
const THAI_PATTERN = /[\u0E00-\u0E7F]/;
const THAI_THRESHOLD = 0.3; // If 30%+ of characters are Thai, treat as Thai document

// OpenThaiGPT API configuration (can be self-hosted or cloud)
const OPENTHAI_API_URL = process.env.OPENTHAI_API_URL || 'http://localhost:5000';
const OPENTHAI_ENABLED = process.env.OPENTHAI_ENABLED === 'true';

// Language detection cache
const languageCache = new Map<string, 'thai' | 'english' | 'mixed'>();

/**
 * Detect if text is primarily Thai, English, or mixed
 */
export function detectLanguage(text: string): 'thai' | 'english' | 'mixed' {
    // Check cache first (use first 100 chars as key)
    const cacheKey = text.substring(0, 100);
    if (languageCache.has(cacheKey)) {
        return languageCache.get(cacheKey)!;
    }
    
    // Count Thai characters
    const cleanText = text.replace(/\s+/g, '');
    if (cleanText.length === 0) return 'english';
    
    let thaiCount = 0;
    for (const char of cleanText) {
        if (THAI_PATTERN.test(char)) {
            thaiCount++;
        }
    }
    
    const thaiRatio = thaiCount / cleanText.length;
    
    let result: 'thai' | 'english' | 'mixed';
    if (thaiRatio >= THAI_THRESHOLD) {
        result = thaiRatio >= 0.7 ? 'thai' : 'mixed';
    } else {
        result = 'english';
    }
    
    // Cache the result
    languageCache.set(cacheKey, result);
    return result;
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
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
 * Get Thai-optimized embeddings using OpenThaiGPT
 * Falls back to OpenAI if OpenThaiGPT is not available
 */
async function getThaiEmbedding(text: string): Promise<number[]> {
    if (!OPENTHAI_ENABLED) {
        // Use OpenAI with Thai-aware preprocessing
        console.log('🔄 Using OpenAI for Thai embedding (OpenThaiGPT not enabled)');
        return await openaiEmbed(preprocessThaiText(text));
    }
    
    try {
        console.log('🇹🇭 Calling OpenThaiGPT embedding API...');
        const response = await fetchWithTimeout(`${OPENTHAI_API_URL}/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: text.substring(0, 8000),
                model: 'openthaigpt-embedding'
            })
        }, 15000); // 15 second timeout
        
        if (!response.ok) {
            throw new Error(`OpenThaiGPT API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ OpenThaiGPT embedding generated');
        return data.data?.[0]?.embedding || [];
    } catch (error) {
        console.warn('⚠️ OpenThaiGPT embedding failed, falling back to OpenAI:', error);
        return await openaiEmbed(preprocessThaiText(text));
    }
}

/**
 * Preprocess Thai text for better embedding with OpenAI
 * - Add word boundaries (Thai doesn't have spaces between words)
 * - Normalize whitespace
 * - Handle mixed Thai-English text
 */
function preprocessThaiText(text: string): string {
    // Normalize whitespace
    let processed = text.replace(/\s+/g, ' ').trim();
    
    // Add context markers for Thai content
    const language = detectLanguage(text);
    if (language === 'thai' || language === 'mixed') {
        // Add language hint for OpenAI to better understand context
        processed = `[Thai Document] ${processed}`;
    }
    
    return processed;
}

/**
 * Language-aware text embedding
 * Automatically selects the best embedding model based on content language
 */
export async function smartEmbed(text: string): Promise<{ embedding: number[]; language: string }> {
    const language = detectLanguage(text);
    
    let embedding: number[];
    
    if (language === 'thai' || language === 'mixed') {
        console.log(`🇹🇭 Using Thai-optimized embedding for ${language} text`);
        embedding = await getThaiEmbedding(text);
    } else {
        console.log(`🇺🇸 Using standard embedding for English text`);
        embedding = await openaiEmbed(text);
    }
    
    return { embedding, language };
}

/**
 * Thai-aware text chunking
 * Better handles Thai sentence boundaries
 */
export function chunkThaiText(text: string, maxChunkSize: number = 1000): { text: string; language: string }[] {
    const language = detectLanguage(text);
    
    // Thai sentence delimiters (includes Thai punctuation)
    const thaiDelimiters = /([.!?。！？\u0E2F\u0E5A\u0E5B])\s*/g;
    const englishDelimiters = /([.!?])\s+/g;
    
    const delimiter = language === 'english' ? englishDelimiters : thaiDelimiters;
    
    // Split into sentences
    const sentences = text.split(delimiter).filter(s => s.trim().length > 0);
    
    const chunks: { text: string; language: string }[] = [];
    let currentChunk = '';
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push({ 
                text: currentChunk.trim(), 
                language: detectLanguage(currentChunk) 
            });
            currentChunk = '';
        }
        currentChunk += sentence + ' ';
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push({ 
            text: currentChunk.trim(), 
            language: detectLanguage(currentChunk) 
        });
    }
    
    return chunks;
}

/**
 * Enhanced entity extraction for Thai text
 */
export async function extractThaiEntities(text: string): Promise<{ name: string; type: string; language: string }[]> {
    const language = detectLanguage(text);
    
    // Thai-specific entity patterns
    const thaiLocationPatterns = [
        /จังหวัด(\S+)/g,          // Province: จังหวัด...
        /อำเภอ(\S+)/g,           // District: อำเภอ...
        /วัด(\S+)/g,             // Temple: วัด...
        /ถนน(\S+)/g,             // Road: ถนน...
        /สนามบิน(\S+)/g,         // Airport: สนามบิน...
        /โรงแรม(\S+)/g,          // Hotel: โรงแรม...
        /หาด(\S+)/g,             // Beach: หาด...
        /เกาะ(\S+)/g,            // Island: เกาะ...
        /ภูเขา(\S+)/g,           // Mountain: ภูเขา...
        /น้ำตก(\S+)/g,           // Waterfall: น้ำตก...
    ];
    
    const thaiPricePatterns = [
        /(\d{1,3}(,\d{3})*)\s*บาท/g,  // Thai Baht: X,XXX บาท
        /THB\s*(\d{1,3}(,\d{3})*)/gi, // THB X,XXX
    ];
    
    const thaiDatePatterns = [
        /(\d{1,2})\s*(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{4})?/g,
        /วันที่\s*(\d{1,2})/g,
    ];
    
    const entities: { name: string; type: string; language: string }[] = [];
    
    if (language === 'thai' || language === 'mixed') {
        // Extract Thai locations
        for (const pattern of thaiLocationPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                entities.push({
                    name: match[0],
                    type: 'LOCATION',
                    language: 'thai'
                });
            }
        }
        
        // Extract Thai prices
        for (const pattern of thaiPricePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                entities.push({
                    name: match[0],
                    type: 'PRICE',
                    language: 'thai'
                });
            }
        }
        
        // Extract Thai dates
        for (const pattern of thaiDatePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                entities.push({
                    name: match[0],
                    type: 'DATE',
                    language: 'thai'
                });
            }
        }
    }
    
    // Also extract English entities for mixed documents
    if (language === 'english' || language === 'mixed') {
        // Standard entity extraction patterns
        const locationPatterns = [
            /(?:Bangkok|Phuket|Chiang Mai|Krabi|Pattaya|Koh Samui|Hua Hin|Ayutthaya)/gi,
            /(?:Hotel|Resort|Airport|Temple|Beach|Island)\s+[\w\s]+/gi,
        ];
        
        for (const pattern of locationPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                entities.push({
                    name: match[0].trim(),
                    type: 'LOCATION',
                    language: 'english'
                });
            }
        }
    }
    
    // Deduplicate
    const seen = new Set<string>();
    return entities.filter(e => {
        const key = `${e.name}-${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Generate Thai-aware RAG response
 * Uses OpenThaiGPT for Thai queries, OpenAI for English
 */
export async function generateThaiAwareAnswer(
    chatHistory: ChatMessage[],
    contextText: string,
    question: string,
    language: string
): Promise<string> {
    const questionLanguage = detectLanguage(question);
    const contextLanguage = detectLanguage(contextText);
    
    console.log(`📝 Question language: ${questionLanguage}, Context language: ${contextLanguage}`);
    
    // If using OpenThaiGPT and question is in Thai
    if (OPENTHAI_ENABLED && (questionLanguage === 'thai' || questionLanguage === 'mixed')) {
        try {
            const prompt = buildThaiPrompt(chatHistory, contextText, question, language);
            
            const response = await fetch(`${OPENTHAI_API_URL}/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    max_tokens: 2048,
                    temperature: 0.7,
                    stop: ['<|im_end|>']
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.choices?.[0]?.text || '';
            }
        } catch (error) {
            console.warn('OpenThaiGPT completion failed, falling back to OpenAI:', error);
        }
    }
    
    // Fall back to OpenAI
    return await generateAnswer(chatHistory, contextText, question, language);
}

/**
 * Build Thai-optimized prompt for OpenThaiGPT
 */
function buildThaiPrompt(
    chatHistory: ChatMessage[],
    contextText: string,
    question: string,
    language: string
): string {
    const historyText = chatHistory
        .slice(-5)
        .map(m => `${m.role === 'user' ? 'ผู้ใช้' : 'ผู้ช่วย'}: ${m.content}`)
        .join('\n');
    
    return `<|im_start|>system
คุณคือผู้ช่วยการท่องเที่ยวที่เป็นประโยชน์ ตอบคำถามโดยอ้างอิงจากเอกสารที่ให้มา ถ้าคำตอบไม่อยู่ในเอกสาร ให้บอกตามตรง

## เอกสารอ้างอิง
${contextText}
<|im_end|>
${historyText ? `\n${historyText}` : ''}
<|im_start|>user
${question}
<|im_end|>
<|im_start|>assistant
`;
}

/**
 * Language statistics for a document collection
 */
export function getLanguageStats(documents: Document[]): {
    thai: number;
    english: number;
    mixed: number;
    total: number;
} {
    let thai = 0, english = 0, mixed = 0;
    
    for (const doc of documents) {
        const lang = detectLanguage(doc.text);
        if (lang === 'thai') thai++;
        else if (lang === 'english') english++;
        else mixed++;
    }
    
    return { thai, english, mixed, total: documents.length };
}

export default {
    detectLanguage,
    smartEmbed,
    chunkThaiText,
    extractThaiEntities,
    generateThaiAwareAnswer,
    getLanguageStats
};

