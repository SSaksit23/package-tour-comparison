"""
Search Tools for Agentic Web Research

Provides intelligent web search capabilities using:
1. EXA Search (primary - already available in backend)
2. SerpAPI/Google Search (fallback)
3. BeautifulSoup for content extraction
"""

import os
import json
import requests
from typing import Optional, List, Dict, Any
from bs4 import BeautifulSoup
from datetime import datetime

# Try to import crewai_tools
try:
    from crewai_tools import BaseTool
    from pydantic import Field
    CREWAI_TOOLS_AVAILABLE = True
except ImportError:
    CREWAI_TOOLS_AVAILABLE = False
    # Create a simple fallback BaseTool
    class BaseTool:
        name: str = ""
        description: str = ""
        def _run(self, *args, **kwargs):
            raise NotImplementedError

# Try to import EXA
try:
    from exa_py import Exa
    EXA_AVAILABLE = True
except ImportError:
    EXA_AVAILABLE = False

# Try to import SerpAPI
try:
    from serpapi import GoogleSearch
    SERPAPI_AVAILABLE = True
except ImportError:
    SERPAPI_AVAILABLE = False


class EXASearchTool(BaseTool):
    """
    Search tool using EXA API for high-quality semantic search.
    Preferred method as it's already configured in the backend.
    """
    name: str = "EXA Web Search"
    description: str = (
        "Performs semantic web search using EXA API. "
        "Best for finding travel packages, reviews, and market data. "
        "Returns structured results with content snippets."
    )
    
    def __init__(self):
        super().__init__()
        self.api_key = os.getenv("EXA_API_KEY")
        self.available = EXA_AVAILABLE and bool(self.api_key)
        if self.available:
            self.exa = Exa(api_key=self.api_key)
        else:
            self.exa = None
    
    def _run(self, query: str, num_results: int = 5) -> str:
        """Execute search and return JSON results"""
        if not self.available:
            return json.dumps({
                "success": False,
                "error": "EXA Search not available",
                "results": []
            })
        
        try:
            response = self.exa.search_and_contents(
                query=query,
                num_results=num_results,
                type="neural",
                use_autoprompt=True,
                text={"max_characters": 2000},
                highlights={"num_sentences": 5}
            )
            
            results = []
            for item in response.results:
                result = {
                    "name": item.title,
                    "url": item.url,
                    "snippet": getattr(item, 'highlights', [''])[0] if getattr(item, 'highlights', []) else '',
                    "content": getattr(item, 'text', '')[:2000],
                    "score": getattr(item, 'score', 0),
                    "published_date": getattr(item, 'published_date', None)
                }
                results.append(result)
            
            return json.dumps({
                "success": True,
                "query": query,
                "results": results,
                "count": len(results),
                "source": "exa"
            })
            
        except Exception as e:
            return json.dumps({
                "success": False,
                "error": str(e),
                "results": []
            })


