
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { Competitor, DailyRoute, GeoLocation } from '../types';
import { getCoordinatesForLocations, getRouteDetailsForDay } from '../services/geminiService';
import { MapIcon } from './icons/MapIcon';

// Fix Leaflet's default icon path issues that can occur with module bundlers/ESM.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MapView: React.FC<{ competitors: Competitor[]; isLoading: boolean }> = ({ competitors, isLoading }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const layerGroupRef = useRef<L.LayerGroup | null>(null);

    const [geocodedData, setGeocodedData] = useState<Record<string, DailyRoute[]>>({});
    const [isProcessingMapData, setIsProcessingMapData] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');

    // Effect to trigger geocoding and route calculation
    useEffect(() => {
        const analyzedCompetitors = competitors.filter(c => c.analysis);
        if (analyzedCompetitors.length > 0 && !selectedCompetitorId) {
            setSelectedCompetitorId(analyzedCompetitors[0].id);
        }

        const processMapData = async () => {
            const competitorsToProcess = analyzedCompetitors.filter(c => !geocodedData[c.id]);
            if (competitorsToProcess.length === 0) return;

            setIsProcessingMapData(true);
            setError(null);

            // Step 1: Geocode all unique locations
            const allLocations = new Set<string>();
            competitorsToProcess.forEach(c => {
                c.analysis?.dailyBreakdown.forEach(day => {
                    day.locations?.forEach(loc => allLocations.add(loc));
                });
            });

            if (allLocations.size === 0) {
                setIsProcessingMapData(false);
                return;
            }

            try {
                const coordinatesMap = await getCoordinatesForLocations(Array.from(allLocations));
                
                // Step 2: Build initial daily routes with geocoded locations
                let initialGeocodedData: Record<string, DailyRoute[]> = {};
                competitorsToProcess.forEach(c => {
                    initialGeocodedData[c.id] = c.analysis!.dailyBreakdown.map(day => ({
                        day: day.day,
                        title: day.title,
                        locations: day.locations
                            .map(locName => {
                                const coords = coordinatesMap[locName];
                                return coords ? { name: locName, ...coords } : null;
                            })
                            .filter((loc): loc is GeoLocation => loc !== null),
                    }));
                });

                // Step 3: Fetch route details (distance/duration) for each day sequentially to avoid rate limiting.
                for (const competitorId in initialGeocodedData) {
                    for (const route of initialGeocodedData[competitorId]) {
                        if (route.locations.length > 1) {
                            const details = await getRouteDetailsForDay(route.locations);
                            route.distance = details.distance;
                            route.duration = details.duration;
                        }
                    }
                }

                setGeocodedData(prev => ({ ...prev, ...initialGeocodedData }));

            } catch (err) {
                console.error(err);
                const message = err instanceof Error ? err.message : "Could not retrieve location data. The map may be incomplete.";
                setError(message);
            } finally {
                setIsProcessingMapData(false);
            }
        };

        processMapData();

    }, [competitors, geocodedData, selectedCompetitorId]);


    // Effect to initialize and update the map display
    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Initialize map
        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapContainerRef.current).setView([20, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapInstanceRef.current);
            layerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
        }

        const map = mapInstanceRef.current;
        const layerGroup = layerGroupRef.current;
        if (!layerGroup) return;

        // Clear previous layers
        layerGroup.clearLayers();

        if (!selectedCompetitorId || !geocodedData[selectedCompetitorId]) return;

        const competitorRoutes = geocodedData[selectedCompetitorId];

        const locationsToShow: GeoLocation[] = [];
        if (selectedDay === 'all') {
            competitorRoutes.forEach(route => locationsToShow.push(...route.locations));
        } else {
            const dayRoute = competitorRoutes.find(r => r.day === selectedDay);
            if (dayRoute) {
                locationsToShow.push(...dayRoute.locations);
            }
        }
        
        const uniqueLocations = Array.from(new Map(locationsToShow.map(item => [item.name, item])).values());

        if (uniqueLocations.length === 0) return;

        const points: L.LatLngExpression[] = [];
        uniqueLocations.forEach((loc, index) => {
            const point: L.LatLngExpression = [loc.lat, loc.lng];
            points.push(point);
            L.marker(point)
                .addTo(layerGroup)
                .bindPopup(`<b>${loc.name}</b>${selectedDay !== 'all' ? `<br/>Stop ${index + 1}` : '' }`);
        });

        if (points.length > 1) {
            L.polyline(points, { color: '#007aff', weight: 3 }).addTo(layerGroup);
            map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 14 });
        } else if (points.length === 1) {
            map.setView(points[0], 12);
        }

    }, [selectedCompetitorId, selectedDay, geocodedData]);

    const competitorOptions = useMemo(() => competitors.filter(c => c.analysis), [competitors]);
    const currentCompetitorData = useMemo(() => {
        return selectedCompetitorId ? geocodedData[selectedCompetitorId] : undefined;
    }, [selectedCompetitorId, geocodedData]);

    const currentDayRouteDetails = useMemo(() => {
        if (!currentCompetitorData || selectedDay === 'all') return null;
        return currentCompetitorData.find(route => route.day === selectedDay);
    }, [currentCompetitorData, selectedDay]);
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full text-on-surface-variant animate-pulse-fast">
                <MapIcon className="w-16 h-16 text-gray-300" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {(isProcessingMapData) && (
                 <div className="absolute inset-0 bg-white/70 flex flex-col justify-center items-center z-20">
                    <svg className="animate-spin h-8 w-8 text-primary mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="font-semibold text-on-surface">Calculating routes and locations...</p>
                 </div>
            )}
            {competitorOptions.length > 0 ? (
                <>
                    <div className="p-2 bg-gray-50/50 rounded-t-lg flex flex-wrap items-center gap-2 sm:gap-4 border-b border-gray-200">
                        {competitorOptions.length > 1 && (
                            <select
                                value={selectedCompetitorId || ''}
                                onChange={e => setSelectedCompetitorId(e.target.value)}
                                className="text-sm font-semibold p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                            >
                                {competitorOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        )}
                        <div className="flex flex-wrap gap-1">
                            <button onClick={() => setSelectedDay('all')} className={`text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${selectedDay === 'all' ? 'bg-primary text-white' : 'bg-white hover:bg-gray-200'}`}>All Days</button>
                            {currentCompetitorData?.map(route => (
                                <button key={route.day} onClick={() => setSelectedDay(route.day)} className={`text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${selectedDay === route.day ? 'bg-primary text-white' : 'bg-white hover:bg-gray-200'}`}>Day {route.day}</button>
                            ))}
                        </div>
                    </div>
                     {currentDayRouteDetails && (currentDayRouteDetails.distance || currentDayRouteDetails.duration) && (
                        <div className="p-2 bg-gray-100 text-center text-sm font-semibold text-on-surface-variant">
                            Estimated Travel: <span className="text-primary">{currentDayRouteDetails.distance}</span> / <span className="text-primary">{currentDayRouteDetails.duration}</span>
                        </div>
                    )}
                    {error && <div className="bg-red-100 text-red-700 text-center text-sm p-2 font-medium">{error}</div>}
                    <div ref={mapContainerRef} className="flex-grow w-full h-full min-h-[300px] z-10 rounded-b-lg" />
                </>
            ) : (
                 <div className="h-full flex flex-col justify-center items-center text-center text-on-surface-variant">
                    <MapIcon className="w-16 h-16 mb-4 text-gray-300"/>
                    <h3 className="font-bold text-lg">Map View</h3>
                    <p className="max-w-xs">Analyze an itinerary to see its travel route visualized on a map.</p>
                </div>
            )}
        </div>
    );
};

export default MapView;
