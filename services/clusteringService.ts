/**
 * Clustering Service - Product Segmentation
 * 
 * Uses K-means clustering to segment travel products based on their characteristics:
 * - Price range
 * - Duration
 * - Destination count
 * - Included services (meals, activities)
 * - Value for money (price per day)
 */

import { Competitor, SavedCompetitor, ItineraryData } from '../types';

// ============== Types ==============

export interface ProductFeatures {
    competitorId: string;
    competitorName: string;
    // Raw features
    totalPrice: number;
    pricePerDay: number;
    durationDays: number;
    destinationCount: number;
    inclusionsCount: number;
    mealsPerDay: number;
    flightCount: number;
    activitiesScore: number; // 0-10 based on activities described
    // Normalized features (0-1 scale)
    normalized: {
        price: number;
        pricePerDay: number;
        duration: number;
        destinations: number;
        inclusions: number;
        meals: number;
        flights: number;
        activities: number;
    };
}

export interface Cluster {
    id: number;
    name: string;
    description: string;
    color: string;
    products: ProductFeatures[];
    centroid: number[];
    characteristics: {
        avgPrice: number;
        avgDuration: number;
        avgDestinations: number;
        priceRange: string;
        segment: 'budget' | 'mid-range' | 'premium' | 'luxury';
    };
}

export interface ClusteringResult {
    clusters: Cluster[];
    products: (ProductFeatures & { clusterId: number })[];
    optimalK: number;
    silhouetteScore: number;
    featureImportance: { feature: string; importance: number }[];
}

// ============== Feature Extraction ==============

/**
 * Extract days from duration string
 */
const extractDays = (duration: string): number => {
    if (!duration) return 0;
    const match = duration.match(/(\d+)\s*[Dd]ay/i) || duration.match(/(\d+)\s*D/);
    return match ? parseInt(match[1]) : 0;
};

/**
 * Calculate activities score based on daily breakdown
 */
const calculateActivitiesScore = (dailyBreakdown: ItineraryData['dailyBreakdown']): number => {
    if (!dailyBreakdown || dailyBreakdown.length === 0) return 0;
    
    let totalScore = 0;
    for (const day of dailyBreakdown) {
        // Score based on activities text length and keywords
        const activities = day.activities || '';
        const activityWords = ['tour', 'visit', 'explore', 'experience', 'cruise', 'trek', 'hike', 
                              'swim', 'snorkel', 'dive', 'safari', 'cooking', 'workshop', 'show'];
        
        let dayScore = Math.min(activities.length / 100, 3); // Base score from length
        activityWords.forEach(word => {
            if (activities.toLowerCase().includes(word)) dayScore += 0.5;
        });
        totalScore += Math.min(dayScore, 5); // Cap at 5 per day
    }
    
    return Math.min(totalScore / dailyBreakdown.length, 10); // Average, capped at 10
};

/**
 * Calculate average meals per day
 */
const calculateMealsPerDay = (dailyBreakdown: ItineraryData['dailyBreakdown']): number => {
    if (!dailyBreakdown || dailyBreakdown.length === 0) return 0;
    
    const totalMeals = dailyBreakdown.reduce((sum, day) => sum + (day.meals?.length || 0), 0);
    return totalMeals / dailyBreakdown.length;
};

/**
 * Extract features from a competitor's analysis
 */
export const extractFeatures = (competitor: Competitor | SavedCompetitor): ProductFeatures | null => {
    const analysis = competitor.analysis;
    if (!analysis) return null;
    
    const totalPrice = analysis.pricing?.[0]?.price || 0;
    const durationDays = extractDays(analysis.duration);
    const pricePerDay = durationDays > 0 ? totalPrice / durationDays : totalPrice;
    const destinationCount = analysis.destinations?.length || 0;
    const inclusionsCount = analysis.inclusions?.length || 0;
    const mealsPerDay = calculateMealsPerDay(analysis.dailyBreakdown);
    const flightCount = analysis.flights?.length || 0;
    const activitiesScore = calculateActivitiesScore(analysis.dailyBreakdown);
    
    return {
        competitorId: 'id' in competitor ? competitor.id : competitor.name,
        competitorName: competitor.name,
        totalPrice,
        pricePerDay,
        durationDays,
        destinationCount,
        inclusionsCount,
        mealsPerDay,
        flightCount,
        activitiesScore,
        normalized: {
            price: 0,
            pricePerDay: 0,
            duration: 0,
            destinations: 0,
            inclusions: 0,
            meals: 0,
            flights: 0,
            activities: 0
        }
    };
};

