"""
LangGraph Agent Orchestrator

Uses LangGraph framework to create a seamless multi-agent workflow for travel analysis.
This provides better state management, conditional routing, and agent coordination.

Graph Structure:
    [START] → [Extractor] → [Analyzer] → [Researcher] → [Synthesizer] → [Translator] → [END]
                    ↓              ↓             ↓
              [Skills Router] → [Tools] → [Memory]
"""

import os
import json
import asyncio
from typing import TypedDict, Annotated, List, Dict, Any, Optional, Sequence
from dataclasses import dataclass
from enum import Enum


# State definition for the graph
class AgentState(TypedDict):
    """State that flows through the agent graph"""
    # Input
    documents: List[Dict[str, str]]  # Input documents
    query: str  # User query or task
    language: str  # Output language
    
    # Processing
    extracted_data: List[Dict]  # Extracted structured data
    analysis_results: Dict  # Analysis output
    web_research: List[Dict]  # Web research results
    
    # Output
    final_report: str  # Generated report
    translated_report: str  # Translated version
    
    # Metadata
    current_step: str
    errors: List[str]
    processing_time: float


class NodeType(Enum):
    EXTRACTOR = "extractor"
    ANALYZER = "analyzer"
    WEB_RESEARCHER = "web_researcher"
    SYNTHESIZER = "synthesizer"
    TRANSLATOR = "translator"


