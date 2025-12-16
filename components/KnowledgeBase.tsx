/**
 * Knowledge Base Component
 * Dedicated UI for managing the document knowledge base
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, UploadProgress } from '../types';
import { getLanguageStats, detectLanguage } from '../services/thaiRagService';

interface KnowledgeBaseProps {
    documents: Document[];
    isArangoConnected: boolean;
    isChromaConnected: boolean;
    uploadProgress: UploadProgress | null;
    onUpload: (files: FileList) => void;
    onDelete: (id: number) => void;
    stats?: {
        documents: number;
        chunks: number;
        entities: number;
    } | null;
}

// Icons
const DocumentIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const UploadIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
);

const SearchIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const DatabaseIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
);

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({
    documents,
    isArangoConnected,
    isChromaConnected,
    uploadProgress,
    onUpload,
    onDelete,
    stats
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter documents by search
    const filteredDocs = documents.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Get language statistics
    const langStats = getLanguageStats(documents);

    // Drag and drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            onUpload(files);
        }
    }, [onUpload]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onUpload(e.target.files);
            e.target.value = ''; // Reset input
        }
    }, [onUpload]);

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return '📕';
        if (ext === 'docx' || ext === 'doc') return '📘';
        if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return '🖼️';
        return '📄';
    };

    const getLanguageFlag = (text: string) => {
        const lang = detectLanguage(text.substring(0, 500));
        if (lang === 'thai') return '🇹🇭';
        if (lang === 'mixed') return '🌐';
        return '🇺🇸';
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const isUploading = uploadProgress?.isUploading;

    return (
        <div className="h-full flex flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <DatabaseIcon />
                        <h2 className="text-lg font-bold text-gray-800">Knowledge Base</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {isArangoConnected && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                                Hybrid RAG
                            </span>
                        )}
                        {!isArangoConnected && isChromaConnected && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <span className="w-2 h-2 bg-blue-500 rounded-full mr-1.5"></span>
                                Vector
                            </span>
                        )}
                        {!isArangoConnected && !isChromaConnected && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                <span className="w-2 h-2 bg-amber-500 rounded-full mr-1.5"></span>
                                Local Only
                            </span>
                        )}
                    </div>
                </div>

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                            <div className="text-lg font-bold text-indigo-600">{stats.documents}</div>
                            <div className="text-xs text-gray-500">Documents</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                            <div className="text-lg font-bold text-purple-600">{stats.chunks}</div>
                            <div className="text-xs text-gray-500">Chunks</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                            <div className="text-lg font-bold text-pink-600">{stats.entities}</div>
                            <div className="text-xs text-gray-500">Entities</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                            <div className="text-lg font-bold text-green-600">
                                {langStats.thai > 0 ? '🇹🇭' : ''}{langStats.english > 0 ? '🇺🇸' : ''}
                            </div>
                            <div className="text-xs text-gray-500">Languages</div>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <SearchIcon />
                    </div>
                </div>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
                <div className="p-3 bg-indigo-50 border-b border-indigo-100">
                    <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium text-indigo-700 truncate max-w-[180px]">
                            {uploadProgress.isUploading 
                                ? `📄 ${uploadProgress.current}`
                                : '✅ Upload Complete!'
                            }
                        </span>
                        <span className="text-indigo-600 font-mono">
                            {uploadProgress.completed}/{uploadProgress.total}
                        </span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2">
                        <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                                uploadProgress.failed.length > 0 
                                    ? 'bg-amber-500' 
                                    : 'bg-indigo-500'
                            }`}
                            style={{ 
                                width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` 
                            }}
                        />
                    </div>
                    {uploadProgress.isUploading && (
                        <p className="text-xs text-indigo-600 mt-1 animate-pulse">
                            ⏳ Processing with multimodal RAG...
                        </p>
                    )}
                </div>
            )}

            {/* Drag & Drop Zone */}
            <div 
                className={`p-4 border-b border-gray-200 transition-colors ${
                    isDragging 
                        ? 'bg-indigo-50 border-indigo-300' 
                        : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div 
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                        isDragging 
                            ? 'border-indigo-400 bg-indigo-100/50' 
                            : 'border-gray-300 hover:border-indigo-400'
                    } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <UploadIcon />
                    <div className="mt-2">
                        <p className="text-sm font-medium text-gray-700">
                            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            or click to browse
                        </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">PDF</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">DOCX</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Images</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        Supports Thai 🇹🇭 and English 🇺🇸 documents
                    </p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.gif,.webp"
                    multiple
                    onChange={handleFileSelect}
                    disabled={isUploading}
                />
            </div>

            {/* Document List */}
            <div className="flex-1 overflow-y-auto">
                {filteredDocs.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        {documents.length === 0 ? (
                            <>
                                <DocumentIcon />
                                <p className="mt-2 text-sm">No documents yet</p>
                                <p className="text-xs text-gray-400">Upload files to build your knowledge base</p>
                            </>
                        ) : (
                            <p className="text-sm">No documents match "{searchQuery}"</p>
                        )}
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {filteredDocs.map((doc) => (
                            <li 
                                key={doc.id}
                                className="p-3 hover:bg-gray-50 transition-colors group"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-xl flex-shrink-0">
                                        {getFileIcon(doc.name)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {doc.name}
                                            </p>
                                            <span className="text-sm">{getLanguageFlag(doc.text)}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Added {formatDate(doc.createdAt)}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                            {doc.text.substring(0, 150)}...
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onDelete(doc.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                        title="Delete document"
                                    >
                                        <TrashIcon />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                        {documents.length} document{documents.length !== 1 ? 's' : ''}
                        {langStats.thai > 0 && ` • ${langStats.thai} Thai`}
                        {langStats.english > 0 && ` • ${langStats.english} English`}
                    </span>
                    {isArangoConnected && (
                        <span className="text-green-600">
                            🔗 Graph + Vector enabled
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default KnowledgeBase;