/**
 * Normalize features to 0-1 scale using min-max normalization
 */
const normalizeFeatures = (products: ProductFeatures[]): ProductFeatures[] => {
    if (products.length === 0) return products;
    
    // Find min/max for each feature
    const minMax = {
        price: { min: Infinity, max: -Infinity },
        pricePerDay: { min: Infinity, max: -Infinity },
        duration: { min: Infinity, max: -Infinity },
        destinations: { min: Infinity, max: -Infinity },
        inclusions: { min: Infinity, max: -Infinity },
        meals: { min: Infinity, max: -Infinity },
        flights: { min: Infinity, max: -Infinity },
        activities: { min: Infinity, max: -Infinity }
    };
    
    products.forEach(p => {
        minMax.price.min = Math.min(minMax.price.min, p.totalPrice);
        minMax.price.max = Math.max(minMax.price.max, p.totalPrice);
        minMax.pricePerDay.min = Math.min(minMax.pricePerDay.min, p.pricePerDay);
        minMax.pricePerDay.max = Math.max(minMax.pricePerDay.max, p.pricePerDay);
        minMax.duration.min = Math.min(minMax.duration.min, p.durationDays);
        minMax.duration.max = Math.max(minMax.duration.max, p.durationDays);
        minMax.destinations.min = Math.min(minMax.destinations.min, p.destinationCount);
        minMax.destinations.max = Math.max(minMax.destinations.max, p.destinationCount);
        minMax.inclusions.min = Math.min(minMax.inclusions.min, p.inclusionsCount);
        minMax.inclusions.max = Math.max(minMax.inclusions.max, p.inclusionsCount);
        minMax.meals.min = Math.min(minMax.meals.min, p.mealsPerDay);
        minMax.meals.max = Math.max(minMax.meals.max, p.mealsPerDay);
        minMax.flights.min = Math.min(minMax.flights.min, p.flightCount);
        minMax.flights.max = Math.max(minMax.flights.max, p.flightCount);
        minMax.activities.min = Math.min(minMax.activities.min, p.activitiesScore);
        minMax.activities.max = Math.max(minMax.activities.max, p.activitiesScore);
    });
    
    // Normalize
    const normalize = (value: number, min: number, max: number): number => {
        if (max === min) return 0.5;
        return (value - min) / (max - min);
    };
    
    return products.map(p => ({
        ...p,
        normalized: {
            price: normalize(p.totalPrice, minMax.price.min, minMax.price.max),
            pricePerDay: normalize(p.pricePerDay, minMax.pricePerDay.min, minMax.pricePerDay.max),
            duration: normalize(p.durationDays, minMax.duration.min, minMax.duration.max),
            destinations: normalize(p.destinationCount, minMax.destinations.min, minMax.destinations.max),
            inclusions: normalize(p.inclusionsCount, minMax.inclusions.min, minMax.inclusions.max),
            meals: normalize(p.mealsPerDay, minMax.meals.min, minMax.meals.max),
            flights: normalize(p.flightCount, minMax.flights.min, minMax.flights.max),
            activities: normalize(p.activitiesScore, minMax.activities.min, minMax.activities.max)
        }
    }));
};

// ============== K-Means Clustering ==============

/**
 * Get feature vector from normalized features
 */
const getFeatureVector = (p: ProductFeatures): number[] => [
    p.normalized.price * 1.5,       // Weight price higher
    p.normalized.pricePerDay * 1.2, // Weight value higher
    p.normalized.duration,
    p.normalized.destinations,
    p.normalized.inclusions,
    p.normalized.meals,
    p.normalized.flights * 0.5,     // Weight flights lower
    p.normalized.activities
];

