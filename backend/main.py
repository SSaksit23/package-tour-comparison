"""
Itinerary Analyzer Backend Service

This service provides:
- PDF text extraction using PyMuPDF (fitz)
- AI Agents for intelligent analysis (CrewAI)
- Persistent memory (Mem0)
- Web search for real-time travel data (EXA)
"""

import io
import os
import re
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import fitz  # PyMuPDF

# Import agents (with graceful fallback)
try:
    from agents import (
        MemoryAgent, 
        WebSearchAgent, 
        TravelAnalystCrew,
        SmartProductLaunchAgent,
        AIConsultantAgent
    )
    AGENTS_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Agents not fully available: {e}")
    AGENTS_AVAILABLE = False
    MemoryAgent = None
    WebSearchAgent = None
    TravelAnalystCrew = None
    SmartProductLaunchAgent = None
    AIConsultantAgent = None


app = FastAPI(
    title="Itinerary Analyzer Backend",
    description="PDF extraction + AI Agents for travel itinerary analysis",
    version="2.0.0"
)

# Initialize agents (lazy loading)
_memory_agent = None
_web_search_agent = None
_travel_crew = None
_product_launch_agent = None
_consultant_agent = None

def get_memory_agent():
    global _memory_agent
    if _memory_agent is None and MemoryAgent:
        _memory_agent = MemoryAgent()
    return _memory_agent

def get_web_search_agent():
    global _web_search_agent
    if _web_search_agent is None and WebSearchAgent:
        _web_search_agent = WebSearchAgent()
    return _web_search_agent

def get_travel_crew():
    global _travel_crew
    if _travel_crew is None and TravelAnalystCrew:
        _travel_crew = TravelAnalystCrew()
    return _travel_crew

def get_product_launch_agent():
    global _product_launch_agent
    if _product_launch_agent is None and SmartProductLaunchAgent:
        _product_launch_agent = SmartProductLaunchAgent()
    return _product_launch_agent

def get_consultant_agent():
    global _consultant_agent
    if _consultant_agent is None and AIConsultantAgent:
        memory = get_memory_agent()
        _consultant_agent = AIConsultantAgent(memory_agent=memory)
    return _consultant_agent


# Pydantic models for API
class MemoryAddRequest(BaseModel):
    content: str
    user_id: str = "default"
    memory_type: str = "general"
    metadata: Optional[dict] = None

class MemorySearchRequest(BaseModel):
    query: str
    user_id: str = "default"
    limit: int = 5

class WebSearchRequest(BaseModel):
    query: str
    num_results: int = 5
    search_type: str = "travel"

class ItineraryAnalysisRequest(BaseModel):
    itineraries: List[dict]  # [{"name": "...", "content": "..."}]
    analysis_focus: str = "competitive"
    include_web_search: bool = False
    user_id: str = "default"

class ProductAnalysisRequest(BaseModel):
    itinerary_data: dict  # Structured itinerary data
    market_context: Optional[str] = None
    competitor_data: Optional[List[dict]] = None

class ConsultationRequest(BaseModel):
    current_analyses: List[dict]  # List of analysis results
    user_id: str = "default"
    focus_areas: Optional[List[str]] = None

# CORS configuration for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_text_from_pdf(pdf_bytes: bytes) -> dict:
    """
    Extract text from PDF using PyMuPDF with optimized settings
    for travel itineraries (prices, dates, Thai text).
    """
    try:
        # Open PDF from bytes
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        total_pages = len(doc)
        extracted_pages = []
        full_text = ""
        
        # Track extraction quality
        total_chars = 0
        has_tables = False
        has_thai = False
        has_prices = False
        
        for page_num in range(total_pages):
            page = doc[page_num]
            
            # Method 1: Standard text extraction with better layout preservation
            # Using "text" mode preserves reading order
            text = page.get_text("text", sort=True)
            
            # Method 2: If standard extraction yields little text, try blocks mode
            if len(text.strip()) < 50:
                blocks = page.get_text("blocks", sort=True)
                text = "\n".join([block[4] for block in blocks if block[6] == 0])  # type 0 = text
            
            # Method 3: Try dict mode for complex layouts (tables)
            if len(text.strip()) < 50:
                text_dict = page.get_text("dict", sort=True)
                lines = []
                for block in text_dict.get("blocks", []):
                    if block.get("type") == 0:  # Text block
                        for line in block.get("lines", []):
                            line_text = " ".join([
                                span.get("text", "") 
                                for span in line.get("spans", [])
                            ])
                            if line_text.strip():
                                lines.append(line_text)
                if lines:
                    text = "\n".join(lines)
            
            # Clean up the extracted text
            text = clean_text(text)
            
            # Detect content types
            if re.search(r'[\u0E00-\u0E7F]', text):
                has_thai = True
            if re.search(r'\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:บาท|THB|฿|USD|\$|EUR)', text, re.IGNORECASE):
                has_prices = True
            if '|' in text or re.search(r'\t{2,}', text):
                has_tables = True
            
            total_chars += len(text)
            
            extracted_pages.append({
                "page": page_num + 1,
                "text": text,
                "char_count": len(text)
            })
            
            full_text += f"\n--- Page {page_num + 1} ---\n{text}\n"
        
        doc.close()
        
        # Calculate extraction quality score
        avg_chars_per_page = total_chars / total_pages if total_pages > 0 else 0
        quality_score = "high" if avg_chars_per_page > 500 else "medium" if avg_chars_per_page > 100 else "low"
        
        return {
            "success": True,
            "text": full_text.strip(),
            "total_pages": total_pages,
            "total_chars": total_chars,
            "avg_chars_per_page": round(avg_chars_per_page, 1),
            "quality_score": quality_score,
            "content_types": {
                "has_thai": has_thai,
                "has_prices": has_prices,
                "has_tables": has_tables
            },
            "pages": extracted_pages
        }
        
    except fitz.FileDataError as e:
        return {
            "success": False,
            "error": "Invalid or corrupted PDF file",
            "details": str(e)
        }
    except fitz.PasswordError:
        return {
            "success": False,
            "error": "PDF is password protected",
            "details": "Please provide an unlocked PDF"
        }
    except Exception as e:
        return {
            "success": False,
            "error": "PDF extraction failed",
            "details": str(e)
        }


