/**
 * Multimodal RAG Service
 * Handles PDF, Word, and Image documents with vision-based understanding
 */

import { Document } from '../types';
import { detectLanguage, smartEmbed } from './thaiRagService';

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const VISION_MODEL = 'gpt-4o';

export interface MultimodalChunk {
    text: string;
    type: 'text' | 'image' | 'table' | 'layout';
    imageData?: string; // Base64 for images
    pageNumber?: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
    language: string;
}

export interface MultimodalDocument {
    id: number;
    name: string;
    fileType: 'pdf' | 'docx' | 'image' | 'text';
    chunks: MultimodalChunk[];
    metadata: {
        pageCount?: number;
        hasImages: boolean;
        hasTables: boolean;
        languages: string[];
        extractedAt: string;
    };
}

/**
 * Detect file type from name or content
 */
export function detectFileType(fileName: string, content?: string): 'pdf' | 'docx' | 'image' | 'text' {
    const ext = fileName.toLowerCase().split('.').pop();
    
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image';
    if (content?.startsWith('data:image')) return 'image';
    
    return 'text';
}

/**
 * Extract text and visual elements from an image using GPT-4 Vision
 */
async function extractFromImage(imageData: string, context?: string): Promise<{
    text: string;
    elements: { type: string; content: string }[];
}> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key required for image processing');
    }

    const systemPrompt = `You are a document analysis expert. Extract ALL text and structured information from this image.

For travel itineraries, focus on:
- Tour names, dates, durations
- Destinations and locations
- Prices and currencies (including Thai Baht บาท)
- Flight details
- Hotel/accommodation names
- Activities and inclusions
- Any tables or schedules

Return a JSON object:
{
    "extractedText": "Full text content from the image",
    "elements": [
        {"type": "title", "content": "..."},
        {"type": "table", "content": "..."},
        {"type": "price", "content": "..."},
        {"type": "location", "content": "..."},
        {"type": "date", "content": "..."}
    ],
    "language": "thai" | "english" | "mixed"
}`;

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: VISION_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
                        { type: 'text', text: context || 'Extract all text and information from this document image.' }
                    ]
                }
            ],
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Vision API error: ${response.status}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    return {
        text: result.extractedText || '',
        elements: result.elements || []
    };
}

/**
 * Process a PDF page as an image (for PDFs with complex layouts)
 */
async function processPDFPageAsImage(pageImageData: string, pageNumber: number): Promise<MultimodalChunk[]> {
    const { text, elements } = await extractFromImage(
        pageImageData,
        `This is page ${pageNumber} of a PDF document. Extract all text, tables, and visual information.`
    );

    const chunks: MultimodalChunk[] = [];
    const language = detectLanguage(text);

    // Main text chunk
    if (text.trim()) {
        chunks.push({
            text,
            type: 'text',
            pageNumber,
            language
        });
    }

    // Element-specific chunks (tables, etc.)
    for (const element of elements) {
        if (element.type === 'table' && element.content) {
            chunks.push({
                text: element.content,
                type: 'table',
                pageNumber,
                language
            });
        }
    }

    return chunks;
}

/**
 * Enhanced text chunking that preserves document structure
 */
