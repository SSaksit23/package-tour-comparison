"""
Travel Analyst Crew using CrewAI

A multi-agent system for comprehensive travel itinerary analysis:
- Document Analyst: Extracts structured data from itineraries
- Market Researcher: Searches web for competitor info and prices
- Strategic Advisor: Generates recommendations and insights
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime

# Try to import CrewAI
try:
    from crewai import Agent, Task, Crew, Process
    from crewai.tools import BaseTool
    CREWAI_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False
    print("⚠️ CrewAI not available")

# Try to import LangChain for LLM
try:
    from langchain_openai import ChatOpenAI
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False


class TravelAnalystCrew:
    """
    Multi-Agent Crew for Travel Itinerary Analysis
    
    Uses CrewAI to orchestrate multiple specialized agents:
    1. Document Analyst - Extracts and structures itinerary data
    2. Market Researcher - Finds competitor info and market prices
    3. Strategic Advisor - Generates insights and recommendations
    """
    
    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        verbose: bool = True
    ):
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.verbose = verbose
        
        if not CREWAI_AVAILABLE:
            self.available = False
            print("⚠️ CrewAI not available, crew analysis disabled")
            return
        
        if not self.openai_api_key:
            self.available = False
            print("⚠️ OPENAI_API_KEY not set, crew analysis disabled")
            return
        
        try:
            # Initialize LLM
            self.llm = ChatOpenAI(
                model=self.model,
                api_key=self.openai_api_key,
                temperature=0.7
            ) if LANGCHAIN_AVAILABLE else None
            
            # Create agents
            self._create_agents()
            self.available = True
            print("✅ Travel Analyst Crew initialized")
            
        except Exception as e:
            print(f"⚠️ Crew initialization failed: {e}")
            self.available = False
    
    def _create_agents(self):
        """Create the specialized agents"""
        
        # Agent 1: Document Analyst
        self.document_analyst = Agent(
            role="Travel Document Analyst",
            goal="Extract and structure key information from travel itineraries including pricing, duration, destinations, inclusions, and unique features",
            backstory="""You are an expert travel document analyst with years of experience 
            reviewing tour packages and itineraries. You excel at extracting precise details 
            like prices, dates, included meals, activities, and accommodations. You're meticulous 
            about identifying both explicit and implicit value propositions in travel packages.""",
            verbose=self.verbose,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Agent 2: Market Researcher
        self.market_researcher = Agent(
            role="Travel Market Researcher",
            goal="Research current market prices, competitor offerings, and industry trends for travel packages",
            backstory="""You are a seasoned travel industry market researcher. You understand 
            pricing strategies, seasonal variations, and competitive positioning in the tourism 
            sector. You're skilled at comparing packages across different operators and 
            identifying market gaps and opportunities.""",
            verbose=self.verbose,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Agent 3: Strategic Advisor
        self.strategic_advisor = Agent(
            role="Travel Strategy Consultant",
            goal="Provide actionable strategic recommendations for travel product positioning, pricing, and competitive advantage",
            backstory="""You are a strategic consultant specializing in the travel and tourism 
            industry. You help tour operators optimize their offerings based on market analysis 
            and customer insights. You're known for providing clear, actionable recommendations 
            that drive business results.""",
            verbose=self.verbose,
            allow_delegation=True,
            llm=self.llm
        )
    
    def analyze_itineraries(
        self,
        itineraries: List[Dict[str, str]],
        analysis_focus: str = "competitive",
        web_context: Optional[str] = None,
        user_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze multiple itineraries using the agent crew
        
        Args:
            itineraries: List of dicts with 'name' and 'content' keys
            analysis_focus: "competitive", "pricing", "value", or "all"
            web_context: Optional web search results to include
            user_context: Optional user preferences from memory
        
        Returns:
            Comprehensive analysis with insights and recommendations
        """
        if not self.available:
            return {
                "success": False,
                "error": "Crew analysis not available",
                "analysis": None
            }
        
        if not itineraries:
            return {
                "success": False,
                "error": "No itineraries provided",
                "analysis": None
            }
        
        try:
            # Prepare itinerary content
            itinerary_text = "\n\n---\n\n".join([
                f"## {it.get('name', f'Itinerary {i+1}')}\n\n{it.get('content', '')}"
                for i, it in enumerate(itineraries)
            ])
            
            # Create analysis tasks
            tasks = self._create_analysis_tasks(
                itinerary_text=itinerary_text,
                analysis_focus=analysis_focus,
                web_context=web_context,
                user_context=user_context,
                itinerary_count=len(itineraries)
            )
            
            # Create and run crew
            crew = Crew(
                agents=[
                    self.document_analyst,
                    self.market_researcher,
                    self.strategic_advisor
                ],
                tasks=tasks,
                process=Process.sequential,
                verbose=self.verbose
            )
            
            result = crew.kickoff()
            
            return {
                "success": True,
                "analysis": str(result),
                "itinerary_count": len(itineraries),
                "analysis_focus": analysis_focus,
                "timestamp": datetime.now().isoformat(),
                "agents_used": ["Document Analyst", "Market Researcher", "Strategic Advisor"]
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "analysis": None
            }
    
    def _create_analysis_tasks(
        self,
        itinerary_text: str,
        analysis_focus: str,
        web_context: Optional[str],
        user_context: Optional[str],
        itinerary_count: int
    ) -> List[Task]:
        """Create the analysis tasks for the crew"""
        
        context_section = ""
        if web_context:
            context_section += f"\n\n### Market Research Context:\n{web_context}"
        if user_context:
            context_section += f"\n\n### User Preferences:\n{user_context}"
        
        # Task 1: Document Analysis
        task1 = Task(
            description=f"""Analyze the following {itinerary_count} travel itinerary(ies) and extract:

1. **Basic Information**: Tour code, duration, total price, price per day
2. **Destinations**: All cities/locations visited with time spent
3. **Inclusions**: Flights, hotels, meals (B/L/D), activities, transfers
4. **Exclusions**: What's not included
5. **Unique Features**: Special experiences, highlights
6. **Value Assessment**: Perceived value for money

Itineraries to analyze:
{itinerary_text}

Provide a structured summary for each itinerary.""",
            expected_output="A structured analysis of each itinerary with all key data points extracted and organized",
            agent=self.document_analyst
        )
        
        # Task 2: Market Research
        task2_description = f"""Based on the document analysis, conduct market research:

1. **Price Comparison**: How do these prices compare to similar packages?
2. **Competitive Position**: Where do these packages sit in the market?
3. **Industry Trends**: What current trends affect these destinations?
4. **Value Benchmarking**: Are the inclusions standard or premium?
{context_section}

Use the document analysis and any available market context to provide insights."""
        
        task2 = Task(
            description=task2_description,
            expected_output="Market research findings including price benchmarking, competitive positioning, and industry context",
            agent=self.market_researcher,
            context=[task1]
        )
        
        # Task 3: Strategic Recommendations
        focus_instructions = {
            "competitive": "Focus on competitive differentiation and positioning strategies.",
            "pricing": "Focus on pricing optimization and value perception.",
            "value": "Focus on enhancing value proposition and customer appeal.",
            "all": "Provide comprehensive analysis covering competition, pricing, and value."
        }
        
        task3 = Task(
            description=f"""Based on the document analysis and market research, provide strategic recommendations:

1. **Product Comparison Matrix**: Create a comparison table of key features
2. **Strengths & Weaknesses**: For each itinerary
3. **Market Opportunities**: Gaps that could be exploited
4. **Pricing Recommendations**: Optimal pricing strategies
5. **Improvement Suggestions**: Specific enhancements for each package
6. **Target Audience Fit**: Which customer segments each package suits

Analysis Focus: {analysis_focus}
{focus_instructions.get(analysis_focus, '')}

Provide actionable, specific recommendations.""",
            expected_output="Strategic recommendations report with comparison matrix, SWOT analysis, and actionable improvement suggestions",
            agent=self.strategic_advisor,
            context=[task1, task2]
        )
        
        return [task1, task2, task3]
    
    def quick_compare(
        self,
        itinerary1: str,
        itinerary2: str,
        name1: str = "Package A",
        name2: str = "Package B"
    ) -> Dict[str, Any]:
        """
        Quick comparison of two itineraries
        
        Returns a focused comparison without full crew analysis
        """
        return self.analyze_itineraries(
            itineraries=[
                {"name": name1, "content": itinerary1},
                {"name": name2, "content": itinerary2}
            ],
            analysis_focus="competitive"
        )
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current status of the crew"""
        return {
            "available": self.available,
            "crewai_installed": CREWAI_AVAILABLE,
            "langchain_installed": LANGCHAIN_AVAILABLE,
            "model": self.model,
            "agents": [
                "Document Analyst",
                "Market Researcher", 
                "Strategic Advisor"
            ] if self.available else []
        }