class IntelligentSearchTool(BaseTool):
    """
    Comprehensive search tool that combines web search with content scraping.
    Uses SerpAPI for search and BeautifulSoup for content extraction.
    Falls back to EXA if SerpAPI is not available.
    """
    name: str = "Intelligent Web Search and Scraper"
    description: str = (
        "Performs a web search for tour packages, scrapes the content of top results, "
        "and returns structured data including prices, destinations, and inclusions. "
        "Use this to find comparable tour packages online."
    )
    
    def __init__(self):
        super().__init__()
        self.serpapi_key = os.getenv("SERPAPI_KEY") or os.getenv("SERP_API_KEY")
        self.exa_key = os.getenv("EXA_API_KEY")
        
        # Determine which search engine to use
        if SERPAPI_AVAILABLE and self.serpapi_key:
            self.search_engine = "serpapi"
        elif EXA_AVAILABLE and self.exa_key:
            self.search_engine = "exa"
            self.exa = Exa(api_key=self.exa_key)
        else:
            self.search_engine = None
    
    def _run(self, query: str) -> str:
        """Execute search and scrape content from results"""
        if not self.search_engine:
            return json.dumps({
                "success": False,
                "error": "No search engine available. Set SERPAPI_KEY or EXA_API_KEY.",
                "results": []
            })
        
        try:
            if self.search_engine == "serpapi":
                return self._search_with_serpapi(query)
            else:
                return self._search_with_exa(query)
        except Exception as e:
            return json.dumps({
                "success": False,
                "error": str(e),
                "results": []
            })
    
    def _search_with_serpapi(self, query: str) -> str:
        """Search using SerpAPI and scrape results"""
        search_params = {
            "q": query,
            "api_key": self.serpapi_key,
            "num": 5,
            "gl": "th",  # Thailand focus for travel packages
            "hl": "en"
        }
        
        search = GoogleSearch(search_params)
        results = search.get_dict()
        
        packages = []
        for result in results.get("organic_results", [])[:5]:
            if 'link' not in result:
                continue
            
            package = {
                "name": result.get('title', 'Unknown Package'),
                "url": result.get('link'),
                "snippet": result.get('snippet', ''),
                "content": ""
            }
            
            # Try to scrape additional content
            try:
                scraped = self._scrape_url(result['link'])
                if scraped:
                    package["content"] = scraped.get("content", "")
                    package["extracted_data"] = scraped.get("extracted_data", {})
            except Exception:
                pass  # Continue with snippet only
            
            packages.append(package)
        
        return json.dumps({
            "success": True,
            "query": query,
            "results": packages,
            "count": len(packages),
            "source": "serpapi"
        })
    
    def _search_with_exa(self, query: str) -> str:
        """Search using EXA (already provides content)"""
        response = self.exa.search_and_contents(
            query=query,
            num_results=5,
            type="neural",
            use_autoprompt=True,
            text={"max_characters": 3000},
            highlights={"num_sentences": 5}
        )
        
        packages = []
        for item in response.results:
            content = getattr(item, 'text', '')
            package = {
                "name": item.title,
                "url": item.url,
                "snippet": getattr(item, 'highlights', [''])[0] if getattr(item, 'highlights', []) else '',
                "content": content[:3000],
                "extracted_data": self._extract_tour_data(content)
            }
            packages.append(package)
        
        return json.dumps({
            "success": True,
            "query": query,
            "results": packages,
            "count": len(packages),
            "source": "exa"
        })
    
    def _scrape_url(self, url: str, timeout: int = 10) -> Optional[Dict]:
        """Scrape content from a URL"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Remove unwanted elements
            for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                element.decompose()
            
            # Get main content
            main_content = soup.find('main') or soup.find('article') or soup.find('body')
            text = main_content.get_text(separator=' ', strip=True) if main_content else ''
            
            # Clean and truncate
            text = ' '.join(text.split())[:3000]
            
            return {
                "content": text,
                "extracted_data": self._extract_tour_data(text)
            }
            
        except Exception as e:
            return None
    
    def _extract_tour_data(self, text: str) -> Dict:
        """Extract structured tour data from text"""
        import re
        
        data = {
            "prices": [],
            "duration": None,
            "destinations": [],
            "inclusions": []
        }
        
        # Extract prices (THB, USD, EUR)
        price_patterns = [
            r'฿?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:บาท|THB|baht)',
            r'\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
            r'(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|EUR)',
        ]
        for pattern in price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            data["prices"].extend(matches[:3])
        
        # Extract duration
        duration_pattern = r'(\d+)\s*(?:days?|nights?|วัน|คืน)'
        duration_match = re.search(duration_pattern, text, re.IGNORECASE)
        if duration_match:
            data["duration"] = duration_match.group(0)
        
        # Common destinations (could be expanded)
        destinations = ['Japan', 'Korea', 'Thailand', 'Vietnam', 'Singapore', 
                       'Malaysia', 'Indonesia', 'China', 'Taiwan', 'Hong Kong',
                       'Tokyo', 'Osaka', 'Seoul', 'Bangkok', 'Phuket', 'Chiang Mai',
                       'ญี่ปุ่น', 'เกาหลี', 'ไทย', 'เวียดนาม', 'สิงคโปร์']
        for dest in destinations:
            if dest.lower() in text.lower():
                data["destinations"].append(dest)
        
        # Common inclusions keywords
        inclusions_keywords = ['breakfast', 'hotel', 'flight', 'transfer', 'guide',
                              'อาหาร', 'โรงแรม', 'ตั๋ว', 'รถรับส่ง', 'มัคคุเทศก์']
        for keyword in inclusions_keywords:
            if keyword.lower() in text.lower():
                data["inclusions"].append(keyword)
        
        return data


class TourPackageSearchTool(BaseTool):
    """
    Specialized tool for searching tour packages with travel-specific queries.
    """
    name: str = "Tour Package Search"
    description: str = (
        "Specialized search for tour packages. Input: destination and optional parameters "
        "(duration, budget, style). Returns comparable tour packages from various travel agencies."
    )
    
    def __init__(self):
        super().__init__()
        self.base_tool = IntelligentSearchTool()
    
    def _run(
        self, 
        destination: str, 
        duration: str = "",
        budget: str = "",
        style: str = ""
    ) -> str:
        """Search for tour packages with specific parameters"""
        # Build search query
        query_parts = [destination, "tour package"]
        
        if duration:
            query_parts.append(f"{duration} days")
        if budget:
            query_parts.append(f"budget {budget}")
        if style:
            query_parts.append(style)
        
        query_parts.append("2025 price itinerary")
        
        query = " ".join(query_parts)
        return self.base_tool._run(query)