/**
 * Calculate Euclidean distance between two vectors
 */
const euclideanDistance = (a: number[], b: number[]): number => {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
};

/**
 * Initialize centroids using k-means++ algorithm
 */
const initializeCentroids = (data: number[][], k: number): number[][] => {
    const centroids: number[][] = [];
    
    // First centroid: random point
    centroids.push([...data[Math.floor(Math.random() * data.length)]]);
    
    // Remaining centroids: choose proportional to squared distance
    while (centroids.length < k) {
        const distances = data.map(point => {
            const minDist = Math.min(...centroids.map(c => euclideanDistance(point, c)));
            return minDist * minDist;
        });
        
        const totalDist = distances.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalDist;
        
        for (let i = 0; i < data.length; i++) {
            random -= distances[i];
            if (random <= 0) {
                centroids.push([...data[i]]);
                break;
            }
        }
    }
    
    return centroids;
};

/**
 * Assign points to nearest centroid
 */
const assignClusters = (data: number[][], centroids: number[][]): number[] => {
    return data.map(point => {
        let minDist = Infinity;
        let cluster = 0;
        centroids.forEach((centroid, i) => {
            const dist = euclideanDistance(point, centroid);
            if (dist < minDist) {
                minDist = dist;
                cluster = i;
            }
        });
        return cluster;
    });
};

/**
 * Update centroids based on assigned points
 */
const updateCentroids = (data: number[][], assignments: number[], k: number): number[][] => {
    const newCentroids: number[][] = [];
    const dimensions = data[0].length;
    
    for (let i = 0; i < k; i++) {
        const clusterPoints = data.filter((_, idx) => assignments[idx] === i);
        
        if (clusterPoints.length === 0) {
            // Empty cluster: reinitialize with random point
            newCentroids.push([...data[Math.floor(Math.random() * data.length)]]);
        } else {
            const centroid = new Array(dimensions).fill(0);
            clusterPoints.forEach(point => {
                point.forEach((val, d) => centroid[d] += val);
            });
            newCentroids.push(centroid.map(v => v / clusterPoints.length));
        }
    }
    
    return newCentroids;
};

/**
 * Calculate silhouette score for clustering quality
 */
const calculateSilhouetteScore = (data: number[][], assignments: number[], k: number): number => {
    if (data.length < 2 || k < 2) return 0;
    
    let totalScore = 0;
    
    data.forEach((point, i) => {
        const cluster = assignments[i];
        
        // a: average distance to same cluster
        const sameCluster = data.filter((_, idx) => assignments[idx] === cluster && idx !== i);
        const a = sameCluster.length > 0
            ? sameCluster.reduce((sum, p) => sum + euclideanDistance(point, p), 0) / sameCluster.length
            : 0;
        
        // b: minimum average distance to other clusters
        let b = Infinity;
        for (let c = 0; c < k; c++) {
            if (c === cluster) continue;
            const otherCluster = data.filter((_, idx) => assignments[idx] === c);
            if (otherCluster.length > 0) {
                const avgDist = otherCluster.reduce((sum, p) => sum + euclideanDistance(point, p), 0) / otherCluster.length;
                b = Math.min(b, avgDist);
            }
        }
        
        if (b === Infinity) b = 0;
        
        const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
        totalScore += s;
    });
    
    return totalScore / data.length;
};

/**
 * K-means clustering algorithm
 */
const kMeans = (data: number[][], k: number, maxIterations: number = 100): { assignments: number[]; centroids: number[][]; } => {
    let centroids = initializeCentroids(data, k);
    let assignments = assignClusters(data, centroids);
    
    for (let iter = 0; iter < maxIterations; iter++) {
        const newCentroids = updateCentroids(data, assignments, k);
        const newAssignments = assignClusters(data, newCentroids);
        
        // Check convergence
        if (JSON.stringify(newAssignments) === JSON.stringify(assignments)) {
            break;
        }
        
        centroids = newCentroids;
        assignments = newAssignments;
    }
    
    return { assignments, centroids };
};

/**
 * Find optimal number of clusters using elbow method + silhouette score
 */
