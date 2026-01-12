/**
 * Neo4j Knowledge Graph Service
 * Provides graph-based document storage and semantic retrieval
 */

import { Document } from '../types';
import { embedText } from './aiProvider';

// Neo4j connection configuration from environment
// Supports both local Docker (bolt://) and Neo4j Aura (neo4j+s://)
const NEO4J_URI = (typeof process !== 'undefined' && process.env?.NEO4J_URI) || 'bolt://localhost:7687';
const NEO4J_USER = (typeof process !== 'undefined' && process.env?.NEO4J_USER) || 'neo4j';
const NEO4J_PASSWORD = (typeof process !== 'undefined' && process.env?.NEO4J_PASSWORD) || 'password123';

// Check if using Neo4j Aura (cloud)
const isAura = NEO4J_URI.includes('neo4j.io') || NEO4J_URI.includes('neo4j+s://');

// Types for Neo4j operations
export interface GraphDocument {
    id: string;
    name: string;
    text: string;
    createdAt: string;
    embedding?: number[];
    entities?: ExtractedEntity[];
}

export interface ExtractedEntity {
    name: string;
    type: 'LOCATION' | 'ORGANIZATION' | 'DATE' | 'PRICE' | 'ACTIVITY' | 'HOTEL' | 'FLIGHT';
}

export interface GraphSearchResult {
    document: GraphDocument;
    score: number;
    relatedDocuments: { name: string; relationship: string }[];
}

// Cosine similarity calculation for vector search
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Neo4j Knowledge Graph Client
 * Uses HTTP API for browser compatibility
 */
class Neo4jKnowledgeGraph {
    private uri: string;
    private auth: { user: string; password: string };
    private isConnected: boolean = false;
    private isAuraInstance: boolean = false;

    constructor() {
        this.isAuraInstance = isAura;
        
        if (this.isAuraInstance) {
            // Neo4j Aura uses HTTPS endpoint
            // Extract the database ID from neo4j+s://xxx.databases.neo4j.io
            const auraMatch = NEO4J_URI.match(/([a-z0-9]+)\.databases\.neo4j\.io/);
            if (auraMatch) {
                this.uri = `https://${auraMatch[1]}.databases.neo4j.io`;
            } else {
                this.uri = NEO4J_URI.replace('neo4j+s://', 'https://').replace('neo4j://', 'https://');
            }
            console.log('🌐 Neo4j Aura endpoint:', this.uri);
        } else {
            // Local Docker - Convert bolt:// to http:// for REST API
            this.uri = NEO4J_URI.replace('bolt://', 'http://').replace(':7687', ':7474');
        }
        this.auth = { user: NEO4J_USER, password: NEO4J_PASSWORD };
    }

