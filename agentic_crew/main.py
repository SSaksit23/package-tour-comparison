"""
Agentic Web Research Module - Main Entry Point

This module orchestrates a multi-agent crew for researching
comparable tour packages on the web based on input itinerary data.

Usage:
    python main.py <base64_encoded_itinerary_json>
    
Or import and call directly:
    from agentic_crew import run_web_research_crew
    result = run_web_research_crew(itinerary_data)
"""

import sys
import os
import base64
import json
from typing import Dict, List, Any, Optional
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Import CrewAI components
try:
    from crewai import Agent, Task, Crew, Process
    CREWAI_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False
    print("⚠️ CrewAI not available, using fallback mode")

# Import our tools
from tools.search_tools import IntelligentSearchTool, EXASearchTool, TourPackageSearchTool


# ============================================
# AGENT DEFINITIONS
# ============================================

def create_agents():
    """Create the agent crew for web research"""
    
    # Agent 1: Query Generator
    query_generator = Agent(
        role='Travel Package Query Specialist',
        goal=(
            'Generate 3-5 highly effective search queries based on travel package details. '
            'Queries should target different aspects: price comparison, similar destinations, '
            'alternative operators, and package reviews.'
        ),
        backstory=(
            'You are an expert travel analyst with deep knowledge of how people search '
            'for tour packages online. You understand SEO patterns and know exactly '
            'what queries will return the most relevant comparable packages. '
            'You focus on finding packages that match the destination, duration, '
            'and style of the input itinerary.'
        ),
        verbose=False,
        allow_delegation=False,
        max_iter=3
    )
    
    # Agent 2: Web Researcher
    researcher = Agent(
        role='Senior Travel Research Analyst',
        goal=(
            'Execute web searches using the provided queries and find 3-5 comparable '
            'tour packages with detailed information including prices, itineraries, '
            'and what is included.'
        ),
        backstory=(
            'You are a master of online travel research. You know how to find the best '
            'tour packages from various agencies and can quickly extract key information '
            'like prices, destinations, duration, and inclusions. You focus on finding '
            'packages that would be genuine alternatives for travelers considering the '
            'original package.'
        ),
        tools=[IntelligentSearchTool(), TourPackageSearchTool()],
        verbose=True,
        allow_delegation=False,
        max_iter=5
    )
    
    # Agent 3: Data Synthesizer
    synthesizer = Agent(
        role='Travel Data Synthesis Expert',
        goal=(
            'Aggregate all research findings into a clean, structured JSON object. '
            'Each package should have standardized fields for easy comparison: '
            'name, operator, destinations, duration, price_range, inclusions, and source_url.'
        ),
        backstory=(
            'You are meticulous data analyst who excels at structuring messy web data '
            'into perfectly formatted JSON. You ensure all data is clean, consistent, '
            'and ready for programmatic comparison. You never include fabricated data '
            'and clearly mark missing information as null.'
        ),
        verbose=False,
        allow_delegation=False,
        max_iter=3
    )
    
    return query_generator, researcher, synthesizer


def create_tasks(itinerary_details: Dict, agents: tuple) -> List[Task]:
    """Create tasks for the agent crew"""
    
    query_generator, researcher, synthesizer = agents
    
    # Format itinerary details for the prompt
    details_str = json.dumps(itinerary_details, indent=2, ensure_ascii=False)
    
    # Task 1: Generate Search Queries
    generate_queries_task = Task(
        description=f'''
        Analyze the following tour package details and create 3-5 search queries
        that will find comparable alternatives:
        
        {details_str}
        
        Consider:
        1. Main destination and nearby alternatives
        2. Duration (look for similar day counts)
        3. Price range if available
        4. Travel style (luxury, budget, adventure, family)
        
        Output a Python list of search query strings. Each query should be specific
        enough to return relevant tour packages.
        ''',
        agent=query_generator,
        expected_output="A Python list of 3-5 search query strings targeting comparable tour packages."
    )
    
    # Task 2: Execute Web Research
    research_task = Task(
        description='''
        Using the search queries generated in the previous task, perform web searches
        to find comparable tour packages.
        
        For each package found, try to extract:
        - Package/Tour name
        - Operating company/agency
        - Main destinations
        - Duration (days/nights)
        - Price or price range
        - Key inclusions (flights, hotels, meals, etc.)
        - Source URL
        
        Focus on finding real, bookable packages from legitimate travel agencies.
        Aim to find 3-5 quality alternatives.
        ''',
        agent=researcher,
        context=[generate_queries_task],
        expected_output="A detailed report of found tour packages with extracted information."
    )
    
    # Task 3: Synthesize into JSON
    synthesize_task = Task(
        description='''
        Take all the research findings and create a clean JSON output.
        
        The output MUST be valid JSON with this exact structure:
        {
            "found_packages": [
                {
                    "name": "Package name",
                    "operator": "Travel agency name or null",
                    "destinations": ["List", "of", "destinations"],
                    "duration": "X days Y nights",
                    "price_range": "Price or price range",
                    "currency": "THB/USD/EUR",
                    "inclusions": ["flight", "hotel", "breakfast", etc.],
                    "exclusions": ["visa", "tips", etc.],
                    "highlights": ["Key selling points"],
                    "source_url": "URL where this was found",
                    "confidence": "high/medium/low"
                }
            ],
            "search_summary": {
                "queries_used": ["list of search queries"],
                "total_found": number,
                "timestamp": "ISO timestamp"
            }
        }
        
        Only include packages with real data. Do not fabricate information.
        Mark any missing fields as null.
        ''',
        agent=synthesizer,
        context=[research_task],
        expected_output="A valid JSON object with found_packages array and search_summary."
    )
    
    return [generate_queries_task, research_task, synthesize_task]