def clean_text(text: str) -> str:
    """
    Clean and normalize extracted text while preserving important data.
    """
    if not text:
        return ""
    
    # Remove excessive whitespace but preserve structure
    text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces/tabs to single space
    text = re.sub(r'\n{3,}', '\n\n', text)  # Max 2 consecutive newlines
    
    # Fix common OCR/extraction issues
    text = text.replace('\ufeff', '')  # Remove BOM
    text = text.replace('\x00', '')  # Remove null bytes
    
    # Normalize Thai text spacing
    # Thai doesn't use spaces between words, but we want spaces around numbers/English
    text = re.sub(r'([\u0E00-\u0E7F])(\d)', r'\1 \2', text)  # Space between Thai and number
    text = re.sub(r'(\d)([\u0E00-\u0E7F])', r'\1 \2', text)  # Space between number and Thai
    
    # Normalize price formats (preserve them)
    text = re.sub(r'(\d)\s*,\s*(\d{3})', r'\1,\2', text)  # Fix broken thousands separators
    
    return text.strip()


def extract_tables_from_pdf(pdf_bytes: bytes) -> dict:
    """
    Extract tables from PDF using PyMuPDF's table detection.
    Useful for itinerary schedules and pricing tables.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        all_tables = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Try to find tables on this page
            tables = page.find_tables()
            
            for table_idx, table in enumerate(tables):
                # Extract table data
                table_data = table.extract()
                
                if table_data and len(table_data) > 1:  # Has header and data
                    all_tables.append({
                        "page": page_num + 1,
                        "table_index": table_idx,
                        "rows": len(table_data),
                        "cols": len(table_data[0]) if table_data else 0,
                        "data": table_data
                    })
        
        doc.close()
        
        return {
            "success": True,
            "table_count": len(all_tables),
            "tables": all_tables
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": "Table extraction failed",
            "details": str(e)
        }


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "PDF Extraction Service",
        "status": "running",
        "version": "1.0.0",
        "engine": f"PyMuPDF {fitz.version[0]}"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "pymupdf_version": fitz.version[0],
        "supported_formats": ["pdf"]
    }


@app.post("/extract")
async def extract_pdf(file: UploadFile = File(...)):
    """
    Extract text from uploaded PDF file.
    
    Returns:
        - text: Full extracted text
        - total_pages: Number of pages
        - quality_score: Extraction quality (high/medium/low)
        - content_types: Detected content (Thai, prices, tables)
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Expected PDF, got: {file.filename}"
        )
    
    # Read file content
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    # Check file size (max 50MB)
    max_size = 50 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Max size is 50MB, got {len(content) / 1024 / 1024:.1f}MB"
        )
    
    # Extract text
    result = extract_text_from_pdf(content)
    
    if not result["success"]:
        raise HTTPException(
            status_code=422,
            detail=result.get("error", "Extraction failed")
        )
    
    return JSONResponse(content=result)


@app.post("/extract-tables")
async def extract_tables(file: UploadFile = File(...)):
    """
    Extract tables from uploaded PDF file.
    
    Returns structured table data that can be used for pricing
    and schedule analysis.
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Invalid file type. Expected PDF.")
    
    content = await file.read()
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    result = extract_tables_from_pdf(content)
    
    return JSONResponse(content=result)


# ==========================================
# AI AGENTS ENDPOINTS
# ==========================================

@app.get("/agents/status")
async def agents_status():
    """Get status of all AI agents"""
    memory = get_memory_agent()
    web_search = get_web_search_agent()
    crew = get_travel_crew()
    
    return {
        "agents_available": AGENTS_AVAILABLE,
        "memory_agent": {
            "available": memory is not None,
            "using_mem0": getattr(memory, 'using_mem0', False) if memory else False
        },
        "web_search_agent": {
            "available": web_search is not None and getattr(web_search, 'available', False)
        },
        "travel_crew": {
            "available": crew is not None and getattr(crew, 'available', False),
            "status": crew.get_status() if crew and hasattr(crew, 'get_status') else None
        }
    }


# --- Memory Agent Endpoints ---

@app.post("/agents/memory/add")
async def add_memory(request: MemoryAddRequest):
    """Add a memory to the store"""
    agent = get_memory_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Memory agent not available")
    
    result = agent.add_memory(
        content=request.content,
        user_id=request.user_id,
        memory_type=request.memory_type,
        metadata=request.metadata
    )
    return JSONResponse(content=result)


@app.post("/agents/memory/search")
async def search_memories(request: MemorySearchRequest):
    """Search for relevant memories"""
    agent = get_memory_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Memory agent not available")
    
    result = agent.search_memories(
        query=request.query,
        user_id=request.user_id,
        limit=request.limit
    )
    return JSONResponse(content=result)


@app.get("/agents/memory/{user_id}")
async def get_all_memories(user_id: str):
    """Get all memories for a user"""
    agent = get_memory_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Memory agent not available")
    
    result = agent.get_all_memories(user_id=user_id)
    return JSONResponse(content=result)


@app.get("/agents/memory/{user_id}/context")
async def get_user_context(user_id: str, query: str = ""):
    """Get user context for AI personalization"""
    agent = get_memory_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Memory agent not available")
    
    context = agent.get_user_context(user_id=user_id, query=query)
    return {"user_id": user_id, "context": context}


@app.delete("/agents/memory/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a specific memory"""
    agent = get_memory_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Memory agent not available")
    
    result = agent.delete_memory(memory_id)
    return JSONResponse(content=result)


# --- Web Search Agent Endpoints ---

@app.post("/agents/search/web")
async def web_search(request: WebSearchRequest):
    """Perform a web search"""
    agent = get_web_search_agent()
    if not agent or not agent.available:
        raise HTTPException(
            status_code=503, 
            detail="Web search not available. Set EXA_API_KEY environment variable."
        )
    
    result = agent.search(
        query=request.query,
        num_results=request.num_results
    )
    return JSONResponse(content=result)


@app.get("/agents/search/prices")
async def search_travel_prices(
    destination: str,
    travel_type: str = "tour package",
    budget_range: Optional[str] = None
):
    """Search for travel prices"""
    agent = get_web_search_agent()
    if not agent or not agent.available:
        raise HTTPException(status_code=503, detail="Web search not available")
    
    result = agent.search_travel_prices(
        destination=destination,
        travel_type=travel_type,
        budget_range=budget_range
    )
    return JSONResponse(content=result)


