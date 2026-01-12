"""
Web Search Agent using EXA Search

Provides real-time web search capabilities for:
- Current travel prices and deals
- Destination reviews and ratings
- Competitor information
- Travel advisories and news
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime

# Try to import exa_py
try:
    from exa_py import Exa
    EXA_AVAILABLE = True
except ImportError:
    EXA_AVAILABLE = False
    print("⚠️ EXA Search not available")


class WebSearchAgent:
    """
    Web Search Agent for Travel Information
    
    Uses EXA Search API for high-quality web search results
    optimized for travel-related queries.
    """
    
    def __init__(self, exa_api_key: Optional[str] = None):
        self.exa_api_key = exa_api_key or os.getenv("EXA_API_KEY")
        
        if EXA_AVAILABLE and self.exa_api_key:
            try:
                self.exa = Exa(api_key=self.exa_api_key)
                self.available = True
                print("✅ EXA Web Search agent initialized")
            except Exception as e:
                print(f"⚠️ EXA initialization failed: {e}")
                self.exa = None
                self.available = False
        else:
            self.exa = None
            self.available = False
            if not self.exa_api_key:
                print("ℹ️ EXA_API_KEY not set, web search disabled")
    
    def search(
        self,
        query: str,
        num_results: int = 5,
        search_type: str = "auto",
        use_autoprompt: bool = True,
        include_text: bool = True
    ) -> Dict[str, Any]:
        """
        Perform a web search
        
        Args:
            query: Search query
            num_results: Number of results to return
            search_type: "auto", "keyword", or "neural"
            use_autoprompt: Let EXA optimize the query
            include_text: Include page text content
        
        Returns:
            Search results with titles, URLs, and content
        """
        if not self.available:
            return {
                "success": False,
                "error": "Web search not available (EXA_API_KEY not configured)",
                "results": []
            }
        
        try:
            # Perform search
            response = self.exa.search_and_contents(
                query=query,
                num_results=num_results,
                type=search_type,
                use_autoprompt=use_autoprompt,
                text={"max_characters": 1500} if include_text else None,
                highlights={"num_sentences": 3} if include_text else None
            )
            
            results = []
            for item in response.results:
                result = {
                    "title": item.title,
                    "url": item.url,
                    "score": getattr(item, 'score', None),
                    "published_date": getattr(item, 'published_date', None),
                }
                
                if include_text:
                    result["text"] = getattr(item, 'text', '')[:1500]
                    result["highlights"] = getattr(item, 'highlights', [])
                
                results.append(result)
            
            return {
                "success": True,
                "query": query,
                "results": results,
                "count": len(results),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "results": []
            }
    
    def search_travel_prices(
        self,
        destination: str,
        travel_type: str = "tour package",
        budget_range: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Search for travel prices and deals
        
        Args:
            destination: Travel destination
            travel_type: "tour package", "hotel", "flight", etc.
            budget_range: Optional budget constraint
        """
        query_parts = [f"{destination} {travel_type} price 2024 2025"]
        
        if budget_range:
            query_parts.append(f"budget {budget_range}")
        
        query = " ".join(query_parts)
        
        return self.search(
            query=query,
            num_results=8,
            search_type="neural"
        )
    
    def search_destination_reviews(
        self,
        destination: str,
        aspects: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Search for destination reviews and ratings
        
        Args:
            destination: Travel destination
            aspects: Specific aspects to search (e.g., ["hotels", "food", "safety"])
        """
        aspects_str = ", ".join(aspects) if aspects else "hotels, attractions, food"
        query = f"{destination} travel review rating {aspects_str} tourist experience"
        
        return self.search(
            query=query,
            num_results=6,
            search_type="neural"
        )
    
    def search_competitor_tours(
        self,
        destination: str,
        tour_type: str = "package tour",
        company_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Search for competitor tour offerings
        
        Args:
            destination: Travel destination
            tour_type: Type of tour
            company_name: Specific competitor to search
        """
        query_parts = [f"{destination} {tour_type}"]
        
        if company_name:
            query_parts.append(f'"{company_name}"')
        else:
            query_parts.append("tour operator travel agency")
        
        query_parts.append("itinerary price includes 2024 2025")
        
        return self.search(
            query=" ".join(query_parts),
            num_results=10,
            search_type="neural"
        )
    
    def search_travel_news(
        self,
        destination: str,
        topics: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Search for recent travel news and advisories
        
        Args:
            destination: Travel destination
            topics: Specific topics (e.g., ["visa", "safety", "weather"])
        """
        topics_str = ", ".join(topics) if topics else "travel advisory, tourism news"
        query = f"{destination} {topics_str} latest news 2024 2025"
        
        return self.search(
            query=query,
            num_results=5,
            search_type="auto"
        )
    
    def get_search_summary(self, results: Dict[str, Any]) -> str:
        """
        Generate a summary of search results for AI consumption
        """
        if not results.get("success"):
            return f"Web search failed: {results.get('error', 'Unknown error')}"
        
        if not results.get("results"):
            return "No web search results found."
        
        summary_parts = [f"Web Search Results ({results.get('count', 0)} found):"]
        
        for i, item in enumerate(results.get("results", [])[:5], 1):
            summary_parts.append(f"\n{i}. {item.get('title', 'No title')}")
            summary_parts.append(f"   URL: {item.get('url', '')}")
            
            if item.get("highlights"):
                summary_parts.append(f"   Key Points: {' '.join(item['highlights'][:2])}")
            elif item.get("text"):
                summary_parts.append(f"   Preview: {item['text'][:200]}...")
        
        return "\n".join(summary_parts)

