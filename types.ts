
export interface ItineraryData {
  tourName: string;
  duration: string;
  destinations: string[];
  pricing: { period: string; price: number; currency: string }[];
  flights: { origin: string; destination: string; flightNumber: string; flightTime: string, departureTime: string, arrivalTime: string }[];
  inclusions: string[];
  exclusions: string[];
  dailyBreakdown: { day: number; title: string; activities: string; meals: string[]; locations: string[] }[];
}

export interface Competitor {
  id: string;
  name: string;
  file: File | null;
  itineraryText: string;
  isParsing: boolean;
  isAnalyzing: boolean;
  parseError: string | null;
  analysis: ItineraryData | null;
}

export type SavedCompetitor = Omit<Competitor, 'id' | 'file' | 'isParsing' | 'parseError' | 'isAnalyzing'> & {
    fileName: string;
    fileSize: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Document {
  id: number;
  name: string;
  text: string;
  createdAt: string;
}

export interface AnalysisRecord {
  id: number;
  createdAt: string; // ISO string date
  competitors: SavedCompetitor[];
  comparison: string;
  chatHistory: ChatMessage[];
  recommendations?: string | null;
}

// FIX: Define GeoLocation and DailyRoute types for map functionality.
export interface GeoLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface DailyRoute {
  day: number;
  title: string;
  locations: GeoLocation[];
  distance?: string;
  duration?: string;
}

export interface UploadProgress {
  isUploading: boolean;
  total: number;
  completed: number;
  current: string;
  failed: string[];
  succeeded: string[];
}

export interface RagProgress {
  isActive: boolean;
  operation: 'indexing' | 'searching' | 'generating' | 'analyzing';
  currentStep: string;
  progress: number; // 0-100
  details?: {
    documentsProcessed?: number;
    totalDocuments?: number;
    chunksProcessed?: number;
    totalChunks?: number;
    entitiesFound?: number;
    searchResults?: number;
  };
  startTime?: number;
}

export interface AppState {
  competitors: Competitor[];
  comparison: string;
  chatHistory: ChatMessage[];
  documents: Document[];
  recommendations: string | null;
  isAnalyzing: boolean;
  isGeneratingRecs: boolean;
  analysisError: string | null;
  language: string;
  isNeo4jConnected: boolean;
  isChromaConnected: boolean;
  isArangoConnected: boolean;
  uploadProgress: UploadProgress | null;
}

// Neo4j Knowledge Graph Types
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

export interface GraphStats {
  documents: number;
  entities: number;
  relationships: number;
}

// RAG (Retrieval-Augmented Generation) Types
export interface DocumentChunk {
  id: string;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  startChar: number;
  endChar: number;
  wordCount: number;
  entities: string[];
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  processingTime: number;
}

export interface RAGSource {
  documentName: string;
  chunkIndex: number;
  relevance: number;
}

export interface RAGStats {
  chunks: number;
  documents: number;
  entities: number;
}
