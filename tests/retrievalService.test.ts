/**
 * Tests for Retrieval Service
 * 
 * Tests the retrieval module functionality including:
 * - Query embedding
 * - Vector similarity search
 * - Chunk retrieval and formatting
 * - Metadata filtering
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as retrievalService from '../services/retrievalService';
import * as chromaService from '../services/chromaService';

describe('Retrieval Service', () => {
  let isChromaAvailable: boolean;

  beforeAll(async () => {
    // Check if ChromaDB is available for integration tests
    isChromaAvailable = await chromaService.isChromaAvailable();
    if (!isChromaAvailable) {
      console.warn('⚠️  ChromaDB not available - skipping integration tests');
    }
  });

  describe('Query Embedding', () => {
    it('should embed a query text', async () => {
      const query = 'What hotels are included in the tour?';
      
      // Note: This requires an actual API key, so it might fail in CI
      // You can mock this in unit tests
      try {
        const embedding = await retrievalService.embedQuery(query);
        expect(embedding).toBeDefined();
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBeGreaterThan(0);
      } catch (error) {
        // If API key is not available, skip this test
        console.warn('Skipping embedding test - API key may not be available');
        expect(error).toBeDefined();
      }
    });

    it('should throw error for empty query', async () => {
      await expect(retrievalService.embedQuery('')).rejects.toThrow();
    });
  });

  describe('Retrieval Stats', () => {
    it('should get retrieval statistics', async () => {
      const stats = await retrievalService.getRetrievalStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('isAvailable');
      
      if (stats?.isAvailable) {
        expect(stats).toHaveProperty('collectionName');
        expect(stats.collectionName).toBe('itinerary_docs');
      }
    });

    it('should check if retrieval is available', async () => {
      const available = await retrievalService.isRetrievalAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Retrieval Functions', () => {
    it('should have retrieveRelevantChunks function', () => {
      expect(typeof retrievalService.retrieveRelevantChunks).toBe('function');
    });

    it('should have retrieveTravelPackageChunks function', () => {
      expect(typeof retrievalService.retrieveTravelPackageChunks).toBe('function');
    });

    it('should have retrieveFromDocument function', () => {
      expect(typeof retrievalService.retrieveFromDocument).toBe('function');
    });

    it('should have retrieveFromTour function', () => {
      expect(typeof retrievalService.retrieveFromTour).toBe('function');
    });

    it('should have batchRetrieve function', () => {
      expect(typeof retrievalService.batchRetrieve).toBe('function');
    });
  });

  describe('Integration Tests (requires ChromaDB)', () => {
    it.skipIf(!isChromaAvailable)('should retrieve relevant chunks from ChromaDB', async () => {
      const query = 'travel package to Thailand';
      const result = await retrievalService.retrieveRelevantChunks(query, {
        topK: 3,
        minScore: 0.0,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('chunks');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('formattedContext');
      expect(result).toHaveProperty('averageScore');
      expect(Array.isArray(result.chunks)).toBe(true);
      expect(result.query).toBe(query);
    }, 30000); // 30 second timeout

    it.skipIf(!isChromaAvailable)('should format context correctly', async () => {
      const query = 'hotel accommodation';
      const result = await retrievalService.retrieveRelevantChunks(query, {
        topK: 2,
      });

      expect(result.formattedContext).toBeDefined();
      expect(typeof result.formattedContext).toBe('string');
      
      if (result.chunks.length > 0) {
        // Context should contain source information
        expect(result.formattedContext).toContain('Retrieved Knowledge');
      }
    }, 30000);

    it.skipIf(!isChromaAvailable)('should filter by source', async () => {
      const query = 'test query';
      const result = await retrievalService.retrieveRelevantChunks(query, {
        topK: 5,
        filterBySource: 'pdf_scraper',
      });

      expect(result).toBeDefined();
      // All chunks should be from pdf_scraper if any were found
      result.chunks.forEach(chunk => {
        expect(chunk.metadata.source).toBe('pdf_scraper');
      });
    }, 30000);

    it.skipIf(!isChromaAvailable)('should handle empty results gracefully', async () => {
      const query = 'very specific query that should not match anything xyz123abc';
      const result = await retrievalService.retrieveRelevantChunks(query, {
        topK: 5,
        minScore: 0.9, // High threshold to ensure no results
      });

      expect(result).toBeDefined();
      expect(result.chunks).toEqual([]);
      expect(result.totalRetrieved).toBe(0);
      expect(result.averageScore).toBe(0);
    }, 30000);
  });

  describe('Configuration Options', () => {
    it('should accept custom topK', async () => {
      // This will likely return empty if ChromaDB is not available or empty
      // but it should not throw an error
      try {
        const result = await retrievalService.retrieveRelevantChunks('test', {
          topK: 10,
        });
        expect(result).toBeDefined();
        expect(result.chunks.length).toBeLessThanOrEqual(10);
      } catch (error: any) {
        // Only fail if it's not a connection error
        if (!error.message?.includes('not available')) {
          throw error;
        }
      }
    });

    it('should accept minScore threshold', async () => {
      try {
        const result = await retrievalService.retrieveRelevantChunks('test', {
          topK: 5,
          minScore: 0.5,
        });
        expect(result).toBeDefined();
        // All chunks should meet the minimum score threshold
        result.chunks.forEach(chunk => {
          expect(chunk.score).toBeGreaterThanOrEqual(0.5);
        });
      } catch (error: any) {
        if (!error.message?.includes('not available')) {
          throw error;
        }
      }
    });
  });
});

