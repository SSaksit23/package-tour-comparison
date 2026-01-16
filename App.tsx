
import React, { useReducer, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Header from './components/Header';
import ItineraryInput from './components/ItineraryInput';
import AnalysisOutput from './components/AnalysisOutput';
import { AppState, Competitor, ChatMessage, AnalysisRecord, Document, ItineraryData, UploadProgress, RagProgress } from './types';
import { RagProgressOverlay } from './components/RagProgressOverlay';
import { parseFile } from './services/fileParser';
import { analyzeItinerary, getComparison, getRecommendations, generateAnswer, getProviderInfo } from './services/aiProvider';
import { analyzeWithCrewAI, getAgentStatus, addMemory, getUserContext, searchWeb } from './services/agentService';
import * as dbService from './services/dbService';
import { AnalyzeIcon } from './components/icons/AnalyzeIcon';
import { TrashIcon } from './components/icons/TrashIcon';
import { SaveIcon } from './components/icons/SaveIcon';
import { ArchiveIcon } from './components/icons/ArchiveIcon';
import { ExportIcon } from './components/icons/ExportIcon';
import { ExcelIcon } from './components/icons/ExcelIcon';
import { LightbulbIcon } from './components/icons/LightbulbIcon';
import { LanguageIcon } from './components/icons/LanguageIcon';
import { exportToPdf, exportToExcel } from './services/exportService';
import { DocumentTextIcon } from './components/icons/DocumentTextIcon';
import { hybridRagQuery, indexDocumentHybrid, removeDocumentHybrid, isHybridRagAvailable, getHybridRagStats } from './services/hybridRagService';
import { isChromaAvailable, indexDocumentInChroma } from './services/chromaService';
import { isArangoAvailable, initializeArangoRAG, indexDocumentInArango, removeDocumentFromArango, arangoHybridQuery, hybridSearch, getArangoStats } from './services/arangoService';
import { KnowledgeBase } from './components/KnowledgeBase';
import { processMultimodalDocument, detectFileType } from './services/multimodalRagService';
import { DataIcon } from './components/icons/DataIcon';


type Action =
  | { type: 'INITIALIZE_STATE'; payload: AppState }
  | { type: 'ADD_COMPETITOR' }
  | { type: 'REMOVE_COMPETITOR'; payload: string }
  | { type: 'UPDATE_COMPETITOR_NAME'; payload: { id: string; name: string } }
  | { type: 'START_PARSING'; payload: { id: string, file: File } }
  | { type: 'FINISH_PARSING'; payload: { id: string; text: string } }
  | { type: 'FAIL_PARSING'; payload: { id: string; error: string } }
  | { type: 'REMOVE_FILE'; payload: string }
  | { type: 'START_ANALYSIS' }
  | { type: 'FINISH_INDIVIDUAL_ANALYSIS'; payload: { id: string; analysis: ItineraryData } }
  | { type: 'FINISH_ALL_ANALYSES'; payload: { comparison: string } }
  | { type: 'FAIL_ANALYSIS'; payload: string }
  | { type: 'START_RECS' }
  | { type: 'FINISH_RECS'; payload: string }
  | { type: 'FAIL_RECS'; payload: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'SET_CHAT_HISTORY'; payload: ChatMessage[] }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'LOAD_HISTORY_ITEM'; payload: AnalysisRecord }
  | { type: 'SET_DOCUMENTS'; payload: Document[] }
  | { type: 'ADD_DOCUMENT_SUCCESS'; payload: Document }
  | { type: 'REMOVE_DOCUMENT_SUCCESS'; payload: number }
  | { type: 'ADD_COMPETITOR_WITH_FILE'; payload: { id: string; file: File; name: string } }
  | { type: 'SET_CHROMA_CONNECTED'; payload: boolean }
  | { type: 'SET_ARANGO_CONNECTED'; payload: boolean }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: UploadProgress | null }
  | { type: 'UPDATE_UPLOAD_PROGRESS'; payload: Partial<UploadProgress> };


const initialState: AppState = {
  competitors: [{ id: uuidv4(), name: 'Itinerary 1', file: null, itineraryText: '', isParsing: false, isAnalyzing: false, parseError: null, analysis: null }],
  comparison: '',
  chatHistory: [{ role: 'assistant', content: "Hi! I'm ready to answer questions about the itineraries once they're analyzed." }],
  documents: [],
  recommendations: null,
  isAnalyzing: false,
  isGeneratingRecs: false,
  analysisError: null,
  language: 'English',
  isChromaConnected: false,
  isArangoConnected: false,
  uploadProgress: null,
};

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'INITIALIZE_STATE':
      return action.payload;
    case 'ADD_COMPETITOR':
      return {
        ...state,
        competitors: [...state.competitors, { id: uuidv4(), name: `Itinerary ${state.competitors.length + 1}`, file: null, itineraryText: '', isParsing: false, isAnalyzing: false, parseError: null, analysis: null }],
      };
    case 'REMOVE_COMPETITOR':
      return {
        ...state,
        competitors: state.competitors.filter(c => c.id !== action.payload),
      };
    case 'UPDATE_COMPETITOR_NAME':
      return {
        ...state,
        competitors: state.competitors.map(c => c.id === action.payload.id ? { ...c, name: action.payload.name } : c),
      };
    case 'START_PARSING':
      return {
        ...state,
        competitors: state.competitors.map(c => c.id === action.payload.id ? { ...c, file: action.payload.file, isParsing: true, parseError: null, analysis: null, isAnalyzing: false } : c),
      };
    case 'FINISH_PARSING':
      return {
        ...state,
        competitors: state.competitors.map(c => c.id === action.payload.id ? { ...c, itineraryText: action.payload.text, isParsing: false } : c),
      };
    case 'FAIL_PARSING':
      return {
        ...state,
        competitors: state.competitors.map(c => c.id === action.payload.id ? { ...c, isParsing: false, parseError: action.payload.error, file: null } : c),
      };
    case 'REMOVE_FILE':
      return {
          ...state,
          competitors: state.competitors.map(c => c.id === action.payload ? { ...c, file: null, itineraryText: '', parseError: null, analysis: null, isAnalyzing: false } : c),
          comparison: '',
          recommendations: null,
      };
    case 'START_ANALYSIS': {
        const competitorsToAnalyzeIds = state.competitors.filter(c => c.itineraryText && !c.analysis).map(c => c.id);
        return { 
            ...state, 
            isAnalyzing: true, 
            analysisError: null, 
            comparison: '', 
            recommendations: null,
            competitors: state.competitors.map(c => competitorsToAnalyzeIds.includes(c.id) ? { ...c, isAnalyzing: true } : c)
        };
    }
    case 'FINISH_INDIVIDUAL_ANALYSIS':
        return {
            ...state,
            competitors: state.competitors.map(c => 
                c.id === action.payload.id 
                ? { ...c, analysis: action.payload.analysis, isAnalyzing: false } 
                : c
            ),
        };
    case 'FINISH_ALL_ANALYSES':
        return {
            ...state,
            isAnalyzing: false,
            comparison: action.payload.comparison,
        };
    case 'FAIL_ANALYSIS':
        return { 
            ...state, 
            isAnalyzing: false, 
            analysisError: action.payload,
            competitors: state.competitors.map(c => ({...c, isAnalyzing: false }))
        };
    case 'START_RECS':
        return { ...state, isGeneratingRecs: true };
    case 'FINISH_RECS':
        return { ...state, isGeneratingRecs: false, recommendations: action.payload };
    case 'FAIL_RECS':
        return { ...state, isGeneratingRecs: false, analysisError: action.payload };
    case 'SET_CHAT_HISTORY':
        return { ...state, chatHistory: action.payload };
    case 'SET_LANGUAGE':
        return { ...state, language: action.payload };
    case 'LOAD_HISTORY_ITEM': {
        const loadedCompetitors = action.payload.competitors.map(c => ({
            ...c,
            id: uuidv4(), // Assign new ID to avoid key conflicts
            file: null,
            isParsing: false,
            isAnalyzing: false,
            parseError: null
        }));
        return {
            ...initialState,
            competitors: loadedCompetitors,
            comparison: action.payload.comparison,
            chatHistory: action.payload.chatHistory,
            recommendations: action.payload.recommendations || null,
        };
    }
    case 'SET_DOCUMENTS':
      return { ...state, documents: action.payload };
    case 'ADD_DOCUMENT_SUCCESS': {
      // Avoid adding duplicates to the state
      if (state.documents.some(d => d.id === action.payload.id)) return state;
      return { ...state, documents: [action.payload, ...state.documents] };
    }
    case 'REMOVE_DOCUMENT_SUCCESS':
      return { ...state, documents: state.documents.filter(d => d.id !== action.payload) };
    case 'ADD_COMPETITOR_WITH_FILE':
      return {
          ...state,
          competitors: [
              ...state.competitors,
              {
                  id: action.payload.id,
                  name: action.payload.name,
                  file: action.payload.file,
                  itineraryText: '',
                  isParsing: true,
                  isAnalyzing: false,
                  parseError: null,
                  analysis: null
              }
          ]
      };
    case 'CLEAR_ALL':
      return {...initialState, documents: state.documents, isChromaConnected: state.isChromaConnected, isArangoConnected: state.isArangoConnected, uploadProgress: null}; // Keep knowledge base and connection status on clear all
    case 'SET_CHROMA_CONNECTED':
      return { ...state, isChromaConnected: action.payload };
    case 'SET_ARANGO_CONNECTED':
      return { ...state, isArangoConnected: action.payload };
    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.payload };
    case 'UPDATE_UPLOAD_PROGRESS':
      return { 
        ...state, 
        uploadProgress: state.uploadProgress 
          ? { ...state.uploadProgress, ...action.payload }
          : null 
      };
    default:
      return state;
  }
};


