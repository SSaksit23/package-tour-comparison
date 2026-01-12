/**
 * ChromaDB Service - Vector Database for Similarity Search
 * 
 * Handles unstructured text storage and semantic similarity queries.
 * Part of the Hybrid RAG system.
 */

import { Document } from '../types';
import { embedText } from './aiProvider';

// ChromaDB configuration
// In development, use the Vite proxy to avoid CORS issues
// The proxy is configured at /chroma-api -> http://localhost:8000/api/v2
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const CHROMA_BASE_URL = (typeof process !== 'undefined' && process.env?.CHROMA_URL) || 'http://localhost:8000';
// Use proxy path in dev mode, direct URL in production
const CHROMA_URL = isDev ? '' : CHROMA_BASE_URL;
// ChromaDB v2 API
const CHROMA_API_PATH = isDev ? '/chroma-api' : '/api/v2';
const COLLECTION_NAME = 'itinerary_docs';

// Types
export interface ChromaDocument {
    id: string;
    content: string;
    metadata: {
        documentId: number;
        documentName: string;
        chunkIndex: number;
        source: string;
    };
    embedding?: number[];
}

export interface ChromaSearchResult {
    id: string;
    content: string;
    metadata: any;
    distance: number;
    score: number;
}

/**
 * ChromaDB Client for Vector Operations
 */
class ChromaVectorStore {
    private apiPath: string;
    private collectionId: string | null = null;

    constructor() {
        // Use proxy path in development to avoid CORS issues
        this.apiPath = CHROMA_API_PATH;
    }

