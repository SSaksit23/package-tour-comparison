"""
Agentic Web Research Module

This module provides intelligent web research capabilities for the
Package Tour Comparison application using CrewAI agents.

Features:
- Automatic search query generation based on itinerary details
- Web scraping and content extraction
- Structured data synthesis from web findings
"""

from .main import run_web_research_crew

__all__ = ['run_web_research_crew']
