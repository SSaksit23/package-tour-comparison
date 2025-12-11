/**
 * ChromaDB Service - Vector Database for Similarity Search
 * 
 * Handles unstructured text storage and semantic similarity queries.
 * Part of the Hybrid RAG system.
 */

import { Document } from '../types';
import { embedText } from './aiService';

// ChromaDB configuration
const CHROMA_URL = (typeof process !== 'undefined' && process.env?.CHROMA_URL) || 'http://localhost:8000';
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
    private baseUrl: string;
    private collectionId: string | null = null;

    constructor() {
        this.baseUrl = CHROMA_URL;
    }

    /**
     * Check if ChromaDB is available
     */
    async checkConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/heartbeat`);
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
            const getResponse = await fetch(`${this.baseUrl}/api/v1/collections/${COLLECTION_NAME}`);
            if (getResponse.ok) {
                const collection = await getResponse.json();
                this.collectionId = collection.id;
                return this.collectionId;
            }

            // Create new collection
            const createResponse = await fetch(`${this.baseUrl}/api/v1/collections`, {
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

        const response = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/add`, {
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

        const response = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/query`, {
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

        const response = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/delete`, {
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
        const response = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/get`, {
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
            const response = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/count`);
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

    // Chunk the document
    const chunks = chunkText(doc.text);
    
    // Create ChromaDB documents with embeddings
    const chromaDocs: ChromaDocument[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await embedText(chunk.text);
        
        chromaDocs.push({
            id: `doc-${doc.id}-chunk-${i}`,
            content: chunk.text,
            metadata: {
                documentId: doc.id,
                documentName: doc.name,
                chunkIndex: i,
                source: 'knowledge_base'
            },
            embedding
        });
    }

    await store.addDocuments(chromaDocs);
    console.log(`📚 ChromaDB: Indexed ${chunks.length} chunks for "${doc.name}"`);
    
    return { chunksCreated: chunks.length };
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

