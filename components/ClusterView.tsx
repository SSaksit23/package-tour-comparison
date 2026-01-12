/**
 * ClusterView Component - Product Segmentation Visualization
 * 
 * Displays clustered products with:
 * - Visual cluster cards with color coding
 * - Scatter plot visualization (2D projection)
 * - Feature comparison radar chart
 * - Segment summary statistics
 */

import React, { useMemo, useState } from 'react';
import { Competitor, SavedCompetitor } from '../types';
import { clusterProducts, ClusteringResult, Cluster, ProductFeatures } from '../services/clusteringService';

interface ClusterViewProps {
    competitors: (Competitor | SavedCompetitor)[];
    language: string;
}

const ClusterView: React.FC<ClusterViewProps> = ({ competitors, language }) => {
    const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'scatter' | 'radar'>('cards');
    
    // Perform clustering
    const clusteringResult = useMemo(() => {
        const analyzed = competitors.filter(c => c.analysis);
        if (analyzed.length < 2) return null;
        return clusterProducts(analyzed);
    }, [competitors]);
    
    if (!clusteringResult) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-lg font-medium">
                    {language === 'Thai' ? 'ต้องการอย่างน้อย 2 โปรดักต์เพื่อทำ Clustering' : 'Need at least 2 analyzed products for clustering'}
                </p>
                <p className="text-sm mt-2 opacity-70">
                    {language === 'Thai' ? 'วิเคราะห์โปรดักต์เพิ่มเติมเพื่อดูการแบ่งกลุ่ม' : 'Analyze more products to see segmentation'}
                </p>
            </div>
        );
    }
    
    const { clusters, products, silhouetteScore, featureImportance } = clusteringResult;
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-on-surface">
                        {language === 'Thai' ? 'การแบ่งกลุ่มผลิตภัณฑ์' : 'Product Segmentation'}
                    </h3>
                    <p className="text-sm text-on-surface-variant mt-1">
                        {language === 'Thai' 
                            ? `พบ ${clusters.length} กลุ่ม จาก ${products.length} ผลิตภัณฑ์ • คุณภาพ: ${(silhouetteScore * 100).toFixed(0)}%`
                            : `Found ${clusters.length} segments from ${products.length} products • Quality: ${(silhouetteScore * 100).toFixed(0)}%`}
                    </p>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex bg-surface-variant rounded-lg p-1">
                    {(['cards', 'scatter', 'radar'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                                viewMode === mode 
                                    ? 'bg-white text-primary shadow-sm' 
                                    : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                        >
                            {mode === 'cards' ? '📊 Cards' : mode === 'scatter' ? '🔵 Scatter' : '🎯 Radar'}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* View Content */}
            {viewMode === 'cards' && (
                <ClusterCards 
                    clusters={clusters} 
                    selectedCluster={selectedCluster}
                    onSelectCluster={setSelectedCluster}
                    language={language}
                />
            )}
            
            {viewMode === 'scatter' && (
                <ScatterPlot 
                    clusters={clusters}
                    products={products}
                    selectedCluster={selectedCluster}
                    onSelectCluster={setSelectedCluster}
                />
            )}
            
            {viewMode === 'radar' && (
                <RadarChart 
                    clusters={clusters}
                    selectedCluster={selectedCluster}
                    language={language}
                />
            )}
            
            {/* Feature Importance */}
            <FeatureImportanceBar features={featureImportance} language={language} />
            
            {/* Product List by Cluster */}
            <ProductsByCluster 
                clusters={clusters}
                selectedCluster={selectedCluster}
                language={language}
            />
        </div>
    );
};

// ============== Sub-components ==============

interface ClusterCardsProps {
    clusters: Cluster[];
    selectedCluster: number | null;
    onSelectCluster: (id: number | null) => void;
    language: string;
}