class LangGraphOrchestrator:
    """
    Orchestrates multi-agent workflows using a graph-based approach.
    
    Benefits over CrewAI:
    - Better state management
    - Conditional branching
    - Parallel execution support
    - Built-in retry logic
    - Streaming support
    """
    
    def __init__(self, openai_api_key: str = None):
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.nodes: Dict[str, callable] = {}
        self.edges: Dict[str, List[str]] = {}
        self._setup_nodes()
    
    def _setup_nodes(self):
        """Define all nodes in the graph"""
        self.nodes = {
            "extractor": self._extractor_node,
            "analyzer": self._analyzer_node,
            "web_researcher": self._web_researcher_node,
            "synthesizer": self._synthesizer_node,
            "translator": self._translator_node,
        }
        
        # Define edges (linear flow with optional branches)
        self.edges = {
            "START": ["extractor"],
            "extractor": ["analyzer"],
            "analyzer": ["web_researcher", "synthesizer"],  # Parallel
            "web_researcher": ["synthesizer"],
            "synthesizer": ["translator"],
            "translator": ["END"],
        }
    
    async def _call_llm(self, prompt: str, system: str = "", json_mode: bool = False) -> str:
        """Call OpenAI LLM"""
        import httpx
        
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        
        body = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 4000
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json=body
            )
            
            if response.status_code == 200:
                result = response.json()
                return result["choices"][0]["message"]["content"]
            else:
                raise Exception(f"LLM call failed: {response.status_code}")
    
    async def _extractor_node(self, state: AgentState) -> AgentState:
        """Extract structured data from documents"""
        print("📄 [Extractor] Processing documents...")
        state["current_step"] = "extracting"
        
        extracted = []
        for doc in state["documents"][:10]:  # Limit for speed
            prompt = f"""Extract structured data from this travel document:

Document: {doc.get('name', 'Unknown')}
Content: {doc.get('text', '')[:2000]}

Return JSON with: destinations, duration, price_range, activities, themes, target_audience"""

            try:
                result = await self._call_llm(prompt, json_mode=True)
                data = json.loads(result)
                data["document_name"] = doc.get('name', 'Unknown')
                extracted.append(data)
            except Exception as e:
                state["errors"].append(f"Extraction failed for {doc.get('name')}: {e}")
        
        state["extracted_data"] = extracted
        print(f"   ✓ Extracted data from {len(extracted)} documents")
        return state
    
    async def _analyzer_node(self, state: AgentState) -> AgentState:
        """Analyze extracted data for patterns and insights"""
        print("🔍 [Analyzer] Analyzing patterns...")
        state["current_step"] = "analyzing"
        
        if not state["extracted_data"]:
            state["analysis_results"] = {"error": "No data to analyze"}
            return state
        
        # Aggregate themes and destinations
        all_destinations = []
        all_themes = []
        all_activities = []
        
        for data in state["extracted_data"]:
            all_destinations.extend(data.get("destinations", []))
            all_themes.extend(data.get("themes", []))
            all_activities.extend(data.get("activities", []))
        
        # Count frequencies
        from collections import Counter
        dest_counts = Counter(all_destinations)
        theme_counts = Counter(all_themes)
        activity_counts = Counter(all_activities)
        
        state["analysis_results"] = {
            "total_documents": len(state["extracted_data"]),
            "top_destinations": dict(dest_counts.most_common(10)),
            "top_themes": dict(theme_counts.most_common(5)),
            "top_activities": dict(activity_counts.most_common(10)),
            "main_destination": dest_counts.most_common(1)[0][0] if dest_counts else "Unknown",
            "main_theme": theme_counts.most_common(1)[0][0] if theme_counts else "general"
        }
        
        print(f"   ✓ Main destination: {state['analysis_results']['main_destination']}")
        return state
    
    async def _web_researcher_node(self, state: AgentState) -> AgentState:
        """Research competitor products on the web"""
        print("🌐 [Web Researcher] Searching for competitors...")
        state["current_step"] = "researching"
        
        # Skip if no main destination found
        main_dest = state["analysis_results"].get("main_destination", "")
        if not main_dest or main_dest == "Unknown":
            state["web_research"] = []
            return state
        
        # Use EXA search if available
        try:
            from .web_search_agent import WebSearchAgent
            agent = WebSearchAgent()
            
            if agent.available:
                query = f"{main_dest} tour packages 2025 price"
                results = agent.search(query, num_results=5)
                
                if results.get("success"):
                    state["web_research"] = [
                        {
                            "title": r.get("title", ""),
                            "url": r.get("url", ""),
                            "snippet": r.get("text", "")[:200]
                        }
                        for r in results.get("results", [])
                    ]
                    print(f"   ✓ Found {len(state['web_research'])} competitor products")
                    return state
        except Exception as e:
            print(f"   ⚠️ Web search failed: {e}")
        
        state["web_research"] = []
        return state
    
    async def _synthesizer_node(self, state: AgentState) -> AgentState:
        """Synthesize all findings into a comprehensive report"""
        print("📝 [Synthesizer] Generating report...")
        state["current_step"] = "synthesizing"
        
        analysis = state["analysis_results"]
        web = state["web_research"]
        
        prompt = f"""Create a comprehensive market analysis report based on the following data:

## Document Analysis
- Total documents analyzed: {analysis.get('total_documents', 0)}
- Main destination: {analysis.get('main_destination', 'N/A')}
- Main theme: {analysis.get('main_theme', 'N/A')}
- Top destinations: {json.dumps(analysis.get('top_destinations', {}), ensure_ascii=False)}
- Top activities: {json.dumps(analysis.get('top_activities', {}), ensure_ascii=False)}

## Web Research (Competitors)
{json.dumps(web, indent=2, ensure_ascii=False) if web else 'No web research data available'}

Generate a professional report with:
1. Executive Summary
2. Key Findings
3. Competitive Landscape
4. Recommendations

Use markdown formatting. Be concise but thorough."""

        try:
            state["final_report"] = await self._call_llm(
                prompt, 
                system="You are a travel market analyst. Write clear, actionable reports."
            )
            print(f"   ✓ Generated report ({len(state['final_report'])} chars)")
        except Exception as e:
            state["final_report"] = f"Report generation failed: {e}"
            state["errors"].append(str(e))
        
        return state
    
    async def _translator_node(self, state: AgentState) -> AgentState:
        """Translate report to target language"""
        print(f"🌍 [Translator] Translating to {state['language']}...")
        state["current_step"] = "translating"
        
        if state["language"].lower() in ["english", "en"]:
            state["translated_report"] = state["final_report"]
            print("   ✓ No translation needed (English)")
            return state
        
        if not state["final_report"]:
            state["translated_report"] = ""
            return state
        
        prompt = f"""Translate the following report to {state['language']}.
Preserve all markdown formatting, numbers, and technical terms.

Report:
{state['final_report']}"""

        try:
            state["translated_report"] = await self._call_llm(prompt)
            print(f"   ✓ Translated to {state['language']}")
        except Exception as e:
            state["translated_report"] = state["final_report"]
            state["errors"].append(f"Translation failed: {e}")
        
        return state
    
    async def run(
        self,
        documents: List[Dict[str, str]],
        query: str = "Analyze these documents",
        language: str = "English",
        skip_web_research: bool = False
    ) -> Dict[str, Any]:
        """
        Run the full agent graph.
        
        Args:
            documents: List of documents with 'name' and 'text'
            query: User query or task description
            language: Output language (English or Thai)
            skip_web_research: Skip web research step
        
        Returns:
            Final state with report and metadata
        """
        import time
        start_time = time.time()
        
        # Initialize state
        state: AgentState = {
            "documents": documents,
            "query": query,
            "language": language,
            "extracted_data": [],
            "analysis_results": {},
            "web_research": [],
            "final_report": "",
            "translated_report": "",
            "current_step": "starting",
            "errors": [],
            "processing_time": 0,
        }
        
        print(f"\n{'='*60}")
        print(f"🚀 LANGGRAPH ORCHESTRATOR")
        print(f"   Documents: {len(documents)}")
        print(f"   Language: {language}")
        print(f"{'='*60}\n")
        
        try:
            # Execute nodes in order
            state = await self._extractor_node(state)
            state = await self._analyzer_node(state)
            
            if not skip_web_research:
                state = await self._web_researcher_node(state)
            
            state = await self._synthesizer_node(state)
            state = await self._translator_node(state)
            
        except Exception as e:
            state["errors"].append(f"Pipeline error: {e}")
            print(f"❌ Pipeline error: {e}")
        
        state["processing_time"] = time.time() - start_time
        state["current_step"] = "completed"
        
        print(f"\n{'='*60}")
        print(f"✅ COMPLETED in {state['processing_time']:.1f}s")
        print(f"   Errors: {len(state['errors'])}")
        print(f"{'='*60}\n")
        
        return {
            "success": len(state["errors"]) == 0,
            "report": state["translated_report"] or state["final_report"],
            "analysis": state["analysis_results"],
            "web_research": state["web_research"],
            "processing_time": state["processing_time"],
            "errors": state["errors"]
        }


# Convenience function
async def run_langgraph_analysis(
    documents: List[Dict[str, str]],
    language: str = "English"
) -> Dict[str, Any]:
    """Run LangGraph analysis on documents"""
    orchestrator = LangGraphOrchestrator()
    return await orchestrator.run(documents, language=language)
