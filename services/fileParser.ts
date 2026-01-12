
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up the worker source for pdf.js to ensure it can run in the background.
// We point it to the version served by esm.sh, matching our import map.
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.mjs`;

// Gemini API for OCR of scanned documents
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// PDF Extractor backend URL (PyMuPDF)
const PDF_EXTRACTOR_URL = process.env.PDF_EXTRACTOR_URL || 'http://localhost:5001';

/**
 * Check if PyMuPDF backend is available
 */
const checkPdfBackendAvailable = async (): Promise<boolean> => {
    try {
        // Try both direct URL and proxy (for Docker environment)
        const urls = ['/pdf-api/health', `${PDF_EXTRACTOR_URL}/health`];
        
        for (const url of urls) {
            try {
                const response = await fetch(url, { 
                    method: 'GET',
                    signal: AbortSignal.timeout(2000) // 2 second timeout
                });
                if (response.ok) {
                    console.log('✅ PyMuPDF backend available at:', url);
                    return true;
                }
            } catch {
                // Try next URL
            }
        }
        return false;
    } catch {
        return false;
    }
};

/**
 * Extract PDF using PyMuPDF backend (more reliable for complex PDFs)
 */
const extractPdfWithBackend = async (file: File): Promise<string | null> => {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        // Try proxy first (for Docker), then direct URL
        const urls = ['/pdf-api/extract', `${PDF_EXTRACTOR_URL}/extract`];
        
        for (const url of urls) {
            try {
                console.log(`📄 Trying PyMuPDF extraction at: ${url}`);
                
                const response = await fetch(url, {
                    method: 'POST',
                    body: formData,
                    signal: AbortSignal.timeout(30000) // 30 second timeout
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    if (result.success && result.text) {
                        console.log(`✅ PyMuPDF extracted ${result.total_chars} chars from ${result.total_pages} pages`);
                        console.log(`   Quality: ${result.quality_score}, Thai: ${result.content_types?.has_thai}, Prices: ${result.content_types?.has_prices}`);
                        
                        // Check if we got meaningful content
                        if (result.total_chars > 100 || result.quality_score !== 'low') {
                            return result.text;
                        } else {
                            console.warn('⚠️ PyMuPDF extraction returned low quality result');
                            return null; // Fall back to other methods
                        }
                    }
                }
            } catch (err) {
                console.warn(`PyMuPDF extraction failed at ${url}:`, err);
            }
        }
        
        return null;
    } catch (error) {
        console.warn('PyMuPDF backend extraction failed:', error);
        return null;
    }
};

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
 * Use Gemini Vision to OCR text from an image (scanned PDF page)
 */
const ocrWithGemini = async (imageBase64: string, pageNum: number = 1): Promise<string> => {
    if (!GEMINI_API_KEY) {
        console.warn('⚠️ Gemini API key not available for OCR');
        return '';
    }

    const url = `${GEMINI_BASE_URL}/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    // Extract mime type and base64 data
    const mimeMatch = imageBase64.match(/data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');

    console.log(`🔍 OCR Page ${pageNum}: Sending ${(base64Data.length / 1024).toFixed(1)}KB image to Gemini...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        },
                        {
                            text: `You are an OCR system. Extract ALL text from this travel document image.

INSTRUCTIONS:
1. Read ALL text visible in the image - every word, number, symbol
2. Include Thai text (ภาษาไทย) if present
3. Include ALL prices (numbers with บาท, THB, USD, etc.)
4. Include dates, flight numbers (like SC8885, SL921)
5. Include city names, hotel names, tour codes
6. Preserve tables and lists structure
7. Read multiple columns left-to-right, top-to-bottom

OUTPUT: Return ONLY the extracted text. No explanations or formatting instructions.`
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 8192
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Gemini OCR failed (${response.status}):`, errorText.substring(0, 200));
            return '';
        }

        const data = await response.json();
        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        console.log(`✅ OCR Page ${pageNum}: Extracted ${extractedText.length} chars`);
        
        if (extractedText.length < 50) {
            console.warn(`⚠️ OCR Page ${pageNum}: Very little text extracted`);
        }
        
        return extractedText;
    } catch (error) {
        console.error(`❌ OCR Page ${pageNum} error:`, error);
        return '';
    }
};

