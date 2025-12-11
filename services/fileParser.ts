
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up the worker source for pdf.js to ensure it can run in the background.
// We point it to the version served by esm.sh, matching our import map.
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.mjs`;

/**
 * Reads a File object and returns its content as an ArrayBuffer.
 * This is a necessary step for both PDF and DOCX parsers.
 */
const readAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error(`Failed to read file "${file.name}". It might be locked or corrupted.`));
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Reads a File object and returns its content as a Base64 Data URL.
 * Used for image handling.
 */
const readAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Failed to read image file "${file.name}".`));
        reader.readAsDataURL(file);
    });
};

/**
 * Parses a PDF file and extracts its text content, page by page.
 * @param file The PDF file to parse.
 * @returns A promise that resolves with the extracted text.
 */
const parsePdf = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await readAsArrayBuffer(file);
        
        // Wrap getDocument in a promise to handle initial loading errors (like password)
        const loadingTask = pdfjs.getDocument(arrayBuffer);
        
        const pdf = await loadingTask.promise.catch((error: any) => {
            if (error.name === 'PasswordException') {
                throw new Error('This PDF is password protected. Please unlock it and try again.');
            } else if (error.name === 'InvalidPDFException') {
                 throw new Error('The file is not a valid PDF or is corrupted.');
            } else {
                throw new Error(`PDF Loading Error: ${error.message || 'Unknown error'}`);
            }
        });

        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                // The 'str' property holds the text of each item.
                // We join them with spaces and add a newline for each page.
                const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
                text += pageText + '\n';
            } catch (pageError: any) {
                console.warn(`Failed to parse page ${i} of PDF:`, pageError);
                // We continue to next page, but note that data might be incomplete
            }
        }

        if (!text.trim()) {
            throw new Error('The PDF appears to be empty or contains only images (scanned). This app requires selectable text to analyze content.');
        }

        return text;

    } catch (error: any) {
        // Propagate our custom errors directly if they are already Error objects we created
        if (error.message && (
            error.message.includes('password') || 
            error.message.includes('scanned') || 
            error.message.includes('corrupted') ||
            error.message.includes('PDF Loading Error')
        )) {
            throw error;
        }
        // Fallback for generic errors
        throw new Error(`Error parsing PDF: ${error.message}`);
    }
};

/**
 * Parses a DOCX file and extracts its raw text content.
 * @param file The DOCX file to parse.
 * @returns A promise that resolves with the extracted text.
 */
const parseDocx = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await readAsArrayBuffer(file);
        const result = await mammoth.extractRawText({ arrayBuffer });
        
        if (!result.value.trim()) {
            throw new Error('The Word document appears to be empty or contains no readable text.');
        }
        
        return result.value;
    } catch (error: any) {
        if (error.message && error.message.includes('empty')) throw error;
        
        console.error('Mammoth extraction error:', error);
        throw new Error(`Error parsing Word document: ${error.message || 'File might be corrupted or incompatible'}.`);
    }
};

/**
 * Orchestrator function that checks the file type and calls the appropriate parser.
 * @param file The file to parse (PDF, DOCX, or Image).
 * @returns A promise that resolves with the extracted text or base64 image data.
 * @throws An error if the file type is not supported.
 */
export const parseFile = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        return parsePdf(file);
    } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        file.name.toLowerCase().endsWith('.docx')
    ) {
        return parseDocx(file);
    } else if (
        file.type.startsWith('image/') || 
        /\.(jpg|jpeg|png|webp|heic)$/i.test(file.name)
    ) {
        return readAsDataURL(file);
    } else {
        const extension = file.name.split('.').pop();
        throw new Error(`Unsupported file type (.${extension}). Please upload a valid PDF, DOCX (Word), or Image file.`);
    }
};