@app.get("/agents/search/reviews")
async def search_destination_reviews(
    destination: str,
    aspects: Optional[str] = None
):
    """Search for destination reviews"""
    agent = get_web_search_agent()
    if not agent or not agent.available:
        raise HTTPException(status_code=503, detail="Web search not available")
    
    aspects_list = aspects.split(",") if aspects else None
    result = agent.search_destination_reviews(
        destination=destination,
        aspects=aspects_list
    )
    return JSONResponse(content=result)


@app.get("/agents/search/competitors")
async def search_competitor_tours(
    destination: str,
    tour_type: str = "package tour",
    company_name: Optional[str] = None
):
    """Search for competitor tour offerings"""
    agent = get_web_search_agent()
    if not agent or not agent.available:
        raise HTTPException(status_code=503, detail="Web search not available")
    
    result = agent.search_competitor_tours(
        destination=destination,
        tour_type=tour_type,
        company_name=company_name
    )
    return JSONResponse(content=result)


# --- Travel Analyst Crew Endpoints ---

@app.post("/agents/crew/analyze")
async def analyze_itineraries(request: ItineraryAnalysisRequest):
    """
    Analyze itineraries using the AI agent crew
    
    This uses CrewAI with multiple specialized agents:
    - Document Analyst: Extracts structured data
    - Market Researcher: Provides market context  
    - Strategic Advisor: Generates recommendations
    
    Note: This can take 5-10 minutes for complex analyses with multiple agents.
    """
    import time
    start_time = time.time()
    
    crew = get_travel_crew()
    if not crew or not crew.available:
        raise HTTPException(
            status_code=503,
            detail="Travel Analyst Crew not available. Ensure OPENAI_API_KEY is set."
        )
    
    print(f"🚀 Starting CrewAI analysis for {len(request.itineraries)} itinerary(ies)...")
    
    # Get optional context
    web_context = None
    user_context = None
    
    if request.include_web_search:
        print("🌐 Fetching web search context...")
        web_agent = get_web_search_agent()
        if web_agent and web_agent.available:
            # Search for relevant market info
            destinations = []
            for it in request.itineraries:
                content = it.get("content", "")
                # Simple destination extraction (could be improved)
                if "japan" in content.lower():
                    destinations.append("Japan")
                elif "korea" in content.lower():
                    destinations.append("Korea")
                elif "vietnam" in content.lower():
                    destinations.append("Vietnam")
                elif "thailand" in content.lower():
                    destinations.append("Thailand")
            
            if destinations:
                try:
                    search_result = web_agent.search_travel_prices(
                        destination=destinations[0],
                        travel_type="tour package"
                    )
                    web_context = web_agent.get_search_summary(search_result)
                    print(f"✅ Web search completed for {destinations[0]}")
                except Exception as e:
                    print(f"⚠️ Web search failed: {e}")
    
    # Get user context from memory
    memory_agent = get_memory_agent()
    if memory_agent:
        try:
            user_context = memory_agent.get_user_context(
                user_id=request.user_id,
                query="travel preferences budget style"
            )
        except Exception as e:
            print(f"⚠️ Memory context retrieval failed: {e}")
    
    # Run crew analysis
    print("🤖 Running CrewAI multi-agent analysis...")
    try:
        result = crew.analyze_itineraries(
            itineraries=request.itineraries,
            analysis_focus=request.analysis_focus,
            web_context=web_context,
            user_context=user_context
        )
        
        elapsed = time.time() - start_time
        print(f"✅ CrewAI analysis completed in {elapsed:.1f}s")
        
        # Save analysis to memory
        if result.get("success") and memory_agent:
            for it in request.itineraries:
                try:
                    memory_agent.remember_analysis_result(
                        user_id=request.user_id,
                        itinerary_name=it.get("name", "Unknown"),
                        summary=f"Analyzed with focus: {request.analysis_focus}"
                    )
                except Exception as e:
                    print(f"⚠️ Failed to save to memory: {e}")
        
        return JSONResponse(content=result)
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ CrewAI analysis failed after {elapsed:.1f}s: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )


@app.get("/agents/crew/status")
async def crew_status():
    """Get detailed status of the Travel Analyst Crew"""
    crew = get_travel_crew()
    if not crew:
        return {"available": False, "reason": "CrewAI not installed"}
    
    return crew.get_status()


# --- Smart Product Launch Agent Endpoints ---

@app.post("/agents/product-launch/analyze")
async def analyze_product_launch(request: ProductAnalysisRequest):
    """
    Analyze product for market positioning and USPs
    
    Uses the Smart Product Launch Agent to:
    - Assess market positioning
    - Identify unique selling propositions
    - Evaluate competitive advantages
    - Provide strategic recommendations
    """
    agent = get_product_launch_agent()
    if not agent or not agent.available:
        raise HTTPException(
            status_code=503,
            detail="Smart Product Launch Agent not available. Ensure OPENAI_API_KEY is set."
        )
    
    # Get market context from web search if available
    market_context = request.market_context
    if not market_context:
        web_agent = get_web_search_agent()
        if web_agent and web_agent.available:
            destinations = request.itinerary_data.get("destinations", [])
            if destinations:
                search_result = web_agent.search_travel_prices(
                    destination=destinations[0] if destinations else "",
                    travel_type="tour package"
                )
                market_context = web_agent.get_search_summary(search_result)
    
    result = agent.analyze_product(
        itinerary_data=request.itinerary_data,
        market_context=market_context,
        competitor_data=request.competitor_data
    )
    
    return JSONResponse(content=result)


# --- AI Consultant Agent Endpoints ---

@app.post("/agents/consultant/consult")
async def get_consultation(request: ConsultationRequest):
    """
    Get strategic consultation with persistent memory
    
    Uses the AI Consultant Agent to:
    - Synthesize insights across multiple analyses
    - Identify long-term trends
    - Provide strategic recommendations
    - Leverage historical context from memory
    """
    agent = get_consultant_agent()
    if not agent or not agent.available:
        raise HTTPException(
            status_code=503,
            detail="AI Consultant Agent not available. Ensure OPENAI_API_KEY is set."
        )
    
    result = agent.provide_consultation(
        current_analyses=request.current_analyses,
        user_id=request.user_id,
        focus_areas=request.focus_areas
    )
    
    return JSONResponse(content=result)


