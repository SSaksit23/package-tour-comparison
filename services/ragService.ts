/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * This service handles the complete RAG pipeline:
 * 1. Document chunking - Split large documents into manageable pieces
 * 2. Vectorization - Generate embeddings using Gemini
 * 3. Storage - Store vectors in Neo4j with graph relationships
 * 4. Retrieval - Semantic search to find relevant chunks
 * 5. Augmentation - Build context for LLM prompts
 */

import { Document } from '../types';
import { embedText, generateAnswer } from './aiProvider';

// OpenAI API configuration for entity extraction
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Neo4j connection config - supports both local and Aura
const NEO4J_URI = (typeof process !== 'undefined' && process.env?.NEO4J_URI) || 'bolt://localhost:7687';
const NEO4J_USER = (typeof process !== 'undefined' && process.env?.NEO4J_USER) || 'neo4j';
const NEO4J_PASSWORD = (typeof process !== 'undefined' && process.env?.NEO4J_PASSWORD) || 'password123';
const isAura = NEO4J_URI.includes('neo4j.io') || NEO4J_URI.includes('neo4j+s://');

// RAG Configuration
const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 200; // Overlap between chunks for context continuity
const TOP_K_CHUNKS = 5; // Number of chunks to retrieve
const SIMILARITY_THRESHOLD = 0.7; // Minimum similarity score

// Types
export interface DocumentChunk {
    id: string;
    documentId: number;
    documentName: string;
    chunkIndex: number;
    text: string;
    embedding: number[];
    metadata: ChunkMetadata;
}

export interface ChunkMetadata {
    startChar: number;
    endChar: number;
    wordCount: number;
    entities: string[];
}

export interface RetrievalResult {
    chunk: DocumentChunk;
    score: number;
    context: string;
}

export interface RAGResponse {
    answer: string;
    sources: { documentName: string; chunkIndex: number; relevance: number }[];
    processingTime: number;
}

/**
 * Split document text into overlapping chunks
 */
function chunkDocument(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): { text: string; start: number; end: number }[] {
    const chunks: { text: string; start: number; end: number }[] = [];
    
    // Clean and normalize text
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    if (cleanText.length <= chunkSize) {
        return [{ text: cleanText, start: 0, end: cleanText.length }];
    }

    let start = 0;
    while (start < cleanText.length) {
        let end = Math.min(start + chunkSize, cleanText.length);
        
        // Try to break at sentence boundary
        if (end < cleanText.length) {
            const lastPeriod = cleanText.lastIndexOf('.', end);
            const lastNewline = cleanText.lastIndexOf('\n', end);
            const breakPoint = Math.max(lastPeriod, lastNewline);
            
            if (breakPoint > start + chunkSize / 2) {
                end = breakPoint + 1;
            }
        }
        
        chunks.push({
            text: cleanText.slice(start, end).trim(),
            start,
            end
        });
        
        start = end - overlap;
        if (start >= cleanText.length) break;
    }
    
    return chunks;
}

/**
 * Extract key entities from chunk for graph relationships
 */
async function extractChunkEntities(text: string): Promise<string[]> {
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
                        content: 'Extract the top 5 most important named entities (places, organizations, dates, prices) from the text. Return ONLY a JSON array of strings, nothing else.' 
                    },
                    { role: 'user', content: text.substring(0, 2000) }
                ],
                temperature: 0,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) return [];
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : parsed.entities || [];
    } catch {
        return [];
    }
}

/**
 * Neo4j RAG Store - Handles vector storage and retrieval
 */
class Neo4jRAGStore {
    private httpUri: string;
    private auth: string;

    constructor() {
        if (isAura) {
            // Neo4j Aura uses HTTPS endpoint
            const auraMatch = NEO4J_URI.match(/([a-z0-9]+)\.databases\.neo4j\.io/);
            if (auraMatch) {
                this.httpUri = `https://${auraMatch[1]}.databases.neo4j.io`;
            } else {
                this.httpUri = NEO4J_URI.replace('neo4j+s://', 'https://').replace('neo4j://', 'https://');
            }
        } else {
            // Local Docker
            this.httpUri = NEO4J_URI.replace('bolt://', 'http://').replace(':7687', ':7474');
        }
        this.auth = 'Basic ' + btoa(`${NEO4J_USER}:${NEO4J_PASSWORD}`);
    }

