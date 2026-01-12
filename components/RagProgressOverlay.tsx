/**
 * RAG Progress Overlay Component
 * Shows detailed progress during RAG operations
 */

import React from 'react';

export interface RagProgressState {
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
        agent?: string; // Agent name (e.g., 'CrewAI')
    };
    startTime?: number;
}

interface RagProgressOverlayProps {
    progress: RagProgressState;
    onCancel?: () => void;
}

const StepIcon: React.FC<{ step: string; isActive: boolean; isComplete: boolean }> = ({ step, isActive, isComplete }) => {
    const baseClass = "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all";
    
    if (isComplete) {
        return (
            <div className={`${baseClass} bg-green-500 text-white`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
        );
    }
    
    if (isActive) {
        return (
            <div className={`${baseClass} bg-indigo-500 text-white animate-pulse`}>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        );
    }
    
    return (
        <div className={`${baseClass} bg-gray-200 text-gray-500`}>
            {step}
        </div>
    );
};

const getStepsForOperation = (operation: RagProgressState['operation']) => {
    switch (operation) {
        case 'indexing':
            return [
                { id: 1, label: 'Parsing', description: 'Reading document content' },
                { id: 2, label: 'Chunking', description: 'Splitting into segments' },
                { id: 3, label: 'Embedding', description: 'Generating vectors' },
                { id: 4, label: 'Indexing', description: 'Storing in database' },
            ];
        case 'searching':
            return [
                { id: 1, label: 'Embedding', description: 'Converting query to vector' },
                { id: 2, label: 'Searching', description: 'Finding relevant chunks' },
                { id: 3, label: 'Ranking', description: 'Scoring results' },
            ];
        case 'generating':
            return [
                { id: 1, label: 'Context', description: 'Building context from sources' },
                { id: 2, label: 'Generating', description: 'Creating response' },
                { id: 3, label: 'Formatting', description: 'Finalizing output' },
            ];
        case 'analyzing':
            return [
                { id: 1, label: 'Document Analyst', description: 'Extracting structured data' },
                { id: 2, label: 'Market Researcher', description: 'Researching market context' },
                { id: 3, label: 'Strategic Advisor', description: 'Generating recommendations' },
            ];
        default:
            return [];
    }
};

const getOperationTitle = (operation: RagProgressState['operation'], agent?: string) => {
    switch (operation) {
        case 'indexing': return '📚 Indexing Document';
        case 'searching': return '🔍 Searching Knowledge Base';
        case 'generating': return '💬 Generating Response';
        case 'analyzing': return agent ? '🤖 Agentic Analysis' : '📊 Analyzing with RAG';
        default: return 'Processing...';
    }
};

const getOperationColor = (operation: RagProgressState['operation']) => {
    switch (operation) {
        case 'indexing': return 'from-indigo-500 to-purple-500';
        case 'searching': return 'from-blue-500 to-cyan-500';
        case 'generating': return 'from-green-500 to-emerald-500';
        case 'analyzing': return 'from-amber-500 to-orange-500';
        default: return 'from-gray-500 to-gray-600';
    }
};

export const RagProgressOverlay: React.FC<RagProgressOverlayProps> = ({ progress, onCancel }) => {
    if (!progress.isActive) return null;
    
    const steps = getStepsForOperation(progress.operation);
    const currentStepIndex = steps.findIndex(s => s.label.toLowerCase() === progress.currentStep.toLowerCase()) + 1;
    const elapsedTime = progress.startTime ? Math.floor((Date.now() - progress.startTime) / 1000) : 0;
    const estimatedTotal = progress.progress > 0 ? Math.floor(elapsedTime / (progress.progress / 100)) : 0;
    const remainingTime = Math.max(0, estimatedTotal - elapsedTime);
    
    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6">
                {/* Header */}
                <div className="text-center">
                    <h3 className="text-xl font-bold text-gray-800">
                        {getOperationTitle(progress.operation, progress.details?.agent)}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                        {progress.currentStep}
                    </p>
                    {progress.details?.agent && (
                        <p className="text-xs text-indigo-600 mt-1 font-semibold">
                            🤖 Powered by {progress.details.agent}
                        </p>
                    )}
                </div>
                
                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-mono font-bold text-indigo-600">
                            {Math.round(progress.progress)}%
                        </span>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                            className={`h-full bg-gradient-to-r ${getOperationColor(progress.operation)} transition-all duration-300 ease-out`}
                            style={{ width: `${progress.progress}%` }}
                        />
                    </div>
                    {elapsedTime > 2 && remainingTime > 0 && (
                        <p className="text-xs text-gray-400 text-right">
                            ~{formatTime(remainingTime)} remaining
                        </p>
                    )}
                </div>
                
                {/* Steps */}
                <div className="flex justify-between items-start">
                    {steps.map((step, index) => (
                        <div key={step.id} className="flex flex-col items-center text-center flex-1">
                            <StepIcon 
                                step={step.id.toString()} 
                                isActive={index + 1 === currentStepIndex}
                                isComplete={index + 1 < currentStepIndex}
                            />
                            <span className={`text-xs mt-2 font-medium ${
                                index + 1 <= currentStepIndex ? 'text-gray-800' : 'text-gray-400'
                            }`}>
                                {step.label}
                            </span>
                            {index < steps.length - 1 && (
                                <div className="absolute top-4 left-1/2 w-full h-0.5 bg-gray-200 -z-10" />
                            )}
                        </div>
                    ))}
                </div>
                
                {/* Details */}
                {progress.details && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        {progress.details.documentsProcessed !== undefined && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Documents</span>
                                <span className="font-mono text-gray-700">
                                    {progress.details.documentsProcessed}
                                    {progress.details.totalDocuments && ` / ${progress.details.totalDocuments}`}
                                </span>
                            </div>
                        )}
                        {progress.details.chunksProcessed !== undefined && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Chunks</span>
                                <span className="font-mono text-gray-700">
                                    {progress.details.chunksProcessed}
                                    {progress.details.totalChunks && ` / ${progress.details.totalChunks}`}
                                </span>
                            </div>
                        )}
                        {progress.details.entitiesFound !== undefined && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Entities Found</span>
                                <span className="font-mono text-gray-700">
                                    {progress.details.entitiesFound}
                                </span>
                            </div>
                        )}
                        {progress.details.searchResults !== undefined && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Results Found</span>
                                <span className="font-mono text-gray-700">
                                    {progress.details.searchResults}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                
                {/* Cancel Button - only show for agentic analysis */}
                {onCancel && progress.operation === 'analyzing' && progress.details?.agent && (
                    <div className="flex justify-center pt-2">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel & Use Standard Analysis
                        </button>
                    </div>
                )}
                
                {/* Animation */}
                <div className="flex justify-center">
                    <div className="flex space-x-1">
                        {[0, 1, 2].map((i) => (
                            <div 
                                key={i}
                                className={`w-2 h-2 rounded-full bg-gradient-to-r ${getOperationColor(progress.operation)} animate-bounce`}
                                style={{ animationDelay: `${i * 0.15}s` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RagProgressOverlay;

