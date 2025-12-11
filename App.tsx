
import React, { useReducer, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'https://esm.sh/uuid';
import Header from './components/Header';
import ItineraryInput from './components/ItineraryInput';
import AnalysisOutput from './components/AnalysisOutput';
import { AppState, Competitor, ChatMessage, AnalysisRecord, Document, ItineraryData } from './types';
import { parseFile } from './services/fileParser';
import { analyzeItinerary, getComparison, getRecommendations, generateAnswer } from './services/geminiService';
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
import { initializeKnowledgeGraph } from './services/neo4jService';
import { hybridRagQuery, indexDocumentHybrid, removeDocumentHybrid, isHybridRagAvailable, getHybridRagStats } from './services/hybridRagService';
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
  | { type: 'SET_NEO4J_CONNECTED'; payload: boolean };


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
  isNeo4jConnected: false,
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
      return {...initialState, documents: state.documents, isNeo4jConnected: state.isNeo4jConnected}; // Keep knowledge base and Neo4j status on clear all
    case 'SET_NEO4J_CONNECTED':
      return { ...state, isNeo4jConnected: action.payload };
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
            
            // Initialize Neo4j Knowledge Graph
            const neo4jConnected = await initializeKnowledgeGraph();
            dispatch({ type: 'SET_NEO4J_CONNECTED', payload: neo4jConnected });
            if (neo4jConnected) {
                console.log('✅ Neo4j Knowledge Graph connected');
            } else {
                console.log('⚠️ Neo4j not available - using local storage only');
            }
        };
        loadData();
    }, []);

    const refreshHistory = useCallback(async () => {
        const savedHistory = await dbService.getHistory();
        setHistory(savedHistory);
    }, []);


    const handleFileSelect = useCallback(async (targetId: string, files: File[]) => {
        if (files.length === 0) return;

        // 1. Handle the first file (replaces the content of the target dropzone)
        const firstFile = files[0];
        const firstFileName = firstFile.name.substring(0, 10); // First 10 chars of filename
        
        dispatch({ type: 'UPDATE_COMPETITOR_NAME', payload: { id: targetId, name: firstFileName } });
        dispatch({ type: 'START_PARSING', payload: { id: targetId, file: firstFile } });
        
        // Async parsing for first file
        parseFile(firstFile)
            .then(text => dispatch({ type: 'FINISH_PARSING', payload: { id: targetId, text } }))
            .catch(e => {
                 const error = e instanceof Error ? e.message : 'An unknown error occurred during parsing.';
                 dispatch({ type: 'FAIL_PARSING', payload: { id: targetId, error } });
            });

        // 2. Handle subsequent files (create new slots)
        for (let i = 1; i < files.length; i++) {
            const newFile = files[i];
            const newId = uuidv4();
            const newName = newFile.name.substring(0, 10); // First 10 chars of filename

            // Add new competitor slot with file attached
            dispatch({ 
                type: 'ADD_COMPETITOR_WITH_FILE', 
                payload: { id: newId, file: newFile, name: newName } 
            });

            // Start parsing for the new file
            parseFile(newFile)
                .then(text => dispatch({ type: 'FINISH_PARSING', payload: { id: newId, text } }))
                .catch(e => {
                     const error = e instanceof Error ? e.message : 'An unknown error occurred during parsing.';
                     dispatch({ type: 'FAIL_PARSING', payload: { id: newId, error } });
                });
        }
    }, []);
    
    const handleUploadToKB = useCallback(async (files: FileList) => {
        const filesArray = Array.from(files);
        for (const file of filesArray) {
            try {
                const text = await parseFile(file);
                 const newDocData: Omit<Document, 'id'> = {
                    name: file.name,
                    text,
                    createdAt: new Date().toISOString(),
                };
                
                // Save locally
                if (!state.documents.some(d => d.name === file.name && d.text === text)) {
                    const newId = await dbService.addDocument(newDocData);
                    const newDoc = { ...newDocData, id: newId };
                    dispatch({ type: 'ADD_DOCUMENT_SUCCESS', payload: newDoc });
                    
                    // Index for Hybrid RAG (ChromaDB + Neo4j) if connected
                    if (state.isNeo4jConnected) {
                        try {
                            const result = await indexDocumentHybrid(newDoc);
                            console.log(`🔍 Hybrid RAG indexed "${file.name}": Chroma=${result.chromaChunks}, Neo4j=${result.neo4jChunks}, Entities=${result.entities}`);
                        } catch (ragError) {
                            console.warn('Failed to index for Hybrid RAG:', ragError);
                        }
                    }
                }

            } catch(e) {
                const error = e instanceof Error ? e.message : 'An unknown error occurred during parsing.';
                alert(`Failed to add document "${file.name}": ${error}`);
                // Continue to next file
            }
        }
    }, [state.documents, state.isNeo4jConnected]);


    // Orchestrate Q&A with Hybrid RAG pipeline (ChromaDB + Neo4j)
    const handleGetAnswer = async (history: ChatMessage[], question: string): Promise<string> => {
        // 1. Try Hybrid RAG pipeline (ChromaDB for vectors + Neo4j for graph)
        if (state.isNeo4jConnected) {
            try {
                const hybridResponse = await hybridRagQuery(question, history, state.language);
                
                console.log(`🔄 Hybrid RAG: Chroma=${hybridResponse.sources.chromaResults}, Neo4j=${hybridResponse.sources.neo4jResults}, Time=${hybridResponse.processingTime}ms`);
                
                if (hybridResponse.sources.chromaResults > 0 || hybridResponse.sources.neo4jResults > 0) {
                    return hybridResponse.answer;
                }
            } catch (e) {
                console.warn('Hybrid RAG query failed, falling back to local:', e);
            }
        }
        
        // 2. Fallback to local documents if Hybrid RAG not available
        let contextText = "";
        if (state.documents.length > 0) {
            contextText += "## Local Documents:\n" + state.documents.map(d => `### ${d.name}\n${d.text}`).join('\n\n') + "\n\n";
        }

        // 3. Generate Answer with local context
        return await generateAnswer(history, contextText, question, state.language);
    };

    const handleAnalyze = useCallback(async () => {
        const competitorsWithText = state.competitors.filter(c => c.itineraryText);
        const competitorsToAnalyze = competitorsWithText.filter(c => !c.analysis);

        if (competitorsToAnalyze.length === 0 && competitorsWithText.length < 2) {
            return;
        }
        
        dispatch({ type: 'START_ANALYSIS' });

        try {
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
                comparison = await getComparison(uniqueAnalyzedForComparison, state.language);
            }
            
            dispatch({ type: 'FINISH_ALL_ANALYSES', payload: { comparison } });

        } catch (e) {
            const error = e instanceof Error ? e.message : 'An unknown error occurred during analysis.';
            dispatch({ type: 'FAIL_ANALYSIS', payload: error });
        }
    }, [state.competitors, state.language]);
    
    const handleGenerateRecs = useCallback(async () => {
        const analyzedCompetitors = state.competitors.filter(c => c.analysis);
        if (analyzedCompetitors.length === 0) return;
        
        dispatch({ type: 'START_RECS' });
        try {
            const pastAnalyses = await dbService.getHistory();
            const recommendations = await getRecommendations(analyzedCompetitors, pastAnalyses, state.language);
            dispatch({ type: 'FINISH_RECS', payload: recommendations });
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Failed to generate recommendations.';
            dispatch({ type: 'FAIL_RECS', payload: error });
        }
    }, [state.competitors, state.language]);

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
            
            // Remove from Hybrid RAG (ChromaDB + Neo4j)
            if (state.isNeo4jConnected) {
                try {
                    await removeDocumentHybrid(id);
                } catch (e) {
                    console.warn('Failed to remove from Hybrid RAG:', e);
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
                        {state.isNeo4jConnected && (
                            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                                <DataIcon className="h-4 w-4" />
                                <div className="flex-1">
                                    <span className="font-semibold">🔄 Hybrid RAG Active</span>
                                    <p className="text-green-600 mt-0.5">
                                        <strong>ChromaDB:</strong> Vector similarity search | 
                                        <strong> Neo4j:</strong> Graph traversal & entity relationships
                                    </p>
                                </div>
                            </div>
                        )}
                        {!state.isNeo4jConnected && state.documents.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                                <span>⚠️ Hybrid RAG not connected - using basic text matching</span>
                            </div>
                        )}
                         <label htmlFor="kb-upload" className="w-full text-center block cursor-pointer px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-primary-light text-primary hover:bg-primary hover:text-white">
                            + Add Document(s) to Knowledge Base
                        </label>
                        <input id="kb-upload" type="file" className="hidden" accept=".pdf,.docx" onChange={(e) => e.target.files && handleUploadToKB(e.target.files)} multiple />
                        <p className="text-xs text-gray-500 text-center">
                            {state.isNeo4jConnected 
                                ? 'Documents indexed in ChromaDB (vectors) + Neo4j (graph)'
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
      <Header />
       <main className="flex-grow p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Controls */}
         <div className="bg-surface p-3 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-2">
            <button onClick={handleAnalyze} disabled={!canAnalyze || state.isAnalyzing} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors bg-primary text-white hover:bg-primary-dark disabled:bg-gray-400 disabled:opacity-75">
                <AnalyzeIcon />
                <span>{state.isAnalyzing ? 'Analyzing...' : 'Analyze & Compare'}</span>
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
            </button>
             <button onClick={handleSaveToHistory} disabled={!isAnalyzed} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-on-surface-variant hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"><SaveIcon /><span>Save</span></button>
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
                                    {state.isNeo4jConnected && <span className="ml-1 inline-block w-2 h-2 bg-green-500 rounded-full" title="Neo4j Connected"></span>}
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
            />
        </div>
      </main>
      <footer className="text-center text-sm text-on-surface-variant py-4 border-t border-gray-200 bg-surface">
        <p>This app made by Saksit Saelow</p>
      </footer>
    </div>
  );
};

export default App;
