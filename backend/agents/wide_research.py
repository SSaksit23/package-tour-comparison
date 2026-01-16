"""
Wide Research - Parallel Multi-Agent Processing System

Based on the Manus Wide Research approach:
- Deploys hundreds of independent agents working in parallel
- Each agent gets its own dedicated context window
- Solves the "context window problem" where quality degrades after 8-10 items
- Item #250 receives the same depth of analysis as item #1

Architecture:
1. Task Decomposition - Break task into independent sub-tasks
2. Parallel Agent Deployment - Each sub-task gets its own agent
3. Independent Processing - Agents work simultaneously  
4. Result Synthesis - Combine all results into final output
"""

import asyncio
import os
import json
import time
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum


class WideResearchStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class SubTask:
    """Represents a single sub-task in Wide Research"""
    id: str
    item: Any  # The item to process
    instruction: str  # What to do with the item
    status: WideResearchStatus = WideResearchStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None
    processing_time: float = 0.0


class WideResearch:
    """
    Wide Research System - Parallel processing for large-scale tasks.
    
    Solves the context window problem by:
    - Processing each item independently with its own agent
    - Running agents in parallel (configurable concurrency)
    - Synthesizing results without context degradation
    """
    
    def __init__(
        self,
        openai_api_key: str = None,
        max_concurrent: int = 10,  # Max parallel agents
        model: str = "gpt-4o-mini"
    ):
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.max_concurrent = max_concurrent
        self.model = model
        self.semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_single_item(
        self,
        subtask: SubTask,
        system_prompt: str = ""
    ) -> SubTask:
        """
        Process a single item with its own dedicated agent context.
        Each call has a fresh context window - no degradation.
        """
        import httpx
        
        async with self.semaphore:  # Control concurrency
            start_time = time.time()
            subtask.status = WideResearchStatus.PROCESSING
            
            # Build prompt with fresh context for this item only
            prompt = f"""You are processing item #{subtask.id} independently.

{system_prompt}

## Item to Process
{json.dumps(subtask.item, indent=2, ensure_ascii=False) if isinstance(subtask.item, dict) else str(subtask.item)}

## Task
{subtask.instruction}

Process this item thoroughly. You have full context available - no need to rush or compress.
Provide detailed, high-quality analysis.
"""
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        "https://api.openai.com/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.openai_api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": self.model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.3,
                            "max_tokens": 2000
                        }
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        subtask.result = result["choices"][0]["message"]["content"]
                        subtask.status = WideResearchStatus.COMPLETED
                    else:
                        subtask.error = f"API error: {response.status_code}"
                        subtask.status = WideResearchStatus.FAILED
                        
            except Exception as e:
                subtask.error = str(e)
                subtask.status = WideResearchStatus.FAILED
            
            subtask.processing_time = time.time() - start_time
            return subtask
    
    async def execute(
        self,
        items: List[Any],
        instruction: str,
        system_prompt: str = "",
        synthesis_prompt: str = None,
        progress_callback: Callable[[int, int], None] = None
    ) -> Dict[str, Any]:
        """
        Execute Wide Research on a list of items.
        
        Args:
            items: List of items to process (can be any type)
            instruction: What to do with each item
            system_prompt: Optional context for all agents
            synthesis_prompt: How to combine results (if None, returns raw results)
            progress_callback: Optional callback(completed, total) for progress updates
        
        Returns:
            Dict with results, timing, and synthesis
        """
        start_time = time.time()
        
        print(f"\n{'='*60}")
        print(f"🚀 WIDE RESEARCH: Processing {len(items)} items in parallel")
        print(f"   Max concurrent agents: {self.max_concurrent}")
        print(f"{'='*60}\n")
        
        # 1. TASK DECOMPOSITION - Create subtasks
        subtasks = [
            SubTask(
                id=str(i + 1),
                item=item,
                instruction=instruction
            )
            for i, item in enumerate(items)
        ]
        
        # 2. PARALLEL AGENT DEPLOYMENT - Process all items
        completed = 0
        async def process_with_progress(subtask):
            nonlocal completed
            result = await self.process_single_item(subtask, system_prompt)
            completed += 1
            if progress_callback:
                progress_callback(completed, len(subtasks))
            print(f"   ✓ Item #{subtask.id} completed ({completed}/{len(subtasks)})")
            return result
        
        # Run all tasks in parallel (controlled by semaphore)
        results = await asyncio.gather(*[
            process_with_progress(st) for st in subtasks
        ])
        
        # 3. COLLECT RESULTS
        successful = [r for r in results if r.status == WideResearchStatus.COMPLETED]
        failed = [r for r in results if r.status == WideResearchStatus.FAILED]
        
        processing_time = time.time() - start_time
        
        print(f"\n✅ Wide Research completed:")
        print(f"   Successful: {len(successful)}/{len(items)}")
        print(f"   Failed: {len(failed)}/{len(items)}")
        print(f"   Total time: {processing_time:.1f}s")
        print(f"   Avg time per item: {processing_time/len(items):.2f}s")
        
        # 4. RESULT SYNTHESIS (optional)
        synthesis = None
        if synthesis_prompt and successful:
            print(f"\n📊 Synthesizing {len(successful)} results...")
            synthesis = await self._synthesize_results(
                [s.result for s in successful],
                synthesis_prompt
            )
        
        return {
            "success": True,
            "total_items": len(items),
            "successful_count": len(successful),
            "failed_count": len(failed),
            "results": [
                {
                    "id": s.id,
                    "item": s.item,
                    "result": s.result,
                    "processing_time": s.processing_time,
                    "status": s.status.value
                }
                for s in successful
            ],
            "failures": [
                {
                    "id": f.id,
                    "item": f.item,
                    "error": f.error
                }
                for f in failed
            ],
            "synthesis": synthesis,
            "total_processing_time": processing_time,
            "average_time_per_item": processing_time / len(items) if items else 0
        }
    
    async def _synthesize_results(
        self,
        results: List[str],
        synthesis_prompt: str
    ) -> str:
        """
        Synthesize individual results into a final output.
        Uses a dedicated agent for synthesis.
        """
        import httpx
        
        # Truncate results if too long for synthesis
        combined_results = "\n\n---\n\n".join([
            f"## Result {i+1}\n{r[:2000]}" 
            for i, r in enumerate(results)
        ])
        
        prompt = f"""{synthesis_prompt}

## Individual Results ({len(results)} items)
{combined_results}

Now synthesize these results according to the instructions above.
Create a unified, well-organized output.
"""
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.5,
                        "max_tokens": 4000
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result["choices"][0]["message"]["content"]
                    
        except Exception as e:
            return f"Synthesis failed: {str(e)}"
        
        return None