export function structuredChunk(
    text: string,
    options: {
        maxChunkSize?: number;
        preserveStructure?: boolean;
    } = {}
): MultimodalChunk[] {
    const { maxChunkSize = 1000, preserveStructure = true } = options;
    const language = detectLanguage(text);
    const chunks: MultimodalChunk[] = [];

    if (!preserveStructure) {
        // Simple chunking
        const words = text.split(/\s+/);
        let currentChunk = '';

        for (const word of words) {
            if ((currentChunk + ' ' + word).length > maxChunkSize && currentChunk) {
                chunks.push({ text: currentChunk.trim(), type: 'text', language });
                currentChunk = word;
            } else {
                currentChunk += ' ' + word;
            }
        }

        if (currentChunk.trim()) {
            chunks.push({ text: currentChunk.trim(), type: 'text', language });
        }

        return chunks;
    }

    // Structure-aware chunking
    // Split by sections (headers, paragraphs, etc.)
    const sections = text.split(/\n{2,}|(?=#{1,3}\s)|(?=\d+\.\s+[A-Z])|(?=Day\s+\d+)|(?=วันที่\s*\d+)/gi);

    let currentChunk = '';

    for (const section of sections) {
        const trimmedSection = section.trim();
        if (!trimmedSection) continue;

        // Check if this looks like a table
        const isTable = /\|.*\|/.test(trimmedSection) || /\t.*\t/.test(trimmedSection);

        if (isTable) {
            // Save current text chunk
            if (currentChunk.trim()) {
                chunks.push({ text: currentChunk.trim(), type: 'text', language });
                currentChunk = '';
            }
            // Add table as separate chunk
            chunks.push({ text: trimmedSection, type: 'table', language });
            continue;
        }

        if ((currentChunk + '\n\n' + trimmedSection).length > maxChunkSize && currentChunk) {
            chunks.push({ text: currentChunk.trim(), type: 'text', language });
            currentChunk = trimmedSection;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmedSection;
        }
    }

    if (currentChunk.trim()) {
        chunks.push({ text: currentChunk.trim(), type: 'text', language });
    }

    return chunks;
}

/**
 * Process an image document
 */
export async function processImageDocument(
    imageData: string,
    fileName: string
): Promise<{ text: string; chunks: MultimodalChunk[] }> {
    console.log(`🖼️ Processing image: ${fileName}`);

    const { text, elements } = await extractFromImage(imageData);
    const language = detectLanguage(text);

    const chunks: MultimodalChunk[] = [
        {
            text,
            type: 'image',
            imageData: imageData.substring(0, 100) + '...', // Store reference only
            language
        }
    ];

    // Add element-specific chunks
    for (const element of elements) {
        if (element.content && element.content.length > 50) {
            chunks.push({
                text: `[${element.type.toUpperCase()}] ${element.content}`,
                type: element.type === 'table' ? 'table' : 'text',
                language
            });
        }
    }

    console.log(`✅ Extracted ${text.length} chars, ${chunks.length} chunks from image`);

    return { text, chunks };
}

/**
 * Process any document type with multimodal understanding
 */
export async function processMultimodalDocument(
    content: string,
    fileName: string,
    fileType?: 'pdf' | 'docx' | 'image' | 'text'
): Promise<{ text: string; chunks: MultimodalChunk[]; metadata: MultimodalDocument['metadata'] }> {
    const type = fileType || detectFileType(fileName, content);
    const startTime = Date.now();

    console.log(`📄 Processing ${type} document: ${fileName}`);

    let text = '';
    let chunks: MultimodalChunk[] = [];
    let hasImages = false;
    let hasTables = false;
    const languages = new Set<string>();

    try {
        if (type === 'image' || content.startsWith('data:image')) {
            // Process as image
            hasImages = true;
            const result = await processImageDocument(content, fileName);
            text = result.text;
            chunks = result.chunks;
        } else {
            // Process as text (already extracted from PDF/DOCX)
            text = content;
            chunks = structuredChunk(text, { maxChunkSize: 800, preserveStructure: true });

            // Check for tables
            hasTables = chunks.some(c => c.type === 'table');
        }

        // Collect languages
        for (const chunk of chunks) {
            languages.add(chunk.language);
        }

        console.log(`✅ Processed in ${Date.now() - startTime}ms: ${chunks.length} chunks, languages: ${[...languages].join(', ')}`);

        return {
            text,
            chunks,
            metadata: {
                hasImages,
                hasTables,
                languages: [...languages],
                extractedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error(`❌ Failed to process ${fileName}:`, error);

        // Fallback to basic text processing
        chunks = structuredChunk(content, { preserveStructure: false });

        return {
            text: content,
            chunks,
            metadata: {
                hasImages: false,
                hasTables: false,
                languages: [detectLanguage(content)],
                extractedAt: new Date().toISOString()
            }
        };
    }
}

/**
 * Generate embeddings for multimodal chunks
 */
export async function embedMultimodalChunks(
    chunks: MultimodalChunk[]
): Promise<{ chunk: MultimodalChunk; embedding: number[] }[]> {
    const results: { chunk: MultimodalChunk; embedding: number[] }[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
            // Add type context to improve embedding quality
            let textToEmbed = chunk.text;
            if (chunk.type === 'table') {
                textToEmbed = `[TABLE DATA] ${chunk.text}`;
            } else if (chunk.type === 'image') {
                textToEmbed = `[IMAGE CONTENT] ${chunk.text}`;
            }

            const { embedding } = await smartEmbed(textToEmbed);
            results.push({ chunk, embedding });

            // Rate limiting
            if (i < chunks.length - 1) {
                await delay(150);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to embed chunk ${i}:`, error);
            results.push({ chunk, embedding: [] });
        }
    }

    return results;
}

/**
 * Describe an image for better context understanding
 */
export async function describeImage(imageData: string): Promise<string> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key required');
    }

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: imageData } },
                        { type: 'text', text: 'Describe this image in detail, focusing on any text, data, or information visible. If this is a document, extract all readable content.' }
                    ]
                }
            ],
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

export default {
    detectFileType,
    processMultimodalDocument,
    processImageDocument,
    structuredChunk,
    embedMultimodalChunks,
    describeImage
};

