
import React from 'react';
import { renderMarkdown } from '../utils/markdownRenderer';
import { LightbulbIcon } from './icons/LightbulbIcon';

interface InsightsViewProps {
  recommendations: string | null;
  isLoading: boolean;
}

const InsightsView: React.FC<InsightsViewProps> = ({ recommendations, isLoading }) => {
    if (isLoading) {
        return (
            <div className="space-y-4 animate-pulse-fast">
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                <div className="h-6 bg-gray-200 rounded w-1/4 mt-6"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
        );
    }

    if (!recommendations) {
        return (
             <div className="h-full flex flex-col justify-center items-center text-center text-on-surface-variant">
                <LightbulbIcon className="w-16 h-16 mb-4 text-gray-300"/>
                <h3 className="font-bold text-lg">AI Recommendations will Appear Here</h3>
                <p className="max-w-md">After analyzing an itinerary, I'll generate personalized insights based on your saved history.</p>
            </div>
        );
    }

  return (
    <div>
        {renderMarkdown(recommendations)}
    </div>
  );
};

export default InsightsView;
