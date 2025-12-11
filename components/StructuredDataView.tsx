
import React from 'react';
import { Competitor, ItineraryData } from '../types';
import { CalendarIcon, CashIcon, ClockIcon, DestinationIcon, ExclamationIcon, CheckCircleIcon, MealIcon, SunIcon, FlightIcon } from './icons/InfoIcons';

const InfoPill: React.FC<{ icon: React.ReactNode; text: React.ReactNode }> = ({ icon, text }) => (
    <div className="flex items-center gap-2 bg-primary-light text-primary-dark font-semibold px-3 py-1.5 rounded-full text-sm">
      {icon}
      <span>{text}</span>
    </div>
);

const DataCard: React.FC<{ title: string; data: ItineraryData | null }> = ({ title, data }) => {
  if (!data) {
    return null; // Don't render a card if there's no data
  }

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 flex-1 min-w-[300px]">
      <h3 className="text-xl font-bold text-gray-800 mb-3">{data.tourName || title}</h3>

      <div className="flex flex-wrap gap-2 mb-4">
        {data.duration && <InfoPill icon={<ClockIcon />} text={data.duration} />}
        {data.destinations && data.destinations.length > 0 && (
            <InfoPill icon={<DestinationIcon />} text={data.destinations.join(', ')} />
        )}
      </div>

       {data.pricing && data.pricing.length > 0 && (
          <div className="mb-4">
            <h4 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><CashIcon /> Pricing</h4>
            <div className="space-y-1 text-sm border-l-4 border-green-300 pl-3">
              {data.pricing.map((p, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="font-semibold text-gray-800">{p.period}</span>
                  <span className="text-gray-600 font-medium">{new Intl.NumberFormat().format(p.price)} {p.currency}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      
      {data.flights && data.flights.length > 0 && (
        <FlightsSection flights={data.flights} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {data.inclusions && data.inclusions.length > 0 && (
            <div>
              <h4 className="font-bold text-green-600 flex items-center gap-2 mb-2"><CheckCircleIcon /> Inclusions</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {data.inclusions.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
        )}
        {data.exclusions && data.exclusions.length > 0 && (
            <div>
              <h4 className="font-bold text-red-600 flex items-center gap-2 mb-2"><ExclamationIcon /> Exclusions</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {data.exclusions.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
        )}
      </div>

      {data.dailyBreakdown && data.dailyBreakdown.length > 0 && (
        <div>
            <h4 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><CalendarIcon /> Daily Itinerary</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {data.dailyBreakdown.map((day) => (
                <div key={day.day} className="text-sm border-l-4 border-primary pl-3">
                <p className="font-bold text-primary-dark flex items-center gap-1.5"><SunIcon /> Day {day.day}: {day.title}</p>
                <p className="text-gray-600 mt-1">{day.activities}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium flex items-center gap-1.5"><MealIcon /> Meals: {day.meals?.join(', ') || 'Not specified'}</p>
                </div>
            ))}
            </div>
        </div>
      )}
    </div>
  );
};

const FlightsSection: React.FC<{flights: ItineraryData['flights']}> = ({flights}) => {
    const flightGroups = flights.reduce((acc, flight) => {
        const route = `${flight.origin} → ${flight.destination}`;
        if (!acc[route]) {
            acc[route] = [];
        }
        acc[route].push(flight);
        return acc;
    }, {} as Record<string, ItineraryData['flights']>);

    return (
        <div className="mb-4">
            <h4 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><FlightIcon /> Flights</h4>
            <div className="space-y-3 text-sm border-l-4 border-blue-300 pl-3">
                {Object.entries(flightGroups).map(([route, flights]) => (
                    <div key={route}>
                        <p className="font-semibold text-gray-800">{route}</p>
                        <div className="mt-1 space-y-1.5">
                            {Array.isArray(flights) && flights.map((flight) => (
                                <div key={flight.flightNumber} className="flex justify-between items-center gap-2">
                                    <div className="text-xs text-gray-500 whitespace-nowrap">
                                        <span>{flight.departureTime} → {flight.arrivalTime}</span>
                                        <span className="ml-2 pl-2 border-l border-gray-300">{flight.flightTime}</span>
                                    </div>
                                    <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{flight.flightNumber}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SkeletonCard: React.FC = () => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 flex-1 min-w-[300px] animate-pulse-fast">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="flex flex-wrap gap-2 mb-4">
            <div className="h-8 bg-gray-200 rounded-full w-24"></div>
            <div className="h-8 bg-gray-200 rounded-full w-32"></div>
        </div>
        <div className="mb-4">
            <div className="h-5 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-1.5"></div>
            <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
        <div className="mb-4">
            <div className="h-5 bg-gray-200 rounded w-1/4 mb-2"></div>
             <div className="pl-3 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-1.5"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
             <div>
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-1.5"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
        </div>
        <div>
             <div className="h-5 bg-gray-200 rounded w-1/4 mb-3"></div>
             <div className="h-16 bg-gray-200 rounded"></div>
        </div>
    </div>
);

const StructuredDataView: React.FC<{ competitors: Competitor[]; isLoading: boolean }> = ({ competitors, isLoading }) => {
    const competitorsToDisplay = competitors.filter(c => c.itineraryText);

    const shouldDisplay = competitorsToDisplay.some(c => c.analysis || c.isAnalyzing);

    if (!shouldDisplay) {
        return null;
    }

    return (
        <div className="flex flex-col lg:flex-row gap-4">
            {competitorsToDisplay.map(c => {
                if (c.isAnalyzing) {
                    return <SkeletonCard key={c.id} />;
                }
                if (c.analysis) {
                    return <DataCard key={c.id} title={c.name} data={c.analysis} />;
                }
                return null;
            })}
        </div>
    );
};

export default StructuredDataView;
