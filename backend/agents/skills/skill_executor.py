"""
Skill Executor - Executes skills with appropriate tools and context.
"""

import os
import json
from typing import List, Dict, Any, Optional
from .skill_definitions import AgentSkill, get_skill, get_skills_for_task


class SkillExecutor:
    """
    Executes agent skills by combining skill instructions with available tools.
    """
    
    def __init__(self, openai_api_key: str = None):
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.execution_history: List[Dict] = []
    
    def select_skills(self, task: str, max_skills: int = 3) -> List[AgentSkill]:
        """
        Automatically select the most relevant skills for a task.
        """
        matched_skills = get_skills_for_task(task, threshold=0.2)
        return matched_skills[:max_skills]
    
    def build_skill_prompt(self, task: str, skills: List[AgentSkill], context: str = "") -> str:
        """
        Build a comprehensive prompt that incorporates skill instructions.
        """
        skill_instructions = []
        for skill in skills:
            skill_instructions.append(f"""
### Skill: {skill.name}
**Category:** {skill.category.value}
**Instructions:**
{skill.instructions}
**Expected Output Format:** {skill.output_format}
""")
        
        skills_text = "".join(skill_instructions)
        context_section = f"## Context\n{context}" if context else ""
        
        prompt = f"""You are an AI agent equipped with specialized skills. Use the following skills to complete the task.

## Equipped Skills
{skills_text}

## Task
{task}

{context_section}

## Instructions
1. Analyze the task and determine which equipped skills to apply
2. Follow the skill instructions precisely
3. Produce output in the expected format
4. Be thorough and detailed in your analysis
5. Cite sources where applicable

Now complete the task using your equipped skills:
"""
        return prompt
    
    async def execute_with_skills(
        self, 
        task: str, 
        skill_ids: List[str] = None,
        context: str = "",
        model: str = "gpt-4o-mini"
    ) -> Dict[str, Any]:
        """
        Execute a task using specified or auto-selected skills.
        """
        import httpx
        
        # Auto-select skills if not specified
        if skill_ids:
            skills = [get_skill(sid) for sid in skill_ids if get_skill(sid)]
        else:
            skills = self.select_skills(task)
        
        if not skills:
            return {
                "success": False,
                "error": "No matching skills found for this task",
                "skills_used": []
            }
        
        # Build the prompt
        prompt = self.build_skill_prompt(task, skills, context)
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                        "max_tokens": 4000
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    output = result["choices"][0]["message"]["content"]
                    
                    # Log execution
                    execution_record = {
                        "task": task,
                        "skills_used": [s.id for s in skills],
                        "success": True,
                        "output_length": len(output)
                    }
                    self.execution_history.append(execution_record)
                    
                    return {
                        "success": True,
                        "output": output,
                        "skills_used": [s.id for s in skills],
                        "skill_names": [s.name for s in skills]
                    }
                else:
                    return {
                        "success": False,
                        "error": f"API error: {response.status_code}",
                        "skills_used": [s.id for s in skills]
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "skills_used": [s.id for s in skills]
            }
    
    def get_available_skills(self) -> List[Dict[str, str]]:
        """
        Return list of all available skills with descriptions.
        """
        from .skill_definitions import AGENT_SKILLS
        return [
            {
                "id": skill.id,
                "name": skill.name,
                "description": skill.description,
                "category": skill.category.value,
                "triggers": skill.triggers
            }
            for skill in AGENT_SKILLS.values()
        ]
