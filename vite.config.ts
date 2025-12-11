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
    
    // Neo4j - support both local Docker and Neo4j Aura (cloud)
    const neo4jUri = fileEnv.NEO4J_URI || fileEnv.CONNECTION_URI || process.env.NEO4J_URI || 'bolt://neo4j:7687';
    const neo4jUser = fileEnv.NEO4J_USER || process.env.NEO4J_USER || 'neo4j';
    const neo4jPassword = fileEnv.NEO4J_PASSWORD || fileEnv.CREDENTIALS || process.env.NEO4J_PASSWORD || 'password123';
    
    // ChromaDB - Vector database
    const chromaUrl = fileEnv.CHROMA_URL || process.env.CHROMA_URL || 'http://localhost:8000';
    
    // Log status
    if (openaiApiKey) {
        console.log('✅ OPENAI_API_KEY loaded:', openaiApiKey.substring(0, 10) + '...');
    } else {
        console.warn('\n⚠️  WARNING: OPENAI_API_KEY is not set!');
        console.warn('   Add OPENAI_API_KEY=your_key to your .env file\n');
    }
    
    console.log('🔗 Neo4j URI:', neo4jUri);
    
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [react()],
        define: {
            'process.env.OPENAI_API_KEY': JSON.stringify(openaiApiKey),
            'process.env.API_KEY': JSON.stringify(openaiApiKey), // Backward compatibility
            'process.env.NEO4J_URI': JSON.stringify(neo4jUri),
            'process.env.NEO4J_USER': JSON.stringify(neo4jUser),
            'process.env.NEO4J_PASSWORD': JSON.stringify(neo4jPassword),
            'process.env.CHROMA_URL': JSON.stringify(chromaUrl)
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        }
    };
});
