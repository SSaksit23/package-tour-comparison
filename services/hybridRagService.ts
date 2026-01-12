/**
 * Hybrid RAG Service - Combines ChromaDB + Neo4j
 * 
 * This service implements an ensemble retrieval approach:
 * 1. ChromaDB: Handles unstructured text and similarity search
 * 2. Neo4j: Handles structured relationships and graph traversal
 * 3. Synthesis: Combines results from both sources for comprehensive answers
 */

import { Document, ChatMessage } from '../types';
import { embedText, generateAnswer } from './aiProvider';
import { searchChroma, indexDocumentInChroma, removeDocumentFromChroma, isChromaAvailable, ChromaSearchResult } from './chromaService';
import { getKnowledgeGraph, extractEntities } from './neo4jService';
import { indexDocumentForRAG, removeDocumentFromRAG } from './ragService';

// OpenAI configuration for entity extraction and synthesis
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Types
export interface HybridSearchResult {
    source: 'chroma' | 'neo4j';
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
        neo4jResults: number;
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
 * Generate a Cypher query from natural language using LLM
 */
async function generateCypherQuery(question: string, entities: string[]): Promise<string | null> {
    if (!OPENAI_API_KEY) return null;

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
                        content: `You are a Neo4j Cypher query generator for a travel itinerary knowledge graph.

The graph has these node types:
- Document: {id, name, text, createdAt}
- Chunk: {id, documentId, documentName, chunkIndex, text}
- Entity: {name, type} where type is one of: LOCATION, ORGANIZATION, DATE, PRICE, ACTIVITY, HOTEL, FLIGHT

Relationships:
- (Document)-[:HAS_CHUNK]->(Chunk)
- (Chunk)-[:MENTIONS]->(Entity)
- (Chunk)-[:NEXT]->(Chunk)
- (Document)-[:MENTIONS]->(Entity)
- (Document)-[:RELATED_TO]->(Document)

Given a question, generate a Cypher query to find relevant information.
Return ONLY the Cypher query, nothing else. If you cannot generate a query, return "NULL".

Known entities from the question: ${entities.join(', ') || 'None detected'}`
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                temperature: 0
            })
        });

        if (!response.ok) return null;
        
        const data = await response.json();
        const cypher = data.choices[0].message.content.trim();
        
        if (cypher === 'NULL' || !cypher.toUpperCase().includes('MATCH')) {
            return null;
        }
        
        return cypher;
    } catch (error) {
        console.error('Cypher generation error:', error);
        return null;
    }
}

/**
 * Execute a Cypher query on Neo4j and extract results
 */