def run_web_research_crew(itinerary_data: Dict) -> Dict:
    """
    Run the web research crew to find comparable packages.
    
    Args:
        itinerary_data: Dictionary containing analyzed itinerary data with keys like:
            - tour_name: Name of the tour
            - destinations: List of destinations
            - duration: Duration string (e.g., "5 days 4 nights")
            - price: Price information
            - inclusions: What's included
    
    Returns:
        Dictionary with found packages and search summary
    """
    
    if not CREWAI_AVAILABLE:
        return {
            "success": False,
            "error": "CrewAI not available",
            "found_packages": []
        }
    
    # Check for required API keys
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        return {
            "success": False,
            "error": "OPENAI_API_KEY not configured",
            "found_packages": []
        }
    
    # Extract key details for search
    search_context = {
        "destinations": itinerary_data.get("destinations", []),
        "duration": itinerary_data.get("duration", ""),
        "price": itinerary_data.get("price", {}).get("total", ""),
        "tour_name": itinerary_data.get("tour_name", ""),
        "style": itinerary_data.get("tour_type", ""),
        "inclusions": itinerary_data.get("inclusions", [])[:5]  # Limit for prompt
    }
    
    try:
        print("🚀 Starting Agentic Web Research...")
        start_time = datetime.now()
        
        # Create agents and tasks
        agents = create_agents()
        tasks = create_tasks(search_context, agents)
        
        # Create and run the crew
        crew = Crew(
            agents=list(agents),
            tasks=tasks,
            process=Process.sequential,
            verbose=2
        )
        
        result = crew.kickoff()
        
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"✅ Web research completed in {elapsed:.1f}s")
        
        # Parse the result
        result_str = str(result)
        
        # Try to extract JSON from the result
        try:
            # Look for JSON in the result
            import re
            json_match = re.search(r'\{[\s\S]*"found_packages"[\s\S]*\}', result_str)
            if json_match:
                parsed_result = json.loads(json_match.group())
            else:
                # Try parsing the whole result as JSON
                parsed_result = json.loads(result_str)
        except json.JSONDecodeError:
            # If parsing fails, return raw result wrapped in structure
            parsed_result = {
                "found_packages": [],
                "raw_result": result_str[:5000],
                "parse_error": "Could not parse agent output as JSON"
            }
        
        return {
            "success": True,
            "elapsed_seconds": elapsed,
            **parsed_result
        }
        
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "found_packages": []
        }


def run_simple_search(itinerary_data: Dict) -> Dict:
    """
    Simplified search without full crew (for faster results).
    Uses EXA directly for quick comparable package search.
    """
    
    destinations = itinerary_data.get("destinations", [])
    duration = itinerary_data.get("duration", "")
    
    if not destinations:
        return {
            "success": False,
            "error": "No destinations provided",
            "found_packages": []
        }
    
    # Build search query
    main_dest = destinations[0] if destinations else ""
    query = f"{main_dest} tour package {duration} 2025 price itinerary".strip()
    
    # Use EXA search tool
    search_tool = EXASearchTool()
    if not search_tool.available:
        search_tool = IntelligentSearchTool()
    
    try:
        result_json = search_tool._run(query)
        result = json.loads(result_json)
        
        if result.get("success"):
            # Transform to standard format
            packages = []
            for item in result.get("results", []):
                packages.append({
                    "name": item.get("name", "Unknown Package"),
                    "operator": None,
                    "destinations": destinations,
                    "duration": duration,
                    "price_range": None,
                    "currency": None,
                    "inclusions": [],
                    "exclusions": [],
                    "highlights": [item.get("snippet", "")],
                    "source_url": item.get("url", ""),
                    "confidence": "medium"
                })
            
            return {
                "success": True,
                "found_packages": packages,
                "search_summary": {
                    "queries_used": [query],
                    "total_found": len(packages),
                    "timestamp": datetime.now().isoformat(),
                    "mode": "simple_search"
                }
            }
        else:
            return result
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "found_packages": []
        }


# ============================================
# MAIN ENTRY POINT
# ============================================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "No input provided. Usage: python main.py <base64_encoded_json>",
            "found_packages": []
        }))
        sys.exit(1)
    
    try:
        # Decode base64 input
        encoded_input = sys.argv[1]
        decoded_input = base64.b64decode(encoded_input).decode('utf-8')
        itinerary_data = json.loads(decoded_input)
        
        # Check for fast mode flag
        fast_mode = sys.argv[2] if len(sys.argv) > 2 else "full"
        
        if fast_mode == "fast":
            result = run_simple_search(itinerary_data)
        else:
            result = run_web_research_crew(itinerary_data)
        
        # Output result as JSON to stdout
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Failed to process input: {str(e)}",
            "found_packages": []
        }))
        sys.exit(1)
