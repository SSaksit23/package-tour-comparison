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
    
    // Get values with fallbacks - OpenAI API key
    const openaiApiKey = fileEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
    
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
    
    // Log status
    if (openaiApiKey) {
        console.log('✅ OPENAI_API_KEY loaded:', openaiApiKey.substring(0, 10) + '...');
    } else {
        console.warn('\n⚠️  WARNING: OPENAI_API_KEY is not set!');
        console.warn('   Add OPENAI_API_KEY=your_key to your .env file\n');
    }
    
    console.log('🔗 ArangoDB URL:', arangoUrl);
    console.log('📊 ChromaDB URL:', chromaUrl);
    
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
                }
            }
        },
        plugins: [react()],
        define: {
            'process.env.OPENAI_API_KEY': JSON.stringify(openaiApiKey),
            'process.env.API_KEY': JSON.stringify(openaiApiKey), // Backward compatibility
            // ArangoDB (primary - hybrid RAG)
            'process.env.ARANGO_URL': JSON.stringify(arangoUrl),
            'process.env.ARANGO_USER': JSON.stringify(arangoUser),
            'process.env.ARANGO_PASSWORD': JSON.stringify(arangoPassword),
            'process.env.ARANGO_DATABASE': JSON.stringify(arangoDatabase),
            // ChromaDB (backup)
            'process.env.CHROMA_URL': JSON.stringify(chromaUrl),
            // OpenThaiGPT (optional)
            'process.env.OPENTHAI_ENABLED': JSON.stringify(openthaiEnabled),
            'process.env.OPENTHAI_API_URL': JSON.stringify(openthaiUrl)
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        }
    };
});
