import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Manually parse .env file to ensure we read it correctly
function loadEnvFile(): Record<string, string> {
    const envPath = path.resolve(process.cwd(), '.env');
    const env: Record<string, string> = {};
    
    try {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            // Remove BOM if present
            const cleanContent = content.replace(/^\uFEFF/, '');
            const lines = cleanContent.split(/\r?\n/);
            
            console.log(`📄 Reading .env file from: ${envPath}`);
            
            for (const line of lines) {
                // Skip comments and empty lines
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine.startsWith('#')) continue;
                
                const match = trimmedLine.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    let value = match[2].trim();
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    env[key] = value;
                }
            }
            console.log(`✅ Loaded ${Object.keys(env).length} variables from .env`);
        } else {
            console.warn('⚠️  No .env file found at:', envPath);
        }
    } catch (e) {
        console.error('❌ Error reading .env file:', e);
    }
    
    return env;
}

export default defineConfig(() => {
    // Load from .env file
    const fileEnv = loadEnvFile();
    
    // Get values with fallbacks - AI Provider keys
    const openaiApiKey = fileEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
    const geminiApiKey = fileEnv.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
    const aiProvider = fileEnv.VITE_AI_PROVIDER || process.env.VITE_AI_PROVIDER || 'auto';
    
    // ArangoDB - Unified Hybrid RAG (Graph + Vector)
    const arangoUrl = fileEnv.ARANGO_URL || process.env.ARANGO_URL || 'http://localhost:8529';
    const arangoInternalUrl = process.env.ARANGO_INTERNAL_URL || 'http://arangodb:8529';
    const arangoUser = fileEnv.ARANGO_USER || process.env.ARANGO_USER || 'root';
    const arangoPassword = fileEnv.ARANGO_PASSWORD || process.env.ARANGO_PASSWORD || 'password123';
    const arangoDatabase = fileEnv.ARANGO_DATABASE || process.env.ARANGO_DATABASE || 'itinerary_kb';
    
    // ChromaDB - Vector database (backup/alternative)
    const chromaUrl = fileEnv.CHROMA_URL || process.env.CHROMA_URL || 'http://localhost:8000';
    const chromaInternalUrl = process.env.CHROMA_INTERNAL_URL || 'http://chromadb:8000';
    
    // OpenThaiGPT - Thai RAG (optional)
    const openthaiEnabled = fileEnv.OPENTHAI_ENABLED || process.env.OPENTHAI_ENABLED || 'false';
    const openthaiUrl = fileEnv.OPENTHAI_API_URL || process.env.OPENTHAI_API_URL || 'http://localhost:5000';
    
    // PDF Extractor - PyMuPDF backend for reliable PDF extraction
    const pdfExtractorUrl = fileEnv.PDF_EXTRACTOR_URL || process.env.PDF_EXTRACTOR_URL || 'http://localhost:5001';
    const pdfExtractorInternalUrl = process.env.PDF_EXTRACTOR_INTERNAL_URL || 'http://pdf-extractor:5001';
    
    // Log status
    if (geminiApiKey) {
        console.log('✅ VITE_GEMINI_API_KEY loaded:', geminiApiKey.substring(0, 10) + '...');
    }
    if (openaiApiKey) {
        console.log('✅ OPENAI_API_KEY loaded:', openaiApiKey.substring(0, 10) + '...');
    }
    if (!geminiApiKey && !openaiApiKey) {
        console.warn('\n⚠️  WARNING: No AI API keys set!');
        console.warn('   Add VITE_GEMINI_API_KEY or OPENAI_API_KEY to your .env file\n');
    }
    const availableProviders = [
        geminiApiKey ? 'Gemini' : null,
        openaiApiKey ? 'OpenAI' : null
    ].filter(Boolean).join(', ');
    console.log('🤖 AI Provider:', aiProvider, `(Available: ${availableProviders || 'none'})`);
    
    console.log('🔗 ArangoDB URL:', arangoUrl);
    console.log('📊 ChromaDB URL:', chromaUrl);
    console.log('📄 PDF Extractor URL:', pdfExtractorUrl);
    
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
            proxy: {
                // Proxy ArangoDB requests to avoid CORS issues
                // System database proxy (for creating databases)
                '/arango-system': {
                    target: arangoInternalUrl,
                    changeOrigin: true,
                    rewrite: (path: string) => path.replace(/^\/arango-system/, '/_db/_system/_api'),
                },
                // Database-specific proxy
                '/arango-api': {
                    target: arangoInternalUrl,
                    changeOrigin: true,
                    rewrite: (path: string) => path.replace(/^\/arango-api/, `/_db/${arangoDatabase}/_api`),
                },
                // Proxy ChromaDB requests (backup)
                // ChromaDB v2 API
                '/chroma-api': {
                    target: chromaInternalUrl,
                    changeOrigin: true,
                    rewrite: (path: string) => path.replace(/^\/chroma-api/, '/api/v2'),
                },
                // Proxy PDF Extractor requests (PyMuPDF backend)
                '/pdf-api': {
                    target: pdfExtractorInternalUrl,
                    changeOrigin: true,
                    rewrite: (path: string) => path.replace(/^\/pdf-api/, ''),
                }
            }
        },
        plugins: [react()],
        define: {
            'process.env.OPENAI_API_KEY': JSON.stringify(openaiApiKey),
            'process.env.API_KEY': JSON.stringify(openaiApiKey), // Backward compatibility
            // Gemini AI (good free tier)
            'process.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiApiKey),
            'process.env.VITE_AI_PROVIDER': JSON.stringify(aiProvider),
            // ArangoDB (primary - hybrid RAG)
            'process.env.ARANGO_URL': JSON.stringify(arangoUrl),
            'process.env.ARANGO_USER': JSON.stringify(arangoUser),
            'process.env.ARANGO_PASSWORD': JSON.stringify(arangoPassword),
            'process.env.ARANGO_DATABASE': JSON.stringify(arangoDatabase),
            // ChromaDB (backup)
            'process.env.CHROMA_URL': JSON.stringify(chromaUrl),
            // OpenThaiGPT (optional)
            'process.env.OPENTHAI_ENABLED': JSON.stringify(openthaiEnabled),
            'process.env.OPENTHAI_API_URL': JSON.stringify(openthaiUrl),
            // PDF Extractor (PyMuPDF backend)
            'process.env.PDF_EXTRACTOR_URL': JSON.stringify(pdfExtractorUrl)
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        }
    };
});
