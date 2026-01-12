"""
AI Consultant Agent with Persistent Memory

This agent acts as a strategic advisor with persistent memory (Mem0).
It synthesizes information across multiple analyses, identifies long-term trends,
and provides high-level recommendations for product optimization, market expansion,
and risk mitigation.
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime

try:
    from crewai import Agent, Task, Crew, Process
    from langchain_openai import ChatOpenAI
    CREWAI_AVAILABLE = True
    LANGCHAIN_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False
    LANGCHAIN_AVAILABLE = False

# Import memory agent
try:
    from .memory_agent import MemoryAgent
    MEMORY_AVAILABLE = True
except ImportError:
    MEMORY_AVAILABLE = False
    MemoryAgent = None


class AIConsultantAgent:
    """
    AI Consultant Agent with Persistent Memory
    
    Provides strategic advisory services with:
    - Long-term trend identification
    - Cross-analysis synthesis
    - Persistent memory of past analyses
    - High-level strategic recommendations
    """
    
    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        verbose: bool = True,
        memory_agent: Optional[Any] = None
    ):
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.verbose = verbose
        
        # Set memory agent (can be passed in or None)
        if memory_agent is None and MEMORY_AVAILABLE:
            try:
                from .memory_agent import MemoryAgent
                memory_agent = MemoryAgent()
            except Exception:
                memory_agent = None
        
        self.memory_agent = memory_agent
        
        if not CREWAI_AVAILABLE or not self.openai_api_key:
            self.available = False
            return
        
        try:
            self.llm = ChatOpenAI(
                model=self.model,
                api_key=self.openai_api_key,
                temperature=0.7
            ) if LANGCHAIN_AVAILABLE else None
            
            self._create_agent()
            self.available = True
            print("✅ AI Consultant Agent initialized")
        except Exception as e:
            print(f"⚠️ Consultant Agent initialization failed: {e}")
            self.available = False
    
    def _create_agent(self):
        """Create the strategic consultant agent"""
        self.agent = Agent(
            role="Strategic Travel Industry Consultant",
            goal="Provide high-level strategic recommendations for product optimization, market expansion, and risk mitigation by synthesizing insights across multiple analyses and identifying long-term trends",
            backstory="""You are a senior strategic consultant specializing in the travel and 
            tourism industry. With years of experience advising major tour operators and travel 
            companies, you excel at identifying patterns across multiple product analyses, 
            recognizing long-term market trends, and providing actionable strategic guidance. 
            You have access to a comprehensive memory of past analyses, allowing you to provide 
            context-aware recommendations that build on historical insights. Your recommendations 
            focus on sustainable growth, competitive positioning, and strategic market opportunities.""",
            verbose=self.verbose,
            allow_delegation=True,
            llm=self.llm
        )
    
    def provide_consultation(
        self,
        current_analyses: List[Dict[str, Any]],
        user_id: str = "default",
        focus_areas: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Provide strategic consultation based on current and historical analyses
        
        Args:
            current_analyses: List of current product analyses
            user_id: User identifier for memory retrieval
            focus_areas: Specific areas to focus on (e.g., ["pricing", "market expansion"])
        
        Returns:
            Strategic consultation report with recommendations
        """
        if not self.available:
            return {
                "success": False,
                "error": "Consultant Agent not available"
            }
        
        try:
            # Retrieve historical context from memory
            historical_context = ""
            if self.memory_agent:
                try:
                    historical_context = self.memory_agent.get_user_context(
                        user_id=user_id,
                        query="travel product analysis trends recommendations"
                    )
                except Exception as e:
                    print(f"⚠️ Could not retrieve memory context: {e}")
            
            # Build consultation context
            context_parts = [
                "## Current Product Analyses",
                self._format_analyses(current_analyses)
            ]
            
            if historical_context:
                context_parts.append(f"\n## Historical Context from Past Analyses\n{historical_context}")
            
            if focus_areas:
                context_parts.append(f"\n## Focus Areas\n{', '.join(focus_areas)}")
            
            context = "\n".join(context_parts)
            
            # Create consultation task
            task = Task(
                description=f"""As a strategic consultant, provide comprehensive strategic recommendations based on the following analyses:

{context}

Provide strategic guidance covering:

1. **Long-Term Trends**: What patterns or trends do you identify across these analyses?
2. **Product Optimization**: How can these products be improved for better market performance?
3. **Market Expansion**: What opportunities exist for expanding into new markets or segments?
4. **Risk Mitigation**: What risks should be addressed, and how?
5. **Competitive Strategy**: How should these products be positioned against competitors?
6. **Strategic Roadmap**: What are the recommended next steps for product development?

Synthesize insights from both current and historical analyses to provide actionable, strategic recommendations.""",
                expected_output="A comprehensive strategic consultation report with long-term trends, optimization recommendations, market expansion opportunities, risk mitigation strategies, competitive positioning, and a strategic roadmap",
                agent=self.agent
            )
            
            crew = Crew(
                agents=[self.agent],
                tasks=[task],
                process=Process.sequential,
                verbose=self.verbose
            )
            
            result = crew.kickoff()
            
            # Save consultation to memory
            if self.memory_agent:
                try:
                    self.memory_agent.add_memory(
                        content=f"Strategic consultation provided for {len(current_analyses)} product(s)",
                        user_id=user_id,
                        memory_type="analysis",
                        metadata={
                            "type": "consultation",
                            "analysis_count": len(current_analyses),
                            "focus_areas": focus_areas
                        }
                    )
                except Exception as e:
                    print(f"⚠️ Could not save to memory: {e}")
            
            return {
                "success": True,
                "consultation": str(result),
                "analysis_count": len(current_analyses),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _format_analyses(self, analyses: List[Dict[str, Any]]) -> str:
        """Format multiple analyses for consultation"""
        return "\n\n---\n\n".join([
            f"### Analysis {i+1}\n{analysis.get('summary', analysis.get('analysis', 'No summary available'))}"
            for i, analysis in enumerate(analyses)
        ])
    
    def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
        return {
            "available": self.available,
            "has_memory": self.memory_agent is not None,
            "crewai_installed": CREWAI_AVAILABLE,
            "model": self.model
        }

