"""
Agent Skills Definitions
Based on: https://github.com/Prat011/awesome-llm-skills

Skills are specialized capabilities that can be equipped to AI agents
to enhance their performance on specific tasks.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class SkillCategory(Enum):
    RESEARCH = "research"
    DATA_EXTRACTION = "data_extraction"
    CONTENT = "content"
    ANALYSIS = "analysis"
    CREATIVE = "creative"
    PRODUCTIVITY = "productivity"


@dataclass
class AgentSkill:
    """Definition of an agent skill"""
    id: str
    name: str
    description: str
    category: SkillCategory
    triggers: List[str]  # Keywords that activate this skill
    instructions: str  # Detailed instructions for the agent
    tools_required: List[str]  # Tools needed to execute this skill
    output_format: str  # Expected output format
    
    def matches_task(self, task_description: str) -> float:
        """Calculate how well this skill matches a task (0-1)"""
        task_lower = task_description.lower()
        matches = sum(1 for trigger in self.triggers if trigger.lower() in task_lower)
        return min(matches / max(len(self.triggers), 1), 1.0)


# Define skills based on awesome-llm-skills repository
AGENT_SKILLS: Dict[str, AgentSkill] = {
    
    # ========================================
    # RESEARCH & DATA SKILLS
    # ========================================
    
    "competitive_research": AgentSkill(
        id="competitive_research",
        name="Competitive Research",
        description="Research and analyze competitor products, pricing, and market positioning",
        category=SkillCategory.RESEARCH,
        triggers=["competitor", "competition", "market research", "compare products", "pricing analysis", "benchmark"],
        instructions="""
When performing competitive research:
1. Identify key competitors based on the target market/product
2. For each competitor, gather:
   - Product features and specifications
   - Pricing structure and tiers
   - Target audience and positioning
   - Unique selling propositions (USPs)
   - Customer reviews and ratings
3. Create structured comparison tables
4. Identify market gaps and opportunities
5. Provide actionable insights for differentiation
""",
        tools_required=["web_search", "data_extraction"],
        output_format="markdown_table"
    ),
    
    "content_research_writer": AgentSkill(
        id="content_research_writer",
        name="Content Research Writer",
        description="Research topics thoroughly and write high-quality content with citations",
        category=SkillCategory.CONTENT,
        triggers=["write article", "content research", "blog post", "create content", "research and write"],
        instructions="""
When creating content:
1. Research the topic using multiple authoritative sources
2. Gather key facts, statistics, and expert opinions
3. Structure content with clear sections:
   - Hook/Introduction
   - Main body with supporting evidence
   - Conclusion with key takeaways
4. Add proper citations for all claims
5. Optimize for readability and engagement
6. Include relevant examples and case studies
""",
        tools_required=["web_search", "article_extractor"],
        output_format="markdown_article"
    ),
    
    "lead_research_assistant": AgentSkill(
        id="lead_research_assistant",
        name="Lead Research Assistant",
        description="Research and qualify business leads with detailed company profiles",
        category=SkillCategory.RESEARCH,
        triggers=["find leads", "company research", "prospect", "business leads", "target companies"],
        instructions="""
When researching leads:
1. Identify target company profile criteria
2. For each potential lead, research:
   - Company overview and size
   - Key decision makers and contacts
   - Recent news and developments
   - Technology stack (if applicable)
   - Pain points that match your solution
3. Score leads based on fit criteria
4. Provide personalized outreach suggestions
5. Organize leads by priority tier
""",
        tools_required=["web_search", "data_extraction"],
        output_format="structured_table"
    ),
    
    "article_extractor": AgentSkill(
        id="article_extractor",
        name="Article Extractor",
        description="Extract full article text and metadata from web pages",
        category=SkillCategory.DATA_EXTRACTION,
        triggers=["extract article", "get content", "scrape page", "extract text", "read webpage"],
        instructions="""
When extracting articles:
1. Identify the main content area
2. Extract:
   - Title and subtitle
   - Author and publication date
   - Main body text (cleaned of ads/navigation)
   - Key images with captions
   - Related links and references
3. Preserve formatting (headers, lists, quotes)
4. Extract metadata (tags, categories, reading time)
5. Return structured, clean content
""",
        tools_required=["web_scraper"],
        output_format="json_document"
    ),
    
    # ========================================
    # TRAVEL-SPECIFIC SKILLS
    # ========================================
    
    "itinerary_analyzer": AgentSkill(
        id="itinerary_analyzer",
        name="Travel Itinerary Analyzer",
        description="Analyze travel itineraries to extract structured data and insights",
        category=SkillCategory.ANALYSIS,
        triggers=["itinerary", "tour package", "travel plan", "trip analysis", "tour comparison"],
        instructions="""