const App: React.FC = () => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [history, setHistory] = useState<AnalysisRecord[]>([]);
    const [isExporting, setIsExporting] = useState<false | 'pdf' | 'excel'>(false);
    const [showSavedPanel, setShowSavedPanel] = useState(false);
    const [savedPanelTab, setSavedPanelTab] = useState<'history' | 'kb'>('history');
    const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
    const [kbStats, setKbStats] = useState<{ documents: number; chunks: number; entities: number } | null>(null);
    const [ragProgress, setRagProgress] = useState<RagProgress>({
        isActive: false,
        operation: 'searching',
        currentStep: '',
        progress: 0
    });
    const [lastRagUsage, setLastRagUsage] = useState<{ used: boolean; docCount: number }>({ used: false, docCount: 0 });
    const [agentStatus, setAgentStatus] = useState<{ available: boolean; crew: boolean; web: boolean; memory: boolean } | null>(null);
    const [useAgenticAnalysis, setUseAgenticAnalysis] = useState(() => {
        // Check localStorage for user preference
        const saved = localStorage.getItem('useAgenticAnalysis');
        return saved !== null ? saved === 'true' : true; // Default to true
    });
    
    // Save preference to localStorage
    useEffect(() => {
        localStorage.setItem('useAgenticAnalysis', String(useAgenticAnalysis));
    }, [useAgenticAnalysis]);
    
    // Check agent status on mount
    useEffect(() => {
        getAgentStatus().then(status => {
            if (status) {
                setAgentStatus({
                    available: status.agents_available,
                    crew: status.travel_crew?.available || false,
                    web: status.web_search_agent?.available || false,
                    memory: status.memory_agent?.available || false
                });
                console.log('🤖 Agent Status:', {
                    crew: status.travel_crew?.available,
                    web: status.web_search_agent?.available,
                    memory: status.memory_agent?.available
                });
            }
        });
    }, []);
    
    // Keep a ref of the latest state for the interval-based auto-save
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // Auto-save to localStorage every 30 seconds
    useEffect(() => {
        const intervalId = setInterval(() => {
            const stateToSave = {
                ...stateRef.current,
                competitors: stateRef.current.competitors.map(c => ({ ...c, file: null }))
            };
            try {
                localStorage.setItem('travel_analyzer_autosave', JSON.stringify(stateToSave));
            } catch (e) {
                console.error('Auto-save to localStorage failed', e);
            }
        }, 30000);

        return () => clearInterval(intervalId);
    }, []);

    // Debounce state saving to IndexedDB
    useEffect(() => {
        const handler = setTimeout(() => {
            // Don't save files in session state
            const stateToSave = { ...state, competitors: state.competitors.map(c => ({...c, file: null})) };
            dbService.saveState(stateToSave);
        }, 500);
        return () => clearTimeout(handler);
    }, [state]);

    // Load state and history on initial mount
    useEffect(() => {
        const loadData = async () => {
            const savedState = await dbService.loadState();
            if (savedState) {
                dispatch({ type: 'INITIALIZE_STATE', payload: savedState });
            }
            const savedHistory = await dbService.getHistory();
            setHistory(savedHistory);
            const savedDocs = await dbService.getAllDocuments();
            dispatch({type: 'SET_DOCUMENTS', payload: savedDocs});
            
            // Check ChromaDB Vector Store availability (backup)
            const chromaConnected = await isChromaAvailable();
            dispatch({ type: 'SET_CHROMA_CONNECTED', payload: chromaConnected });
            if (chromaConnected) {
                console.log('✅ ChromaDB Vector Store connected (backup)');
            } else {
                console.log('⚠️ ChromaDB not available');
            }
            
            // Check ArangoDB Hybrid RAG availability (primary)
            const arangoConnected = await isArangoAvailable();
            dispatch({ type: 'SET_ARANGO_CONNECTED', payload: arangoConnected });
            if (arangoConnected) {
                const initialized = await initializeArangoRAG();
                if (initialized) {
                    console.log('✅ ArangoDB Hybrid RAG connected (Graph + Vector)');
                    // Fetch KB stats
                    const stats = await getArangoStats();
                    if (stats) {
                        setKbStats(stats);
                    }
                } else {
                    console.log('⚠️ ArangoDB connected but failed to initialize');
                    dispatch({ type: 'SET_ARANGO_CONNECTED', payload: false });
                }
            } else {
                console.log('⚠️ ArangoDB not available - using ChromaDB fallback');
            }
        };
        loadData();
    }, []);

    const refreshHistory = useCallback(async () => {
        const savedHistory = await dbService.getHistory();
        setHistory(savedHistory);
    }, []);


    // Helper function to auto-index document to Knowledge Base
    const autoIndexToKB = useCallback(async (fileName: string, text: string) => {
        // Skip if it's an image (base64) or text is too short
        if (text.startsWith('data:image') || text.length < 100) return;
        
        // Check if document already exists in KB
        const existingDocs = state.documents.filter(d => d.name === fileName);
        if (existingDocs.length > 0) {
            console.log(`📚 Document "${fileName}" already in KB, skipping auto-index`);
            return;
        }

        try {
            // Save to local DB
            const newDoc = await dbService.addDocument({ name: fileName, text });
            dispatch({ type: 'ADD_DOCUMENT_SUCCESS', payload: newDoc });
            
            // Index to ArangoDB if connected
            if (state.isArangoConnected) {
                console.log(`🔄 Auto-indexing "${fileName}" to Knowledge Base...`);
                await indexDocumentInArango(newDoc);
                console.log(`✅ Auto-indexed "${fileName}" to KB (${text.length} chars)`);
                
                // Refresh KB stats
                const stats = await getArangoStats();
                if (stats) setKbStats(stats);
            }
        } catch (error) {
            console.warn(`⚠️ Auto-index failed for "${fileName}":`, error);
            // Don't throw - this is a background operation
        }
    }, [state.documents, state.isArangoConnected]);

    const handleFileSelect = useCallback(async (targetId: string, files: File[]) => {
        if (files.length === 0) return;

        // 1. Handle the first file (replaces the content of the target dropzone)
        const firstFile = files[0];
        const firstFileName = firstFile.name.replace(/\.[^/.]+$/, ''); // Remove extension
        
        dispatch({ type: 'UPDATE_COMPETITOR_NAME', payload: { id: targetId, name: firstFileName.substring(0, 15) } });
        dispatch({ type: 'START_PARSING', payload: { id: targetId, file: firstFile } });
        
        // Async parsing for first file
        parseFile(firstFile)
            .then(async text => {
                dispatch({ type: 'FINISH_PARSING', payload: { id: targetId, text } });
                // Auto-index to Knowledge Base
                await autoIndexToKB(firstFileName, text);
            })
            .catch(e => {
                 const error = e instanceof Error ? e.message : 'An unknown error occurred during parsing.';
                 dispatch({ type: 'FAIL_PARSING', payload: { id: targetId, error } });
            });

        // 2. Handle subsequent files (create new slots)
        for (let i = 1; i < files.length; i++) {
            const newFile = files[i];
            const newId = uuidv4();
            const newName = newFile.name.replace(/\.[^/.]+$/, ''); // Remove extension

            // Add new competitor slot with file attached
            dispatch({ 
                type: 'ADD_COMPETITOR_WITH_FILE', 
                payload: { id: newId, file: newFile, name: newName.substring(0, 15) } 
            });

            // Start parsing for the new file
            parseFile(newFile)
                .then(async text => {
                    dispatch({ type: 'FINISH_PARSING', payload: { id: newId, text } });
                    // Auto-index to Knowledge Base
                    await autoIndexToKB(newName, text);
                })
                .catch(e => {
                     const error = e instanceof Error ? e.message : 'An unknown error occurred during parsing.';
                     dispatch({ type: 'FAIL_PARSING', payload: { id: newId, error } });
                });
        }
    }, [autoIndexToKB]);
    
    const handleUploadToKB = useCallback(async (files: FileList) => {
        const filesArray = Array.from(files);
        const totalFiles = filesArray.length;
        
        if (totalFiles === 0) return;

        // File size limit: 10MB per file to prevent memory issues
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        const validFiles: File[] = [];
        const skippedFiles: string[] = [];
        
        for (const file of filesArray) {
            if (file.size > MAX_FILE_SIZE) {
                skippedFiles.push(`${file.name} (too large: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
            } else {
                validFiles.push(file);
            }
        }
        
        // Show RAG progress for indexing
        setRagProgress({
            isActive: true,
            operation: 'indexing',
            currentStep: 'Parsing',
            progress: 0,
            startTime: Date.now(),
            details: {
                documentsProcessed: 0,
                totalDocuments: validFiles.length
            }
        });
        
        if (skippedFiles.length > 0) {
            console.warn(`⚠️ Skipped ${skippedFiles.length} files exceeding 10MB limit:`, skippedFiles);
        }
        
        if (validFiles.length === 0) {
            alert('No valid files to upload. Files must be under 10MB.');
            return;
        }
        
        // Initialize progress
        dispatch({ 
            type: 'SET_UPLOAD_PROGRESS', 
            payload: {
                isUploading: true,
                total: validFiles.length,
                completed: 0,
                current: validFiles[0].name,
                failed: skippedFiles, // Include oversized files as failed
                succeeded: []
            }
        });

        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        const succeeded: string[] = [];
        const failed: string[] = [...skippedFiles];
        
        // Process files ONE AT A TIME to prevent memory issues
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            
            try {
                // Update current file
                dispatch({ 
                    type: 'UPDATE_UPLOAD_PROGRESS', 
                    payload: { current: file.name, completed: i }
                });
                
                // Update RAG progress - Parsing step
                const baseProgress = (i / validFiles.length) * 80;
                setRagProgress(prev => ({
                    ...prev,
                    currentStep: 'Parsing',
                    progress: baseProgress + 5,
                    details: { 
                        ...prev.details,
                        documentsProcessed: i,
                        totalDocuments: validFiles.length
                    }
                }));
                
                // Parse file - use multimodal processing for images
                console.log(`📄 [${i + 1}/${validFiles.length}] Parsing: ${file.name}`);
                const fileType = detectFileType(file.name);
                let text: string;
                
                if (fileType === 'image') {
                    // Use multimodal RAG for images
                    console.log(`🖼️ Processing image with multimodal RAG: ${file.name}`);
                    const result = await processMultimodalDocument(
                        await parseFile(file), // This returns base64 for images
                        file.name,
                        'image'
                    );
                    text = result.text;
                } else {
                    text = await parseFile(file);
                }
                
                // Update RAG progress - Chunking step
                setRagProgress(prev => ({
                    ...prev,
                    currentStep: 'Chunking',
                    progress: baseProgress + 20
                }));
                
                // Truncate very long documents to prevent memory issues
                const MAX_TEXT_LENGTH = 500000; // ~500KB of text
                const truncatedText = text.length > MAX_TEXT_LENGTH 
                    ? text.slice(0, MAX_TEXT_LENGTH) + '\n\n[Document truncated due to size...]'
                    : text;
                
                const newDocData: Omit<Document, 'id'> = {
                    name: file.name,
                    text: truncatedText,
                    createdAt: new Date().toISOString(),
                };
                
                // Check for duplicates
                if (state.documents.some(d => d.name === file.name)) {
                    console.log(`⏭️ Skipping duplicate: ${file.name}`);
                    succeeded.push(file.name);
                    continue;
                }
                
                // Save locally
                const newId = await dbService.addDocument(newDocData);
                const newDoc = { ...newDocData, id: newId };
                dispatch({ type: 'ADD_DOCUMENT_SUCCESS', payload: newDoc });
                
                // Update RAG progress - Embedding step (reuse baseProgress from above)
                setRagProgress(prev => ({
                    ...prev,
                    currentStep: 'Embedding',
                    progress: baseProgress + 40
                }));
                
                // Index for Hybrid RAG with retry logic
                const indexWithRetry = async (retries = 2): Promise<void> => {
                    for (let attempt = 1; attempt <= retries; attempt++) {
                        try {
                            // Update RAG progress - Indexing step
                            setRagProgress(prev => ({
                                ...prev,
                                currentStep: 'Indexing',
                                progress: baseProgress + 60
                            }));
                            
                            if (state.isArangoConnected) {
                                const result = await indexDocumentInArango(newDoc);
                                
                                // Update progress with chunk/entity counts
                                setRagProgress(prev => ({
                                    ...prev,
                                    progress: baseProgress + 80,
                                    details: {
                                        ...prev.details,
                                        chunksProcessed: (prev.details?.chunksProcessed || 0) + result.chunks,
                                        entitiesFound: (prev.details?.entitiesFound || 0) + result.entities
                                    }
                                }));
                                
                                console.log(`🔗 [${i + 1}/${validFiles.length}] Indexed "${file.name}": ${result.chunks} chunks, ${result.entities} entities`);
                                return;
                            } else if (state.isChromaConnected) {
                                const chromaResult = await indexDocumentInChroma(newDoc);
                                
                                setRagProgress(prev => ({
                                    ...prev,
                                    progress: baseProgress + 80,
                                    details: {
                                        ...prev.details,
                                        chunksProcessed: (prev.details?.chunksProcessed || 0) + chromaResult.chunksCreated
                                    }
                                }));
                                
                                console.log(`📊 [${i + 1}/${validFiles.length}] Indexed "${file.name}": ${chromaResult.chunksCreated} chunks`);
                                return;
                            }
                            return; // No indexing service available
                        } catch (e) {
                            if (attempt < retries) {
                                console.warn(`⚠️ Retry ${attempt}/${retries} for "${file.name}"`);
                                await delay(3000 * attempt); // Longer backoff
                            } else {
                                throw e;
                            }
                        }
                    }
                };
                
                await indexWithRetry();
                succeeded.push(file.name);
                
                // Update progress
                dispatch({ 
                    type: 'UPDATE_UPLOAD_PROGRESS', 
                    payload: { completed: i + 1, succeeded: [...succeeded], failed: [...failed] }
                });
                
                // Allow garbage collection between files
                await delay(500);
                
            } catch (e) {
                const error = e instanceof Error ? e.message : 'Unknown error';
                console.error(`❌ Failed to process "${file.name}":`, error);
                failed.push(file.name);
                
                // Update RAG progress to show error
                setRagProgress(prev => ({
                    ...prev,
                    currentStep: `Failed: ${file.name}`,
                    progress: Math.min(prev.progress + 5, 95)
                }));
                
                // Update progress even on failure
                dispatch({ 
                    type: 'UPDATE_UPLOAD_PROGRESS', 
                    payload: { completed: i + 1, succeeded: [...succeeded], failed: [...failed] }
                });
                
                // Continue to next file after a brief pause
                await delay(1000);
            }
        }
        
        // Final summary
        console.log(`\n📊 Upload Complete: ${succeeded.length}/${validFiles.length} succeeded, ${failed.length} failed`);
        
        if (failed.length > 0) {
            console.log('Failed files:', failed);
        }
        
        // Mark upload as complete
        dispatch({ 
            type: 'UPDATE_UPLOAD_PROGRESS', 
            payload: { isUploading: false, completed: validFiles.length }
        });
        
        // Update RAG progress to complete
        setRagProgress(prev => ({
            ...prev,
            currentStep: 'Complete',
            progress: 100,
            details: {
                ...prev.details,
                documentsProcessed: validFiles.length - failed.length
            }
        }));
        
        // Refresh KB stats
        if (state.isArangoConnected) {
            try {
                const stats = await getArangoStats();
                if (stats) setKbStats(stats);
            } catch (e) {
                console.warn('Failed to refresh KB stats:', e);
            }
        }
        
        // Hide RAG progress after a delay
        setTimeout(() => {
            setRagProgress(prev => ({ ...prev, isActive: false }));
        }, 1500);
        
        // Keep progress visible for 5 seconds, then clear
        setTimeout(() => {
            dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: null });
        }, 5000);
        
    }, [state.documents, state.isArangoConnected, state.isChromaConnected]);


    // Orchestrate Q&A with Hybrid RAG pipeline (ArangoDB or ChromaDB)
    const handleGetAnswer = async (history: ChatMessage[], question: string): Promise<string> => {
        const startTime = Date.now();
        
        // Show RAG progress
        setRagProgress({
            isActive: true,
            operation: 'generating',
            currentStep: 'Embedding',
            progress: 10,
            startTime
        });
        
        // Track sources used
        const sourcesUsed: string[] = [];
        
        try {
            // 1. Try ArangoDB Hybrid RAG (Graph + Vector in one database)
            if (state.isArangoConnected) {
                try {
                    setRagProgress(prev => ({ ...prev, currentStep: 'Searching Vector DB', progress: 30 }));
                    console.log('🔍 Q&A: Attempting ArangoDB Hybrid Search...');
                    
                    const hybridResponse = await arangoHybridQuery(question, history, state.language);
                    
                    setRagProgress(prev => ({ 
                        ...prev, 
                        currentStep: 'Processing Results', 
                        progress: 70,
                        details: {
                            searchResults: hybridResponse.sources.vectorResults + hybridResponse.sources.graphResults,
                            entitiesFound: hybridResponse.sources.entities.length
                        }
                    }));
                    
                    console.log(`🔗 ArangoDB Hybrid RAG: Vector=${hybridResponse.sources.vectorResults}, Graph=${hybridResponse.sources.graphResults}, Entities=${hybridResponse.sources.entities.length}, Time=${hybridResponse.processingTime}ms`);
                    
                    // Always try to use ArangoDB results even if count is 0 but answer exists
                    if (hybridResponse.answer && (hybridResponse.sources.vectorResults > 0 || hybridResponse.sources.graphResults > 0 || hybridResponse.sources.entities.length > 0)) {
                        setRagProgress(prev => ({ ...prev, currentStep: 'Formatting', progress: 100 }));
                        setTimeout(() => setRagProgress(prev => ({ ...prev, isActive: false })), 500);
                        setLastRagUsage({ used: true, docCount: hybridResponse.sources.vectorResults + hybridResponse.sources.graphResults });
                        console.log('✅ Q&A: Using ArangoDB results');
                        return hybridResponse.answer;
                    }
                    console.log('⚠️ Q&A: ArangoDB returned no results, trying fallbacks...');
                } catch (e) {
                    console.warn('❌ Q&A: ArangoDB Hybrid RAG query failed:', e);
                }
            } else {
                console.log('⚠️ Q&A: ArangoDB not connected');
            }
            
            // 2. Fallback to ChromaDB Vector Search if available
            if (state.isChromaConnected) {
                try {
                    setRagProgress(prev => ({ ...prev, currentStep: 'ChromaDB Search', progress: 40 }));
                    console.log('🔍 Q&A: Attempting ChromaDB Search...');
                    
                    const hybridResponse = await hybridRagQuery(question, history, state.language);
                    
                    setRagProgress(prev => ({ 
                        ...prev, 
                        currentStep: 'Generating', 
                        progress: 70,
                        details: {
                            searchResults: hybridResponse.sources.chromaResults
                        }
                    }));
                    
                    console.log(`🔄 ChromaDB RAG: ${hybridResponse.sources.chromaResults} results, Time=${hybridResponse.processingTime}ms`);
                    
                    if (hybridResponse.sources.chromaResults > 0) {
                        setRagProgress(prev => ({ ...prev, currentStep: 'Formatting', progress: 100 }));
                        setTimeout(() => setRagProgress(prev => ({ ...prev, isActive: false })), 500);
                        setLastRagUsage({ used: true, docCount: hybridResponse.sources.chromaResults });
                        console.log('✅ Q&A: Using ChromaDB results');
                        return hybridResponse.answer;
                    }
                    console.log('⚠️ Q&A: ChromaDB returned no results');
                } catch (e) {
                    console.warn('❌ Q&A: ChromaDB RAG query failed:', e);
                }
            } else {
                console.log('⚠️ Q&A: ChromaDB not connected');
            }
            
            // 3. Fallback to local documents if Hybrid RAG not available or returned no results
            console.log('📄 Q&A: Using local documents fallback');
            setRagProgress(prev => ({ ...prev, currentStep: 'Local Documents', progress: 50 }));
            
            let contextText = "";
            if (state.documents.length > 0) {
                // Add document names as sources
                state.documents.forEach(d => sourcesUsed.push(d.name));
                contextText += "## Knowledge Base Documents:\n" + state.documents.map(d => `### ${d.name}\n${d.text}`).join('\n\n') + "\n\n";
                console.log(`📚 Q&A: Using ${state.documents.length} local documents as context`);
            }

            setRagProgress(prev => ({ ...prev, currentStep: 'Generating', progress: 80 }));
            
            // 4. Generate Answer with local context
            const answer = await generateAnswer(history, contextText, question, state.language);
            
            // Append sources to answer
            const sourcesText = sourcesUsed.length > 0 
                ? `\n\n---\n📚 **Sources:** ${sourcesUsed.join(', ')}`
                : '';
            
            setRagProgress(prev => ({ ...prev, currentStep: 'Formatting', progress: 100 }));
            setTimeout(() => setRagProgress(prev => ({ ...prev, isActive: false })), 500);
            setLastRagUsage({ used: false, docCount: state.documents.length });
            
            return answer + sourcesText;
        } catch (error) {
            setRagProgress(prev => ({ ...prev, isActive: false }));
            throw error;
        }
    };

    const handleAnalyze = useCallback(async () => {
        const competitorsWithText = state.competitors.filter(c => c.itineraryText);
        const competitorsToAnalyze = competitorsWithText.filter(c => !c.analysis);

        if (competitorsToAnalyze.length === 0 && competitorsWithText.length < 2) {
            return;
        }
        
        dispatch({ type: 'START_ANALYSIS' });

        try {
            // Try CrewAI agentic analysis if available and enabled
            if (useAgenticAnalysis && agentStatus?.crew && competitorsWithText.length >= 1) {
                console.log('🤖 Using CrewAI agentic analysis...');
                
                setRagProgress({
                    isActive: true,
                    operation: 'analyzing',
                    currentStep: 'Agent Analysis',
                    progress: 10,
                    startTime: Date.now(),
                    details: { agent: 'CrewAI' }
                });
                
                try {
                    // Prepare itineraries for crew analysis
                    const itineraries = competitorsWithText.map(c => ({
                        name: c.name,
                        content: c.itineraryText
                    }));
                    
                    setRagProgress(prev => ({ ...prev, currentStep: 'Document Analyst', progress: 20 }));
                    
                    // Get user context from memory for personalization
                    const userContext = agentStatus.memory ? await getUserContext('default') : '';
                    
                    // Update progress to show we're waiting for backend
                    setRagProgress(prev => ({ ...prev, currentStep: 'Market Researcher', progress: 30 }));
                    
                    // Run CrewAI analysis with timeout handling
                    const crewResult = await analyzeWithCrewAI(itineraries, {
                        analysis_focus: 'competitive',
                        include_web_search: agentStatus.web,
                        user_id: 'default'
                    });
                    
                    // Update progress after call completes
                    setRagProgress(prev => ({ ...prev, currentStep: 'Strategic Advisor', progress: 60 }));
                    
                    if (crewResult.success && crewResult.analysis) {
                        console.log('✅ CrewAI analysis completed');
                        
                        // Parse the agent analysis and extract structured data for each itinerary
                        // The crew analysis contains comprehensive insights
                        setRagProgress(prev => ({ ...prev, currentStep: 'Processing', progress: 80 }));
                        
                        // For each competitor, still extract basic structured data
                        const analysisPromises = competitorsToAnalyze.map(async (c) => {
                            try {
                                const analysis = await analyzeItinerary(c.itineraryText, state.language);
                                dispatch({ type: 'FINISH_INDIVIDUAL_ANALYSIS', payload: { id: c.id, analysis } });
                                return { ...c, analysis };
                            } catch (individualError) {
                                const message = individualError instanceof Error ? individualError.message : String(individualError);
                                throw new Error(`Analysis for "${c.name}" failed: ${message}`);
                            }
                        });
                        
                        const newlyAnalyzedCompetitors = await Promise.all(analysisPromises);
                        
                        // Use crew analysis as the comparison/insights
                        const allAnalyzedForComparison = [
                            ...state.competitors.filter(c => c.analysis),
                            ...newlyAnalyzedCompetitors
                        ];
                        
                        setRagProgress(prev => ({ ...prev, currentStep: 'Finalizing', progress: 95 }));
                        
                        // Store crew analysis as comparison (it includes comprehensive insights)
                        dispatch({ 
                            type: 'FINISH_ALL_ANALYSES', 
                            payload: { comparison: crewResult.analysis } 
                        });
                        
                        // Save to memory if available
                        if (agentStatus.memory) {
                            for (const it of itineraries) {
                                await addMemory(
                                    `Analyzed itinerary "${it.name}" with CrewAI agents`,
                                    'default',
                                    'analysis'
                                );
                            }
                        }
                        
                        setRagProgress(prev => ({ ...prev, isActive: false }));
                        return;
                    } else {
                        console.warn('⚠️ CrewAI analysis failed:', crewResult.error);
                        setRagProgress(prev => ({ ...prev, isActive: false }));
                        // Show error but continue with standard analysis
                        const errorMsg = crewResult.error || 'Unknown error';
                        if (errorMsg.includes('timed out')) {
                            console.warn('⚠️ CrewAI timed out, falling back to standard analysis');
                            // Don't show alert, just fall through to standard analysis
                        } else if (errorMsg.includes('Backend service is not available')) {
                            console.warn('⚠️ CrewAI backend not available, falling back to standard analysis');
                            // Don't show alert, just fall through to standard analysis
                        } else {
                            console.warn(`⚠️ CrewAI error: ${errorMsg}, falling back to standard analysis`);
                        }
                        // Always fall through to standard analysis without blocking alert
                    }
                } catch (crewError) {
                    console.warn('⚠️ CrewAI error, falling back to standard analysis:', crewError);
                    setRagProgress(prev => ({ ...prev, isActive: false }));
                    // Silently fall through to standard analysis
                }
            }
            
            // Standard analysis (fallback or if agents disabled)
            setRagProgress({
                isActive: true,
                operation: 'analyzing',
                currentStep: 'Extracting',
                progress: 10,
                startTime: Date.now()
            });
            
            // Run new analyses and dispatch updates as they complete
            const analysisPromises = competitorsToAnalyze.map(async (c) => {
                try {
                    const analysis = await analyzeItinerary(c.itineraryText, state.language);
                    dispatch({ type: 'FINISH_INDIVIDUAL_ANALYSIS', payload: { id: c.id, analysis } });
                    return { ...c, analysis }; // Return updated competitor for comparison
                } catch (individualError) {
                    const message = individualError instanceof Error ? individualError.message : String(individualError);
                    throw new Error(`Analysis for "${c.name}" failed: ${message}`);
                }
            });

            const newlyAnalyzedCompetitors = await Promise.all(analysisPromises);
            
            // Combine newly analyzed with previously analyzed for comparison
            const allAnalyzedForComparison = [
                ...state.competitors.filter(c => c.analysis),
                ...newlyAnalyzedCompetitors
            ];
            const uniqueAnalyzedForComparison = Array.from(new Map(allAnalyzedForComparison.map(item => [item.id, item])).values());
            
            let comparison = 'Single itinerary loaded. Add another to compare.';
            if (uniqueAnalyzedForComparison.length > 1) {
                // Fetch RAG context for enhanced comparison
                let ragContext: string | undefined;
                if (state.isArangoConnected || state.isChromaConnected) {
                    try {
                        // Show RAG progress
                        setRagProgress({
                            isActive: true,
                            operation: 'analyzing',
                            currentStep: 'RAG Search',
                            progress: 10,
                            startTime: Date.now()
                        });
                        
                        // Build search query from destinations
                        const destinations = uniqueAnalyzedForComparison
                            .flatMap(c => c.analysis?.destinations || [])
                            .slice(0, 5)
                            .join(', ');
                        
                        if (destinations && state.isArangoConnected) {
                            setRagProgress(prev => ({ ...prev, currentStep: 'Searching', progress: 30 }));
                            
                            const searchResults = await hybridSearch(`travel itinerary ${destinations}`);
                            
                            setRagProgress(prev => ({ 
                                ...prev, 
                                currentStep: 'Analyzing', 
                                progress: 50,
                                details: { searchResults: searchResults.length }
                            }));
                            
                            if (searchResults.length > 0) {
                                ragContext = searchResults
                                    .slice(0, 3)
                                    .map(r => `[${r.documentName}]: ${r.content}`)
                                    .join('\n\n');
                                console.log(`📚 RAG Context: Found ${searchResults.length} relevant documents for comparison`);
                            }
                        }
                    } catch (ragError) {
                        console.warn('RAG context fetch failed:', ragError);
                    }
                }
                
                setRagProgress(prev => ({ ...prev, currentStep: 'Comparing', progress: 70 }));
                comparison = await getComparison(uniqueAnalyzedForComparison, state.language, ragContext);
                setRagProgress(prev => ({ ...prev, isActive: false }));
            }
            
            dispatch({ type: 'FINISH_ALL_ANALYSES', payload: { comparison } });

        } catch (e) {
            const error = e instanceof Error ? e.message : 'An unknown error occurred during analysis.';
            dispatch({ type: 'FAIL_ANALYSIS', payload: error });
        }
    }, [state.competitors, state.language, state.isArangoConnected, state.isChromaConnected]);
    
    const handleGenerateRecs = useCallback(async () => {
        const analyzedCompetitors = state.competitors.filter(c => c.analysis);
        if (analyzedCompetitors.length === 0) return;
        
        dispatch({ type: 'START_RECS' });
        
        // Try CrewAI agentic recommendations if available
        if (useAgenticAnalysis && agentStatus?.crew) {
            console.log('🤖 Using CrewAI for strategic recommendations...');
            
            setRagProgress({
                isActive: true,
                operation: 'analyzing',
                currentStep: 'Agent Analysis',
                progress: 10,
                startTime: Date.now(),
                details: { agent: 'CrewAI Strategic Advisor' }
            });
            
            try {
                // Prepare itineraries
                const itineraries = analyzedCompetitors.map(c => ({
                    name: c.name,
                    content: c.itineraryText || ''
                }));
                
                setRagProgress(prev => ({ ...prev, currentStep: 'Market Research', progress: 30 }));
                
                // Get user context and web search
                const userContext = agentStatus.memory ? await getUserContext('default', 'travel preferences') : '';
                
                // Run CrewAI analysis focused on recommendations with timeout
                const crewResult = await Promise.race([
                    analyzeWithCrewAI(itineraries, {
                        analysis_focus: 'all', // Comprehensive analysis
                        include_web_search: agentStatus.web, // Include web search for market data
                        user_id: 'default'
                    }),
                    // Timeout after 90 seconds
                    new Promise<CrewAnalysisResponse>((resolve) => {
                        setTimeout(() => {
                            resolve({
                                success: false,
                                error: 'Analysis timed out after 90 seconds. The backend may be slow or unresponsive.'
                            });
                        }, 90000);
                    })
                ]);
                
                if (crewResult.success && crewResult.analysis) {
                    console.log('✅ CrewAI recommendations generated');
                    
                    // Extract recommendations section from crew analysis
                    // The crew analysis includes strategic recommendations
                    dispatch({ type: 'FINISH_RECS', payload: crewResult.analysis });
                    
                    // Save to memory
                    if (agentStatus.memory) {
                        await addMemory(
                            `Generated strategic recommendations for ${itineraries.length} itinerary(ies)`,
                            'default',
                            'analysis'
                        );
                    }
                    
                    setRagProgress(prev => ({ ...prev, isActive: false }));
                    return;
                } else {
                    console.warn('⚠️ CrewAI recommendations failed:', crewResult.error);
                    setRagProgress(prev => ({ ...prev, isActive: false }));
                    // Don't show alert, just fall through to standard analysis
                }
            } catch (crewError) {
                console.warn('⚠️ CrewAI recommendations error, falling back:', crewError);
                setRagProgress(prev => ({ ...prev, isActive: false }));
                // Fall through to standard recommendations
            }
        }
        
        // Standard recommendations (fallback)
        setRagProgress({
            isActive: true,
            operation: 'analyzing',
            currentStep: 'RAG Search',
            progress: 5,
            startTime: Date.now()
        });
        
        try {
            const pastAnalyses = await dbService.getHistory();
            
            // Fetch RAG context for enhanced recommendations
            let ragContext: string | undefined;
            
            // Add web search context if available
            if (agentStatus?.web && analyzedCompetitors.length > 0) {
                try {
                    const firstCompetitor = analyzedCompetitors[0];
                    const destinations = firstCompetitor.analysis?.destinations || [];
                    if (destinations.length > 0) {
                        setRagProgress(prev => ({ ...prev, currentStep: 'Web Search', progress: 15 }));
                        const webResults = await searchWeb(destinations[0], 'prices', 3);
                        if (webResults.success && webResults.results?.length > 0) {
                            const webContext = webResults.results
                                .map((r: any) => `${r.title}: ${r.text || r.highlights?.join(' ') || ''}`)
                                .join('\n\n');
                            ragContext = (ragContext || '') + '\n\n## Current Market Data:\n' + webContext;
                            console.log('🌐 Added web search context for recommendations');
                        }
                    }
                } catch (webError) {
                    console.warn('Web search failed:', webError);
                }
            }
            if (state.isArangoConnected || state.isChromaConnected) {
                try {
                    setRagProgress(prev => ({ ...prev, currentStep: 'Searching', progress: 20 }));
                    
                    // Build comprehensive search query
                    const searchTerms = analyzedCompetitors
                        .flatMap(c => [
                            ...(c.analysis?.destinations || []),
                            c.analysis?.tourName || '',
                            ...(c.analysis?.inclusions?.slice(0, 3) || [])
                        ])
                        .filter(Boolean)
                        .slice(0, 8)
                        .join(' ');
                    
                    if (searchTerms && state.isArangoConnected) {
                        console.log(`🔍 RAG Search Query: "${searchTerms}"`);
                        const searchResults = await hybridSearch(`travel insights recommendations ${searchTerms}`);
                        
                        console.log(`📊 RAG Search Results: ${searchResults.length} documents found`);
                        
                        setRagProgress(prev => ({ 
                            ...prev, 
                            currentStep: 'Analyzing', 
                            progress: 40,
                            details: { 
                                searchResults: searchResults.length,
                                entitiesFound: searchResults.reduce((acc, r) => acc + (r.entities?.length || 0), 0)
                            }
                        }));
                        
                        if (searchResults.length > 0) {
                            ragContext = searchResults
                                .slice(0, 5)
                                .map(r => {
                                    const entities = r.entities?.length ? ` [Entities: ${r.entities.join(', ')}]` : '';
                                    return `[${r.documentName}${entities}]: ${r.content.substring(0, 1000)}`;
                                })
                                .join('\n\n---\n\n');
                            console.log(`📚 RAG Context: Found ${searchResults.length} relevant documents for insights`);
                            console.log(`📝 RAG Context Preview: ${ragContext.substring(0, 500)}...`);
                            setLastRagUsage({ used: true, docCount: searchResults.length });
                        } else {
                            console.warn(`⚠️ No RAG results found. Make sure documents are indexed in Knowledge Base.`);
                            setLastRagUsage({ used: false, docCount: 0 });
                        }
                    } else if (!searchTerms) {
                        console.warn(`⚠️ No search terms extracted from analysis`);
                        setLastRagUsage({ used: false, docCount: 0 });
                    } else if (!state.isArangoConnected) {
                        console.warn(`⚠️ ArangoDB not connected - RAG disabled`);
                        setLastRagUsage({ used: false, docCount: 0 });
                    }
                } catch (ragError) {
                    console.warn('RAG context fetch failed:', ragError);
                }
            }
            
            setRagProgress(prev => ({ ...prev, currentStep: 'Comparing', progress: 60 }));
            
            console.log(`🧠 Generating insights with RAG context: ${ragContext ? 'YES (' + ragContext.length + ' chars)' : 'NO (empty KB)'}`);
            
            const recommendations = await getRecommendations(analyzedCompetitors, pastAnalyses, state.language, ragContext);
            
            setRagProgress(prev => ({ ...prev, progress: 100 }));
            setTimeout(() => setRagProgress(prev => ({ ...prev, isActive: false })), 500);
            
            console.log(`✅ Insights generated successfully`);
            dispatch({ type: 'FINISH_RECS', payload: recommendations });
        } catch (e) {
            setRagProgress(prev => ({ ...prev, isActive: false }));
            const error = e instanceof Error ? e.message : 'Failed to generate recommendations.';
            dispatch({ type: 'FAIL_RECS', payload: error });
        }
    }, [state.competitors, state.language, state.isArangoConnected, state.isChromaConnected, useAgenticAnalysis, agentStatus]);

    const handleSaveToHistory = async () => {
        const analyzedCompetitors = state.competitors.filter(c => c.analysis);
        if(analyzedCompetitors.length === 0) {
            alert("Nothing to save. Please analyze at least one itinerary first.");
            return;
        }

        const recordToSave: Omit<AnalysisRecord, 'id'> = {
            createdAt: new Date().toISOString(),
            competitors: analyzedCompetitors.map(c => ({
                name: c.name,
                itineraryText: c.itineraryText,
                analysis: c.analysis,
                fileName: c.file?.name || 'N/A',
                fileSize: c.file?.size || 0,
            })),
            comparison: state.comparison,
            chatHistory: state.chatHistory,
            recommendations: state.recommendations
        };
        await dbService.addAnalysisToHistory(recordToSave);
        await refreshHistory();
    };

    const handleLoadHistoryItem = (record: AnalysisRecord) => {
        if(window.confirm("This will replace your current session. Are you sure you want to load this item?")) {
            dispatch({ type: 'LOAD_HISTORY_ITEM', payload: record });
            setShowSavedPanel(false);
        }
    };
    
    const handleDeleteHistoryItem = async (id: number) => {
        if(window.confirm("Are you sure you want to delete this item forever?")) {
            await dbService.deleteFromHistory(id);
            await refreshHistory();
        }
    };
    
    const handleDeleteDocument = async (id: number) => {
        if(window.confirm("Are you sure you want to delete this document from your Knowledge Base forever?")) {
            await dbService.deleteDocument(id);
            dispatch({ type: 'REMOVE_DOCUMENT_SUCCESS', payload: id });
            
            // Remove from Hybrid RAG
            if (state.isArangoConnected) {
                try {
                    await removeDocumentFromArango(id);
                    // Refresh KB stats
                    const stats = await getArangoStats();
                    if (stats) setKbStats(stats);
                } catch (e) {
                    console.warn('Failed to remove from ArangoDB:', e);
                }
            } else if (state.isChromaConnected) {
                try {
                    await removeDocumentHybrid(id);
                } catch (e) {
                    console.warn('Failed to remove from ChromaDB:', e);
                }
            }
        }
    };

    const handleExport = async (format: 'pdf' | 'excel') => {
        setIsExporting(format);
        try {
            if (format === 'pdf') {
                await exportToPdf(state);
            } else {
                await exportToExcel(state);
            }
        } catch (error) {
            console.error(`Export to ${format} failed`, error);
            alert(`Sorry, the ${format} export failed. Please check the console for details.`);
        } finally {
            setIsExporting(false);
        }
    };
    
    const handleClearSession = () => {
        if(window.confirm('Are you sure you want to clear the current session? This will not delete your Knowledge Base.')) {
            dispatch({type: 'CLEAR_ALL'});
        }
    };


    const setChatHistory = (history: ChatMessage[]) => dispatch({ type: 'SET_CHAT_HISTORY', payload: history });
    const isAnalyzed = useMemo(() => state.competitors.some(c => c.analysis), [state.competitors]);
    const canAnalyze = useMemo(() => state.competitors.some(c => c.itineraryText && !c.isParsing), [state.competitors]);

    // Helper for rendering saved panel content
    const renderSavedPanelContent = () => {
        if (savedPanelTab === 'history') {
            if (history.length === 0) {
                return <p className="p-4 text-center text-gray-500">No saved history.</p>;
            }
            return (
                <div className="flex flex-col">
                    {history.map(item => (
                        <div key={item.id} className="p-3 border-b hover:bg-gray-50 group">
                            <p className="font-semibold">{item.competitors.map(c => c.name).join(' vs ')}</p>
                            <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</p>
                            <div className="mt-2 flex gap-2">
                                <button onClick={() => handleLoadHistoryItem(item)} className="text-xs font-semibold text-primary hover:underline">Load</button>
                                <button onClick={() => handleDeleteHistoryItem(item.id)} className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            );
        } else {
            return (
                <div>
                    {state.documents.length === 0 ? (
                        <p className="p-4 text-center text-gray-500">Your Knowledge Base is empty.</p>
                    ) : (
                        state.documents.map(doc => (
                            <div key={doc.id} className="p-3 border-b hover:bg-gray-50 flex items-center gap-3">
                                <DocumentTextIcon className="h-6 w-6 text-primary flex-shrink-0" />
                                <div className="flex-grow overflow-hidden">
                                    <p className="font-semibold text-sm truncate" title={doc.name}>{doc.name}</p>
                                    <p className="text-xs text-gray-500">Added: {new Date(doc.createdAt).toLocaleDateString()}</p>
                                </div>
                                <button onClick={() => handleDeleteDocument(doc.id)} className="text-xs font-semibold text-red-500 hover:underline flex-shrink-0">Delete</button>
                            </div>
                        ))
                    )}
                    <div className="p-3 bg-gray-50 border-t space-y-2">
                        {state.isArangoConnected && (
                            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                                <DataIcon className="h-4 w-4" />
                                <div className="flex-1">
                                    <span className="font-semibold">🔄 Hybrid RAG Active</span>
                                    <p className="text-green-600 mt-0.5">
                                        <strong>ArangoDB:</strong> Vector similarity + Graph traversal
                                    </p>
                                </div>
                            </div>
                        )}
                        {!state.isArangoConnected && state.isChromaConnected && (
                            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
                                <DataIcon className="h-4 w-4" />
                                <span>🔍 ChromaDB Vector Search Active</span>
                            </div>
                        )}
                        {!state.isArangoConnected && !state.isChromaConnected && state.documents.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                                <span>⚠️ Database not connected - using local text matching</span>
                            </div>
                        )}
                        {/* Upload Progress Indicator */}
                        {state.uploadProgress && (
                            <div className="w-full bg-gray-100 rounded-lg p-4 space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-gray-700 truncate max-w-[200px]">
                                        {state.uploadProgress.isUploading 
                                            ? `📄 ${state.uploadProgress.current}`
                                            : `✅ Upload Complete!`
                                        }
                                    </span>
                                    <span className="text-gray-500 font-mono">
                                        {state.uploadProgress.completed}/{state.uploadProgress.total}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div 
                                        className={`h-2.5 rounded-full transition-all duration-300 ${
                                            state.uploadProgress.failed.length > 0 
                                                ? 'bg-amber-500' 
                                                : 'bg-green-500'
                                        }`}
                                        style={{ 
                                            width: `${(state.uploadProgress.completed / state.uploadProgress.total) * 100}%` 
                                        }}
                                    />
                                </div>
                                {state.uploadProgress.isUploading && (
                                    <p className="text-xs text-gray-500 animate-pulse">
                                        ⏳ Processing... This may take a while for large batches
                                    </p>
                                )}
                                {state.uploadProgress.failed.length > 0 && (
                                    <p className="text-xs text-red-600 truncate">
                                        ❌ Failed ({state.uploadProgress.failed.length}): {state.uploadProgress.failed.slice(0, 3).join(', ')}{state.uploadProgress.failed.length > 3 ? '...' : ''}
                                    </p>
                                )}
                                {!state.uploadProgress.isUploading && (
                                    <p className="text-xs text-green-600">
                                        ✓ {state.uploadProgress.succeeded.length} files indexed successfully
                                    </p>
                                )}
                            </div>
                        )}
                        
                        <label 
                            htmlFor="kb-upload" 
                            className={`w-full text-center block cursor-pointer px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                state.uploadProgress?.isUploading
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-primary-light text-primary hover:bg-primary hover:text-white'
                            }`}
                        >
                            {state.uploadProgress?.isUploading 
                                ? '⏳ Processing files...'
                                : '+ Add Document(s) to Knowledge Base'
                            }
                        </label>
                        <input 
                            id="kb-upload" 
                            type="file" 
                            className="hidden" 
                            accept=".pdf,.docx" 
                            onChange={(e) => e.target.files && handleUploadToKB(e.target.files)} 
                            multiple 
                            disabled={state.uploadProgress?.isUploading}
                        />
                        <p className="text-xs text-gray-500 text-center">
                            {state.isArangoConnected 
                                ? '🔗 Hybrid RAG: Graph + Vector search enabled'
                                : state.isChromaConnected
                                    ? '📊 Vector search enabled'
                                    : 'Documents stored locally in browser'
                            }
                        </p>
                    </div>
                </div>
            );
        }
    };

  return (
    <div className="min-h-screen flex flex-col text-on-surface bg-background">
      {/* RAG Progress Overlay */}
      <RagProgressOverlay 
        progress={ragProgress} 
        onCancel={() => {
          console.log('⚠️ Analysis cancelled by user');
          setRagProgress(prev => ({ ...prev, isActive: false }));
          // Dispatch to stop analysis state
          dispatch({ type: 'FAIL_ANALYSIS', payload: 'Analysis cancelled. Using standard analysis mode.' });
        }}
      />
      
      <Header />
       <main className="flex-grow p-4 md:p-6 flex gap-4">
        {/* Knowledge Base Sidebar */}
        {showKnowledgeBase && (
            <div className="w-80 flex-shrink-0 hidden md:block">
                <KnowledgeBase
                    documents={state.documents}
                    isArangoConnected={state.isArangoConnected}
                    isChromaConnected={state.isChromaConnected}
                    uploadProgress={state.uploadProgress}
                    onUpload={handleUploadToKB}
                    onDelete={handleDeleteDocument}
                    stats={kbStats}
                />
            </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 space-y-4 md:space-y-6 min-w-0">
        {/* Controls */}
         <div className="bg-surface p-3 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-2">
            <button onClick={handleAnalyze} disabled={!canAnalyze || state.isAnalyzing} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors bg-primary text-white hover:bg-primary-dark disabled:bg-gray-400 disabled:opacity-75">
                <AnalyzeIcon />
                <span>{state.isAnalyzing ? 'Analyzing...' : 'Analyze & Compare'}</span>
                {agentStatus?.crew && useAgenticAnalysis && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 text-white rounded" title="Using CrewAI multi-agent analysis">
                        🤖
                    </span>
                )}
            </button>
             <button onClick={() => dispatch({ type: 'ADD_COMPETITOR' })} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-on-surface-variant hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent">
                + Add Itinerary
            </button>
             <div className="flex-grow"></div>

            <div className="relative">
                <select 
                    value={state.language} 
                    onChange={e => dispatch({type: 'SET_LANGUAGE', payload: e.target.value})}
                    className="bg-transparent hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary rounded-lg text-sm font-semibold text-on-surface-variant transition-colors appearance-none pl-8 pr-4 py-2"
                >
                    <option>English</option>
                    <option>Thai</option>
                </select>
                <LanguageIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none"/>
            </div>

            <button onClick={handleGenerateRecs} disabled={!isAnalyzed || state.isGeneratingRecs} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-on-surface-variant hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent">
                <LightbulbIcon />
                <span>{state.isGeneratingRecs ? 'Generating...' : 'Get Insights'}</span>
                {agentStatus?.crew && useAgenticAnalysis && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded" title="Using CrewAI agents">
                        🤖
                    </span>
                )}
            </button>
            {state.isGeneratingRecs && (
                <button 
                    onClick={() => {
                        dispatch({ type: 'FAIL_RECS', payload: 'Cancelled by user' });
                        setRagProgress(prev => ({ ...prev, isActive: false }));
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200"
                    title="Cancel generation"
                >
                    ✕ Cancel
                </button>
            )}
            
            {/* Agent Status Indicator */}
            {agentStatus && (
                <div className="flex items-center gap-1 px-2 py-1 rounded text-xs" title="AI Agent Status">
                    {agentStatus.crew && (
                        <label className="flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded cursor-pointer hover:bg-green-200" title="Toggle Agentic Analysis">
                            <input
                                type="checkbox"
                                checked={useAgenticAnalysis}
                                onChange={(e) => setUseAgenticAnalysis(e.target.checked)}
                                className="w-3 h-3"
                            />
                            <span>🤖 Crew</span>
                        </label>
                    )}
                    {agentStatus.web && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded" title="Web Search Available">
                            🌐 Web
                        </span>
                    )}
                    {agentStatus.memory && (
                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded" title="Memory Available">
                            🧠 Mem
                        </span>
                    )}
                    {!agentStatus.crew && !agentStatus.web && !agentStatus.memory && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded" title="Agents not available">
                            ⚠️ No Agents
                        </span>
                    )}
                </div>
            )}
             <button onClick={handleSaveToHistory} disabled={!isAnalyzed} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-on-surface-variant hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"><SaveIcon /><span>Save</span></button>
             
             {/* Knowledge Base Button */}
             <button 
                onClick={() => setShowKnowledgeBase(!showKnowledgeBase)} 
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    showKnowledgeBase 
                        ? 'bg-indigo-100 text-indigo-700' 
                        : 'text-on-surface-variant hover:bg-gray-100'
                }`}
             >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <span>Knowledge Base</span>
                {state.documents.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-indigo-200 text-indigo-700">
                        {state.documents.length}
                    </span>
                )}
             </button>
             
             <div className="relative">
                <button onClick={() => setShowSavedPanel(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-on-surface-variant hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"><ArchiveIcon /><span>Saved</span></button>
                {showSavedPanel && (
                    <>
                     <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setShowSavedPanel(false)}></div>
                     <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border z-40 flex flex-col max-h-[70vh]">
                        <div className="p-3 border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg">Saved Items</h3>
                            <button onClick={() => setShowSavedPanel(false)} className="text-2xl leading-none">&times;</button>
                        </div>
                        <div className="border-b border-gray-200">
                             <nav className="flex -mb-px">
                                <button onClick={() => setSavedPanelTab('history')} className={`flex-1 py-3 px-1 text-center border-b-2 font-medium text-sm ${savedPanelTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                                    Analysis History ({history.length})
                                </button>
                                <button onClick={() => setSavedPanelTab('kb')} className={`flex-1 py-3 px-1 text-center border-b-2 font-medium text-sm ${savedPanelTab === 'kb' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                                    Knowledge Base ({state.documents.length})
                                    {state.isArangoConnected && <span className="ml-1 inline-block w-2 h-2 bg-green-500 rounded-full" title="ArangoDB Connected"></span>}
                                </button>
                            </nav>
                        </div>
                        <div className="overflow-y-auto flex-grow">
                            {renderSavedPanelContent()}
                        </div>
                    </div>
                    </>
                )}
            </div>
             <div className="relative group">
                <button disabled={!isAnalyzed || !!isExporting} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-on-surface-variant hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"><ExportIcon /><span>Export</span></button>
                <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-lg shadow-xl border z-20 overflow-hidden hidden group-focus-within:block hover:block">
                   <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2 hover:bg-primary-light flex items-center gap-2">
                       <ExportIcon /> {isExporting === 'pdf' ? 'Exporting...' : 'Export as PDF'}
                    </button>
                    <button onClick={() => handleExport('excel')} className="w-full text-left px-4 py-2 hover:bg-primary-light flex items-center gap-2">
                        <ExcelIcon /> {isExporting === 'excel' ? 'Exporting...' : 'Export as Excel'}
                    </button>
                </div>
            </div>
             <button onClick={handleClearSession} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-red-600 hover:bg-red-50">
                <TrashIcon />
                <span>Clear Session</span>
            </button>
         </div>

        {state.analysisError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">{state.analysisError}</div>}
        
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className={`grid grid-cols-1 ${state.competitors.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
                 {state.competitors.map((competitor) => (
                    <ItineraryInput
                        key={competitor.id}
                        {...competitor}
                        isRemovable={state.competitors.length > 1}
                        onNameChange={(name) => dispatch({ type: 'UPDATE_COMPETITOR_NAME', payload: { id: competitor.id, name } })}
                        onFileSelect={(files) => handleFileSelect(competitor.id, files)}
                        onFileRemove={() => dispatch({ type: 'REMOVE_FILE', payload: competitor.id })}
                        onCompetitorRemove={() => dispatch({ type: 'REMOVE_COMPETITOR', payload: competitor.id })}
                        onAddCompetitor={() => dispatch({ type: 'ADD_COMPETITOR' })}
                    />
                ))}
            </div>

            <AnalysisOutput
                competitors={state.competitors}
                comparison={state.comparison}
                chatHistory={state.chatHistory}
                setChatHistory={setChatHistory}
                documents={state.documents}
                recommendations={state.recommendations}
                isLoading={state.isAnalyzing}
                isLoadingRecs={state.isGeneratingRecs}
                language={state.language}
                onUploadToKB={handleUploadToKB}
                onGetAnswer={handleGetAnswer}
                ragUsed={lastRagUsage.used}
                ragDocCount={lastRagUsage.docCount}
            />
        </div>
        </div>
      </main>
      <footer className="text-center text-sm text-on-surface-variant py-4 border-t border-gray-200 bg-surface">
        <p>This app made by Saksit Saelow</p>
      </footer>
    </div>
  );
};

export default App;

