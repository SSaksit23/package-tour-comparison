/**
 * Retrieval Service - Vector Similarity Search for RAG
 * 
 * This module implements the retrieval component of the RAG pipeline as outlined in
 * the Deep Development Plan. It handles:
 * 1. Query embedding using the same model as document chunks
 * 2. Vector similarity search in ChromaDB
 * 3. Retrieving and formatting relevant text chunks from PDF travel packages
 * 4. Metadata filtering and result ranking
 * 
 * Designed specifically for travel package PDF document retrieval from
 * scraped itinerary documents stored in ChromaDB.
 * 
 * @example
 * ```typescript
 * // Basic retrieval
 * const result = await retrieveRelevantChunks("What hotels are included in the tour?");
 * console.log(result.formattedContext); // Ready for LLM prompt
 * 
 * // Retrieve from PDF travel packages only
 * const pdfResult = await retrieveTravelPackageChunks("tour packages to Thailand", 5);
 * 
 * // Retrieve from specific document
 * const docResult = await retrieveFromDocument("pricing information", "Thailand_Tour_2024.pdf");
 * 
 * // Use retrieved context in RAG
 * const answer = await generateAnswer(
 *   chatHistory,
 *   result.formattedContext,
 *   "What hotels are included?",
 *   "en"
 * );
 * ```
 */

import { embedText } from './aiProvider';
import { getChromaStore, ChromaSearchResult, isChromaAvailable } from './chromaService';
import { Document } from '../types';

// Retrieval Configuration
export interface RetrievalConfig {
    topK?: number; // Number of chunks to retrieve (default: 5)
    minScore?: number; // Minimum similarity score threshold (default: 0.0)
    includeMetadata?: boolean; // Whether to include full metadata in results
    filterBySource?: string; // Filter by source metadata (e.g., 'pdf_scraper', 'knowledge_base')
    filterByDocumentName?: string; // Filter by specific document name
    filterByTourId?: string; // Filter by tour/route ID if available
}

// Retrieved chunk with enhanced metadata
export interface RetrievedChunk {
    id: string;
    content: string;
    score: number; // Similarity score (0-1)
    metadata: {
        documentId?: number;
        documentName: string;
        chunkIndex: number;
        source: string;
        tourId?: string; // Tour/route ID from scraped PDFs
        pageNumber?: number; // Page number if available
        [key: string]: any; // Additional metadata fields
    };
}

// Retrieval result with formatted context
export interface RetrievalResult {
    chunks: RetrievedChunk[];
    totalRetrieved: number;
    query: string;
    queryEmbedding?: number[];
    averageScore: number;
    formattedContext: string; // Formatted context ready for LLM prompt
}

// Default configuration
const DEFAULT_CONFIG: Required<RetrievalConfig> = {
    topK: 5,
    minScore: 0.0,
    includeMetadata: true,
    filterBySource: undefined as any,
    filterByDocumentName: undefined as any,
    filterByTourId: undefined as any,
};

/**
 * Embed a query text using the same embedding model as document chunks
 * This ensures consistent vector space representation for similarity search
 */