When analyzing travel itineraries:
1. Extract key information:
   - Tour name and operator
   - Destinations and sequence
   - Duration (days/nights)
   - Pricing and inclusions
   - Activities and highlights
   - Accommodation details
   - Transportation type
2. Calculate value metrics:
   - Price per day
   - Activities per day
   - Accommodation quality ratio
3. Identify unique selling points
4. Compare against market standards
5. Provide improvement suggestions
""",
        tools_required=["document_parser", "ai_analysis"],
        output_format="structured_report"
    ),
    
    "tour_package_finder": AgentSkill(
        id="tour_package_finder",
        name="Tour Package Finder",
        description="Search and compare tour packages from multiple sources",
        category=SkillCategory.RESEARCH,
        triggers=["find tours", "tour packages", "travel deals", "vacation packages", "holiday packages"],
        instructions="""
When searching for tour packages:
1. Identify search criteria:
   - Destination(s)
   - Duration range
   - Budget range
   - Travel style (luxury, budget, adventure, etc.)
2. Search multiple travel sources
3. For each package found:
   - Extract complete details
   - Verify pricing accuracy
   - Check availability
   - Note booking conditions
4. Compare packages by value metrics
5. Rank by overall score
6. Provide recommendation summary
""",
        tools_required=["web_search", "price_extractor"],
        output_format="comparison_table"
    ),
    
    "market_intelligence": AgentSkill(
        id="market_intelligence",
        name="Market Intelligence",
        description="Comprehensive market analysis combining document analysis and web research",
        category=SkillCategory.ANALYSIS,
        triggers=["market analysis", "market intelligence", "industry report", "market trends", "competitive landscape"],
        instructions="""
When conducting market intelligence:
1. Analyze internal documents to identify:
   - Key products/services
   - Target markets
   - Pricing strategies
   - Unique features
2. Research external market:
   - Competitor offerings
   - Market trends
   - Customer preferences
   - Price benchmarks
3. Synthesize findings into:
   - Market overview
   - Competitive positioning
   - SWOT analysis
   - Strategic recommendations
4. Generate actionable report
""",
        tools_required=["document_parser", "web_search", "ai_analysis"],
        output_format="executive_report"
    ),
    
    # ========================================
    # DATA & PRODUCTIVITY SKILLS
    # ========================================
    
    "data_table_generator": AgentSkill(
        id="data_table_generator",
        name="Data Table Generator",
        description="Generate structured data tables from unstructured information",
        category=SkillCategory.DATA_EXTRACTION,
        triggers=["create table", "data table", "spreadsheet", "structured data", "organize data"],
        instructions="""
When generating data tables:
1. Identify data points to extract
2. Define column headers and data types
3. Process each item consistently:
   - Extract relevant fields
   - Normalize formats (dates, prices, etc.)
   - Handle missing values appropriately
4. Validate data consistency
5. Sort and organize logically
6. Export in requested format (CSV, JSON, Markdown)
""",
        tools_required=["data_extraction", "format_converter"],
        output_format="data_table"
    ),
    
    "report_generator": AgentSkill(
        id="report_generator",
        name="Report Generator",
        description="Generate comprehensive reports with visualizations and insights",
        category=SkillCategory.PRODUCTIVITY,
        triggers=["generate report", "create report", "analysis report", "summary report", "executive summary"],
        instructions="""
When generating reports:
1. Structure with clear sections:
   - Executive Summary
   - Key Findings
   - Detailed Analysis
   - Recommendations
   - Appendices
2. Include supporting data:
   - Tables and charts
   - Key metrics
   - Trend analysis
3. Write clear, actionable insights
4. Use consistent formatting
5. Add table of contents for long reports
6. Include methodology notes
""",
        tools_required=["ai_analysis", "chart_generator"],
        output_format="markdown_report"
    ),
}


def get_skill(skill_id: str) -> Optional[AgentSkill]:
    """Get a skill by its ID"""
    return AGENT_SKILLS.get(skill_id)


def get_skills_for_task(task_description: str, threshold: float = 0.3) -> List[AgentSkill]:
    """
    Find skills that match a task description.
    Returns skills sorted by match score (highest first).
    """
    matches = []
    for skill in AGENT_SKILLS.values():
        score = skill.matches_task(task_description)
        if score >= threshold:
            matches.append((skill, score))
    
    # Sort by score descending
    matches.sort(key=lambda x: x[1], reverse=True)
    return [skill for skill, score in matches]


def get_skill_instructions(skill_ids: List[str]) -> str:
    """
    Combine instructions from multiple skills into a single prompt.
    """
    instructions = []
    for skill_id in skill_ids:
        skill = get_skill(skill_id)
        if skill:
            instructions.append(f"## {skill.name}\n{skill.instructions}")
    
    return "\n\n".join(instructions)