const ClusterCards: React.FC<ClusterCardsProps> = ({ clusters, selectedCluster, onSelectCluster, language }) => {
    const segmentLabels: Record<string, { en: string; th: string }> = {
        'budget': { en: 'Budget', th: 'ประหยัด' },
        'mid-range': { en: 'Mid-Range', th: 'ปานกลาง' },
        'premium': { en: 'Premium', th: 'พรีเมียม' },
        'luxury': { en: 'Luxury', th: 'หรูหรา' }
    };
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusters.map((cluster) => (
                <div
                    key={cluster.id}
                    onClick={() => onSelectCluster(selectedCluster === cluster.id ? null : cluster.id)}
                    className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        selectedCluster === cluster.id 
                            ? 'border-primary shadow-lg scale-[1.02]' 
                            : 'border-transparent bg-white hover:border-gray-200 hover:shadow-md'
                    }`}
                    style={{ 
                        backgroundColor: selectedCluster === cluster.id ? `${cluster.color}10` : undefined 
                    }}
                >
                    {/* Color indicator */}
                    <div 
                        className="absolute top-0 left-0 w-full h-1 rounded-t-xl"
                        style={{ backgroundColor: cluster.color }}
                    />
                    
                    {/* Segment badge */}
                    <span 
                        className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full text-white mb-3"
                        style={{ backgroundColor: cluster.color }}
                    >
                        {language === 'Thai' 
                            ? segmentLabels[cluster.characteristics.segment]?.th 
                            : segmentLabels[cluster.characteristics.segment]?.en}
                    </span>
                    
                    <h4 className="text-lg font-bold text-on-surface mb-1">{cluster.name}</h4>
                    <p className="text-sm text-on-surface-variant mb-4">{cluster.description}</p>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-on-surface-variant">
                                {language === 'Thai' ? 'ช่วงราคา' : 'Price Range'}
                            </span>
                            <p className="font-semibold text-on-surface">{cluster.characteristics.priceRange}</p>
                        </div>
                        <div>
                            <span className="text-on-surface-variant">
                                {language === 'Thai' ? 'ระยะเวลา' : 'Avg Duration'}
                            </span>
                            <p className="font-semibold text-on-surface">
                                {cluster.characteristics.avgDuration.toFixed(1)} {language === 'Thai' ? 'วัน' : 'days'}
                            </p>
                        </div>
                        <div>
                            <span className="text-on-surface-variant">
                                {language === 'Thai' ? 'จุดหมาย' : 'Destinations'}
                            </span>
                            <p className="font-semibold text-on-surface">
                                ~{cluster.characteristics.avgDestinations.toFixed(0)}
                            </p>
                        </div>
                        <div>
                            <span className="text-on-surface-variant">
                                {language === 'Thai' ? 'จำนวน' : 'Products'}
                            </span>
                            <p className="font-semibold text-on-surface">{cluster.products.length}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

interface ScatterPlotProps {
    clusters: Cluster[];
    products: (ProductFeatures & { clusterId: number })[];
    selectedCluster: number | null;
    onSelectCluster: (id: number | null) => void;
}

const ScatterPlot: React.FC<ScatterPlotProps> = ({ clusters, products, selectedCluster, onSelectCluster }) => {
    // Project to 2D using price vs duration (most interpretable)
    const width = 500;
    const height = 350;
    const padding = 50;
    
    // Find min/max for scaling
    const prices = products.map(p => p.totalPrice);
    const durations = products.map(p => p.durationDays);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    const scaleX = (price: number) => {
        const range = maxPrice - minPrice || 1;
        return padding + ((price - minPrice) / range) * (width - 2 * padding);
    };
    
    const scaleY = (duration: number) => {
        const range = maxDuration - minDuration || 1;
        return height - padding - ((duration - minDuration) / range) * (height - 2 * padding);
    };
    
    return (
        <div className="bg-white rounded-xl p-6 border border-gray-100">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl mx-auto">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map(t => (
                    <g key={t}>
                        <line 
                            x1={padding} 
                            y1={padding + t * (height - 2 * padding)} 
                            x2={width - padding} 
                            y2={padding + t * (height - 2 * padding)}
                            stroke="#e5e7eb" 
                            strokeDasharray="4"
                        />
                        <line 
                            x1={padding + t * (width - 2 * padding)} 
                            y1={padding} 
                            x2={padding + t * (width - 2 * padding)} 
                            y2={height - padding}
                            stroke="#e5e7eb" 
                            strokeDasharray="4"
                        />
                    </g>
                ))}
                
                {/* Axes */}
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#9ca3af" strokeWidth={2} />
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#9ca3af" strokeWidth={2} />
                
                {/* Axis labels */}
                <text x={width / 2} y={height - 10} textAnchor="middle" className="text-xs fill-gray-500">
                    Price (THB)
                </text>
                <text x={15} y={height / 2} textAnchor="middle" transform={`rotate(-90, 15, ${height / 2})`} className="text-xs fill-gray-500">
                    Duration (days)
                </text>
                
                {/* Data points */}
                {products.map((product, idx) => {
                    const cluster = clusters.find(c => c.id === product.clusterId);
                    const isSelected = selectedCluster === null || selectedCluster === product.clusterId;
                    
                    return (
                        <g key={idx} onClick={() => onSelectCluster(product.clusterId)} style={{ cursor: 'pointer' }}>
                            <circle
                                cx={scaleX(product.totalPrice)}
                                cy={scaleY(product.durationDays)}
                                r={isSelected ? 10 : 6}
                                fill={cluster?.color || '#9ca3af'}
                                opacity={isSelected ? 0.9 : 0.3}
                                stroke="white"
                                strokeWidth={2}
                            />
                            {isSelected && (
                                <text
                                    x={scaleX(product.totalPrice)}
                                    y={scaleY(product.durationDays) - 15}
                                    textAnchor="middle"
                                    className="text-[10px] font-medium fill-gray-700"
                                >
                                    {product.competitorName.substring(0, 12)}
                                </text>
                            )}
                        </g>
                    );
                })}
                
                {/* Legend */}
                <g transform={`translate(${width - padding - 100}, ${padding})`}>
                    {clusters.map((cluster, idx) => (
                        <g key={cluster.id} transform={`translate(0, ${idx * 20})`}>
                            <circle cx={8} cy={8} r={6} fill={cluster.color} />
                            <text x={20} y={12} className="text-[10px] fill-gray-600">
                                {cluster.characteristics.segment}
                            </text>
                        </g>
                    ))}
                </g>
            </svg>
        </div>
    );
};

interface RadarChartProps {
    clusters: Cluster[];
    selectedCluster: number | null;
    language: string;
}

const RadarChart: React.FC<RadarChartProps> = ({ clusters, selectedCluster, language }) => {
    const dimensions = [
        { key: 'price', label: language === 'Thai' ? 'ราคา' : 'Price' },
        { key: 'duration', label: language === 'Thai' ? 'ระยะเวลา' : 'Duration' },
        { key: 'destinations', label: language === 'Thai' ? 'จุดหมาย' : 'Destinations' },
        { key: 'meals', label: language === 'Thai' ? 'อาหาร' : 'Meals' },
        { key: 'activities', label: language === 'Thai' ? 'กิจกรรม' : 'Activities' },
        { key: 'inclusions', label: language === 'Thai' ? 'รวมบริการ' : 'Inclusions' },
    ];
    
    const size = 300;
    const center = size / 2;
    const radius = size / 2 - 40;
    
    // Calculate average normalized values for each cluster
    const clusterAverages = clusters.map(cluster => {
        const avgNormalized = {
            price: cluster.products.reduce((sum, p) => sum + p.normalized.price, 0) / cluster.products.length,
            duration: cluster.products.reduce((sum, p) => sum + p.normalized.duration, 0) / cluster.products.length,
            destinations: cluster.products.reduce((sum, p) => sum + p.normalized.destinations, 0) / cluster.products.length,
            meals: cluster.products.reduce((sum, p) => sum + p.normalized.meals, 0) / cluster.products.length,
            activities: cluster.products.reduce((sum, p) => sum + p.normalized.activities, 0) / cluster.products.length,
            inclusions: cluster.products.reduce((sum, p) => sum + p.normalized.inclusions, 0) / cluster.products.length,
        };
        return { cluster, avgNormalized };
    });
    
    // Generate polygon points
    const getPolygonPoints = (values: Record<string, number>): string => {
        return dimensions.map((dim, i) => {
            const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2;
            const value = values[dim.key] || 0;
            const x = center + radius * value * Math.cos(angle);
            const y = center + radius * value * Math.sin(angle);
            return `${x},${y}`;
        }).join(' ');
    };
    
    return (
        <div className="bg-white rounded-xl p-6 border border-gray-100">
            <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-md mx-auto">
                {/* Background circles */}
                {[0.25, 0.5, 0.75, 1].map(t => (
                    <circle
                        key={t}
                        cx={center}
                        cy={center}
                        r={radius * t}
                        fill="none"
                        stroke="#e5e7eb"
                        strokeDasharray={t < 1 ? "4" : "0"}
                    />
                ))}
                
                {/* Axes */}
                {dimensions.map((dim, i) => {
                    const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2;
                    const x = center + radius * Math.cos(angle);
                    const y = center + radius * Math.sin(angle);
                    const labelX = center + (radius + 25) * Math.cos(angle);
                    const labelY = center + (radius + 25) * Math.sin(angle);
                    
                    return (
                        <g key={dim.key}>
                            <line x1={center} y1={center} x2={x} y2={y} stroke="#d1d5db" />
                            <text
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-[10px] fill-gray-600 font-medium"
                            >
                                {dim.label}
                            </text>
                        </g>
                    );
                })}
                
                {/* Cluster polygons */}
                {clusterAverages.map(({ cluster, avgNormalized }) => {
                    const isSelected = selectedCluster === null || selectedCluster === cluster.id;
                    
                    return (
                        <polygon
                            key={cluster.id}
                            points={getPolygonPoints(avgNormalized)}
                            fill={cluster.color}
                            fillOpacity={isSelected ? 0.2 : 0.05}
                            stroke={cluster.color}
                            strokeWidth={isSelected ? 2 : 1}
                            strokeOpacity={isSelected ? 1 : 0.3}
                        />
                    );
                })}
            </svg>
            
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-4">
                {clusters.map(cluster => (
                    <div key={cluster.id} className="flex items-center gap-2">
                        <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: cluster.color }}
                        />
                        <span className="text-xs text-gray-600">{cluster.characteristics.segment}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface FeatureImportanceBarProps {
    features: { feature: string; importance: number }[];
    language: string;
}

const FeatureImportanceBar: React.FC<FeatureImportanceBarProps> = ({ features, language }) => {
    const featureLabels: Record<string, { en: string; th: string }> = {
        price: { en: 'Price', th: 'ราคา' },
        pricePerDay: { en: 'Price/Day', th: 'ราคา/วัน' },
        duration: { en: 'Duration', th: 'ระยะเวลา' },
        destinations: { en: 'Destinations', th: 'จุดหมาย' },
        inclusions: { en: 'Inclusions', th: 'รวมบริการ' },
        meals: { en: 'Meals', th: 'อาหาร' },
        flights: { en: 'Flights', th: 'เที่ยวบิน' },
        activities: { en: 'Activities', th: 'กิจกรรม' },
    };
    
    return (
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border border-gray-100">
            <h4 className="text-sm font-semibold text-on-surface mb-4">
                {language === 'Thai' ? 'ปัจจัยที่แยกกลุ่ม' : 'Key Differentiating Factors'}
            </h4>
            <div className="space-y-3">
                {features.slice(0, 5).map((f, idx) => (
                    <div key={f.feature} className="flex items-center gap-3">
                        <span className="text-xs text-on-surface-variant w-24 truncate">
                            {language === 'Thai' 
                                ? featureLabels[f.feature]?.th || f.feature
                                : featureLabels[f.feature]?.en || f.feature}
                        </span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                                className="h-full rounded-full transition-all duration-500"
                                style={{ 
                                    width: `${f.importance * 100}%`,
                                    backgroundColor: `hsl(${220 - idx * 30}, 70%, 50%)`
                                }}
                            />
                        </div>
                        <span className="text-xs font-medium text-on-surface w-12 text-right">
                            {(f.importance * 100).toFixed(0)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface ProductsByClusterProps {
    clusters: Cluster[];
    selectedCluster: number | null;
    language: string;
}

const ProductsByCluster: React.FC<ProductsByClusterProps> = ({ clusters, selectedCluster, language }) => {
    const displayClusters = selectedCluster !== null 
        ? clusters.filter(c => c.id === selectedCluster)
        : clusters;
    
    return (
        <div className="space-y-4">
            <h4 className="text-sm font-semibold text-on-surface">
                {language === 'Thai' ? 'รายละเอียดผลิตภัณฑ์' : 'Product Details'}
            </h4>
            
            {displayClusters.map(cluster => (
                <div key={cluster.id} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                    <div 
                        className="px-4 py-2 font-medium text-sm text-white"
                        style={{ backgroundColor: cluster.color }}
                    >
                        {cluster.name} ({cluster.products.length} {language === 'Thai' ? 'รายการ' : 'items'})
                    </div>
                    <div className="divide-y divide-gray-50">
                        {cluster.products.map(product => (
                            <div key={product.competitorId} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-on-surface">{product.competitorName}</p>
                                    <p className="text-xs text-on-surface-variant">
                                        {product.durationDays} {language === 'Thai' ? 'วัน' : 'days'} • {product.destinationCount} {language === 'Thai' ? 'จุดหมาย' : 'destinations'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-on-surface">
                                        {product.totalPrice.toLocaleString()} THB
                                    </p>
                                    <p className="text-xs text-on-surface-variant">
                                        ~{Math.round(product.pricePerDay).toLocaleString()}/day
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ClusterView;