    /**
     * Execute a Cypher query via Neo4j HTTP API
     */
    private async executeCypher<T = any>(query: string, parameters: Record<string, any> = {}): Promise<T[]> {
        try {
            const response = await fetch(`${this.uri}/db/neo4j/tx/commit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + btoa(`${this.auth.user}:${this.auth.password}`)
                },
                body: JSON.stringify({
                    statements: [{
                        statement: query,
                        parameters
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`Neo4j HTTP error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.errors && data.errors.length > 0) {
                throw new Error(data.errors[0].message);
            }

            this.isConnected = true;
            
            // Transform Neo4j response to simple array
            const results = data.results[0];
            if (!results || !results.data) return [];
            
            return results.data.map((row: any) => {
                const obj: any = {};
                results.columns.forEach((col: string, idx: number) => {
                    obj[col] = row.row[idx];
                });
                return obj;
            });
        } catch (error) {
            console.error('Neo4j query error:', error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Check if Neo4j is available
     */
    async checkConnection(): Promise<boolean> {
        try {
            await this.executeCypher('RETURN 1 as test');
            this.isConnected = true;
            return true;
        } catch {
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Initialize the graph schema with constraints and indexes
     */
    async initializeSchema(): Promise<void> {
        const schemaQueries = [
            'CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE',
            'CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE',
            'CREATE INDEX doc_name IF NOT EXISTS FOR (d:Document) ON (d.name)',
            'CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)'
        ];

        for (const query of schemaQueries) {
            try {
                await this.executeCypher(query);
            } catch (e) {
                // Ignore constraint already exists errors
                console.log('Schema setup:', e);
            }
        }
    }

    /**
     * Add a document to the knowledge graph with entities extracted
     */
    async addDocument(doc: Document, entities: ExtractedEntity[], embedding: number[]): Promise<void> {
        // Create document node
        await this.executeCypher(`
            MERGE (d:Document {id: $id})
            SET d.name = $name,
                d.text = $text,
                d.createdAt = $createdAt,
                d.embedding = $embedding
        `, {
            id: String(doc.id),
            name: doc.name,
            text: doc.text.substring(0, 10000), // Limit text size
            createdAt: doc.createdAt,
            embedding: embedding
        });

        // Create entity nodes and relationships
        for (const entity of entities) {
            await this.executeCypher(`
                MERGE (e:Entity {name: $entityName})
                SET e.type = $entityType
                WITH e
                MATCH (d:Document {id: $docId})
                MERGE (d)-[:MENTIONS]->(e)
            `, {
                entityName: entity.name,
                entityType: entity.type,
                docId: String(doc.id)
            });
        }

        // Create relationships between documents that share entities
        await this.executeCypher(`
            MATCH (d1:Document {id: $docId})-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(d2:Document)
            WHERE d1 <> d2
            MERGE (d1)-[r:RELATED_TO]->(d2)
            SET r.sharedEntities = COALESCE(r.sharedEntities, 0) + 1
        `, { docId: String(doc.id) });
    }

    /**
     * Remove a document and its orphan relationships
     */
    async removeDocument(docId: number): Promise<void> {
        await this.executeCypher(`
            MATCH (d:Document {id: $id})
            DETACH DELETE d
        `, { id: String(docId) });

        // Clean up orphan entities
        await this.executeCypher(`
            MATCH (e:Entity)
            WHERE NOT (e)<-[:MENTIONS]-()
            DELETE e
        `);
    }

    /**
     * Semantic search using vector similarity + graph traversal
     */
    async semanticSearch(queryEmbedding: number[], topK: number = 5): Promise<GraphSearchResult[]> {
        // Get all documents with embeddings
        const docs = await this.executeCypher<{
            id: string;
            name: string;
            text: string;
            createdAt: string;
            embedding: number[];
        }>(`
            MATCH (d:Document)
            WHERE d.embedding IS NOT NULL
            RETURN d.id as id, d.name as name, d.text as text, 
                   d.createdAt as createdAt, d.embedding as embedding
        `);

        // Calculate similarity scores
        const scoredDocs = docs
            .filter(doc => doc.embedding && doc.embedding.length > 0)
            .map(doc => ({
                document: {
                    id: doc.id,
                    name: doc.name,
                    text: doc.text,
                    createdAt: doc.createdAt
                },
                score: cosineSimilarity(queryEmbedding, doc.embedding)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        // Enrich with related documents
        const results: GraphSearchResult[] = [];
        for (const scored of scoredDocs) {
            const related = await this.executeCypher<{ name: string; sharedEntities: number }>(`
                MATCH (d:Document {id: $id})-[r:RELATED_TO]-(d2:Document)
                RETURN d2.name as name, r.sharedEntities as sharedEntities
                ORDER BY r.sharedEntities DESC
                LIMIT 3
            `, { id: scored.document.id });

            results.push({
                ...scored,
                relatedDocuments: related.map(r => ({
                    name: r.name,
                    relationship: `${r.sharedEntities} shared entities`
                }))
            });
        }

        return results;
    }

    /**
     * Find documents by entity
     */
    async findByEntity(entityName: string): Promise<GraphDocument[]> {
        const docs = await this.executeCypher<{
            id: string;
            name: string;
            text: string;
            createdAt: string;
        }>(`
            MATCH (d:Document)-[:MENTIONS]->(e:Entity)
            WHERE toLower(e.name) CONTAINS toLower($entityName)
            RETURN DISTINCT d.id as id, d.name as name, d.text as text, d.createdAt as createdAt
        `, { entityName });

        return docs;
    }

    /**
     * Get graph statistics
     */
    async getStats(): Promise<{ documents: number; entities: number; relationships: number }> {
        const stats = await this.executeCypher<{ docs: number; entities: number; rels: number }>(`
            MATCH (d:Document) 
            WITH count(d) as docs
            MATCH (e:Entity)
            WITH docs, count(e) as entities
            MATCH ()-[r:MENTIONS]->()
            RETURN docs, entities, count(r) as rels
        `);

        return {
            documents: stats[0]?.docs || 0,
            entities: stats[0]?.entities || 0,
            relationships: stats[0]?.rels || 0
        };
    }

    /**
     * Get all entities for visualization
     */
    async getAllEntities(): Promise<ExtractedEntity[]> {
        const entities = await this.executeCypher<{ name: string; type: string }>(`
            MATCH (e:Entity)
            RETURN e.name as name, e.type as type
            ORDER BY e.type, e.name
        `);

        return entities.map(e => ({
            name: e.name,
            type: e.type as ExtractedEntity['type']
        }));
    }
}

// Singleton instance
let graphInstance: Neo4jKnowledgeGraph | null = null;

/**
 * Get the Neo4j Knowledge Graph instance
 */
export function getKnowledgeGraph(): Neo4jKnowledgeGraph {
    if (!graphInstance) {
        graphInstance = new Neo4jKnowledgeGraph();
    }
    return graphInstance;
}

/**
 * Extract entities from document text using OpenAI
 */
export async function extractEntities(text: string): Promise<ExtractedEntity[]> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
    if (!apiKey) return [];
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Extract named entities from travel documents. Return a JSON object with an "entities" array containing objects with "name" and "type" fields.
Types: LOCATION, ORGANIZATION, DATE, PRICE, ACTIVITY, HOTEL, FLIGHT`
                    },
                    {
                        role: 'user',
                        content: text.substring(0, 8000)
                    }
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
 * Add a document to the knowledge graph with automatic entity extraction and embedding
 */
export async function addDocumentToGraph(doc: Document): Promise<void> {
    const graph = getKnowledgeGraph();
    
    // Check connection first
    const isConnected = await graph.checkConnection();
    if (!isConnected) {
        console.warn('Neo4j not available, skipping graph storage');
        return;
    }

    try {
        // Extract entities and generate embedding in parallel
        const [entities, embedding] = await Promise.all([
            extractEntities(doc.text),
            embedText(doc.text.substring(0, 5000)) // Limit for embedding
        ]);

        await graph.addDocument(doc, entities, embedding);
        console.log(`Added document "${doc.name}" to knowledge graph with ${entities.length} entities`);
    } catch (error) {
        console.error('Failed to add document to graph:', error);
        throw error;
    }
}

/**
 * Search the knowledge graph for relevant documents
 */
export async function searchKnowledgeGraph(query: string, topK: number = 5): Promise<GraphSearchResult[]> {
    const graph = getKnowledgeGraph();
    
    const isConnected = await graph.checkConnection();
    if (!isConnected) {
        return [];
    }

    try {
        const queryEmbedding = await embedText(query);
        return await graph.semanticSearch(queryEmbedding, topK);
    } catch (error) {
        console.error('Knowledge graph search failed:', error);
        return [];
    }
}

/**
 * Remove a document from the knowledge graph
 */
export async function removeDocumentFromGraph(docId: number): Promise<void> {
    const graph = getKnowledgeGraph();
    
    const isConnected = await graph.checkConnection();
    if (!isConnected) return;

    try {
        await graph.removeDocument(docId);
    } catch (error) {
        console.error('Failed to remove document from graph:', error);
    }
}

/**
 * Initialize the knowledge graph schema
 */
export async function initializeKnowledgeGraph(): Promise<boolean> {
    const graph = getKnowledgeGraph();
    
    try {
        const isConnected = await graph.checkConnection();
        if (isConnected) {
            await graph.initializeSchema();
            console.log('Knowledge graph initialized successfully');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to initialize knowledge graph:', error);
        return false;
    }
}

/**
 * Get knowledge graph statistics
 */
export async function getGraphStats(): Promise<{ documents: number; entities: number; relationships: number } | null> {
    const graph = getKnowledgeGraph();
    
    const isConnected = await graph.checkConnection();
    if (!isConnected) return null;

    try {
        return await graph.getStats();
    } catch {
        return null;
    }
}

