/**
 * Translation Service - English ↔ Thai Translation
 * 
 * Provides translation functionality for reports and content.
 */

const BACKEND_URL = import.meta.env.VITE_PDF_EXTRACTOR_URL || 'http://localhost:5001';

export interface TranslationResult {
    success: boolean;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    error?: string;
}

/**
 * Translate text between English and Thai using AI
 */
export const translateText = async (
    text: string,
    targetLanguage: 'Thai' | 'English'
): Promise<TranslationResult> => {
    try {
        const response = await fetch(`${BACKEND_URL}/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                target_language: targetLanguage
            }),
        });

        if (!response.ok) {
            throw new Error(`Translation failed: ${response.status}`);
        }

        const data = await response.json();
        return {
            success: true,
            translatedText: data.translated_text,
            sourceLanguage: data.source_language,
            targetLanguage: data.target_language
        };
    } catch (error) {
        console.error("Translation error:", error);
        return {
            success: false,
            translatedText: text,
            sourceLanguage: 'unknown',
            targetLanguage: targetLanguage,
            error: error instanceof Error ? error.message : 'Translation failed'
        };
    }
};

/**
 * Detect if text is primarily Thai or English
 */
export const detectLanguage = (text: string): 'Thai' | 'English' | 'Mixed' => {
    const thaiChars = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    if (thaiChars > latinChars * 2) return 'Thai';
    if (latinChars > thaiChars * 2) return 'English';
    return 'Mixed';
};

/**
 * Client-side quick translations for common UI phrases
 */
export const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
    'Insights': { th: 'ข้อมูลเชิงลึก', en: 'Insights' },
    'Data': { th: 'ข้อมูล', en: 'Data' },
    'Compare': { th: 'เปรียบเทียบ', en: 'Compare' },
    'Segments': { th: 'กลุ่ม', en: 'Segments' },
    'Q&A': { th: 'ถาม-ตอบ', en: 'Q&A' },
    'Analyze & Compare': { th: 'วิเคราะห์และเปรียบเทียบ', en: 'Analyze & Compare' },
    'Get Insights': { th: 'รับข้อมูลเชิงลึก', en: 'Get Insights' },
    'Knowledge Base': { th: 'ฐานความรู้', en: 'Knowledge Base' },
    'Export': { th: 'ส่งออก', en: 'Export' },
    'Save': { th: 'บันทึก', en: 'Save' },
    'Clear Session': { th: 'ล้างเซสชัน', en: 'Clear Session' },
    'Translate to Thai': { th: 'แปลเป็นไทย', en: 'Translate to Thai' },
    'Translate to English': { th: 'แปลเป็นอังกฤษ', en: 'Translate to English' },
    'Duration': { th: 'ระยะเวลา', en: 'Duration' },
    'Price': { th: 'ราคา', en: 'Price' },
    'Destinations': { th: 'จุดหมายปลายทาง', en: 'Destinations' },
    'Activities': { th: 'กิจกรรม', en: 'Activities' },
    'Loading': { th: 'กำลังโหลด', en: 'Loading' },
    'Generating': { th: 'กำลังสร้าง', en: 'Generating' },
};

export const t = (key: string, lang: 'Thai' | 'English' = 'English'): string => {
    const translations = UI_TRANSLATIONS[key];
    if (!translations) return key;
    return lang === 'Thai' ? translations.th : translations.en;
};
