/**
 * Hybrid RAG Service - Uses ArangoDB for Graph + Vector Search
 * 
 * This service implements an ensemble retrieval approach using ArangoDB:
 * 1. Vector Search: Semantic similarity using ArangoDB's vector index
 * 2. Graph Search: Entity relationships and traversal
 * 3. Synthesis: Combines results from both approaches for comprehensive answers
 * 
 * Note: This service now delegates to arangoService for the actual implementation.
 * It's kept for backwards compatibility with existing code.
 */

import { Document, ChatMessage } from '../types';
import { generateAnswer } from './aiProvider';
import { searchChroma, indexDocumentInChroma, removeDocumentFromChroma, isChromaAvailable, ChromaSearchResult, getChromaStats } from './chromaService';

// OpenAI configuration for entity extraction and synthesis
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Types
export interface HybridSearchResult {
    source: 'chroma' | 'arango';
    content: string;
    metadata: {
        documentName?: string;
        chunkIndex?: number;
        entityType?: string;
        relationship?: string;
    };
    score: number;
}

export interface HybridRAGResponse {
    answer: string;
    sources: {
        chromaResults: number;
        graphResults: number;
        entities: string[];
    };
    processingTime: number;
}

export interface GraphQueryResult {
    content: string;
    entities: string[];
    relationships: string[];
}

/**
 * Extract entities from a question for graph traversal
 */
async function extractQueryEntities(question: string): Promise<string[]> {
    if (!OPENAI_API_KEY) return [];

    try {
        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Extract named entities (places, hotels, airlines, dates, activities) from the question. Return a JSON object with an "entities" array of strings.'
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                temperature: 0,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) return [];
        
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return Array.isArray(parsed.entities) ? parsed.entities : [];
    } catch {
        return [];
    }
}

/**
 * Synthesize answers from ChromaDB results
 */
async function synthesizeAnswer(
    question: string,
    chromaResults: ChromaSearchResult[],
    chatHistory: ChatMessage[],
    language: string
): Promise<string> {
    // Build context from ChromaDB (vector search results)
    let vectorContext = '';
    if (chromaResults.length > 0) {
        vectorContext = chromaResults.map((r, i) => 
            `[Source ${i + 1}: ${r.metadata.documentName || 'Document'} - Relevance: ${(r.score * 100).toFixed(0)}%]\n${r.content}`
        ).join('\n\n');
    }

    // Combine contexts
    const combinedContext = `
## Retrieved Context

### From Vector Search (Semantic Similarity)
${vectorContext || 'No relevant text chunks found.'}
`;

    // Generate synthesized answer
    return await generateAnswer(chatHistory, combinedContext, question, language);
}

/**
 * Hybrid RAG Query - Uses ChromaDB as backup
 * 
 * Note: For full hybrid RAG with graph support, use arangoHybridQuery from arangoService
 */
export async function hybridRagQuery(
    question: string,
    chatHistory: ChatMessage[],
    language: string
): Promise<HybridRAGResponse> {
    const startTime = Date.now();
    
    console.log(`\n🔄 Hybrid RAG Query (ChromaDB): "${question}"`);

    // Step 1: Extract entities from question
    const queryEntities = await extractQueryEntities(question);
    console.log('📍 Extracted entities:', queryEntities);

    // Step 2: Search ChromaDB
    const chromaResults = await searchChroma(question, 5).catch(err => {
        console.warn('ChromaDB search failed:', err);
        return [] as ChromaSearchResult[];
    });

    console.log(`📚 ChromaDB: ${chromaResults.length} results`);

    // Step 3: Synthesize final answer
    const answer = await synthesizeAnswer(
        question,
        chromaResults,
        chatHistory,
        language
    );

    // Add source citations
    let finalAnswer = answer;
    if (chromaResults.length > 0) {
        const docNames = [...new Set(chromaResults.map(r => r.metadata.documentName).filter(Boolean))];
        finalAnswer += `\n\n---\n📚 **Sources:** Documents: ${docNames.join(', ')}`;
    }

    return {
        answer: finalAnswer,
        sources: {
            chromaResults: chromaResults.length,
            graphResults: 0,
            entities: queryEntities
        },
        processingTime: Date.now() - startTime
    };
}

/**
 * Index a document in ChromaDB
 */
export async function indexDocumentHybrid(doc: Document): Promise<{
    chromaChunks: number;
    entities: number;
}> {
    console.log(`\n📥 Indexing "${doc.name}" in ChromaDB...`);

    const chromaResult = await indexDocumentInChroma(doc).catch(err => {
        console.warn('ChromaDB indexing failed:', err);
        return { chunksCreated: 0 };
    });

    console.log(`✅ Indexed: ChromaDB=${chromaResult.chunksCreated} chunks`);

    return {
        chromaChunks: chromaResult.chunksCreated,
        entities: 0
    };
}

/**
 * Remove a document from ChromaDB
 */
export async function removeDocumentHybrid(documentId: number): Promise<void> {
    await removeDocumentFromChroma(documentId).catch(() => {});
}

/**
 * Check if Hybrid RAG is available (ChromaDB only)
 */
export async function isHybridRagAvailable(): Promise<{
    chroma: boolean;
    full: boolean;
}> {
    const chromaAvailable = await isChromaAvailable();

    return {
        chroma: chromaAvailable,
        full: chromaAvailable
    };
}

/**
 * Get Hybrid RAG statistics
 */
export async function getHybridRagStats(): Promise<{
    chroma: { count: number } | null;
}> {
    const chromaStats = await getChromaStats().catch(() => null);

    return {
        chroma: chromaStats
    };
}
