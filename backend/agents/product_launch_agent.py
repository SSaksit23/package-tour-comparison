"""
Smart Product Launch Agent

This agent acts as a product strategist, analyzing tour market positioning,
unique selling propositions (USPs), and overall competitiveness.
It evaluates packages against market data retrieved by the web search agent
to provide strategic assessment.
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


class SmartProductLaunchAgent:
    """
    Smart Product Launch Agent
    
    Analyzes travel products for:
    - Market positioning
    - Unique selling propositions (USPs)
    - Competitive assessment
    - Market data integration
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
            print("✅ Smart Product Launch Agent initialized")
        except Exception as e:
            print(f"⚠️ Product Launch Agent initialization failed: {e}")
            self.available = False
    
    def _create_agent(self):
        """Create the product strategist agent"""
        self.agent = Agent(
            role="Travel Product Strategist",
            goal="Analyze travel tour packages for market positioning, identify unique selling propositions, and assess competitive positioning using market data",
            backstory="""You are an expert travel product strategist with deep experience in 
            the tourism industry. You specialize in analyzing tour packages to identify their 
            market position, unique value propositions, and competitive advantages. You excel 
            at synthesizing market data, competitor intelligence, and customer insights to 
            provide strategic recommendations for product optimization and market positioning.""",
            verbose=self.verbose,
            allow_delegation=False,
            llm=self.llm
        )
    
    def analyze_product(
        self,
        itinerary_data: Dict[str, Any],
        market_context: Optional[str] = None,
        competitor_data: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Analyze a travel product for market positioning
        
        Args:
            itinerary_data: Structured itinerary data
            market_context: Market research data from web search
            competitor_data: Data about competing products
        
        Returns:
            Strategic analysis with positioning, USPs, and recommendations
        """
        if not self.available:
            return {
                "success": False,
                "error": "Product Launch Agent not available"
            }
        
        try:
            # Build analysis context
            context_parts = [
                f"## Product Information\n{self._format_itinerary(itinerary_data)}"
            ]
            
            if market_context:
                context_parts.append(f"\n## Market Context\n{market_context}")
            
            if competitor_data:
                context_parts.append(f"\n## Competitor Analysis\n{self._format_competitors(competitor_data)}")
            
            context = "\n".join(context_parts)
            
            # Create analysis task
            task = Task(
                description=f"""Analyze this travel product and provide a comprehensive strategic assessment:

{context}

Provide analysis covering:
1. **Market Positioning**: Where does this product sit in the market? (Budget, Mid-range, Luxury, Niche)
2. **Unique Selling Propositions (USPs)**: What makes this product unique or superior?
3. **Competitive Advantages**: What are the key differentiators?
4. **Target Audience**: Who is this product best suited for?
5. **Market Opportunities**: What gaps or opportunities exist?
6. **Strategic Recommendations**: How can this product be optimized for better market performance?

Provide actionable, specific insights.""",
                expected_output="A comprehensive strategic product analysis with market positioning, USPs, competitive advantages, target audience, opportunities, and recommendations",
                agent=self.agent
            )
            
            crew = Crew(
                agents=[self.agent],
                tasks=[task],
                process=Process.sequential,
                verbose=self.verbose
            )
            
            result = crew.kickoff()
            
            return {
                "success": True,
                "analysis": str(result),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _format_itinerary(self, data: Dict[str, Any]) -> str:
        """Format itinerary data for analysis"""
        parts = []
        if data.get("tourName"):
            parts.append(f"Tour: {data['tourName']}")
        if data.get("duration"):
            parts.append(f"Duration: {data['duration']}")
        if data.get("destinations"):
            parts.append(f"Destinations: {', '.join(data['destinations'])}")
        if data.get("pricing"):
            prices = [f"{p.get('period', '')}: {p.get('price', '')} {p.get('currency', '')}" 
                     for p in data['pricing']]
            parts.append(f"Pricing: {', '.join(prices)}")
        if data.get("inclusions"):
            parts.append(f"Inclusions: {', '.join(data['inclusions'][:5])}")
        return "\n".join(parts)
    
    def _format_competitors(self, competitors: List[Dict[str, Any]]) -> str:
        """Format competitor data for analysis"""
        return "\n\n".join([
            f"### {c.get('name', 'Competitor')}\n{self._format_itinerary(c)}"
            for c in competitors
        ])