/**
 * Convert a PDF page to an image using canvas
 */
const pdfPageToImage = async (page: pdfjs.PDFPageProxy, scale: number = 2.0): Promise<string> => {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    await page.render({
        canvasContext: ctx,
        viewport
    }).promise;

    return canvas.toDataURL('image/png');
};

/**
 * Parses a PDF file and extracts its text content, page by page.
 * Uses PyMuPDF backend if available (more reliable), otherwise falls back to PDF.js.
 * If the PDF is scanned (no selectable text), uses Gemini OCR.
 * @param file The PDF file to parse.
 * @returns A promise that resolves with the extracted text.
 */
const parsePdf = async (file: File): Promise<string> => {
    try {
        // Try PyMuPDF backend first (much more reliable for complex PDFs)
        console.log(`📄 Processing PDF: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        
        const backendText = await extractPdfWithBackend(file);
        if (backendText && backendText.trim().length > 100) {
            console.log('✅ Using PyMuPDF backend extraction result');
            return backendText;
        }
        
        console.log('⚠️ PyMuPDF backend not available or returned insufficient text, falling back to PDF.js...');
        
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
        let pagesWithText = 0;
        const totalPages = pdf.numPages;
        
        // First pass: try to extract selectable text
        for (let i = 1; i <= totalPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ').trim();
                
                if (pageText.length > 20) { // Meaningful text (not just page numbers)
                    pagesWithText++;
                }
                text += pageText + '\n';
            } catch (pageError: any) {
                console.warn(`Failed to parse page ${i} of PDF:`, pageError);
            }
        }

        // Check if PDF has enough selectable text
        const hasSelectableText = text.trim().length > 100 && pagesWithText > 0;
        
        if (hasSelectableText) {
            console.log(`📄 PDF parsed with selectable text: ${text.length} chars from ${pagesWithText}/${totalPages} pages`);
            console.log(`📄 Text Preview: ${text.substring(0, 300)}...`);
            return text;
        }

        // PDF appears to be scanned - use Gemini OCR
        console.log(`🔍 PDF appears to be scanned (${text.trim().length} chars, ${pagesWithText} pages with text). Using Gemini OCR...`);
        
        if (!GEMINI_API_KEY) {
            throw new Error('This PDF appears to be scanned (image-based). Gemini API key is required for OCR. Please add VITE_GEMINI_API_KEY to your .env file.');
        }

        let ocrText = '';
        const maxPagesToOCR = Math.min(totalPages, 10); // Limit to 10 pages to avoid rate limits
        
        for (let i = 1; i <= maxPagesToOCR; i++) {
            try {
                console.log(`🔍 OCR processing page ${i}/${maxPagesToOCR}...`);
                const page = await pdf.getPage(i);
                const imageData = await pdfPageToImage(page, 2.0); // Higher resolution for better OCR
                const pageText = await ocrWithGemini(imageData, i);
                
                if (pageText) {
                    ocrText += `\n--- Page ${i} ---\n${pageText}\n`;
                }
                
                // Small delay between pages to avoid rate limiting
                if (i < maxPagesToOCR) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (pageError: any) {
                console.warn(`OCR failed for page ${i}:`, pageError);
            }
        }

        if (!ocrText.trim()) {
            throw new Error('Could not extract text from this scanned PDF. The document may be too low quality or in an unsupported format.');
        }

        console.log(`✅ OCR completed: ${ocrText.length} chars extracted from ${maxPagesToOCR} pages`);
        console.log(`📄 OCR Preview: ${ocrText.substring(0, 300)}...`);
        
        if (totalPages > maxPagesToOCR) {
            ocrText += `\n\n[Note: Only first ${maxPagesToOCR} of ${totalPages} pages were processed]`;
        }

        return ocrText;

    } catch (error: any) {
        // Propagate our custom errors directly
        if (error.message && (
            error.message.includes('password') || 
            error.message.includes('scanned') || 
            error.message.includes('corrupted') ||
            error.message.includes('PDF Loading Error') ||
            error.message.includes('OCR') ||
            error.message.includes('Gemini')
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
