
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { PaperAirplaneIcon } from './icons/PaperAirplaneIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { UserIcon } from './icons/UserIcon';
import { renderMarkdown } from '../utils/markdownRenderer';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { ExportIcon } from './icons/ExportIcon';

interface QnaViewProps {
  chatHistory: ChatMessage[];
  setChatHistory: (history: ChatMessage[]) => void;
  contexts: {name: string, text: string}[];
  isReady: boolean;
  language: string;
  onUploadToKB: (files: FileList) => Promise<void>;
  onGetAnswer: (history: ChatMessage[], question: string) => Promise<string>;
}

const QnaView: React.FC<QnaViewProps> = ({ chatHistory, setChatHistory, contexts, isReady, language, onUploadToKB, onGetAnswer }) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const dragCounter = useRef(0);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [chatHistory]);

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', content: input };
        const updatedHistory = [...chatHistory, newUserMessage];
        setChatHistory(updatedHistory);
        setInput('');
        setIsLoading(true);

        try {
            // Use the prop to get the answer, which now uses purely local documents
            const assistantResponse = await onGetAnswer(updatedHistory, input);
            
            const newAssistantMessage: ChatMessage = { role: 'assistant', content: assistantResponse };
            setChatHistory([...updatedHistory, newAssistantMessage]);
        } catch (error) {
            console.error("Q&A Error:", error);
            const errorMessage: ChatMessage = { role: 'assistant', content: 'Sorry, I encountered an error while generating a response. Please try again.' };
            setChatHistory([...updatedHistory, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };
    
    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        
        const fileCount = files.length;
        setUploadStatus(`Uploading ${fileCount} file${fileCount > 1 ? 's' : ''}...`);
        try {
            await onUploadToKB(files);
        } catch (error) {
            console.error("Upload failed in QnaView", error);
        } finally {
            setUploadStatus('');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files);
        // Clear the input value to allow uploading the same file again if needed
        if (e.target) e.target.value = '';
    };

    const handleExportChat = () => {
        if (chatHistory.length === 0) return;
        
        const timestamp = new Date().toLocaleString();
        const header = `Chat History Export - ${timestamp}\n==========================================\n\n`;
        
        const text = header + chatHistory.map(m => {
            const role = m.role === 'user' ? 'User' : 'Assistant';
            return `[${role}]\n${m.content}\n`;
        }).join('\n------------------------------------------\n\n');
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-history-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Drag and Drop Handlers
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };
    
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Necessary to allow drop
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };
    
    const isUploading = !!uploadStatus;
    const showEmptyState = !isReady;

    if (showEmptyState) {
        return (
            <div
                className={`h-full flex flex-col justify-center items-center text-center p-4 rounded-lg border-2 border-dashed transition-colors duration-200 ${
                    isDragging ? 'border-primary bg-primary-light' : 'border-gray-300'
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {isDragging ? (
                     <>
                        <BookOpenIcon className="w-16 h-16 mb-4 text-primary"/>
                        <h3 className="font-bold text-lg text-primary">Drop documents to upload</h3>
                    </>
                ) : (
                    <>
                        <BookOpenIcon className="w-16 h-16 mb-4 text-gray-300"/>
                        <h3 className="font-bold text-lg">Knowledge Base Q&A</h3>
                        <p className="max-w-xs mb-4">Your knowledge base is empty. Drag & drop documents here, or click to upload.</p>
                        <label htmlFor="qna-upload-empty" className={`w-full max-w-xs text-center block px-4 py-3 rounded-lg font-semibold transition-colors ${isUploading ? 'bg-gray-400' : 'bg-primary text-white hover:bg-primary-dark cursor-pointer'}`}>
                            {isUploading ? uploadStatus : '+ Upload Document(s)'}
                        </label>
                        <input id="qna-upload-empty" type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileChange} disabled={isUploading} multiple />
                    </>
                )}
            </div>
        );
    }

    return (
        <div
            className="flex flex-col h-full relative"
            onDragEnter={handleDragEnter}
        >
             {isDragging && (
                <div
                    className="absolute inset-0 bg-primary-light/80 backdrop-blur-sm z-10 flex flex-col justify-center items-center rounded-lg border-4 border-dashed border-primary"
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <BookOpenIcon className="w-24 h-24 mb-4 text-primary"/>
                    <p className="text-2xl font-bold text-primary-dark">Drop to add to Knowledge Base</p>
                </div>
            )}
            
            <div className="flex justify-between items-center pb-2 border-b mb-2 px-1">
                <h3 className="font-bold text-sm text-gray-700">Conversation</h3>
                <button
                    onClick={handleExportChat}
                    disabled={chatHistory.length <= 1} 
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-primary hover:bg-primary-light transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                    title="Export Chat History as Text"
                >
                    <ExportIcon className="w-4 h-4" />
                    <span>Export History</span>
                </button>
            </div>

            <div className="flex-grow overflow-y-auto pr-4 space-y-4">
                {chatHistory.map((msg, index) => (
                     <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                         {msg.role === 'assistant' && (
                             <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-white">
                                 <SparklesIcon className="w-5 h-5" />
                             </div>
                         )}
                         <div
                             className={`max-w-2xl rounded-xl px-4 py-3 border ${
                                 msg.role === 'user'
                                 ? 'bg-blue-50 border-blue-200 text-blue-900'
                                 : 'bg-gray-100 border-gray-200 text-on-surface'
                             }`}
                         >
                            {renderMarkdown(msg.content)}
                         </div>
                          {msg.role === 'user' && (
                             <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-600">
                                 <UserIcon className="w-5 h-5"/>
                             </div>
                         )}
                     </div>
                ))}
                {isLoading && (
                     <div className="flex items-start gap-3">
                         <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-white">
                             <SparklesIcon className="w-5 h-5" />
                         </div>
                         <div className="max-w-2xl rounded-xl px-4 py-3 border bg-gray-100 border-gray-200 text-on-surface">
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="h-2 w-2 bg-primary rounded-full animate-bounce"></div>
                            </div>
                         </div>
                     </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="mt-4 pt-2 border-t">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask a question about your itineraries or documents..."
                        className="w-full p-3 pr-12 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                        rows={1}
                        disabled={isLoading}
                        aria-label="Chat input"
                    />
                    <button 
                        onClick={handleSendMessage} 
                        disabled={isLoading || !input.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-white bg-primary hover:bg-primary-dark disabled:bg-gray-400"
                        aria-label="Send message"
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                </div>
                 <div className="flex justify-between items-center mt-2">
                     <span className="text-xs text-gray-500 italic">
                         Searching Local Documents Only
                     </span>
                    <div className="text-right">
                        <label htmlFor="qna-upload-active" className={`text-xs font-semibold text-primary ${isUploading ? 'opacity-50' : 'hover:underline cursor-pointer'}`}>
                            {isUploading ? uploadStatus : '+ Add document(s)'}
                        </label>
                        <input id="qna-upload-active" type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileChange} disabled={isUploading} multiple />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QnaView;
