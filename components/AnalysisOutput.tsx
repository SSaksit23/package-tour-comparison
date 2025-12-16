
import React, { useState, useEffect } from 'react';
import { Competitor, ChatMessage, AnalysisRecord, Document } from '../types';
import StructuredDataView from './StructuredDataView';
import QnaView from './QnaView';
import ComparisonView from './ComparisonView';
import InsightsView from './InsightsView';
import { DataIcon } from './icons/DataIcon';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { CompareIcon } from './icons/CompareIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';


interface AnalysisOutputProps {
  competitors: Competitor[];
  comparison: string;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  documents: Document[];
  recommendations: string | null;
  isLoading: boolean;
  isLoadingRecs: boolean;
  language: string;
  onUploadToKB: (files: FileList) => Promise<void>;
  onGetAnswer: (history: ChatMessage[], question: string) => Promise<string>;
  ragUsed?: boolean;
  ragDocCount?: number;
}

type Tab = 'data' | 'compare' | 'qna' | 'insights';

const AnalysisOutput: React.FC<AnalysisOutputProps> = ({
  competitors,
  comparison,
  chatHistory,
  setChatHistory,
  documents,
  recommendations,
  isLoading,
  isLoadingRecs,
  language,
  onUploadToKB,
  onGetAnswer,
  ragUsed = false,
  ragDocCount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const hasContent = competitors.some(c => c.analysis);
  const activeCompetitors = competitors.filter(c => c.itineraryText);

  useEffect(() => {
    if (hasContent) {
      if (recommendations) {
        setActiveTab('insights');
      } else if (activeCompetitors.length > 1) {
        setActiveTab('compare');
      } else {
        setActiveTab('data');
      }
    }
  }, [hasContent, activeCompetitors.length, recommendations]);


  const tabs: { id: Tab; label: string; icon: React.ReactNode; disabled?: boolean}[] = [
    { id: 'insights', label: 'Insights', icon: <LightbulbIcon />, disabled: !hasContent },
    { id: 'data', label: 'Structured Data', icon: <DataIcon />, disabled: !hasContent },
    { id: 'compare', label: 'Comparison', icon: <CompareIcon />, disabled: activeCompetitors.length < 2},
    { id: 'qna', label: 'Q&A', icon: <ChatBubbleIcon />, disabled: documents.length === 0 },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'insights':
        return <InsightsView recommendations={recommendations} isLoading={isLoadingRecs} ragUsed={ragUsed} ragDocCount={ragDocCount} />;
      case 'data':
        return <StructuredDataView competitors={competitors} isLoading={isLoading} />;
      case 'compare':
        return <ComparisonView comparison={comparison} isLoading={isLoading} />;
      case 'qna':
        return (
          <QnaView
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            contexts={documents.map(d => ({name: d.name, text: d.text}))}
            isReady={documents.length > 0}
            language={language}
            onUploadToKB={onUploadToKB}
            onGetAnswer={onGetAnswer}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-200px)] lg:h-auto min-h-[400px]">
      <div className="p-2 border-b border-gray-200">
        <div className="flex space-x-1 sm:space-x-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`flex-1 flex items-center justify-center gap-2 px-2 sm:px-3 py-2 rounded-md text-sm font-semibold transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary-light text-primary'
                  : 'text-on-surface-variant hover:bg-gray-100'
              } disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-grow p-1 sm:p-4 overflow-y-auto relative">
        {(!hasContent && !isLoading) && (
            <div className="h-full flex flex-col justify-center items-center text-center text-on-surface-variant">
                <DataIcon className="w-16 h-16 mb-4 text-gray-300"/>
                <h3 className="font-bold text-lg">Analysis Results will Appear Here</h3>
                <p className="max-w-xs">Upload one or more itineraries and click "Analyze & Compare" to get started.</p>
            </div>
        )}
        {renderContent()}
      </div>
    </div>
  );
};

export default AnalysisOutput;
