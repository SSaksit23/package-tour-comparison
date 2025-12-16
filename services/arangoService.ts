/**
 * ArangoDB Service - Unified Hybrid RAG (Graph + Vector)
 * 
 * ArangoDB is a multi-model database that supports:
 * - Document storage (like MongoDB)
 * - Graph traversal (like Neo4j)
 * - Vector search with ANN indexes
 * 
 * This service implements hybrid retrieval combining:
 * 1. Vector similarity search for semantic matching
 * 2. Graph traversal for relationship-based retrieval
 */

import { Document, ChatMessage } from '../types';
import { embedText, generateAnswer } from './aiService';
import { smartEmbed, chunkThaiText, extractThaiEntities, detectLanguage, generateThaiAwareAnswer } from './thaiRagService';

// ArangoDB configuration
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const ARANGO_URL = (typeof process !== 'undefined' && process.env?.ARANGO_URL) || 'http://localhost:8529';
const ARANGO_USER = (typeof process !== 'undefined' && process.env?.ARANGO_USER) || 'root';
const ARANGO_PASSWORD = (typeof process !== 'undefined' && process.env?.ARANGO_PASSWORD) || 'password123';
const ARANGO_DATABASE = (typeof process !== 'undefined' && process.env?.ARANGO_DATABASE) || 'itinerary_kb';

// Use Vite proxy in development to avoid CORS
const ARANGO_API_PATH = isDev ? '/arango-api' : `${ARANGO_URL}/_db/${ARANGO_DATABASE}/_api`;
const ARANGO_SYSTEM_PATH = isDev ? '/arango-system' : `${ARANGO_URL}/_db/_system/_api`;

// Collection names
const COLLECTIONS = {
    documents: 'documents',
    chunks: 'chunks',
    entities: 'entities',
    // Edge collections for relationships
    hasChunk: 'has_chunk',      // document -> chunk
    mentions: 'mentions',        // chunk -> entity
    relatedTo: 'related_to',    // entity -> entity
    nextChunk: 'next_chunk'     // chunk -> chunk (sequential)
};

// Types
export interface ArangoDocument {
    _key?: string;
    _id?: string;
    id: number;
    name: string;
    text: string;
    createdAt: string;
}

export interface ArangoChunk {
    _key?: string;
    _id?: string;
    documentId: number;
    documentName: string;
    chunkIndex: number;
    text: string;
    embedding: number[];
    wordCount: number;
}

export interface ArangoEntity {
    _key?: string;
    _id?: string;
    name: string;
    type: 'LOCATION' | 'ORGANIZATION' | 'DATE' | 'PRICE' | 'ACTIVITY' | 'HOTEL' | 'FLIGHT' | 'OTHER';
    mentions: number;
}

export interface HybridSearchResult {
    content: string;
    documentName: string;
    chunkIndex: number;
    score: number;
    source: 'vector' | 'graph' | 'hybrid';
    entities?: string[];
    path?: string[];
}

export interface HybridRAGResponse {
    answer: string;
    sources: {
        vectorResults: number;
        graphResults: number;
        entities: string[];
    };
    processingTime: number;
}

/**
 * ArangoDB Hybrid RAG Client
 */
class ArangoHybridRAG {
    private apiPath: string;
    private auth: string;
    private initialized: boolean = false;

    constructor() {
        this.apiPath = ARANGO_API_PATH;
        this.auth = 'Basic ' + btoa(`${ARANGO_USER}:${ARANGO_PASSWORD}`);
    }

    /**
     * Execute AQL query
     */
    private async executeAQL<T = any>(query: string, bindVars: Record<string, any> = {}): Promise<T[]> {
        try {
            const response = await fetch(`${this.apiPath}/cursor`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.auth
                },
                body: JSON.stringify({ query, bindVars })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.errorMessage || `ArangoDB error: ${response.status}`);
            }