# Convenience functions for common use cases

async def research_companies(
    company_names: List[str],
    research_focus: str = "overview, products, competitors",
    max_concurrent: int = 5
) -> Dict[str, Any]:
    """
    Research multiple companies in parallel.
    Each company gets thorough, independent research.
    """
    wr = WideResearch(max_concurrent=max_concurrent)
    
    return await wr.execute(
        items=company_names,
        instruction=f"""Research this company and provide:
- Company overview and history
- Main products/services
- Target market
- Key competitors
- Recent news or developments
- {research_focus}""",
        synthesis_prompt="""Create a comprehensive comparison table of all researched companies.
Include columns for: Company Name, Industry, Key Products, Target Market, Competitive Position.
Follow with key insights about the market landscape."""
    )


async def analyze_products(
    products: List[Dict],
    analysis_criteria: str = "features, pricing, target audience",
    max_concurrent: int = 10
) -> Dict[str, Any]:
    """
    Analyze multiple products in parallel.
    Each product gets full, undegraded analysis.
    """
    wr = WideResearch(max_concurrent=max_concurrent)
    
    return await wr.execute(
        items=products,
        instruction=f"""Analyze this product and extract:
- Product name and brand
- Key features and specifications
- Price point and value proposition
- Target audience
- Strengths and weaknesses
- {analysis_criteria}""",
        synthesis_prompt="""Create a product comparison matrix.
Organize by category, then rank by value proposition.
Highlight top picks and best values."""
    )


async def batch_content_generation(
    topics: List[str],
    content_type: str = "blog post outline",
    max_concurrent: int = 5
) -> Dict[str, Any]:
    """
    Generate content for multiple topics in parallel.
    Each piece gets full creative attention.
    """
    wr = WideResearch(max_concurrent=max_concurrent)
    
    return await wr.execute(
        items=topics,
        instruction=f"""Create a {content_type} for this topic:
- Engaging hook
- Key points to cover
- Supporting evidence needed
- Call to action
- Target keywords""",
        synthesis_prompt=None  # Keep individual results separate
    )
