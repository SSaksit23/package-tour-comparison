"""
Travel Itinerary Intelligence Platform - Backend API
FastAPI application for itinerary analysis, RAG, and multi-agent orchestration
"""

import os
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import fitz  # PyMuPDF

# Import agents (with graceful fallback)
try:
    from agents.travel_analyst_crew import TravelAnalystCrew
    from agents.web_search_agent import WebSearchAgent
    from agents.product_launch_agent import SmartProductLaunchAgent
    from agents.consultant_agent import AIConsultantAgent
    from agents.memory_agent import MemoryAgent
    AGENTS_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Agents not fully available: {e}")
    AGENTS_AVAILABLE = False
    TravelAnalystCrew = None
    WebSearchAgent = None
    SmartProductLaunchAgent = None
    AIConsultantAgent = None
    MemoryAgent = None

# Import services
try:
    from services.rag_service import HybridRAGService
    from services.file_parser import FileParserService
    RAG_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ RAG service not available: {e}")
    RAG_AVAILABLE = False
    HybridRAGService = None
    FileParserService = None

app = FastAPI(
    title="Travel Itinerary Intelligence Platform",
    description="AI-powered itinerary analysis with Hybrid RAG and multi-agent system",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services (lazy loading)
_travel_crew = None
_web_search_agent = None
_product_launch_agent = None
_consultant_agent = None
_memory_agent = None
_rag_service = None
_file_parser = None

def get_travel_crew():
    global _travel_crew
    if _travel_crew is None and TravelAnalystCrew:
        _travel_crew = TravelAnalystCrew()
    return _travel_crew

def get_web_search_agent():
    global _web_search_agent
    if _web_search_agent is None and WebSearchAgent:
        _web_search_agent = WebSearchAgent()
    return _web_search_agent

def get_rag_service():
    global _rag_service
    if _rag_service is None and HybridRAGService:
        _rag_service = HybridRAGService()
    return _rag_service

def get_file_parser():
    global _file_parser
    if _file_parser is None and FileParserService:
        _file_parser = FileParserService()
    return _file_parser

# Pydantic models
class ItineraryAnalysisRequest(BaseModel):
    itineraries: List[dict]  # [{"name": "...", "content": "..."}]
    analysis_focus: str = "competitive"
    include_web_search: bool = False
    user_id: str = "default"

class RAGQueryRequest(BaseModel):
    question: str
    chat_history: Optional[List[dict]] = []
    language: str = "English"

class IndexDocumentRequest(BaseModel):
    name: str
    text: str

# Health check
@app.get("/")
async def root():
    return {
        "service": "Travel Itinerary Intelligence Platform",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "agents_available": AGENTS_AVAILABLE,
        "rag_available": RAG_AVAILABLE
    }

# File extraction endpoints
@app.post("/api/extract")
async def extract_file(file: UploadFile = File(...)):
    """Extract text from uploaded PDF/DOCX/image file"""
    parser = get_file_parser()
    if not parser:
        raise HTTPException(status_code=503, detail="File parser not available")
    
    try:
        content = await file.read()
        result = await parser.parse_file(file.filename, content)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Analysis endpoints
@app.post("/api/analyze")
async def analyze_itineraries(request: ItineraryAnalysisRequest):
    """Analyze itineraries using multi-agent system"""
    crew = get_travel_crew()
    if not crew or not crew.available:
        raise HTTPException(
            status_code=503,
            detail="Travel Analyst Crew not available. Ensure OPENAI_API_KEY is set."
        )
    
    # Get optional web context
    web_context = None
    if request.include_web_search:
        web_agent = get_web_search_agent()
        if web_agent and web_agent.available:
            # Extract destinations for web search
            destinations = []
            for it in request.itineraries:
                content = it.get("content", "").lower()
                # Simple destination extraction (improve in production)
                for dest in ["japan", "korea", "vietnam", "thailand", "singapore"]:
                    if dest in content:
                        destinations.append(dest.title())
                        break
            
            if destinations:
                try:
                    search_result = web_agent.search_travel_prices(
                        destination=destinations[0],
                        travel_type="tour package"
                    )
                    web_context = web_agent.get_search_summary(search_result)
                except Exception as e:
                    print(f"⚠️ Web search failed: {e}")
    
    # Run crew analysis
    try:
        result = crew.analyze_itineraries(
            itineraries=request.itineraries,
            analysis_focus=request.analysis_focus,
            web_context=web_context
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# RAG endpoints
@app.post("/api/rag/query")
async def rag_query(request: RAGQueryRequest):
    """Query knowledge base with RAG"""
    rag_service = get_rag_service()
    if not rag_service or not rag_service.available:
        raise HTTPException(
            status_code=503,
            detail="RAG service not available. Ensure ChromaDB/ArangoDB is configured."
        )
    
    try:
        result = await rag_service.query(
            question=request.question,
            chat_history=request.chat_history,
            language=request.language
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/knowledge/index")
async def index_document(request: IndexDocumentRequest):
    """Index document to knowledge base"""
    rag_service = get_rag_service()
    if not rag_service or not rag_service.available:
        raise HTTPException(status_code=503, detail="RAG service not available")
    
    try:
        result = await rag_service.index_document(
            name=request.name,
            text=request.text
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Agent status endpoints
@app.get("/api/agents/status")
async def agents_status():
    """Get status of all AI agents"""
    crew = get_travel_crew()
    web_agent = get_web_search_agent()
    
    return {
        "agents_available": AGENTS_AVAILABLE,
        "travel_crew": crew.get_status() if crew else {"available": False},
        "web_search": {"available": web_agent.available if web_agent else False},
        "rag_service": {"available": get_rag_service().available if get_rag_service() else False}
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)