    private async executeCypher<T = any>(query: string, params: Record<string, any> = {}): Promise<T[]> {
        try {
            const response = await fetch(`${this.httpUri}/db/neo4j/tx/commit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.auth
                },
                body: JSON.stringify({
                    statements: [{ statement: query, parameters: params }]
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (data.errors?.length > 0) throw new Error(data.errors[0].message);
            
            const results = data.results[0];
            if (!results?.data) return [];
            
            return results.data.map((row: any) => {
                const obj: any = {};
                results.columns.forEach((col: string, idx: number) => {
                    obj[col] = row.row[idx];
                });
                return obj;
            });
        } catch (error) {
            console.error('Neo4j query error:', error);
            throw error;
        }
    }

    async checkConnection(): Promise<boolean> {
        try {
            await this.executeCypher('RETURN 1');
            return true;
        } catch {
            return false;
        }
    }

    async initializeRAGSchema(): Promise<void> {
        const queries = [
            'CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE',
            'CREATE INDEX chunk_doc IF NOT EXISTS FOR (c:Chunk) ON (c.documentId)',
            'CREATE INDEX entity_name_rag IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE'
        ];
        
        for (const q of queries) {
            try { await this.executeCypher(q); } catch { /* ignore */ }
        }
    }

    async storeChunk(chunk: DocumentChunk): Promise<void> {
        // Store chunk node with embedding
        await this.executeCypher(`
            MERGE (c:Chunk {id: $id})
            SET c.documentId = $documentId,
                c.documentName = $documentName,
                c.chunkIndex = $chunkIndex,
                c.text = $text,
                c.embedding = $embedding,
                c.startChar = $startChar,
                c.endChar = $endChar,
                c.wordCount = $wordCount
        `, {
            id: chunk.id,
            documentId: chunk.documentId,
            documentName: chunk.documentName,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            embedding: chunk.embedding,
            startChar: chunk.metadata.startChar,
            endChar: chunk.metadata.endChar,
            wordCount: chunk.metadata.wordCount
        });

        // Create entity relationships
        for (const entity of chunk.metadata.entities) {
            await this.executeCypher(`
                MERGE (e:Entity {name: $entity})
                WITH e
                MATCH (c:Chunk {id: $chunkId})
                MERGE (c)-[:MENTIONS]->(e)
            `, { entity, chunkId: chunk.id });
        }

        // Link chunks from same document
        if (chunk.chunkIndex > 0) {
            await this.executeCypher(`
                MATCH (c1:Chunk {documentId: $docId, chunkIndex: $prevIdx})
                MATCH (c2:Chunk {id: $chunkId})
                MERGE (c1)-[:NEXT]->(c2)
            `, {
                docId: chunk.documentId,
                prevIdx: chunk.chunkIndex - 1,
                chunkId: chunk.id
            });
        }
    }

    async deleteDocumentChunks(documentId: number): Promise<void> {
        await this.executeCypher(`
            MATCH (c:Chunk {documentId: $docId})
            DETACH DELETE c
        `, { docId: documentId });
    }

    async vectorSearch(queryEmbedding: number[], topK: number = TOP_K_CHUNKS): Promise<RetrievalResult[]> {
        // Get all chunks with embeddings
        const chunks = await this.executeCypher<{
            id: string;
            documentId: number;
            documentName: string;
            chunkIndex: number;
            text: string;
            embedding: number[];
        }>(`
            MATCH (c:Chunk)
            WHERE c.embedding IS NOT NULL
            RETURN c.id as id, c.documentId as documentId, c.documentName as documentName,
                   c.chunkIndex as chunkIndex, c.text as text, c.embedding as embedding
        `);

        // Calculate cosine similarity
        const scored = chunks
            .filter(c => c.embedding?.length > 0)
            .map(chunk => ({
                chunk: {
                    id: chunk.id,
                    documentId: chunk.documentId,
                    documentName: chunk.documentName,
                    chunkIndex: chunk.chunkIndex,
                    text: chunk.text,
                    embedding: chunk.embedding,
                    metadata: { startChar: 0, endChar: 0, wordCount: 0, entities: [] }
                },
                score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
                context: chunk.text
            }))
            .filter(r => r.score >= SIMILARITY_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        // Expand context with neighboring chunks
        for (const result of scored) {
            const neighbors = await this.executeCypher<{ text: string }>(`
                MATCH (c:Chunk {id: $id})-[:NEXT|NEXT*0..1]-(neighbor:Chunk)
                WHERE neighbor.id <> $id
                RETURN neighbor.text as text
                LIMIT 2
            `, { id: result.chunk.id });
            
            if (neighbors.length > 0) {
                result.context = neighbors.map(n => n.text).join(' ... ') + ' ... ' + result.context;
            }
        }

        return scored;
    }

    async hybridSearch(queryEmbedding: number[], queryEntities: string[], topK: number = TOP_K_CHUNKS): Promise<RetrievalResult[]> {
        // Vector search results
        const vectorResults = await this.vectorSearch(queryEmbedding, topK);
        
        // Entity-based search
        const entityResults: RetrievalResult[] = [];
        if (queryEntities.length > 0) {
            const entityChunks = await this.executeCypher<{
                id: string;
                documentId: number;
                documentName: string;
                chunkIndex: number;
                text: string;
                embedding: number[];
                matchCount: number;
            }>(`
                MATCH (c:Chunk)-[:MENTIONS]->(e:Entity)
                WHERE e.name IN $entities
                WITH c, count(DISTINCT e) as matchCount
                RETURN c.id as id, c.documentId as documentId, c.documentName as documentName,
                       c.chunkIndex as chunkIndex, c.text as text, c.embedding as embedding,
                       matchCount
                ORDER BY matchCount DESC
                LIMIT $limit
            `, { entities: queryEntities, limit: topK });

            for (const chunk of entityChunks) {
                if (!vectorResults.some(v => v.chunk.id === chunk.id)) {
                    entityResults.push({
                        chunk: {
                            id: chunk.id,
                            documentId: chunk.documentId,
                            documentName: chunk.documentName,
                            chunkIndex: chunk.chunkIndex,
                            text: chunk.text,
                            embedding: chunk.embedding || [],
                            metadata: { startChar: 0, endChar: 0, wordCount: 0, entities: [] }
                        },
                        score: 0.5 + (chunk.matchCount * 0.1), // Boost by entity matches
                        context: chunk.text
                    });
                }
            }
        }

        // Combine and deduplicate
        const combined = [...vectorResults, ...entityResults]
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return combined;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async getStats(): Promise<{ chunks: number; documents: number; entities: number }> {
        const stats = await this.executeCypher<{ chunks: number; docs: number; entities: number }>(`
            MATCH (c:Chunk) WITH count(c) as chunks, count(DISTINCT c.documentId) as docs
            OPTIONAL MATCH (e:Entity) 
            RETURN chunks, docs, count(e) as entities
        `);
        return {
            chunks: stats[0]?.chunks || 0,
            documents: stats[0]?.docs || 0,
            entities: stats[0]?.entities || 0
        };
    }
}

// Singleton instance
let ragStore: Neo4jRAGStore | null = null;

function getRAGStore(): Neo4jRAGStore {
    if (!ragStore) ragStore = new Neo4jRAGStore();
    return ragStore;
}

/**
 * Process and index a document for RAG
 */
export async function indexDocumentForRAG(doc: Document): Promise<{ chunksCreated: number; entitiesExtracted: number }> {
    const store = getRAGStore();
    
    const isConnected = await store.checkConnection();
    if (!isConnected) {
        throw new Error('Neo4j not available for RAG indexing');
    }

    await store.initializeRAGSchema();
    
    // 1. Chunk the document
    const textChunks = chunkDocument(doc.text);
    console.log(`📄 Split "${doc.name}" into ${textChunks.length} chunks`);
    
    let totalEntities = 0;
    
    // 2. Process each chunk
    for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        
        // Generate embedding
        const embedding = await embedText(chunk.text);
        
        // Extract entities
        const entities = await extractChunkEntities(chunk.text);
        totalEntities += entities.length;
        
        // Create chunk object
        const docChunk: DocumentChunk = {
            id: `${doc.id}-chunk-${i}`,
            documentId: doc.id,
            documentName: doc.name,
            chunkIndex: i,
            text: chunk.text,
            embedding,
            metadata: {
                startChar: chunk.start,
                endChar: chunk.end,
                wordCount: chunk.text.split(/\s+/).length,
                entities
            }
        };
        
        // Store in Neo4j
        await store.storeChunk(docChunk);
        console.log(`  ✓ Indexed chunk ${i + 1}/${textChunks.length}`);
    }
    
    return { chunksCreated: textChunks.length, entitiesExtracted: totalEntities };
}

/**
 * Remove document from RAG index
 */
export async function removeDocumentFromRAG(documentId: number): Promise<void> {
    const store = getRAGStore();
    const isConnected = await store.checkConnection();
    if (!isConnected) return;
    
    await store.deleteDocumentChunks(documentId);
}

/**
 * RAG Query - Retrieve relevant context and generate answer
 */
export async function ragQuery(
    question: string,
    chatHistory: { role: 'user' | 'assistant'; content: string }[],
    language: string
): Promise<RAGResponse> {
    const startTime = Date.now();
    const store = getRAGStore();
    
    const isConnected = await store.checkConnection();
    if (!isConnected) {
        return {
            answer: "Knowledge graph is not available. Please ensure Neo4j is running.",
            sources: [],
            processingTime: Date.now() - startTime
        };
    }

    // 1. Generate query embedding
    const queryEmbedding = await embedText(question);
    
    // 2. Extract entities from query for hybrid search
    const queryEntities = await extractChunkEntities(question);
    
    // 3. Retrieve relevant chunks using hybrid search
    const retrievedChunks = await store.hybridSearch(queryEmbedding, queryEntities, TOP_K_CHUNKS);
    
    if (retrievedChunks.length === 0) {
        return {
            answer: "I couldn't find any relevant information in the knowledge base to answer your question.",
            sources: [],
            processingTime: Date.now() - startTime
        };
    }

    // 4. Build augmented context
    const contextParts = retrievedChunks.map((r, idx) => 
        `[Source ${idx + 1}: ${r.chunk.documentName}, Chunk ${r.chunk.chunkIndex + 1}, Relevance: ${(r.score * 100).toFixed(0)}%]\n${r.context}`
    );
    
    const augmentedContext = `
## Retrieved Knowledge (from ${retrievedChunks.length} sources)

${contextParts.join('\n\n---\n\n')}
`;

    // 5. Generate answer with augmented context
    const answer = await generateAnswer(chatHistory, augmentedContext, question, language);

    return {
        answer,
        sources: retrievedChunks.map(r => ({
            documentName: r.chunk.documentName,
            chunkIndex: r.chunk.chunkIndex,
            relevance: Math.round(r.score * 100)
        })),
        processingTime: Date.now() - startTime
    };
}

/**
 * Check if RAG is available
 */
export async function isRAGAvailable(): Promise<boolean> {
    const store = getRAGStore();
    return await store.checkConnection();
}

/**
 * Get RAG statistics
 */
export async function getRAGStats(): Promise<{ chunks: number; documents: number; entities: number } | null> {
    const store = getRAGStore();
    const isConnected = await store.checkConnection();
    if (!isConnected) return null;
    return await store.getStats();
}

/**
 * Re-index all existing documents for RAG
 */
export async function reindexAllDocuments(documents: Document[], onProgress?: (current: number, total: number) => void): Promise<void> {
    for (let i = 0; i < documents.length; i++) {
        await indexDocumentForRAG(documents[i]);
        onProgress?.(i + 1, documents.length);
    }
}