            const data = await response.json();
            return data.result || [];
        } catch (error) {
            console.error('ArangoDB query error:', error);
            throw error;
        }
    }

    /**
     * Check connection to ArangoDB
     */
    async checkConnection(): Promise<boolean> {
        try {
            // Use system database to check connection (doesn't require target db to exist)
            const response = await fetch(`${ARANGO_SYSTEM_PATH}/version`, {
                headers: { 'Authorization': this.auth }
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Initialize database and collections
     */
    async initialize(): Promise<boolean> {
        if (this.initialized) return true;

        try {
            // Create database if not exists
            await this.createDatabaseIfNotExists();

            // Create document collections
            for (const coll of [COLLECTIONS.documents, COLLECTIONS.chunks, COLLECTIONS.entities]) {
                await this.createCollectionIfNotExists(coll, 'document');
            }

            // Create edge collections
            for (const coll of [COLLECTIONS.hasChunk, COLLECTIONS.mentions, COLLECTIONS.relatedTo, COLLECTIONS.nextChunk]) {
                await this.createCollectionIfNotExists(coll, 'edge');
            }

            // Create indexes for vector search and lookups
            await this.createIndexes();

            this.initialized = true;
            console.log('✅ ArangoDB Hybrid RAG initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize ArangoDB:', error);
            return false;
        }
    }

    private async createDatabaseIfNotExists(): Promise<void> {
        try {
            // Check if database exists by trying to access it
            const checkResponse = await fetch(`${this.apiPath}/version`, {
                headers: { 'Authorization': this.auth }
            });
            
            if (!checkResponse.ok) {
                console.log('📦 Creating ArangoDB database:', ARANGO_DATABASE);
                // Create database using system database
                const createResponse = await fetch(`${ARANGO_SYSTEM_PATH}/database`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.auth
                    },
                    body: JSON.stringify({ name: ARANGO_DATABASE })
                });
                
                if (createResponse.ok) {
                    console.log('✅ Database created:', ARANGO_DATABASE);
                } else {
                    const error = await createResponse.json().catch(() => ({}));
                    console.log('Database creation response:', error);
                }
            }
        } catch (e) {
            console.log('Database check/create:', e);
            // Database might already exist, continue
        }
    }

    private async createCollectionIfNotExists(name: string, type: 'document' | 'edge'): Promise<void> {
        try {
            const response = await fetch(`${this.apiPath}/collection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.auth
                },
                body: JSON.stringify({
                    name,
                    type: type === 'edge' ? 3 : 2
                })
            });
            
            // 409 = collection already exists, which is fine
            if (response.ok) {
                console.log(`📁 Created collection: ${name}`);
            }
            // Silently ignore 409 Conflict (already exists)
        } catch {
            // Network error - collection might already exist
        }
    }

    private async createIndexes(): Promise<void> {
        // Create persistent index on chunks for document lookup
        try {
            await fetch(`${this.apiPath}/index?collection=${COLLECTIONS.chunks}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.auth
                },
                body: JSON.stringify({
                    type: 'persistent',
                    fields: ['documentId'],
                    unique: false
                })
            });
        } catch { /* Index might already exist */ }

        // Create index on entities by name
        try {
            await fetch(`${this.apiPath}/index?collection=${COLLECTIONS.entities}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.auth
                },
                body: JSON.stringify({
                    type: 'persistent',
                    fields: ['name'],
                    unique: true
                })
            });
        } catch { /* Index might already exist */ }
    }

    /**
     * Index a document with chunks and entities
     * Language-aware: Uses Thai-optimized processing for Thai documents
     * Memory-optimized: processes chunks sequentially with delays
     */
    async indexDocument(doc: Document): Promise<{ chunks: number; entities: number; language: string }> {
        await this.initialize();

        // Detect document language
        const docLanguage = detectLanguage(doc.text);
        console.log(`📄 Document "${doc.name}" detected as: ${docLanguage === 'thai' ? '🇹🇭 Thai' : docLanguage === 'mixed' ? '🌐 Mixed' : '🇺🇸 English'}`);

        // Limit document text to prevent memory issues
        const MAX_DOC_TEXT = 100000; // ~100KB
        const truncatedText = doc.text.length > MAX_DOC_TEXT 
            ? doc.text.substring(0, MAX_DOC_TEXT) 
            : doc.text;

        // 1. Store the document with language metadata
        const docKey = `doc_${doc.id}`;
        await this.executeAQL(`
            UPSERT { _key: @key }
            INSERT { _key: @key, id: @id, name: @name, text: @text, createdAt: @createdAt, language: @language }
            UPDATE { name: @name, text: @text, language: @language }
            IN ${COLLECTIONS.documents}
        `, {
            key: docKey,
            id: doc.id,
            name: doc.name,
            text: truncatedText.substring(0, 5000), // Only store preview
            createdAt: doc.createdAt,
            language: docLanguage
        });

        // 2. Chunk the document using language-aware chunking
        const allChunks = docLanguage === 'thai' || docLanguage === 'mixed'
            ? chunkThaiText(truncatedText, 800) // Smaller chunks for Thai
            : this.chunkText(truncatedText);
        
        // Limit number of chunks to prevent memory/API overload
        const MAX_CHUNKS = 50;
        const chunks = allChunks.slice(0, MAX_CHUNKS);
        
        if (allChunks.length > MAX_CHUNKS) {
            console.log(`⚠️ Document "${doc.name}" has ${allChunks.length} chunks, limiting to ${MAX_CHUNKS}`);
        }
        
        const entities = new Set<string>();
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // 3. Process chunks sequentially with delays to prevent rate limiting
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkText = typeof chunk === 'string' ? chunk : chunk.text;
            const chunkLang = typeof chunk === 'string' ? docLanguage : chunk.language;
            const chunkKey = `chunk_${doc.id}_${i}`;

            try {
                // Generate language-aware embedding with timeout
                let embedding: number[];
                const startTime = Date.now();
                console.log(`🔄 [Chunk ${i + 1}/${chunks.length}] Generating embedding for ${chunkLang} text (${chunkText.length} chars)...`);
                
                try {
                    // Wrap in Promise.race with timeout
                    const timeoutPromise = new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('Embedding timeout after 45s')), 45000)
                    );
                    
                    const result = await Promise.race([
                        smartEmbed(chunkText),
                        timeoutPromise
                    ]);
                    
                    embedding = result.embedding;
                    console.log(`✅ [Chunk ${i + 1}] Embedding generated in ${Date.now() - startTime}ms (${embedding.length} dimensions)`);
                } catch (e) {
                    // If embedding fails, use empty array and continue
                    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
                    console.warn(`⚠️ [Chunk ${i + 1}] Embedding failed: ${errorMsg} - using empty vector`);
                    embedding = [];
                }

                // Extract entities using language-aware extraction
                let chunkEntities: { name: string; type: string; language?: string }[] = [];
                if (embedding.length > 0 && i < 15) { // Extract entities from first 15 chunks
                    try {
                        if (chunkLang === 'thai' || chunkLang === 'mixed') {
                            // Use Thai entity extraction
                            chunkEntities = await extractThaiEntities(chunkText);
                        } else {
                            chunkEntities = await this.extractEntities(chunkText);
                        }
                        chunkEntities.forEach(e => entities.add(e.name));
                    } catch {
                        // Entity extraction failed, continue without entities
                    }
                }

                // Store chunk with embedding and language
                await this.executeAQL(`
                    UPSERT { _key: @key }
                    INSERT { 
                        _key: @key, 
                        documentId: @docId, 
                        documentName: @docName,
                        chunkIndex: @idx, 
                        text: @text, 
                        embedding: @embedding,
                        wordCount: @wordCount,
                        language: @language
                    }
                    UPDATE { text: @text, embedding: @embedding, language: @language }
                    IN ${COLLECTIONS.chunks}
                `, {
                    key: chunkKey,
                    docId: doc.id,
                    docName: doc.name,
                    idx: i,
                    text: chunkText,
                    embedding,
                    wordCount: chunkText.split(/\s+/).length,
                    language: chunkLang
                });

                // Create document -> chunk edge
                await this.executeAQL(`
                    UPSERT { _from: @from, _to: @to }
                    INSERT { _from: @from, _to: @to }
                    UPDATE { }
                    IN ${COLLECTIONS.hasChunk}
                `, {
                    from: `${COLLECTIONS.documents}/${docKey}`,
                    to: `${COLLECTIONS.chunks}/${chunkKey}`
                });

                // Create chunk -> next_chunk edge (for sequential traversal)
                if (i > 0) {
                    const prevChunkKey = `chunk_${doc.id}_${i - 1}`;
                    await this.executeAQL(`
                        UPSERT { _from: @from, _to: @to }
                        INSERT { _from: @from, _to: @to }
                        UPDATE { }
                        IN ${COLLECTIONS.nextChunk}
                    `, {
                        from: `${COLLECTIONS.chunks}/${prevChunkKey}`,
                        to: `${COLLECTIONS.chunks}/${chunkKey}`
                    });
                }

                // Create chunk -> entity edges
                if (chunkEntities.length > 0) {
                    for (const entity of chunkEntities) {
                        const entityKey = this.sanitizeKey(entity.name);
                        
                        // Upsert entity with language
                        await this.executeAQL(`
                            UPSERT { _key: @key }
                            INSERT { _key: @key, name: @name, type: @type, mentions: 1, language: @language }
                            UPDATE { mentions: OLD.mentions + 1 }
                            IN ${COLLECTIONS.entities}
                        `, {
                            key: entityKey,
                            name: entity.name,
                            type: entity.type,
                            language: entity.language || chunkLang
                        });

                        // Create chunk -> entity edge
                        await this.executeAQL(`
                            UPSERT { _from: @from, _to: @to }
                            INSERT { _from: @from, _to: @to }
                            UPDATE { }
                            IN ${COLLECTIONS.mentions}
                        `, {
                            from: `${COLLECTIONS.chunks}/${chunkKey}`,
                            to: `${COLLECTIONS.entities}/${entityKey}`
                        });
                    }
                }

                // Progress log every 5 chunks
                if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
                    const langEmoji = chunkLang === 'thai' ? '🇹🇭' : chunkLang === 'mixed' ? '🌐' : '🇺🇸';
                    console.log(`  ${langEmoji} Indexed ${i + 1}/${chunks.length} chunks`);
                }

                // Delay between chunks to prevent rate limiting (250ms for Thai due to processing)
                if (i < chunks.length - 1) {
                    await delay(chunkLang === 'thai' ? 250 : 200);
                }
                
            } catch (chunkError) {
                console.error(`❌ Failed to index chunk ${i}:`, chunkError);
                // Continue with next chunk
            }
        }

        const langLabel = docLanguage === 'thai' ? '🇹🇭' : docLanguage === 'mixed' ? '🌐' : '🇺🇸';
        console.log(`📚 ArangoDB: ${langLabel} Indexed ${chunks.length} chunks, ${entities.size} entities for "${doc.name}"`);
        return { chunks: chunks.length, entities: entities.size, language: docLanguage };
    }

    /**
     * Remove a document and its chunks/relationships
     */
    async removeDocument(documentId: number): Promise<void> {
        const docKey = `doc_${documentId}`;

        // Remove all chunks and their edges
        await this.executeAQL(`
            FOR chunk IN ${COLLECTIONS.chunks}
                FILTER chunk.documentId == @docId
                LET chunkId = chunk._id
                // Remove mention edges
                FOR edge IN ${COLLECTIONS.mentions}
                    FILTER edge._from == chunkId
                    REMOVE edge IN ${COLLECTIONS.mentions}
                // Remove next_chunk edges
                FOR edge IN ${COLLECTIONS.nextChunk}
                    FILTER edge._from == chunkId OR edge._to == chunkId
                    REMOVE edge IN ${COLLECTIONS.nextChunk}
                // Remove has_chunk edges
                FOR edge IN ${COLLECTIONS.hasChunk}
                    FILTER edge._to == chunkId
                    REMOVE edge IN ${COLLECTIONS.hasChunk}
                // Remove chunk
                REMOVE chunk IN ${COLLECTIONS.chunks}
        `, { docId: documentId });

        // Remove document
        await this.executeAQL(`
            REMOVE { _key: @key } IN ${COLLECTIONS.documents}
            OPTIONS { ignoreErrors: true }
        `, { key: docKey });
    }

    /**
     * Hybrid search combining vector similarity and graph traversal
     * Language-aware: Uses appropriate embedding model based on query language
     */
    async hybridSearch(query: string, topK: number = 5): Promise<HybridSearchResult[]> {
        await this.initialize();

        // 1. Detect query language and generate appropriate embedding
        const queryLang = detectLanguage(query);
        const { embedding: queryEmbedding } = await smartEmbed(query);
        
        console.log(`🔍 Search language: ${queryLang === 'thai' ? '🇹🇭 Thai' : queryLang === 'mixed' ? '🌐 Mixed' : '🇺🇸 English'}`);

        // 2. Extract entities from query for graph traversal (language-aware)
        let queryEntities: { name: string; type: string }[];
        if (queryLang === 'thai' || queryLang === 'mixed') {
            queryEntities = await extractThaiEntities(query);
        } else {
            queryEntities = await this.extractEntities(query);
        }
        const entityNames = queryEntities.map(e => e.name.toLowerCase());

        // 3. Vector search (cosine similarity)
        // First check how many chunks exist and how many have valid embeddings
        const chunkStats = await this.executeAQL<{ total: number; withEmbeddings: number }>(`
            LET total = LENGTH(FOR c IN ${COLLECTIONS.chunks} RETURN 1)
            LET withEmbeddings = LENGTH(FOR c IN ${COLLECTIONS.chunks} FILTER LENGTH(c.embedding) > 0 RETURN 1)
            RETURN { total: total, withEmbeddings: withEmbeddings }
        `, {});
        
        const stats = chunkStats[0] || { total: 0, withEmbeddings: 0 };
        console.log(`📦 Knowledge Base: ${stats.total} chunks total, ${stats.withEmbeddings} with embeddings`);
        
        if (stats.total === 0) {
            console.warn('⚠️ No documents indexed in Knowledge Base. Please upload files first.');
            return [];
        }
        
        if (stats.withEmbeddings === 0) {
            console.warn('⚠️ Documents exist but no embeddings found. Embedding may have failed during indexing.');
            // Try text-based fallback search
            console.log('🔄 Falling back to text-based search...');
            const textResults = await this.executeAQL<{
                text: string;
                documentName: string;
                chunkIndex: number;
            }>(`
                FOR chunk IN ${COLLECTIONS.chunks}
                    FILTER CONTAINS(LOWER(chunk.text), LOWER(@query))
                    LIMIT @topK
                    RETURN {
                        text: chunk.text,
                        documentName: chunk.documentName,
                        chunkIndex: chunk.chunkIndex
                    }
            `, { query: query.substring(0, 50), topK });
            
            if (textResults.length > 0) {
                console.log(`📝 Text search fallback found ${textResults.length} results`);
                return textResults.map(r => ({
                    content: r.text,
                    documentName: r.documentName,
                    chunkIndex: r.chunkIndex,
                    score: 0.5,
                    source: 'vector' as const
                }));
            }
            return [];
        }
        
        const vectorResults = await this.executeAQL<{
            text: string;
            documentName: string;
            chunkIndex: number;
            similarity: number;
        }>(`
            FOR chunk IN ${COLLECTIONS.chunks}
                LET similarity = (
                    LET dotProduct = SUM(FOR i IN 0..LENGTH(chunk.embedding)-1 RETURN chunk.embedding[i] * @queryEmb[i])
                    LET normA = SQRT(SUM(FOR x IN chunk.embedding RETURN x * x))
                    LET normB = SQRT(SUM(FOR x IN @queryEmb RETURN x * x))
                    RETURN normA > 0 AND normB > 0 ? dotProduct / (normA * normB) : 0
                )[0]
                FILTER similarity > 0.3
                SORT similarity DESC
                LIMIT @topK
                RETURN {
                    text: chunk.text,
                    documentName: chunk.documentName,
                    chunkIndex: chunk.chunkIndex,
                    similarity: similarity
                }
        `, { queryEmb: queryEmbedding, topK });
        
        console.log(`🔎 Vector search found ${vectorResults.length} results (threshold: 0.3)`);

        // 4. Graph traversal (entity-based)
        let graphResults: HybridSearchResult[] = [];
        
        if (entityNames.length > 0) {
            const graphData = await this.executeAQL<{
                text: string;
                documentName: string;
                chunkIndex: number;
                entities: string[];
                matchCount: number;
            }>(`
                FOR entity IN ${COLLECTIONS.entities}
                    FILTER LOWER(entity.name) IN @entityNames
                    FOR v, e, p IN 1..1 INBOUND entity ${COLLECTIONS.mentions}
                        LET chunk = v
                        LET mentionedEntities = (
                            FOR e2 IN ${COLLECTIONS.mentions}
                                FILTER e2._from == chunk._id
                                FOR ent IN ${COLLECTIONS.entities}
                                    FILTER ent._id == e2._to
                                    RETURN ent.name
                        )
                        COLLECT chunkId = chunk._id, 
                                chunkText = chunk.text, 
                                docName = chunk.documentName, 
                                chunkIdx = chunk.chunkIndex,
                                ents = mentionedEntities
                        AGGREGATE matchCount = SUM(1)
                        SORT matchCount DESC
                        LIMIT @topK
                        RETURN {
                            text: chunkText,
                            documentName: docName,
                            chunkIndex: chunkIdx,
                            entities: ents,
                            matchCount: matchCount
                        }
            `, { entityNames, topK });

            graphResults = graphData.map(r => ({
                content: r.text,
                documentName: r.documentName,
                chunkIndex: r.chunkIndex,
                score: 0.5 + (r.matchCount * 0.1), // Boost by entity matches
                source: 'graph' as const,
                entities: r.entities
            }));
        }

        // 5. Combine and deduplicate results
        const seenChunks = new Set<string>();
        const combinedResults: HybridSearchResult[] = [];

        // Add vector results first (usually more relevant)
        for (const r of vectorResults) {
            const key = `${r.documentName}-${r.chunkIndex}`;
            if (!seenChunks.has(key)) {
                seenChunks.add(key);
                combinedResults.push({
                    content: r.text,
                    documentName: r.documentName,
                    chunkIndex: r.chunkIndex,
                    score: r.similarity,
                    source: 'vector'
                });
            }
        }

        // Add graph results that weren't in vector results
        for (const r of graphResults) {
            const key = `${r.documentName}-${r.chunkIndex}`;
            if (!seenChunks.has(key)) {
                seenChunks.add(key);
                combinedResults.push(r);
            } else {
                // Boost score for chunks found by both methods
                const existing = combinedResults.find(c => 
                    c.documentName === r.documentName && c.chunkIndex === r.chunkIndex
                );
                if (existing) {
                    existing.score = Math.min(1, existing.score + 0.1);
                    existing.source = 'hybrid';
                    existing.entities = r.entities;
                }
            }
        }

        // Sort by score and limit
        return combinedResults
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Get graph context for an entity (related entities and paths)
     */
    async getEntityContext(entityName: string): Promise<{
        entity: ArangoEntity | null;
        relatedChunks: { text: string; documentName: string }[];
        relatedEntities: string[];
    }> {
        const entityKey = this.sanitizeKey(entityName);

        // Get entity
        const entities = await this.executeAQL<ArangoEntity>(`
            FOR e IN ${COLLECTIONS.entities}
                FILTER e._key == @key OR LOWER(e.name) == LOWER(@name)
                LIMIT 1
                RETURN e
        `, { key: entityKey, name: entityName });

        if (entities.length === 0) {
            return { entity: null, relatedChunks: [], relatedEntities: [] };
        }

        const entity = entities[0];

        // Get related chunks
        const relatedChunks = await this.executeAQL<{ text: string; documentName: string }>(`
            FOR e IN ${COLLECTIONS.entities}
                FILTER e._key == @key
                FOR v IN 1..1 INBOUND e ${COLLECTIONS.mentions}
                    LIMIT 5
                    RETURN { text: v.text, documentName: v.documentName }
        `, { key: entity._key });

        // Get related entities (entities that appear in same chunks)
        const relatedEntities = await this.executeAQL<string>(`
            FOR e IN ${COLLECTIONS.entities}
                FILTER e._key == @key
                FOR chunk IN 1..1 INBOUND e ${COLLECTIONS.mentions}
                    FOR e2 IN 1..1 OUTBOUND chunk ${COLLECTIONS.mentions}
                        FILTER e2._key != @key
                        COLLECT entityName = e2.name
                        LIMIT 10
                        RETURN entityName
        `, { key: entity._key });

        return { entity, relatedChunks, relatedEntities };
    }

    /**
     * Get statistics about the knowledge graph
     */
    async getStats(): Promise<{
        documents: number;
        chunks: number;
        entities: number;
        relationships: number;
    }> {
        try {
            const stats = await this.executeAQL<{
                docs: number;
                chunks: number;
                entities: number;
                rels: number;
            }>(`
                RETURN {
                    docs: LENGTH(${COLLECTIONS.documents}),
                    chunks: LENGTH(${COLLECTIONS.chunks}),
                    entities: LENGTH(${COLLECTIONS.entities}),
                    rels: LENGTH(${COLLECTIONS.hasChunk}) + LENGTH(${COLLECTIONS.mentions}) + LENGTH(${COLLECTIONS.nextChunk})
                }
            `);

            return stats[0] || { documents: 0, chunks: 0, entities: 0, relationships: 0 };
        } catch {
            return { documents: 0, chunks: 0, entities: 0, relationships: 0 };
        }
    }

    // ==================== Helper Methods ====================

    private chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): { text: string; start: number; end: number }[] {
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

    private async extractEntities(text: string): Promise<{ name: string; type: ArangoEntity['type'] }[]> {
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
        if (!OPENAI_API_KEY) return [];

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
                            content: `Extract named entities from the text. Return JSON: {"entities": [{"name": "string", "type": "LOCATION|ORGANIZATION|DATE|PRICE|ACTIVITY|HOTEL|FLIGHT|OTHER"}]}`
                        },
                        { role: 'user', content: text.substring(0, 2000) }
                    ],
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) return [];

            const data = await response.json();
            const parsed = JSON.parse(data.choices[0].message.content);
            return parsed.entities || [];
        } catch {
            return [];
        }
    }

    private sanitizeKey(str: string): string {
        // ArangoDB keys can only contain letters, numbers, underscore, and hyphen
        return str.toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 254);
    }
}

// ==================== Exports ====================

let arangoInstance: ArangoHybridRAG | null = null;

export function getArangoRAG(): ArangoHybridRAG {
    if (!arangoInstance) {
        arangoInstance = new ArangoHybridRAG();
    }
    return arangoInstance;
}

/**
 * Check if ArangoDB is available
 */
export async function isArangoAvailable(): Promise<boolean> {
    const arango = getArangoRAG();
    return await arango.checkConnection();
}

/**
 * Initialize ArangoDB for Hybrid RAG
 */
export async function initializeArangoRAG(): Promise<boolean> {
    const arango = getArangoRAG();
    const connected = await arango.checkConnection();
    if (!connected) return false;
    return await arango.initialize();
}

/**
 * Index a document in ArangoDB (graph + vector)
 */
export async function indexDocumentInArango(doc: Document): Promise<{ chunks: number; entities: number }> {
    const arango = getArangoRAG();
    return await arango.indexDocument(doc);
}

/**
 * Remove a document from ArangoDB
 */
export async function removeDocumentFromArango(documentId: number): Promise<void> {
    const arango = getArangoRAG();
    await arango.removeDocument(documentId);
}

/**
 * Perform hybrid search (vector + graph)
 */
export async function hybridSearch(query: string, topK: number = 5): Promise<HybridSearchResult[]> {
    const arango = getArangoRAG();
    return await arango.hybridSearch(query, topK);
}

/**
 * Hybrid RAG Query - Main entry point for Q&A
 * Language-aware: Uses Thai-optimized processing for Thai queries
 */
export async function arangoHybridQuery(
    question: string,
    chatHistory: ChatMessage[],
    language: string
): Promise<HybridRAGResponse> {
    const startTime = Date.now();
    const arango = getArangoRAG();

    // Detect question language
    const questionLang = detectLanguage(question);
    const langEmoji = questionLang === 'thai' ? '🇹🇭' : questionLang === 'mixed' ? '🌐' : '🇺🇸';
    
    console.log(`\n🔄 ArangoDB Hybrid RAG Query (${langEmoji} ${questionLang}): "${question}"`);

    // Perform hybrid search with language-aware embedding
    const results = await arango.hybridSearch(question, 5);

    const vectorCount = results.filter(r => r.source === 'vector').length;
    const graphCount = results.filter(r => r.source === 'graph').length;
    const hybridCount = results.filter(r => r.source === 'hybrid').length;

    console.log(`📊 Results: ${vectorCount} vector, ${graphCount} graph, ${hybridCount} hybrid`);

    // Build context for LLM with language indicators
    // Limit each chunk to 2000 chars and total context to ~40000 chars
    const MAX_CHUNK_CHARS = 2000;
    const MAX_TOTAL_CHARS = 40000;
    let totalChars = 0;
    
    const contextParts: string[] = [];
    for (const r of results) {
        const sourceLabel = r.source === 'vector' ? '🔍 Semantic' : r.source === 'graph' ? '🔗 Graph' : '⚡ Hybrid';
        const entityInfo = r.entities?.length ? `\nEntities: ${r.entities.slice(0, 5).join(', ')}` : '';
        const truncatedContent = r.content.length > MAX_CHUNK_CHARS 
            ? r.content.substring(0, MAX_CHUNK_CHARS) + '...'
            : r.content;
        
        const part = `[Source: ${r.documentName} - ${sourceLabel}]${entityInfo}\n${truncatedContent}`;
        
        if (totalChars + part.length > MAX_TOTAL_CHARS) {
            console.log(`⚠️ Context limit reached at ${totalChars} chars, stopping at ${contextParts.length} sources`);
            break;
        }
        
        contextParts.push(part);
        totalChars += part.length;
    }

    const context = contextParts.length > 0 
        ? `## Retrieved Knowledge (Hybrid RAG)\n\n${contextParts.join('\n\n---\n\n')}`
        : 'No relevant information found in the knowledge base.';
    
    console.log(`📝 Context size: ${totalChars} chars from ${contextParts.length} sources`);

    // Generate language-aware answer
    const answer = await generateThaiAwareAnswer(chatHistory, context, question, language);

    // Collect all entities
    const allEntities = [...new Set(results.flatMap(r => r.entities || []))];

    // Add source citations with language info
    let finalAnswer = answer;
    if (results.length > 0) {
        const docNames = [...new Set(results.map(r => r.documentName))];
        finalAnswer += `\n\n---\n📚 **Sources:** ${docNames.join(', ')}`;
        if (allEntities.length > 0) {
            finalAnswer += ` | 🏷️ **Entities:** ${allEntities.slice(0, 5).join(', ')}`;
        }
    }

    return {
        answer: finalAnswer,
        sources: {
            vectorResults: vectorCount + hybridCount,
            graphResults: graphCount + hybridCount,
            entities: allEntities
        },
        processingTime: Date.now() - startTime
    };
}

/**
 * Get ArangoDB statistics
 */
export async function getArangoStats(): Promise<{
    documents: number;
    chunks: number;
    entities: number;
    relationships: number;
} | null> {
    try {
        const arango = getArangoRAG();
        const connected = await arango.checkConnection();
        if (!connected) return null;
        return await arango.getStats();
    } catch {
        return null;
    }
}

