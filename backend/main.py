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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)

