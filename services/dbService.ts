import { openDB, IDBPDatabase } from 'idb';
import { AppState, AnalysisRecord, Document } from '../types';

const DB_NAME = 'travel-analyzer-db';
const SESSION_STORE = 'app-state-store';
const HISTORY_STORE = 'history-store';
const DOCUMENT_STORE = 'document-store';
const DB_VERSION = 3; 

// A promise that resolves with the database instance.
const dbPromise: Promise<IDBPDatabase> = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
        // Handle initial creation and upgrades sequentially
        if (oldVersion < 1) {
            if (!db.objectStoreNames.contains(SESSION_STORE)) {
                db.createObjectStore(SESSION_STORE);
            }
        }
        if (oldVersion < 2) {
             if (!db.objectStoreNames.contains(HISTORY_STORE)) {
                db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
            }
        }
        if (oldVersion < 3) {
            if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
               db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id', autoIncrement: true });
           }
       }
    },
});

const SESSION_KEY = 'latestState';

/**
 * Saves the current session state to IndexedDB for persistence across refreshes.
 * @param state The current state of the application.
 */
export const saveState = async (state: AppState): Promise<void> => {
    try {
        const db = await dbPromise;
        await db.put(SESSION_STORE, state, SESSION_KEY);
    } catch (error) {
        console.error("Failed to save session state to IndexedDB:", error);
    }
};

/**
 * Loads the application session state from IndexedDB.
 * @returns The saved state, or null if no state is found.
 */
export const loadState = async (): Promise<AppState | null> => {
    try {
        const db = await dbPromise;
        const state = await db.get(SESSION_STORE, SESSION_KEY);
        return state || null;
    } catch (error) {
        console.error("Failed to load session state from IndexedDB:", error);
        return null;
    }
};

/**
 * Clears the saved application session state from IndexedDB.
 */
export const clearState = async (): Promise<void> => {
    try {
        const db = await dbPromise;
        await db.delete(SESSION_STORE, SESSION_KEY);
    } catch (error) {
        console.error("Failed to clear session state from IndexedDB:", error);
    }
};


// --- HISTORY STORE FUNCTIONS ---

/**
 * Adds a new analysis record to the persistent history.
 * @param record The analysis record to save.
 * @returns The ID of the newly created record.
 */
export const addAnalysisToHistory = async (record: Omit<AnalysisRecord, 'id'>): Promise<number> => {
    const db = await dbPromise;
    const key = await db.add(HISTORY_STORE, record);
    return key as number;
};

/**
 * Retrieves all analysis records from the history.
 * @returns A promise that resolves with an array of analysis records.
 */
export const getHistory = async (): Promise<AnalysisRecord[]> => {
    const db = await dbPromise;
    // Get all records and sort them by date, newest first
    const history = await db.getAll(HISTORY_STORE);
    // Wrap `createdAt` in `new Date()` to handle cases where it might be a string, making the sort robust.
    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

/**
 * Deletes a specific analysis record from the history by its ID.
 * @param id The ID of the record to delete.
 */
export const deleteFromHistory = async (id: number): Promise<void> => {
    const db = await dbPromise;
    await db.delete(HISTORY_STORE, id);
};


/**
 * Clears the entire analysis history from IndexedDB.
 */
export const clearHistory = async (): Promise<void> => {
    try {
        const db = await dbPromise;
        await db.clear(HISTORY_STORE);
    } catch (error) {
        console.error("Failed to clear history from IndexedDB:", error);
    }
};

// --- DOCUMENT STORE FUNCTIONS ---

/**
 * Adds a new document to the knowledge base.
 * @param doc The document to save.
 * @returns The ID of the newly created document.
 */
export const addDocument = async (doc: Omit<Document, 'id'>): Promise<number> => {
    const db = await dbPromise;
    const key = await db.add(DOCUMENT_STORE, doc);
    return key as number;
};

/**
 * Retrieves all documents from the knowledge base.
 * @returns A promise that resolves with an array of documents.
 */
export const getAllDocuments = async (): Promise<Document[]> => {
    const db = await dbPromise;
    const docs = await db.getAll(DOCUMENT_STORE);
    return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

/**
 * Deletes a specific document from the knowledge base by its ID.
 * @param id The ID of the document to delete.
 */
export const deleteDocument = async (id: number): Promise<void> => {
    const db = await dbPromise;
    await db.delete(DOCUMENT_STORE, id);
};