@app.get("/agents/consultant/status")
async def consultant_status():
    """Get detailed status of the AI Consultant Agent"""
    agent = get_consultant_agent()
    if not agent:
        return {"available": False, "reason": "CrewAI not installed"}
    
    return agent.get_status()


# --- Agentic Web Research Endpoint ---

class WebResearchRequest(BaseModel):
    itinerary_data: dict  # Analyzed itinerary data
    mode: str = "fast"  # "full" for complete crew analysis, "fast" for quick search
    max_results: int = 5

@app.post("/agents/research/web-packages")
async def research_web_packages(request: WebResearchRequest):
    """
    Find comparable tour packages using agentic web research.
    
    This endpoint uses AI agents to:
    1. Generate effective search queries based on the itinerary
    2. Search the web for similar packages
    3. Extract and structure the found packages
    
    Args:
        itinerary_data: Analyzed itinerary with destinations, duration, etc.
        mode: "fast" for quick EXA search, "full" for complete CrewAI analysis
        max_results: Maximum packages to return
    
    Returns:
        List of comparable packages found online
    """
    import time
    start_time = time.time()
    
    # Get search agent
    web_agent = get_web_search_agent()
    
    # Extract key info from itinerary
    destinations = request.itinerary_data.get("destinations", [])
    duration = request.itinerary_data.get("duration", "")
    tour_name = request.itinerary_data.get("tourName", "")
    
    if not destinations:
        return JSONResponse(content={
            "success": False,
            "error": "No destinations found in itinerary data",
            "found_packages": []
        })
    
    main_destination = destinations[0] if destinations else ""
    
    # Build search queries
    queries = [
        f"{main_destination} tour package {duration} 2025",
        f"{main_destination} travel itinerary price inclusions",
    ]
    
    if len(destinations) > 1:
        queries.append(f"{' '.join(destinations[:3])} multi-city tour package")
    
    print(f"🔍 Web research for: {main_destination} ({request.mode} mode)")
    
    found_packages = []
    queries_used = []
    
    try:
        if request.mode == "fast" and web_agent and web_agent.available:
            # Fast mode: Use EXA directly
            for query in queries[:2]:
                queries_used.append(query)
                result = web_agent.search(query, num_results=3)
                
                if result.get("success"):
                    for item in result.get("results", []):
                        # Extract package info
                        pkg = {
                            "name": item.get("title", "Found Package"),
                            "operator": None,
                            "destinations": destinations,
                            "duration": duration,
                            "price_range": None,
                            "currency": None,
                            "inclusions": [],
                            "exclusions": [],
                            "highlights": [item.get("text", "")[:300] if item.get("text") else ""],
                            "source_url": item.get("url", ""),
                            "confidence": "medium"
                        }
                        
                        # Try to extract price from text
                        import re
                        text = item.get("text", "")
                        price_match = re.search(r'(\d{1,3}(?:,\d{3})*)\s*(?:บาท|THB|USD|\$)', text, re.IGNORECASE)
                        if price_match:
                            pkg["price_range"] = price_match.group(1)
                            pkg["currency"] = "THB" if "บาท" in text or "THB" in text else "USD"
                        
                        found_packages.append(pkg)
                        
                        if len(found_packages) >= request.max_results:
                            break
                
                if len(found_packages) >= request.max_results:
                    break
        
        elif request.mode == "full":
            # Full mode: Use CrewAI crew
            crew = get_travel_crew()
            if crew and crew.available:
                print("🤖 Running full CrewAI analysis...")
                crew_result = crew.analyze_itineraries(
                    itineraries=[{
                        "name": tour_name or "Primary",
                        "content": str(request.itinerary_data)
                    }],
                    analysis_focus="competitive"
                )
                # Extract any web packages from crew result
                if crew_result.get("success"):
                    # The crew might return insights that we can use
                    queries_used.append("CrewAI multi-agent analysis")
        
        else:
            # Fallback to basic search
            if web_agent and web_agent.available:
                query = f"{main_destination} tour package"
                queries_used.append(query)
                result = web_agent.search(query, num_results=request.max_results)
                
                if result.get("success"):
                    for item in result.get("results", []):
                        found_packages.append({
                            "name": item.get("title", "Found Package"),
                            "operator": None,
                            "destinations": destinations,
                            "duration": duration,
                            "price_range": None,
                            "currency": None,
                            "inclusions": [],
                            "exclusions": [],
                            "highlights": [item.get("text", "")[:300] if item.get("text") else ""],
                            "source_url": item.get("url", ""),
                            "confidence": "low"
                        })
        
        elapsed = time.time() - start_time
        print(f"✅ Found {len(found_packages)} packages in {elapsed:.1f}s")
        
        return JSONResponse(content={
            "success": True,
            "found_packages": found_packages[:request.max_results],
            "search_summary": {
                "queries_used": queries_used,
                "total_found": len(found_packages),
                "timestamp": datetime.now().isoformat() if 'datetime' in dir() else None,
                "mode": request.mode
            },
            "elapsed_seconds": elapsed
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Web research failed: {e}")
        traceback.print_exc()
        return JSONResponse(content={
            "success": False,
            "error": str(e),
            "found_packages": []
        })


# ==========================================
# MARKET INTELLIGENCE PIPELINE
# ==========================================
# Flow: Extract → Vectorize → Analyze Themes → Web Search → Aggregate → Report

class MarketIntelligenceRequest(BaseModel):
    """Request for comprehensive market intelligence analysis"""
    documents: List[dict]  # [{"name": "...", "text": "..."}]
    user_id: str = "default"
    include_web_research: bool = True
    max_web_results: int = 5  # Reduced default for speed
    generate_report: bool = True
    fast_mode: bool = True  # Use fast mode by default for speed

class MarketIntelligenceResponse(BaseModel):
    """Response from market intelligence pipeline"""
    success: bool
    pipeline_steps: dict
    dominant_themes: dict
    web_research: dict
    knowledge_graph_update: dict
    final_report: str
    elapsed_seconds: float

@app.post("/agents/market-intelligence")
async def market_intelligence_pipeline(request: MarketIntelligenceRequest):
    """
    Comprehensive Market Intelligence Pipeline
    
    This endpoint orchestrates the full RAG-based analysis flow:
    
    1. EXTRACT: Parse and clean document text
    2. VECTORIZE: Store documents in vector DB (via frontend's ArangoDB)
    3. ANALYZE: Identify dominant cities, themes, and product patterns
    4. WEB SEARCH: Find competitor products for the dominant themes
    5. AGGREGATE: Combine findings into knowledge graph
    6. REPORT: Generate comprehensive market intelligence report
    
    Args:
        documents: List of documents with name and text
        user_id: User identifier for personalization
        include_web_research: Whether to search web for competitors
        max_web_results: Maximum web search results
        generate_report: Whether to generate final report
    
    Returns:
        Complete market intelligence analysis with report
    """
    import time
    import json
    from collections import Counter
    
    start_time = time.time()
    
    pipeline_steps = {
        "extract": {"status": "pending", "details": {}},
        "analyze_themes": {"status": "pending", "details": {}},
        "web_research": {"status": "pending", "details": {}},
        "aggregate": {"status": "pending", "details": {}},
        "report": {"status": "pending", "details": {}}
    }
    
    print(f"\n{'='*60}")
    print(f"🧠 MARKET INTELLIGENCE PIPELINE")
    print(f"📄 Documents: {len(request.documents)}")
    print(f"{'='*60}\n")
    
    # ============================================
    # STEP 1: EXTRACT - Validate and clean documents
    # ============================================
    print("📝 Step 1: Extract & Validate Documents...")
    
    valid_documents = []
    total_chars = 0
    
    for doc in request.documents:
        text = doc.get("text", "")
        name = doc.get("name", "Unknown")
        
        if text and len(text.strip()) > 50:
            cleaned_text = clean_text(text)
            valid_documents.append({
                "name": name,
                "text": cleaned_text,
                "char_count": len(cleaned_text)
            })
            total_chars += len(cleaned_text)
    
    pipeline_steps["extract"] = {
        "status": "completed",
        "details": {
            "input_documents": len(request.documents),
            "valid_documents": len(valid_documents),
            "total_characters": total_chars
        }
    }
    print(f"   ✅ Extracted {len(valid_documents)} valid documents ({total_chars:,} chars)")
    
    if not valid_documents:
        return JSONResponse(content={
            "success": False,
            "error": "No valid documents to analyze",
            "pipeline_steps": pipeline_steps,
            "dominant_themes": {},
            "web_research": {},
            "knowledge_graph_update": {},
            "final_report": "",
            "elapsed_seconds": time.time() - start_time
        })
    
    # ============================================
    # STEP 2: ANALYZE - Extract themes, cities, and patterns
    # ============================================
    print("\n🔍 Step 2: Analyze Themes & Patterns...")
    
    # Use OpenAI to extract structured information
    openai_api_key = os.getenv("OPENAI_API_KEY")
    
    dominant_themes = {
        "destinations": Counter(),
        "themes": Counter(),
        "duration_patterns": Counter(),
        "price_ranges": Counter(),
        "activities": Counter()
    }
    
    all_extracted_data = []
    
    # OPTIMIZATION: Limit documents analyzed for speed
    max_docs_to_analyze = 10 if request.fast_mode else 50
    docs_to_analyze = valid_documents[:max_docs_to_analyze]
    
    if len(valid_documents) > max_docs_to_analyze:
        print(f"   ⚡ Fast mode: Analyzing {max_docs_to_analyze} of {len(valid_documents)} documents")
    
    if openai_api_key:
        import httpx
        import asyncio
        
        # OPTIMIZATION: Parallel document analysis
        async def analyze_single_doc(doc: dict, client: httpx.AsyncClient) -> dict:
            """Analyze a single document - for parallel processing"""
            # Use shorter text for faster processing
            text_limit = 2000 if request.fast_mode else 4000
            extraction_prompt = f"""Analyze this travel itinerary and extract JSON:
Document: {doc['name']}
Content: {doc['text'][:text_limit]}

Return JSON: {{"destinations": ["cities"], "themes": ["beach/adventure/cultural/luxury/budget/family/honeymoon"], "duration": "X days Y nights", "price_range": "price or null", "activities": ["key activities"], "target_audience": "who"}}"""

            try:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": extraction_prompt}],
                        "temperature": 0,
                        "response_format": {"type": "json_object"}
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    extracted = json.loads(result["choices"][0]["message"]["content"])
                    extracted["document_name"] = doc["name"]
                    return extracted
            except Exception as e:
                print(f"   ⚠️ Failed to analyze {doc['name']}: {e}")
            return None
        
        # Run parallel analysis
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [analyze_single_doc(doc, client) for doc in docs_to_analyze]
            results = await asyncio.gather(*tasks)
            
            for extracted in results:
                if extracted:
                    all_extracted_data.append(extracted)
                    # Aggregate themes
                    for dest in extracted.get("destinations", []):
                        dominant_themes["destinations"][dest.strip()] += 1
                    for theme in extracted.get("themes", []):
                        dominant_themes["themes"][theme.strip().lower()] += 1
                    if extracted.get("duration"):
                        dominant_themes["duration_patterns"][extracted["duration"]] += 1
                    for activity in extracted.get("activities", []):
                        dominant_themes["activities"][activity.strip()] += 1
        
        print(f"   ✅ Analyzed {len(all_extracted_data)} documents in parallel")
    
    # Get top themes
    top_destinations = dominant_themes["destinations"].most_common(5)
    top_themes = dominant_themes["themes"].most_common(5)
    top_activities = dominant_themes["activities"].most_common(10)
    
    # Determine the dominant destination and theme
    main_destination = top_destinations[0][0] if top_destinations else "Unknown"
    main_theme = top_themes[0][0] if top_themes else "general"
    
    pipeline_steps["analyze_themes"] = {
        "status": "completed",
        "details": {
            "documents_analyzed": len(all_extracted_data),
            "main_destination": main_destination,
            "main_theme": main_theme,
            "top_destinations": dict(top_destinations),
            "top_themes": dict(top_themes)
        }
    }
    
    print(f"   ✅ Main Destination: {main_destination}")
    print(f"   ✅ Main Theme: {main_theme}")
    print(f"   ✅ Top destinations: {[d[0] for d in top_destinations[:3]]}")
    
    # ============================================
    # STEP 3: WEB SEARCH - Find competitor products
    # ============================================
    web_research_results = {
        "queries_executed": [],
        "packages_found": [],
        "prices_found": [],
        "competitors_found": []
    }
    
    if request.include_web_research:
        print(f"\n🌐 Step 3: Web Research for '{main_destination}' {main_theme} tours...")
        
        web_agent = get_web_search_agent()
        
        if web_agent and web_agent.available:
            # Build targeted search queries based on dominant themes
            search_queries = [
                f"{main_destination} {main_theme} tour package 2025",
                f"{main_destination} travel itinerary price comparison",
                f"best {main_destination} tour operators reviews"
            ]
            
            if len(top_destinations) > 1:
                second_dest = top_destinations[1][0]
                search_queries.append(f"{main_destination} {second_dest} multi-city tour")
            
            for query in search_queries[:3]:  # Limit to 3 queries
                try:
                    print(f"   🔍 Searching: {query[:50]}...")
                    result = web_agent.search(query, num_results=request.max_web_results // 3)
                    
                    if result.get("success"):
                        web_research_results["queries_executed"].append(query)
                        
                        for item in result.get("results", []):
                            package_info = {
                                "title": item.get("title", ""),
                                "url": item.get("url", ""),
                                "snippet": item.get("text", "")[:500] if item.get("text") else "",
                                "source_query": query
                            }
                            
                            # Extract price if mentioned
                            text = item.get("text", "")
                            price_patterns = [
                                r'(\d{1,3}(?:,\d{3})*)\s*(?:บาท|THB)',
                                r'\$\s*(\d{1,3}(?:,\d{3})*)',
                                r'(\d{1,3}(?:,\d{3})*)\s*USD'
                            ]
                            for pattern in price_patterns:
                                match = re.search(pattern, text, re.IGNORECASE)
                                if match:
                                    package_info["price_found"] = match.group(0)
                                    web_research_results["prices_found"].append({
                                        "price": match.group(0),
                                        "source": item.get("url", "")
                                    })
                                    break
                            
                            web_research_results["packages_found"].append(package_info)
                            
                except Exception as e:
                    print(f"   ⚠️ Search failed: {e}")
            
            print(f"   ✅ Found {len(web_research_results['packages_found'])} packages from web")
        else:
            print("   ⚠️ Web search agent not available")
    
    pipeline_steps["web_research"] = {
        "status": "completed" if web_research_results["packages_found"] else "skipped",
        "details": {
            "queries_executed": len(web_research_results["queries_executed"]),
            "packages_found": len(web_research_results["packages_found"]),
            "prices_found": len(web_research_results["prices_found"])
        }
    }
    
    # ============================================
    # STEP 4: AGGREGATE - Combine into knowledge structure
    # ============================================
    print("\n📊 Step 4: Aggregate Knowledge...")
    
    knowledge_graph_update = {
        "entities_created": [],
        "relationships_created": [],
        "vectors_stored": 0
    }
    
    # Create entity structure for the knowledge graph
    # (This will be sent to frontend to store in ArangoDB)
    
    # Main destination entity
    destination_entity = {
        "type": "destination",
        "name": main_destination,
        "properties": {
            "total_products": len(valid_documents),
            "themes": [t[0] for t in top_themes[:5]],
            "activities": [a[0] for a in top_activities[:10]],
            "web_packages_found": len(web_research_results["packages_found"])
        }
    }
    knowledge_graph_update["entities_created"].append(destination_entity)
    
    # Product entities from documents
    for data in all_extracted_data:
        product_entity = {
            "type": "product",
            "name": data.get("document_name", "Unknown"),
            "properties": {
                "destinations": data.get("destinations", []),
                "themes": data.get("themes", []),
                "duration": data.get("duration"),
                "target_audience": data.get("target_audience")
            }
        }
        knowledge_graph_update["entities_created"].append(product_entity)
        
        # Create relationships
        for dest in data.get("destinations", []):
            knowledge_graph_update["relationships_created"].append({
                "from": data.get("document_name"),
                "to": dest,
                "type": "visits"
            })
    
    # Web competitor entities
    for pkg in web_research_results["packages_found"][:5]:
        competitor_entity = {
            "type": "competitor_product",
            "name": pkg.get("title", "Unknown"),
            "properties": {
                "url": pkg.get("url"),
                "price": pkg.get("price_found"),
                "snippet": pkg.get("snippet", "")[:200]
            }
        }
        knowledge_graph_update["entities_created"].append(competitor_entity)
    
    pipeline_steps["aggregate"] = {
        "status": "completed",
        "details": {
            "entities_created": len(knowledge_graph_update["entities_created"]),
            "relationships_created": len(knowledge_graph_update["relationships_created"])
        }
    }
    
    print(f"   ✅ Created {len(knowledge_graph_update['entities_created'])} entities")
    print(f"   ✅ Created {len(knowledge_graph_update['relationships_created'])} relationships")
    
    # ============================================
    # STEP 5: REPORT - Generate comprehensive report
    # ============================================
    final_report = ""
    
    if request.generate_report and openai_api_key:
        print("\n📝 Step 5: Generate Market Intelligence Report...")
        
        # Prepare context for report generation
        report_context = f"""
## Market Intelligence Analysis Summary

### Documents Analyzed
- Total documents: {len(valid_documents)}
- Main destination: {main_destination}
- Main theme: {main_theme}

### Destination Distribution
{json.dumps(dict(top_destinations), indent=2)}

### Theme Distribution
{json.dumps(dict(top_themes), indent=2)}

### Popular Activities
{json.dumps(dict(top_activities[:10]), indent=2)}

### Web Research Findings
- Competitor packages found: {len(web_research_results['packages_found'])}
- Price points discovered: {len(web_research_results['prices_found'])}

### Sample Competitor Products:
{json.dumps(web_research_results['packages_found'][:5], indent=2, default=str)}

### Price Data Found:
{json.dumps(web_research_results['prices_found'][:10], indent=2, default=str)}
"""

        report_prompt = f"""Based on this market intelligence data, generate a comprehensive strategic report for a travel business.

{report_context}

Generate a professional market intelligence report with these sections:

1. **Executive Summary** - Key findings in 3-4 bullet points
2. **Market Overview** - Analysis of the {main_destination} {main_theme} market
3. **Product Portfolio Analysis** - Insights from the analyzed documents
4. **Competitive Landscape** - What competitors are offering based on web research
5. **Pricing Intelligence** - Price trends and positioning opportunities
6. **Strategic Recommendations** - 3-5 actionable recommendations
7. **Opportunities & Threats** - SWOT-style analysis

Make it actionable and data-driven. Use specific numbers from the data provided."""

        try:
            import httpx
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": report_prompt}],
                        "temperature": 0.7,
                        "max_tokens": 2000
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    final_report = result["choices"][0]["message"]["content"]
                    print(f"   ✅ Generated report ({len(final_report)} chars)")
                else:
                    print(f"   ⚠️ Report generation failed: {response.status_code}")
                    
        except Exception as e:
            print(f"   ⚠️ Report generation error: {e}")
    
    pipeline_steps["report"] = {
        "status": "completed" if final_report else "skipped",
        "details": {
            "report_length": len(final_report),
            "sections_generated": final_report.count("**") // 2 if final_report else 0
        }
    }
    
    # ============================================
    # COMPLETE - Return results
    # ============================================
    elapsed = time.time() - start_time
    
    print(f"\n{'='*60}")
    print(f"✅ PIPELINE COMPLETE in {elapsed:.1f}s")
    print(f"{'='*60}\n")
    
    # Store in memory for future reference
    memory_agent = get_memory_agent()
    if memory_agent:
        try:
            memory_agent.add_memory(
                content=f"Market intelligence analysis: {main_destination} {main_theme} tours. "
                        f"Analyzed {len(valid_documents)} documents, found {len(web_research_results['packages_found'])} competitor packages.",
                user_id=request.user_id,
                memory_type="analysis"
            )
        except Exception as e:
            print(f"⚠️ Failed to store in memory: {e}")
    
    return JSONResponse(content={
        "success": True,
        "pipeline_steps": pipeline_steps,
        "dominant_themes": {
            "main_destination": main_destination,
            "main_theme": main_theme,
            "top_destinations": dict(top_destinations),
            "top_themes": dict(top_themes),
            "top_activities": dict(top_activities[:10]),
            "extracted_data": all_extracted_data
        },
        "web_research": web_research_results,
        "knowledge_graph_update": knowledge_graph_update,
        "final_report": final_report,
        "elapsed_seconds": elapsed
    })


# ==========================================
# AGENT SKILLS ENDPOINTS
# ==========================================
# Based on: https://github.com/Prat011/awesome-llm-skills

try:
    from agents.skills import AGENT_SKILLS, get_skills_for_task, SkillExecutor
    SKILLS_AVAILABLE = True
except ImportError:
    SKILLS_AVAILABLE = False
    print("⚠️ Agent Skills system not available")

@app.get("/agents/skills")
async def list_skills():
    """List all available agent skills"""
    if not SKILLS_AVAILABLE:
        return {"skills": [], "available": False}
    
    skills_list = [
        {
            "id": skill.id,
            "name": skill.name,
            "description": skill.description,
            "category": skill.category.value,
            "triggers": skill.triggers,
            "output_format": skill.output_format
        }
        for skill in AGENT_SKILLS.values()
    ]
    
    return {"skills": skills_list, "available": True, "count": len(skills_list)}

class SkillExecutionRequest(BaseModel):
    """Request for skill-based task execution"""
    task: str
    skill_ids: List[str] = None  # Optional - auto-select if not provided
    context: str = ""

@app.post("/agents/skills/execute")
async def execute_with_skills(request: SkillExecutionRequest):
    """Execute a task using equipped skills"""
    if not SKILLS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Skills system not available")
    
    try:
        executor = SkillExecutor()
        result = await executor.execute_with_skills(
            task=request.task,
            skill_ids=request.skill_ids,
            context=request.context
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agents/skills/match")
async def match_skills_to_task(task: str):
    """Find which skills best match a task"""
    if not SKILLS_AVAILABLE:
        return {"matches": [], "available": False}
    
    matched = get_skills_for_task(task, threshold=0.1)
    return {
        "matches": [
            {
                "id": s.id,
                "name": s.name,
                "match_score": s.matches_task(task),
                "description": s.description
            }
            for s in matched[:5]
        ]
    }


# ==========================================
# WIDE RESEARCH ENDPOINTS
# ==========================================
# Parallel multi-agent processing for large-scale tasks

try:
    from agents.wide_research import WideResearch, research_companies, analyze_products
    WIDE_RESEARCH_AVAILABLE = True
except ImportError:
    WIDE_RESEARCH_AVAILABLE = False
    print("⚠️ Wide Research system not available")

class WideResearchRequest(BaseModel):
    """Request for Wide Research parallel processing"""
    items: List[dict]  # Items to process
    instruction: str   # What to do with each item
    system_prompt: str = ""  # Optional context for all agents
    synthesis_prompt: str = None  # How to combine results
    max_concurrent: int = 10  # Max parallel agents

@app.post("/agents/wide-research")
async def execute_wide_research(request: WideResearchRequest):
    """
    Execute Wide Research - Parallel processing for large-scale tasks.
    
    Each item is processed by an independent agent with its own context window.
    Item #100 receives the same quality analysis as item #1.
    
    Use cases:
    - Research 100+ companies
    - Analyze 50+ products
    - Compare 200+ tour packages
    - Generate content for 30+ topics
    """
    if not WIDE_RESEARCH_AVAILABLE:
        raise HTTPException(status_code=503, detail="Wide Research not available")
    
    try:
        wr = WideResearch(max_concurrent=request.max_concurrent)
        result = await wr.execute(
            items=request.items,
            instruction=request.instruction,
            system_prompt=request.system_prompt,
            synthesis_prompt=request.synthesis_prompt
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class WideProductResearchRequest(BaseModel):
    """Request for wide product/tour research"""
    destinations: List[str]  # Destinations to research
    product_type: str = "tour packages"  # What to search for
    max_results_per_destination: int = 5
    max_concurrent: int = 5

@app.post("/agents/wide-research/products")
async def wide_product_research(request: WideProductResearchRequest):
    """
    Research products/tours across multiple destinations in parallel.
    
    Example: Research tour packages for 20 destinations simultaneously.
    Each destination gets thorough, independent research.
    """
    if not WIDE_RESEARCH_AVAILABLE:
        raise HTTPException(status_code=503, detail="Wide Research not available")
    
    try:
        # Get web search agent
        web_agent = get_web_search_agent()
        
        async def research_destination(dest: str) -> dict:
            """Research a single destination"""
            query = f"{dest} {request.product_type} 2025"
            results = {"destination": dest, "products": [], "error": None}
            
            if web_agent and web_agent.available:
                search_result = web_agent.search(query, num_results=request.max_results_per_destination)
                if search_result.get("success"):
                    for item in search_result.get("results", []):
                        results["products"].append({
                            "title": item.get("title"),
                            "url": item.get("url"),
                            "snippet": item.get("text", "")[:300],
                            "source": "web_search"
                        })
            
            return results
        
        # Process all destinations in parallel
        import asyncio
        tasks = [research_destination(dest) for dest in request.destinations]
        all_results = await asyncio.gather(*tasks)
        
        # Aggregate results
        total_products = sum(len(r["products"]) for r in all_results)
        
        return {
            "success": True,
            "total_destinations": len(request.destinations),
            "total_products_found": total_products,
            "results": all_results,
            "product_type": request.product_type
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# COMBINED: Skills + Wide Research for Travel
# ==========================================

class TravelWideResearchRequest(BaseModel):
    """Combined skills + wide research for travel analysis"""
    documents: List[dict]  # Uploaded documents
    research_type: str = "competitive"  # competitive, market, trend
    include_web_research: bool = True
    max_concurrent: int = 5

@app.post("/agents/travel-wide-research")
async def travel_wide_research(request: TravelWideResearchRequest):
    """
    Combined Travel Wide Research:
    1. Extract themes from documents using skills
    2. Wide Research competitor products in parallel
    3. Synthesize comprehensive market report
    """
    import time
    start_time = time.time()
    
    results = {
        "document_analysis": [],
        "web_research": [],
        "synthesis": "",
        "success": True
    }
    
    try:
        # Step 1: Analyze each document in parallel (if Wide Research available)
        if WIDE_RESEARCH_AVAILABLE and request.documents:
            wr = WideResearch(max_concurrent=request.max_concurrent)
            
            doc_analysis = await wr.execute(
                items=request.documents,
                instruction="""Analyze this travel document and extract:
- Destinations mentioned
- Duration (days/nights)
- Price range
- Key activities/highlights
- Target audience
- Unique selling points

Return as JSON format.""",
                synthesis_prompt="""Aggregate all document analyses into:
1. Top destinations by frequency
2. Common price ranges
3. Popular activities
4. Market segments identified"""
            )
            
            results["document_analysis"] = doc_analysis.get("results", [])
            results["document_synthesis"] = doc_analysis.get("synthesis", "")
        
        # Step 2: Extract top destinations for web research
        destinations_found = set()
        for doc_result in results.get("document_analysis", []):
            if doc_result.get("result"):
                # Parse JSON from result
                try:
                    import json
                    parsed = json.loads(doc_result["result"])
                    if isinstance(parsed.get("destinations"), list):
                        destinations_found.update(parsed["destinations"])
                except:
                    # Extract destinations using simple regex
                    import re
                    found = re.findall(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*', doc_result["result"])
                    destinations_found.update(found[:3])
        
        # Step 3: Wide web research for competitor products
        if request.include_web_research and destinations_found:
            destinations_list = list(destinations_found)[:10]  # Limit to top 10
            
            web_items = [
                {"destination": dest, "query": f"{dest} tour packages 2025 price"}
                for dest in destinations_list
            ]
            
            if WIDE_RESEARCH_AVAILABLE:
                web_research = await wr.execute(
                    items=web_items,
                    instruction="""For this destination, search and find:
- Top 5 tour packages available
- Price ranges
- Popular tour operators
- Best time to visit
- Trending activities

Be specific and factual.""",
                    synthesis_prompt="""Create a competitive market analysis:
1. Price comparison table by destination
2. Top tour operators identified
3. Market gaps and opportunities
4. Recommended positioning strategy"""
                )
                
                results["web_research"] = web_research.get("results", [])
                results["market_synthesis"] = web_research.get("synthesis", "")
        
        results["elapsed_seconds"] = time.time() - start_time
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        results["success"] = False
        results["error"] = str(e)
        results["elapsed_seconds"] = time.time() - start_time
        return results


# ==========================================
# TRANSLATION ENDPOINT
# ==========================================

class TranslationRequest(BaseModel):
    """Request for text translation"""
    text: str
    target_language: str = "Thai"  # Thai or English

@app.post("/translate")
async def translate_text(request: TranslationRequest):
    """
    Translate text between English and Thai using AI.
    """
    import httpx
    
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(status_code=503, detail="Translation service not available")
    
    # Detect source language
    thai_chars = len(re.findall(r'[\u0E00-\u0E7F]', request.text))
    latin_chars = len(re.findall(r'[a-zA-Z]', request.text))
    source_language = "Thai" if thai_chars > latin_chars else "English"
    
    # Skip if already in target language
    if source_language == request.target_language:
        return {
            "translated_text": request.text,
            "source_language": source_language,
            "target_language": request.target_language
        }
    
    prompt = f"""Translate the following text to {request.target_language}.
Preserve all markdown formatting, numbers, technical terms, and structure.
Only translate - do not add or remove any content.

Text to translate:
{request.text}"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                translated = result["choices"][0]["message"]["content"]
                return {
                    "translated_text": translated,
                    "source_language": source_language,
                    "target_language": request.target_language
                }
            else:
                raise HTTPException(status_code=500, detail="Translation API error")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# LANGGRAPH ORCHESTRATOR ENDPOINT
# ==========================================

try:
    from agents.langgraph_orchestrator import LangGraphOrchestrator, run_langgraph_analysis
    LANGGRAPH_AVAILABLE = True
except ImportError as e:
    LANGGRAPH_AVAILABLE = False
    print(f"⚠️ LangGraph orchestrator not available: {e}")

class LangGraphRequest(BaseModel):
    """Request for LangGraph analysis"""
    documents: List[dict]
    language: str = "English"
    skip_web_research: bool = False

@app.post("/agents/langgraph/analyze")
async def langgraph_analyze(request: LangGraphRequest):
    """
    Run analysis using LangGraph orchestrator.
    
    Provides better state management and agent coordination than CrewAI.
    Graph: Extractor → Analyzer → Web Researcher → Synthesizer → Translator
    """
    if not LANGGRAPH_AVAILABLE:
        raise HTTPException(status_code=503, detail="LangGraph not available")
    
    try:
        orchestrator = LangGraphOrchestrator()
        result = await orchestrator.run(
            documents=request.documents,
            language=request.language,
            skip_web_research=request.skip_web_research
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)

