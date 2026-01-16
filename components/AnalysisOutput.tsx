import React, { useState, useEffect } from 'react';
import { Competitor, ChatMessage, AnalysisRecord, Document } from '../types';
import StructuredDataView from './StructuredDataView';
import QnaView from './QnaView';
import ComparisonView from './ComparisonView';
import InsightsView from './InsightsView';
import ClusterView from './ClusterView';
import { DataIcon } from './icons/DataIcon';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { CompareIcon } from './icons/CompareIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { ClusterIcon } from './icons/ClusterIcon';
import { LanguageIcon } from './icons/LanguageIcon';


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

type Tab = 'data' | 'compare' | 'cluster' | 'qna' | 'insights';

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
    { id: 'insights', label: 'Insights', icon: <LightbulbIcon className="w-4 h-4" />, disabled: !hasContent },
    { id: 'data', label: 'Data', icon: <DataIcon className="w-4 h-4" />, disabled: !hasContent },
    { id: 'compare', label: 'Compare', icon: <CompareIcon className="w-4 h-4" />, disabled: activeCompetitors.length < 2},
    { id: 'cluster', label: 'Segments', icon: <ClusterIcon className="w-4 h-4" />, disabled: activeCompetitors.length < 2},
    { id: 'qna', label: 'Q&A', icon: <ChatBubbleIcon className="w-4 h-4" />, disabled: documents.length === 0 },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'insights':
        return <InsightsView recommendations={recommendations} isLoading={isLoadingRecs} ragUsed={ragUsed} ragDocCount={ragDocCount} />;
      case 'data':
        return <StructuredDataView competitors={competitors} isLoading={isLoading} />;
      case 'compare':
        return <ComparisonView comparison={comparison} competitors={competitors} isLoading={isLoading} />;
      case 'cluster':
        return <ClusterView competitors={competitors} language={language} />;
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
    <div className="bg-surface rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-200px)] lg:h-auto min-h-[400px] font-montserrat">
      <div className="p-2 border-b border-gray-200 overflow-x-auto">
        <div className="flex space-x-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-light text-primary'
                  : 'text-on-surface-variant hover:bg-gray-100'
              } disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-grow p-2 sm:p-4 overflow-y-auto relative">
        {(!hasContent && !isLoading) && (
            <div className="h-full flex flex-col justify-center items-center text-center text-on-surface-variant font-montserrat">
                <DataIcon className="w-16 h-16 mb-4 text-gray-300"/>
                <h3 className="font-semibold text-lg">Analysis Results will Appear Here</h3>
                <p className="max-w-xs text-sm">Upload one or more itineraries and click "Analyze & Compare" to get started.</p>
            </div>
        )}
        {renderContent()}
      </div>
    </div>
  );
};

export default AnalysisOutput;
