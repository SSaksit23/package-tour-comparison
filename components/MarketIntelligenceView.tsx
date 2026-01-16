/**
 * Market Intelligence View Component
 * 
 * Provides a comprehensive UI for the Market Intelligence Pipeline:
 * 1. Extract documents → 2. Vectorize DB → 3. Analyze themes
 * 4. Web research → 5. Aggregate to knowledge graph → 6. Generate report
 */

import React, { useState } from 'react';
import { Document } from '../types';
import { renderMarkdown } from '../utils/markdownRenderer';

interface MarketIntelligenceViewProps {
    documents: Document[];
    language: string;
}

interface PipelineStep {
    status: 'pending' | 'running' | 'completed' | 'skipped' | 'error';
    details: Record<string, unknown>;
}

interface MarketIntelligenceResult {
    success: boolean;
    pipeline_steps: Record<string, PipelineStep>;
    dominant_themes: {
        main_destination: string;
        main_theme: string;
        top_destinations: Record<string, number>;
        top_themes: Record<string, number>;
        top_activities: Record<string, number>;
        extracted_data: Array<{
            document_name: string;
            destinations: string[];
            themes: string[];
            duration: string;
            activities: string[];
            target_audience: string;
        }>;
    };
    web_research: {
        queries_executed: string[];
        packages_found: Array<{
            title: string;
            url: string;
            snippet: string;
            price_found?: string;
        }>;
        prices_found: Array<{
            price: string;
            source: string;
        }>;
    };
    knowledge_graph_update: {
        entities_created: Array<{
            type: string;
            name: string;
            properties: Record<string, unknown>;
        }>;
        relationships_created: Array<{
            from: string;
            to: string;
            type: string;
        }>;
    };
    final_report: string;
    elapsed_seconds: number;
}

const BACKEND_URL = import.meta.env.VITE_PDF_EXTRACTOR_URL || 'http://localhost:5001';

