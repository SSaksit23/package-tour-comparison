
import React, { useRef, useState } from 'react';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

// A simple, self-contained SVG icon for the upload prompt.
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-gray-400 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
);

const PhotoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-2 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

interface ItineraryInputProps {
    name: string;
    onNameChange: (newName: string) => void;
    onFileSelect: (files: File[]) => void;
    onFileRemove: () => void;
    onCompetitorRemove: () => void;
    onAddCompetitor: () => void;
    file: File | null;
    isParsing: boolean;
    parseError: string | null;
    isRemovable: boolean;
}

const ItineraryInput: React.FC<ItineraryInputProps> = ({ name, onNameChange, onFileSelect, onFileRemove, onCompetitorRemove, onAddCompetitor, file, isParsing, parseError, isRemovable }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            onFileSelect(Array.from(files));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            onFileSelect(Array.from(files));
        }
        // Reset input value to allow selecting the same file again if needed
        if (e.target) e.target.value = '';
    };

    const handleClick = () => {
        if (!isParsing && !file) {
            inputRef.current?.click();
        }
    };
    
    const handleRemoveFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        onFileRemove();
    };

    const isImage = file && file.type.startsWith('image/');

    const dropzoneBaseClasses = "relative flex-grow flex flex-col justify-center items-center p-4 bg-background rounded-lg border-2 border-dashed transition-all duration-200 group";
    const dropzoneActiveClasses = "border-primary bg-primary-light shadow-inner scale-[0.99]";
    const dropzoneInactiveClasses = "border-gray-300 hover:border-primary hover:bg-gray-50";
    const dropzoneCursorClass = !file && !isParsing ? 'cursor-pointer' : 'cursor-default';

    return (
        <div className="flex-1 flex flex-col bg-surface p-4 rounded-xl shadow-sm border border-gray-200 min-h-[300px] transition-all hover:shadow-md">
            <div className="flex justify-between items-center mb-3 gap-2">
                 <input
                    type="text"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    className="text-lg font-bold text-on-surface bg-transparent focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white rounded -ml-1 px-1 w-full"
                    placeholder="Enter a name"
                    aria-label="Competitor name"
                 />
                 <div className="flex items-center gap-2 flex-shrink-0">
                     <button 
                        onClick={onAddCompetitor} 
                        className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors p-1"
                        title="Add another itinerary"
                     >
                        + Add
                     </button>
                     {isRemovable && (
                         <button onClick={onCompetitorRemove} className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors z-10 p-1">
                            Remove
                         </button>
                     )}
                 </div>
            </div>
            <div
                className={`${dropzoneBaseClasses} ${isDragging ? dropzoneActiveClasses : dropzoneInactiveClasses} ${dropzoneCursorClass}`}
                onClick={handleClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                aria-label={`Upload area for ${name}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.heic,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                    aria-hidden="true"
                    multiple
                />

                {isParsing ? (
                    <div className="text-center" aria-live="polite">
                        <svg className="animate-spin h-10 w-10 text-primary mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="font-semibold text-on-surface">Processing...</p>
                        <p className="text-xs text-on-surface-variant mt-1">Analyzing document structure</p>
                    </div>
                ) : file ? (
                    <div className="text-center p-2 w-full">
                        {isImage ? <PhotoIcon /> : <DocumentTextIcon className="w-12 h-12 mb-2 text-primary mx-auto" />}
                        <p className="font-semibold text-on-surface break-all line-clamp-2" title={file.name}>{file.name}</p>
                        <p className="text-xs text-on-surface-variant mb-4">({(file.size / 1024).toFixed(2)} KB)</p>
                        <button 
                            onClick={handleRemoveFile} 
                            className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                        >
                            Remove File
                        </button>
                    </div>
                ) : parseError ? (
                     <div className="text-center text-red-500 p-2" role="alert">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <p className="font-bold text-lg">Upload Failed</p>
                        <p className="text-sm mt-1 mb-3 text-on-surface-variant max-w-[200px] mx-auto">{parseError}</p>
                        <button className="text-sm text-primary font-semibold hover:underline decoration-2 underline-offset-2">
                            Try another file
                        </button>
                    </div>
                ) : (
                    <div className="text-center pointer-events-none flex flex-col items-center p-2">
                        <UploadIcon />
                        <span className="font-semibold text-on-surface mb-1">Drop your itinerary here</span>
                        <span className="text-xs text-on-surface-variant">Supports PDF, Word (DOCX), or Images</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ItineraryInput;