const findOptimalK = (data: number[][], maxK: number = 5): number => {
    if (data.length <= 2) return Math.min(data.length, 2);
    
    const maxClusters = Math.min(maxK, data.length - 1);
    let bestK = 2;
    let bestScore = -1;
    
    for (let k = 2; k <= maxClusters; k++) {
        const { assignments } = kMeans(data, k);
        const score = calculateSilhouetteScore(data, assignments, k);
        
        if (score > bestScore) {
            bestScore = score;
            bestK = k;
        }
    }
    
    return bestK;
};

// ============== Cluster Naming & Characteristics ==============

const CLUSTER_COLORS = [
    '#3B82F6', // Blue - Budget
    '#10B981', // Green - Mid-range
    '#F59E0B', // Amber - Premium
    '#8B5CF6', // Purple - Luxury
    '#EC4899', // Pink
    '#06B6D4', // Cyan
];

/**
 * Determine segment based on average price per day
 */
const determineSegment = (avgPricePerDay: number, allPrices: number[]): 'budget' | 'mid-range' | 'premium' | 'luxury' => {
    const sortedPrices = [...allPrices].sort((a, b) => a - b);
    const percentile = sortedPrices.findIndex(p => p >= avgPricePerDay) / sortedPrices.length;
    
    if (percentile <= 0.25) return 'budget';
    if (percentile <= 0.5) return 'mid-range';
    if (percentile <= 0.75) return 'premium';
    return 'luxury';
};

/**
 * Generate cluster name and description
 */
const generateClusterInfo = (
    clusterId: number,
    products: ProductFeatures[],
    allProducts: ProductFeatures[]
): { name: string; description: string; segment: 'budget' | 'mid-range' | 'premium' | 'luxury' } => {
    const avgPrice = products.reduce((sum, p) => sum + p.totalPrice, 0) / products.length;
    const avgPricePerDay = products.reduce((sum, p) => sum + p.pricePerDay, 0) / products.length;
    const avgDuration = products.reduce((sum, p) => sum + p.durationDays, 0) / products.length;
    const avgDestinations = products.reduce((sum, p) => sum + p.destinationCount, 0) / products.length;
    const avgMeals = products.reduce((sum, p) => sum + p.mealsPerDay, 0) / products.length;
    const avgActivities = products.reduce((sum, p) => sum + p.activitiesScore, 0) / products.length;
    
    const allPricesPerDay = allProducts.map(p => p.pricePerDay);
    const segment = determineSegment(avgPricePerDay, allPricesPerDay);
    
    // Generate descriptive name
    const priceLevel = segment === 'budget' ? 'Budget' : segment === 'mid-range' ? 'Value' : segment === 'premium' ? 'Premium' : 'Luxury';
    const durationDesc = avgDuration <= 4 ? 'Short' : avgDuration <= 7 ? 'Standard' : 'Extended';
    const activityLevel = avgActivities <= 3 ? 'Relaxed' : avgActivities <= 6 ? 'Balanced' : 'Active';
    
    const name = `${priceLevel} ${durationDesc} ${activityLevel}`;
    
    // Generate description
    const descriptions: string[] = [];
    descriptions.push(`${products.length} product${products.length > 1 ? 's' : ''}`);
    descriptions.push(`~${Math.round(avgDuration)} days`);
    descriptions.push(`~${Math.round(avgDestinations)} destinations`);
    descriptions.push(`${avgMeals.toFixed(1)} meals/day`);
    
    return {
        name,
        description: descriptions.join(' • '),
        segment
    };
};

// ============== Main Clustering Function ==============

/**
 * Cluster competitors based on their characteristics
 */