export const MarketIntelligenceView: React.FC<MarketIntelligenceViewProps> = ({
    documents,
    language
}) => {
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<MarketIntelligenceResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<string>('');
    const [includeWebResearch, setIncludeWebResearch] = useState(true);
    const [maxWebResults, setMaxWebResults] = useState(5);
    const [fastMode, setFastMode] = useState(true);

    const runPipeline = async () => {
        if (documents.length === 0) {
            setError(language === 'Thai' 
                ? 'กรุณาอัปโหลดเอกสารก่อนเริ่มวิเคราะห์' 
                : 'Please upload documents before running analysis');
            return;
        }

        setIsRunning(true);
        setError(null);
        setResult(null);

        const steps = [
            { id: 'extract', label: language === 'Thai' ? 'กำลังแยกข้อมูล...' : 'Extracting documents...' },
            { id: 'analyze_themes', label: language === 'Thai' ? 'กำลังวิเคราะห์ธีม...' : 'Analyzing themes...' },
            { id: 'web_research', label: language === 'Thai' ? 'กำลังค้นหาเว็บ...' : 'Searching web...' },
            { id: 'aggregate', label: language === 'Thai' ? 'กำลังรวบรวมข้อมูล...' : 'Aggregating data...' },
            { id: 'report', label: language === 'Thai' ? 'กำลังสร้างรายงาน...' : 'Generating report...' }
        ];

        // Simulate step progression
        let stepIndex = 0;
        const stepInterval = setInterval(() => {
            if (stepIndex < steps.length) {
                setCurrentStep(steps[stepIndex].label);
                stepIndex++;
            }
        }, 3000);

        try {
            const response = await fetch(`${BACKEND_URL}/agents/market-intelligence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    documents: documents.map(doc => ({
                        name: doc.name,
                        text: doc.text
                    })),
                    include_web_research: includeWebResearch,
                    max_web_results: maxWebResults,
                    generate_report: true,
                    fast_mode: fastMode
                })
            });

            clearInterval(stepInterval);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error ${response.status}`);
            }

            const data = await response.json();
            setResult(data);
            setCurrentStep('');
        } catch (err) {
            clearInterval(stepInterval);
            setError(err instanceof Error ? err.message : 'Pipeline failed');
            setCurrentStep('');
        } finally {
            setIsRunning(false);
        }
    };

    const getStepIcon = (status: string) => {
        switch (status) {
            case 'completed': return '✅';
            case 'running': return '🔄';
            case 'skipped': return '⏭️';
            case 'error': return '❌';
            default: return '⏳';
        }
    };

    return (
        <div className="market-intelligence-view p-6 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-3xl">🧠</span>
                        {language === 'Thai' ? 'Market Intelligence' : 'Market Intelligence Pipeline'}
                    </h2>
                    <p className="text-gray-600 mt-1">
                        {language === 'Thai' 
                            ? 'วิเคราะห์เอกสาร → Vector DB → วิเคราะห์ธีม → ค้นหาเว็บ → สร้างรายงาน'
                            : 'Extract → Vectorize → Analyze Themes → Web Search → Generate Report'}
                    </p>
                </div>
                
                <div className="text-right">
                    <div className="text-sm text-gray-500">
                        {language === 'Thai' ? 'เอกสารในระบบ' : 'Documents Available'}
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{documents.length}</div>
                </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-lg p-4 mb-6 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {language === 'Thai' ? 'การตั้งค่า' : 'Configuration'}
                </h3>
                <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={fastMode}
                            onChange={(e) => setFastMode(e.target.checked)}
                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700">
                            ⚡ {language === 'Thai' ? 'โหมดเร็ว (แนะนำ)' : 'Fast Mode (Recommended)'}
                        </span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeWebResearch}
                            onChange={(e) => setIncludeWebResearch(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                            {language === 'Thai' ? 'ค้นหาคู่แข่งจากเว็บ' : 'Include Web Research'}
                        </span>
                    </label>
                    
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">
                            {language === 'Thai' ? 'ผลลัพธ์สูงสุด:' : 'Max Results:'}
                        </span>
                        <select
                            value={maxWebResults}
                            onChange={(e) => setMaxWebResults(Number(e.target.value))}
                            className="text-sm border rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value={3}>3</option>
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Run Button */}
            <button
                onClick={runPipeline}
                disabled={isRunning || documents.length === 0}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all
                    ${isRunning || documents.length === 0
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
                    }`}
            >
                {isRunning ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        {currentStep || (language === 'Thai' ? 'กำลังประมวลผล...' : 'Processing...')}
                    </span>
                ) : (
                    <span className="flex items-center justify-center gap-2">
                        <span className="text-xl">🚀</span>
                        {language === 'Thai' ? 'เริ่มวิเคราะห์ Market Intelligence' : 'Run Market Intelligence Pipeline'}
                    </span>
                )}
            </button>

            {/* Error Display */}
            {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <div className="flex items-center gap-2">
                        <span>❌</span>
                        <span className="font-medium">{language === 'Thai' ? 'เกิดข้อผิดพลาด:' : 'Error:'}</span>
                    </div>
                    <p className="mt-1">{error}</p>
                </div>
            )}

            {/* Results */}
            {result && (
                <div className="mt-6 space-y-6">
                    {/* Pipeline Steps */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span>📊</span>
                            {language === 'Thai' ? 'สถานะการทำงาน' : 'Pipeline Status'}
                            <span className="ml-auto text-sm font-normal text-gray-500">
                                {result.elapsed_seconds.toFixed(1)}s
                            </span>
                        </h3>
                        <div className="grid grid-cols-5 gap-2">
                            {Object.entries(result.pipeline_steps).map(([step, data]) => (
                                <div 
                                    key={step}
                                    className={`p-3 rounded-lg text-center transition-all
                                        ${data.status === 'completed' ? 'bg-green-50 border border-green-200' :
                                          data.status === 'skipped' ? 'bg-gray-50 border border-gray-200' :
                                          'bg-yellow-50 border border-yellow-200'}`}
                                >
                                    <div className="text-2xl mb-1">{getStepIcon(data.status)}</div>
                                    <div className="text-xs font-medium capitalize text-gray-700">
                                        {step.replace('_', ' ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Dominant Themes */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span>🎯</span>
                            {language === 'Thai' ? 'ธีมหลักที่พบ' : 'Dominant Themes'}
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            {/* Main Destination */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-600">
                                    {language === 'Thai' ? 'จุดหมายหลัก' : 'Main Destination'}
                                </div>
                                <div className="text-2xl font-bold text-blue-700">
                                    {result.dominant_themes.main_destination}
                                </div>
                            </div>
                            
                            {/* Main Theme */}
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-600">
                                    {language === 'Thai' ? 'ธีมหลัก' : 'Main Theme'}
                                </div>
                                <div className="text-2xl font-bold text-purple-700 capitalize">
                                    {result.dominant_themes.main_theme}
                                </div>
                            </div>
                        </div>

                        {/* Top Destinations Chart */}
                        <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                                {language === 'Thai' ? 'การกระจายจุดหมาย' : 'Destination Distribution'}
                            </h4>
                            <div className="space-y-2">
                                {Object.entries(result.dominant_themes.top_destinations).slice(0, 5).map(([dest, count]) => {
                                    const maxCount = Math.max(...Object.values(result.dominant_themes.top_destinations));
                                    const percentage = (count / maxCount) * 100;
                                    return (
                                        <div key={dest} className="flex items-center gap-2">
                                            <span className="w-24 text-sm text-gray-600 truncate">{dest}</span>
                                            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                            <span className="text-sm font-medium text-gray-700 w-8">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Top Themes */}
                        <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                                {language === 'Thai' ? 'ธีมยอดนิยม' : 'Popular Themes'}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(result.dominant_themes.top_themes).map(([theme, count]) => (
                                    <span 
                                        key={theme}
                                        className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm capitalize"
                                    >
                                        {theme} ({count})
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Web Research Results */}
                    {result.web_research.packages_found.length > 0 && (
                        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <span>🌐</span>
                                {language === 'Thai' ? 'ผลการค้นหาคู่แข่ง' : 'Competitor Research Results'}
                                <span className="ml-auto text-sm font-normal text-blue-600">
                                    {result.web_research.packages_found.length} {language === 'Thai' ? 'แพ็กเกจ' : 'packages'}
                                </span>
                            </h3>
                            
                            <div className="space-y-3">
                                {result.web_research.packages_found.slice(0, 5).map((pkg, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                        <a 
                                            href={pkg.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 font-medium line-clamp-1"
                                        >
                                            {pkg.title}
                                        </a>
                                        {pkg.price_found && (
                                            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 rounded text-sm">
                                                {pkg.price_found}
                                            </span>
                                        )}
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                            {pkg.snippet}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Price Intelligence */}
                            {result.web_research.prices_found.length > 0 && (
                                <div className="mt-4 p-3 bg-green-50 rounded-lg">
                                    <h4 className="text-sm font-medium text-green-800 mb-2">
                                        💰 {language === 'Thai' ? 'ข้อมูลราคาที่พบ' : 'Price Intelligence'}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {result.web_research.prices_found.slice(0, 8).map((price, idx) => (
                                            <span key={idx} className="px-2 py-1 bg-white rounded text-sm text-green-700 border border-green-200">
                                                {price.price}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Knowledge Graph Summary */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span>🔗</span>
                            {language === 'Thai' ? 'Knowledge Graph Update' : 'Knowledge Graph Summary'}
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-50 p-4 rounded-lg">
                                <div className="text-3xl font-bold text-indigo-700">
                                    {result.knowledge_graph_update.entities_created.length}
                                </div>
                                <div className="text-sm text-indigo-600">
                                    {language === 'Thai' ? 'Entities สร้างใหม่' : 'Entities Created'}
                                </div>
                            </div>
                            <div className="bg-pink-50 p-4 rounded-lg">
                                <div className="text-3xl font-bold text-pink-700">
                                    {result.knowledge_graph_update.relationships_created.length}
                                </div>
                                <div className="text-sm text-pink-600">
                                    {language === 'Thai' ? 'Relationships สร้างใหม่' : 'Relationships Created'}
                                </div>
                            </div>
                        </div>

                        {/* Entity Types */}
                        <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                                {language === 'Thai' ? 'ประเภท Entity' : 'Entity Types'}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {Array.from(new Set(result.knowledge_graph_update.entities_created.map(e => e.type))).map(type => (
                                    <span 
                                        key={type}
                                        className={`px-3 py-1 rounded-full text-sm
                                            ${type === 'destination' ? 'bg-blue-100 text-blue-800' :
                                              type === 'product' ? 'bg-green-100 text-green-800' :
                                              'bg-orange-100 text-orange-800'}`}
                                    >
                                        {type} ({result.knowledge_graph_update.entities_created.filter(e => e.type === type).length})
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Final Report */}
                    {result.final_report && (
                        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <span>📝</span>
                                {language === 'Thai' ? 'รายงาน Market Intelligence' : 'Market Intelligence Report'}
                            </h3>
                            
                            <div 
                                className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-li:text-gray-600"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(result.final_report) }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MarketIntelligenceView;