export async function embedQuery(query: string): Promise<number[]> {
    try {
        const embedding = await embedText(query);
        if (!embedding || embedding.length === 0) {
            throw new Error('Failed to generate query embedding');
        }
        return embedding;
    } catch (error) {
        console.error('❌ Query embedding failed:', error);
        throw new Error(`Query embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Filter search results based on configuration criteria
 */
function filterResults(
    results: ChromaSearchResult[],
    config: Required<RetrievalConfig>
): ChromaSearchResult[] {
    return results.filter(result => {
        // Filter by minimum score
        if (result.score < config.minScore) {
            return false;
        }

        // Filter by source
        if (config.filterBySource && result.metadata?.source !== config.filterBySource) {
            return false;
        }

        // Filter by document name
        if (config.filterByDocumentName && result.metadata?.documentName !== config.filterByDocumentName) {
            return false;
        }

        // Filter by tour ID
        if (config.filterByTourId && result.metadata?.tourId !== config.filterByTourId) {
            return false;
        }

        return true;
    });
}

/**
 * Transform ChromaDB search results into RetrievedChunk format
 */
function transformToRetrievedChunks(
    results: ChromaSearchResult[],
    includeMetadata: boolean
): RetrievedChunk[] {
    return results.map(result => ({
        id: result.id,
        content: result.content,
        score: result.score,
        metadata: includeMetadata ? {
            documentId: result.metadata?.documentId,
            documentName: result.metadata?.documentName || 'Unknown',
            chunkIndex: result.metadata?.chunkIndex ?? 0,
            source: result.metadata?.source || 'unknown',
            tourId: result.metadata?.tourId,
            pageNumber: result.metadata?.pageNumber,
            ...result.metadata, // Include all additional metadata
        } : {
            documentName: result.metadata?.documentName || 'Unknown',
            chunkIndex: result.metadata?.chunkIndex ?? 0,
            source: result.metadata?.source || 'unknown',
        },
    }));
}

/**
 * Format retrieved chunks into a context string for LLM prompt augmentation
 * This creates a formatted context that can be directly inserted into RAG prompts
 */
function formatContext(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) {
        return '';
    }

    const contextParts = chunks.map((chunk, index) => {
        const header = `[Source ${index + 1}: ${chunk.metadata.documentName}`;
        const metadataParts: string[] = [];
        
        if (chunk.metadata.chunkIndex !== undefined) {
            metadataParts.push(`Chunk ${chunk.metadata.chunkIndex + 1}`);
        }
        if (chunk.metadata.tourId) {
            metadataParts.push(`Tour ID: ${chunk.metadata.tourId}`);
        }
        if (chunk.metadata.pageNumber) {
            metadataParts.push(`Page ${chunk.metadata.pageNumber}`);
        }
        
        const metadataStr = metadataParts.length > 0 ? ` (${metadataParts.join(', ')})` : '';
        const relevance = `Relevance: ${(chunk.score * 100).toFixed(0)}%`;
        
        return `${header}${metadataStr}, ${relevance}]\n${chunk.content}`;
    });

    return `## Retrieved Knowledge (from ${chunks.length} source${chunks.length > 1 ? 's' : ''})\n\n${contextParts.join('\n\n---\n\n')}`;
}

/**
 * Retrieve relevant chunks from ChromaDB based on a query
 * This is the main retrieval function that implements the RAG retrieval pipeline
 * 
 * @param query - The user's query/question
 * @param config - Retrieval configuration options
 * @returns RetrievalResult with chunks, scores, and formatted context
 */
export async function retrieveRelevantChunks(
    query: string,
    config: RetrievalConfig = {}
): Promise<RetrievalResult> {
    // Check if ChromaDB is available
    const isAvailable = await isChromaAvailable();
    if (!isAvailable) {
        throw new Error('ChromaDB is not available. Please ensure ChromaDB is running.');
    }

    // Merge with default config
    const finalConfig: Required<RetrievalConfig> = {
        ...DEFAULT_CONFIG,
        ...config,
    };

    // Step 1: Embed the query
    console.log(`🔍 Embedding query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
    const queryEmbedding = await embedQuery(query);

    // Step 2: Perform vector similarity search in ChromaDB
    console.log(`🔎 Searching ChromaDB for top ${finalConfig.topK} similar chunks...`);
    const store = getChromaStore();
    const searchResults = await store.search(queryEmbedding, finalConfig.topK * 2); // Get 2x to allow filtering

    // Step 3: Filter results based on configuration
    const filteredResults = filterResults(searchResults, finalConfig);
    const topResults = filteredResults.slice(0, finalConfig.topK);

    // Step 4: Transform to RetrievedChunk format
    const chunks = transformToRetrievedChunks(topResults, finalConfig.includeMetadata);

    // Step 5: Calculate average score
    const averageScore = chunks.length > 0
        ? chunks.reduce((sum, chunk) => sum + chunk.score, 0) / chunks.length
        : 0;

    // Step 6: Format context for LLM
    const formattedContext = formatContext(chunks);

    console.log(`✅ Retrieved ${chunks.length} relevant chunks (avg score: ${(averageScore * 100).toFixed(1)}%)`);

    return {
        chunks,
        totalRetrieved: chunks.length,
        query,
        queryEmbedding,
        averageScore,
        formattedContext,
    };
}

/**
 * Retrieve chunks specifically from PDF travel package documents
 * This is a convenience function for the use case described in the development plan
 * 
 * @param query - Query about travel packages
 * @param topK - Number of chunks to retrieve
 * @param minScore - Minimum similarity score (0-1)
 * @returns RetrievalResult with PDF travel package chunks
 */
export async function retrieveTravelPackageChunks(
    query: string,
    topK: number = 5,
    minScore: number = 0.5
): Promise<RetrievalResult> {
    return retrieveRelevantChunks(query, {
        topK,
        minScore,
        filterBySource: 'pdf_scraper', // Filter for scraped PDF documents
        includeMetadata: true,
    });
}

/**
 * Retrieve chunks from a specific document
 * Useful for document-specific queries
 * 
 * @param query - The query
 * @param documentName - Name of the document to search in
 * @param topK - Number of chunks to retrieve
 * @returns RetrievalResult with chunks from the specified document
 */
export async function retrieveFromDocument(
    query: string,
    documentName: string,
    topK: number = 5
): Promise<RetrievalResult> {
    return retrieveRelevantChunks(query, {
        topK,
        filterByDocumentName: documentName,
        includeMetadata: true,
    });
}

/**
 * Retrieve chunks for a specific tour/route
 * Useful when querying about a specific travel package
 * 
 * @param query - The query
 * @param tourId - Tour/route ID from scraped PDFs
 * @param topK - Number of chunks to retrieve
 * @returns RetrievalResult with chunks from the specified tour
 */
export async function retrieveFromTour(
    query: string,
    tourId: string,
    topK: number = 5
): Promise<RetrievalResult> {
    return retrieveRelevantChunks(query, {
        topK,
        filterByTourId: tourId,
        includeMetadata: true,
    });
}

/**
 * Batch retrieve for multiple queries
 * Useful for processing multiple questions at once
 * 
 * @param queries - Array of queries
 * @param config - Retrieval configuration
 * @returns Array of RetrievalResult objects
 */
export async function batchRetrieve(
    queries: string[],
    config: RetrievalConfig = {}
): Promise<RetrievalResult[]> {
    const results: RetrievalResult[] = [];
    
    for (const query of queries) {
        try {
            const result = await retrieveRelevantChunks(query, config);
            results.push(result);
        } catch (error) {
            console.error(`❌ Failed to retrieve for query "${query}":`, error);
            // Continue with other queries
        }
    }
    
    return results;
}

/**
 * Get retrieval statistics
 * Provides information about the vector store for monitoring
 */
export async function getRetrievalStats(): Promise<{
    isAvailable: boolean;
    collectionName?: string;
    totalChunks?: number;
} | null> {
    const isAvailable = await isChromaAvailable();
    
    if (!isAvailable) {
        return {
            isAvailable: false,
        };
    }

    try {
        const store = getChromaStore();
        const stats = await store.getStats();
        
        return {
            isAvailable: true,
            collectionName: 'itinerary_docs',
            totalChunks: stats.count,
        };
    } catch (error) {
        console.error('Failed to get retrieval stats:', error);
        return {
            isAvailable: true,
            collectionName: 'itinerary_docs',
        };
    }
}

/**
 * Check if retrieval service is available
 */
export async function isRetrievalAvailable(): Promise<boolean> {
    return await isChromaAvailable();
}