export const clusterProducts = (
    competitors: (Competitor | SavedCompetitor)[],
    preferredK?: number
): ClusteringResult | null => {
    // Extract features from all analyzed competitors
    const rawFeatures = competitors
        .map(c => extractFeatures(c))
        .filter((f): f is ProductFeatures => f !== null && f.totalPrice > 0);
    
    if (rawFeatures.length < 2) {
        console.warn('Need at least 2 analyzed products for clustering');
        return null;
    }
    
    // Normalize features
    const products = normalizeFeatures(rawFeatures);
    
    // Convert to feature vectors
    const featureVectors = products.map(getFeatureVector);
    
    // Determine optimal K or use preferred
    const k = preferredK || findOptimalK(featureVectors, Math.min(4, products.length - 1));
    
    // Run K-means
    const { assignments, centroids } = kMeans(featureVectors, k);
    const silhouetteScore = calculateSilhouetteScore(featureVectors, assignments, k);
    
    // Build cluster objects
    const clusters: Cluster[] = [];
    for (let i = 0; i < k; i++) {
        const clusterProducts = products.filter((_, idx) => assignments[idx] === i);
        
        if (clusterProducts.length === 0) continue;
        
        const { name, description, segment } = generateClusterInfo(i, clusterProducts, products);
        
        const avgPrice = clusterProducts.reduce((sum, p) => sum + p.totalPrice, 0) / clusterProducts.length;
        const avgDuration = clusterProducts.reduce((sum, p) => sum + p.durationDays, 0) / clusterProducts.length;
        const avgDestinations = clusterProducts.reduce((sum, p) => sum + p.destinationCount, 0) / clusterProducts.length;
        
        const minPrice = Math.min(...clusterProducts.map(p => p.totalPrice));
        const maxPrice = Math.max(...clusterProducts.map(p => p.totalPrice));
        
        clusters.push({
            id: i,
            name,
            description,
            color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
            products: clusterProducts,
            centroid: centroids[i],
            characteristics: {
                avgPrice,
                avgDuration,
                avgDestinations,
                priceRange: minPrice === maxPrice 
                    ? `${minPrice.toLocaleString()}`
                    : `${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}`,
                segment
            }
        });
    }
    
    // Sort clusters by average price
    clusters.sort((a, b) => a.characteristics.avgPrice - b.characteristics.avgPrice);
    
    // Calculate feature importance (variance contribution)
    const featureNames = ['price', 'pricePerDay', 'duration', 'destinations', 'inclusions', 'meals', 'flights', 'activities'];
    const featureImportance = featureNames.map((feature, idx) => {
        const values = featureVectors.map(v => v[idx]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return { feature, importance: variance };
    });
    
    // Normalize importance scores
    const totalImportance = featureImportance.reduce((sum, f) => sum + f.importance, 0);
    featureImportance.forEach(f => f.importance = totalImportance > 0 ? f.importance / totalImportance : 0);
    featureImportance.sort((a, b) => b.importance - a.importance);
    
    return {
        clusters,
        products: products.map((p, idx) => ({ ...p, clusterId: assignments[idx] })),
        optimalK: k,
        silhouetteScore,
        featureImportance
    };
};

/**
 * Get cluster summary for display
 */
export const getClusterSummary = (result: ClusteringResult): string => {
    const lines: string[] = [
        `## Product Segmentation Analysis`,
        '',
        `Found **${result.clusters.length} segments** across ${result.products.length} products`,
        `Clustering quality score: ${(result.silhouetteScore * 100).toFixed(0)}%`,
        '',
        '### Segments',
        ''
    ];
    
    result.clusters.forEach((cluster, idx) => {
        lines.push(`#### ${idx + 1}. ${cluster.name}`);
        lines.push(`- **Products:** ${cluster.products.map(p => p.competitorName).join(', ')}`);
        lines.push(`- **Price Range:** ${cluster.characteristics.priceRange} THB`);
        lines.push(`- **Avg Duration:** ${cluster.characteristics.avgDuration.toFixed(1)} days`);
        lines.push(`- **Avg Destinations:** ${cluster.characteristics.avgDestinations.toFixed(1)}`);
        lines.push(`- **Segment:** ${cluster.characteristics.segment}`);
        lines.push('');
    });
    
    lines.push('### Key Differentiating Factors');
    result.featureImportance.slice(0, 4).forEach((f, idx) => {
        lines.push(`${idx + 1}. **${f.feature}** (${(f.importance * 100).toFixed(0)}% variance)`);
    });
    
    return lines.join('\n');
};