    /**
     * Check if ChromaDB is available
     * In v2 API, the heartbeat is at the root path (not /heartbeat)
     */
    async checkConnection(): Promise<boolean> {
        try {
            // ChromaDB v2 API: heartbeat is at the root path
            const response = await fetch(`${this.apiPath}`);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Get or create the collection
     */
    private async ensureCollection(): Promise<string> {
        if (this.collectionId) return this.collectionId;

        try {
            // Try to get existing collection
            const getResponse = await fetch(`${this.apiPath}/collections/${COLLECTION_NAME}`);
            if (getResponse.ok) {
                const collection = await getResponse.json();
                this.collectionId = collection.id;
                return this.collectionId;
            }

            // Create new collection
            const createResponse = await fetch(`${this.apiPath}/collections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: COLLECTION_NAME,
                    metadata: { 'hnsw:space': 'cosine' }
                })
            });

            if (!createResponse.ok) {
                throw new Error(`Failed to create collection: ${createResponse.status}`);
            }

            const collection = await createResponse.json();
            this.collectionId = collection.id;
            return this.collectionId;
        } catch (error) {
            console.error('ChromaDB collection error:', error);
            throw error;
        }
    }

    /**
     * Add documents to the vector store
     */
    async addDocuments(docs: ChromaDocument[]): Promise<void> {
        const collectionId = await this.ensureCollection();

        const ids = docs.map(d => d.id);
        const documents = docs.map(d => d.content);
        const metadatas = docs.map(d => d.metadata);
        const embeddings = docs.map(d => d.embedding).filter(e => e) as number[][];

        const response = await fetch(`${this.apiPath}/collections/${collectionId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids,
                documents,
                metadatas,
                embeddings: embeddings.length === docs.length ? embeddings : undefined
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to add documents: ${error}`);
        }
    }

    /**
     * Search for similar documents
     */
    async search(queryEmbedding: number[], topK: number = 5): Promise<ChromaSearchResult[]> {
        const collectionId = await this.ensureCollection();

        const response = await fetch(`${this.apiPath}/collections/${collectionId}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query_embeddings: [queryEmbedding],
                n_results: topK,
                include: ['documents', 'metadatas', 'distances']
            })
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const result = await response.json();
        
        // Transform ChromaDB response format
        const ids = result.ids?.[0] || [];
        const documents = result.documents?.[0] || [];
        const metadatas = result.metadatas?.[0] || [];
        const distances = result.distances?.[0] || [];

        return ids.map((id: string, i: number) => ({
            id,
            content: documents[i] || '',
            metadata: metadatas[i] || {},
            distance: distances[i] || 0,
            // Convert distance to similarity score (cosine distance to similarity)
            score: 1 - (distances[i] || 0)
        }));
    }

    /**
     * Search by text query (will embed the query first)
     */
    async searchByText(query: string, topK: number = 5): Promise<ChromaSearchResult[]> {
        const queryEmbedding = await embedText(query);
        return await this.search(queryEmbedding, topK);
    }

    /**
     * Delete documents by IDs
     */
    async deleteDocuments(ids: string[]): Promise<void> {
        const collectionId = await this.ensureCollection();

        const response = await fetch(`${this.apiPath}/collections/${collectionId}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });

        if (!response.ok) {
            throw new Error(`Delete failed: ${response.status}`);
        }
    }

    /**
     * Delete all documents for a specific document ID
     */
    async deleteByDocumentId(documentId: number): Promise<void> {
        const collectionId = await this.ensureCollection();

        // Query to find all chunks for this document
        const response = await fetch(`${this.apiPath}/collections/${collectionId}/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                where: { documentId: documentId }
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.ids && result.ids.length > 0) {
                await this.deleteDocuments(result.ids);
            }
        }
    }

    /**
     * Get collection stats
     */
    async getStats(): Promise<{ count: number }> {
        try {
            const collectionId = await this.ensureCollection();
            const response = await fetch(`${this.apiPath}/collections/${collectionId}/count`);
            if (response.ok) {
                const count = await response.json();
                return { count };
            }
            return { count: 0 };
        } catch {
            return { count: 0 };
        }
    }
}

// Singleton instance
let chromaInstance: ChromaVectorStore | null = null;

export function getChromaStore(): ChromaVectorStore {
    if (!chromaInstance) {
        chromaInstance = new ChromaVectorStore();
    }
    return chromaInstance;
}

/**
 * Chunk text into smaller pieces for vector storage
 */
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): { text: string; start: number; end: number }[] {
    const chunks: { text: string; start: number; end: number }[] = [];
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
 * Index a document in ChromaDB
 */
export async function indexDocumentInChroma(doc: Document): Promise<{ chunksCreated: number }> {
    const store = getChromaStore();
    
    const isConnected = await store.checkConnection();
    if (!isConnected) {
        console.warn('ChromaDB not available');
        return { chunksCreated: 0 };
    }

    // Limit document text to prevent memory issues
    const MAX_TEXT_LENGTH = 100000; // ~100KB
    const truncatedText = doc.text.length > MAX_TEXT_LENGTH 
        ? doc.text.substring(0, MAX_TEXT_LENGTH)
        : doc.text;

    // Chunk the document
    const allChunks = chunkText(truncatedText);
    
    // Limit chunks to prevent memory/API overload
    const MAX_CHUNKS = 50;
    const chunks = allChunks.slice(0, MAX_CHUNKS);
    
    if (allChunks.length > MAX_CHUNKS) {
        console.log(`⚠️ Document "${doc.name}" has ${allChunks.length} chunks, limiting to ${MAX_CHUNKS}`);
    }
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Process chunks in small batches to avoid memory issues
    const BATCH_SIZE = 5;
    let totalIndexed = 0;
    
    for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
        const batchChunks = chunks.slice(batchStart, batchEnd);
        const chromaDocs: ChromaDocument[] = [];
        
        for (let i = 0; i < batchChunks.length; i++) {
            const chunkIndex = batchStart + i;
            const chunk = batchChunks[i];
            
            try {
                const embedding = await embedText(chunk.text);
                
                chromaDocs.push({
                    id: `doc-${doc.id}-chunk-${chunkIndex}`,
                    content: chunk.text,
                    metadata: {
                        documentId: doc.id,
                        documentName: doc.name,
                        chunkIndex: chunkIndex,
                        source: 'knowledge_base'
                    },
                    embedding
                });
                
                // Small delay between embeddings to prevent rate limiting
                if (i < batchChunks.length - 1) {
                    await delay(100);
                }
            } catch (e) {
                console.warn(`⚠️ Failed to embed chunk ${chunkIndex}:`, e);
                // Continue with next chunk
            }
        }
        
        // Add batch to ChromaDB
        if (chromaDocs.length > 0) {
            try {
                await store.addDocuments(chromaDocs);
                totalIndexed += chromaDocs.length;
            } catch (e) {
                console.warn(`⚠️ Failed to add batch to ChromaDB:`, e);
            }
        }
        
        // Log progress
        console.log(`  ✓ Indexed ${Math.min(batchEnd, chunks.length)}/${chunks.length} chunks`);
        
        // Delay between batches
        if (batchEnd < chunks.length) {
            await delay(500);
        }
    }

    console.log(`📚 ChromaDB: Indexed ${totalIndexed} chunks for "${doc.name}"`);
    
    return { chunksCreated: totalIndexed };
}

/**
 * Remove a document from ChromaDB
 */
export async function removeDocumentFromChroma(documentId: number): Promise<void> {
    const store = getChromaStore();
    
    const isConnected = await store.checkConnection();
    if (!isConnected) return;

    await store.deleteByDocumentId(documentId);
}

/**
 * Search ChromaDB for relevant text chunks
 */
export async function searchChroma(query: string, topK: number = 5): Promise<ChromaSearchResult[]> {
    const store = getChromaStore();
    
    const isConnected = await store.checkConnection();
    if (!isConnected) return [];

    return await store.searchByText(query, topK);
}

/**
 * Check if ChromaDB is available
 */
export async function isChromaAvailable(): Promise<boolean> {
    const store = getChromaStore();
    return await store.checkConnection();
}

/**
 * Get ChromaDB statistics
 */
export async function getChromaStats(): Promise<{ count: number } | null> {
    const store = getChromaStore();
    
    const isConnected = await store.checkConnection();
    if (!isConnected) return null;

    return await store.getStats();
}