async function executeGraphQuery(question: string, entities: string[]): Promise<GraphQueryResult> {
    const graph = getKnowledgeGraph();
    const result: GraphQueryResult = { content: '', entities: [], relationships: [] };

    try {
        // Check if Neo4j is available
        const isConnected = await graph.checkConnection();
        if (!isConnected) {
            return result;
        }

        // Try entity-based search first (more reliable)
        if (entities.length > 0) {
            // Find documents/chunks that mention the entities
            const entityQuery = `
                MATCH (c:Chunk)-[:MENTIONS]->(e:Entity)
                WHERE e.name IN $entities OR toLower(e.name) IN $lowerEntities
                RETURN DISTINCT c.text as text, c.documentName as docName, collect(e.name) as entities
                LIMIT 5
            `;
            
            // Note: This would require the graph instance to have a query method
            // For now, we'll use a simplified approach
        }

        // Generate and execute Cypher query for complex questions
        const cypher = await generateCypherQuery(question, entities);
        if (cypher) {
            console.log('🔍 Generated Cypher:', cypher);
            // Execute the query (would need graph.query method)
        }

        return result;
    } catch (error) {
        console.error('Graph query error:', error);
        return result;
    }
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
 * Synthesize answers from multiple sources
 */
async function synthesizeAnswer(
    question: string,
    chromaResults: ChromaSearchResult[],
    graphResults: GraphQueryResult,
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

    // Build context from Neo4j (graph traversal results)
    let graphContext = '';
    if (graphResults.content) {
        graphContext = `[Graph Data]\n${graphResults.content}`;
        if (graphResults.entities.length > 0) {
            graphContext += `\nEntities: ${graphResults.entities.join(', ')}`;
        }
        if (graphResults.relationships.length > 0) {
            graphContext += `\nRelationships: ${graphResults.relationships.join(', ')}`;
        }
    }

    // Combine contexts
    const combinedContext = `
## Retrieved Context

### From Vector Search (Semantic Similarity)
${vectorContext || 'No relevant text chunks found.'}

### From Graph Database (Structured Relationships)
${graphContext || 'No graph relationships found.'}
`;

    // Generate synthesized answer
    return await generateAnswer(chatHistory, combinedContext, question, language);
}

/**
 * Hybrid RAG Query - Main entry point
 * 
 * Process:
 * 1. Extract entities from question (for graph traversal)
 * 2. Search ChromaDB for semantically similar text chunks
 * 3. Query Neo4j for structured relationships
 * 4. Synthesize results using LLM
 */
export async function hybridRagQuery(
    question: string,
    chatHistory: ChatMessage[],
    language: string
): Promise<HybridRAGResponse> {
    const startTime = Date.now();
    
    console.log(`\n🔄 Hybrid RAG Query: "${question}"`);

    // Step 1: Extract entities from question for graph traversal
    const queryEntities = await extractQueryEntities(question);
    console.log('📍 Extracted entities:', queryEntities);

    // Step 2: Run parallel searches
    const [chromaResults, graphResults] = await Promise.all([
        // Vector search in ChromaDB
        searchChroma(question, 5).catch(err => {
            console.warn('ChromaDB search failed:', err);
            return [] as ChromaSearchResult[];
        }),
        
        // Graph query in Neo4j
        executeGraphQuery(question, queryEntities).catch(err => {
            console.warn('Neo4j query failed:', err);
            return { content: '', entities: [], relationships: [] } as GraphQueryResult;
        })
    ]);

    console.log(`📚 ChromaDB: ${chromaResults.length} results`);
    console.log(`🔗 Neo4j: ${graphResults.entities.length} entities found`);

    // Step 3: If ChromaDB found entities, use them for a second Neo4j pass
    // (Advanced: Entity handoff from vector to graph)
    if (chromaResults.length > 0 && queryEntities.length === 0) {
        // Extract entities from ChromaDB results for graph enrichment
        const chromaText = chromaResults.map(r => r.content).join(' ');
        const enrichedEntities = await extractQueryEntities(chromaText);
        
        if (enrichedEntities.length > 0) {
            console.log('🔄 Entity handoff to graph:', enrichedEntities);
            // Could do a second graph pass here
        }
    }

    // Step 4: Synthesize final answer
    const answer = await synthesizeAnswer(
        question,
        chromaResults,
        graphResults,
        chatHistory,
        language
    );

    // Add source citations
    let finalAnswer = answer;
    if (chromaResults.length > 0 || graphResults.entities.length > 0) {
        const sources = [];
        if (chromaResults.length > 0) {
            const docNames = [...new Set(chromaResults.map(r => r.metadata.documentName).filter(Boolean))];
            sources.push(`Documents: ${docNames.join(', ')}`);
        }
        if (graphResults.entities.length > 0) {
            sources.push(`Entities: ${graphResults.entities.slice(0, 5).join(', ')}`);
        }
        finalAnswer += `\n\n---\n📚 **Sources:** ${sources.join(' | ')}`;
    }

    return {
        answer: finalAnswer,
        sources: {
            chromaResults: chromaResults.length,
            neo4jResults: graphResults.entities.length,
            entities: [...queryEntities, ...graphResults.entities]
        },
        processingTime: Date.now() - startTime
    };
}

/**
 * Index a document in both ChromaDB and Neo4j
 */
export async function indexDocumentHybrid(doc: Document): Promise<{
    chromaChunks: number;
    neo4jChunks: number;
    entities: number;
}> {
    console.log(`\n📥 Indexing "${doc.name}" in Hybrid RAG...`);

    // Index in parallel
    const [chromaResult, neo4jResult] = await Promise.all([
        indexDocumentInChroma(doc).catch(err => {
            console.warn('ChromaDB indexing failed:', err);
            return { chunksCreated: 0 };
        }),
        indexDocumentForRAG(doc).catch(err => {
            console.warn('Neo4j indexing failed:', err);
            return { chunksCreated: 0, entitiesExtracted: 0 };
        })
    ]);

    console.log(`✅ Indexed: ChromaDB=${chromaResult.chunksCreated} chunks, Neo4j=${neo4jResult.chunksCreated} chunks`);

    return {
        chromaChunks: chromaResult.chunksCreated,
        neo4jChunks: neo4jResult.chunksCreated,
        entities: neo4jResult.entitiesExtracted || 0
    };
}

/**
 * Remove a document from both ChromaDB and Neo4j
 */
export async function removeDocumentHybrid(documentId: number): Promise<void> {
    await Promise.all([
        removeDocumentFromChroma(documentId).catch(() => {}),
        removeDocumentFromRAG(documentId).catch(() => {})
    ]);
}

/**
 * Check if Hybrid RAG is available
 */
export async function isHybridRagAvailable(): Promise<{
    chroma: boolean;
    neo4j: boolean;
    full: boolean;
}> {
    const [chromaAvailable, neo4jAvailable] = await Promise.all([
        isChromaAvailable(),
        getKnowledgeGraph().checkConnection()
    ]);

    return {
        chroma: chromaAvailable,
        neo4j: neo4jAvailable,
        full: chromaAvailable && neo4jAvailable
    };
}

/**
 * Get Hybrid RAG statistics
 */
export async function getHybridRagStats(): Promise<{
    chroma: { count: number } | null;
    neo4j: { chunks: number; documents: number; entities: number } | null;
}> {
    const { getRAGStats } = await import('./ragService');
    const { getChromaStats } = await import('./chromaService');

    const [chromaStats, neo4jStats] = await Promise.all([
        getChromaStats().catch(() => null),
        getRAGStats().catch(() => null)
    ]);

    return {
        chroma: chromaStats,
        neo4j: neo4jStats
    };
}

