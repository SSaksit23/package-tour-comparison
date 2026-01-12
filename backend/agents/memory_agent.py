"""
Memory Agent using Mem0

Provides persistent memory for the AI system to:
- Remember user preferences (budget, travel style, destinations)
- Store past analysis summaries
- Recall relevant context for personalized recommendations
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime

# Try to import mem0, fallback to simple in-memory storage
try:
    from mem0 import Memory
    MEM0_AVAILABLE = True
except ImportError:
    MEM0_AVAILABLE = False
    print("⚠️ Mem0 not available, using fallback in-memory storage")


class SimpleMemoryStore:
    """Fallback in-memory storage when Mem0 is not available"""
    
    def __init__(self):
        self.memories: Dict[str, List[Dict]] = {}
    
    def add(self, messages: List[Dict], user_id: str, metadata: Optional[Dict] = None) -> Dict:
        if user_id not in self.memories:
            self.memories[user_id] = []
        
        memory_entry = {
            "id": f"mem_{len(self.memories[user_id])}_{datetime.now().timestamp()}",
            "messages": messages,
            "metadata": metadata or {},
            "created_at": datetime.now().isoformat()
        }
        self.memories[user_id].append(memory_entry)
        
        return {"results": [memory_entry]}
    
    def search(self, query: str, user_id: str, limit: int = 5) -> Dict:
        user_memories = self.memories.get(user_id, [])
        
        # Simple keyword matching
        query_lower = query.lower()
        relevant = []
        
        for mem in user_memories:
            for msg in mem.get("messages", []):
                content = msg.get("content", "").lower()
                if any(word in content for word in query_lower.split()):
                    relevant.append({
                        "id": mem["id"],
                        "memory": msg.get("content", ""),
                        "metadata": mem.get("metadata", {}),
                        "score": 0.8  # Placeholder score
                    })
                    break
        
        return {"results": relevant[:limit]}
    
    def get_all(self, user_id: str) -> Dict:
        return {"results": self.memories.get(user_id, [])}
    
    def delete(self, memory_id: str) -> bool:
        for user_memories in self.memories.values():
            for i, mem in enumerate(user_memories):
                if mem["id"] == memory_id:
                    user_memories.pop(i)
                    return True
        return False


class MemoryAgent:
    """
    Memory Agent for Travel Itinerary Analyzer
    
    Uses Mem0 for persistent, intelligent memory storage.
    Falls back to simple in-memory storage if Mem0 is unavailable.
    """
    
    def __init__(self, openai_api_key: Optional[str] = None):
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        
        if MEM0_AVAILABLE and self.openai_api_key:
            try:
                config = {
                    "llm": {
                        "provider": "openai",
                        "config": {
                            "model": "gpt-4o-mini",
                            "api_key": self.openai_api_key
                        }
                    },
                    "embedder": {
                        "provider": "openai",
                        "config": {
                            "model": "text-embedding-3-small",
                            "api_key": self.openai_api_key
                        }
                    },
                    "version": "v1.1"
                }
                self.memory = Memory.from_config(config)
                self.using_mem0 = True
                print("✅ Mem0 memory agent initialized")
            except Exception as e:
                print(f"⚠️ Mem0 initialization failed: {e}, using fallback")
                self.memory = SimpleMemoryStore()
                self.using_mem0 = False
        else:
            self.memory = SimpleMemoryStore()
            self.using_mem0 = False
            print("ℹ️ Using simple in-memory storage")
    
    def add_memory(
        self, 
        content: str, 
        user_id: str = "default",
        memory_type: str = "general",
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Add a memory to the store
        
        Args:
            content: The content to remember
            user_id: Unique user identifier
            memory_type: Type of memory (preference, analysis, feedback, etc.)
            metadata: Additional metadata
        
        Returns:
            Result of the memory addition
        """
        messages = [{"role": "user", "content": content}]
        meta = metadata or {}
        meta["type"] = memory_type
        meta["timestamp"] = datetime.now().isoformat()
        
        try:
            result = self.memory.add(messages, user_id=user_id, metadata=meta)
            return {
                "success": True,
                "using_mem0": self.using_mem0,
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def search_memories(
        self, 
        query: str, 
        user_id: str = "default",
        limit: int = 5
    ) -> Dict[str, Any]:
        """
        Search for relevant memories
        
        Args:
            query: Search query
            user_id: User to search memories for
            limit: Maximum number of results
        
        Returns:
            Relevant memories
        """
        try:
            result = self.memory.search(query, user_id=user_id, limit=limit)
            return {
                "success": True,
                "memories": result.get("results", []),
                "count": len(result.get("results", []))
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "memories": []
            }
    
    def get_all_memories(self, user_id: str = "default") -> Dict[str, Any]:
        """Get all memories for a user"""
        try:
            result = self.memory.get_all(user_id=user_id)
            return {
                "success": True,
                "memories": result.get("results", []),
                "count": len(result.get("results", []))
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "memories": []
            }
    
    def delete_memory(self, memory_id: str) -> Dict[str, Any]:
        """Delete a specific memory"""
        try:
            self.memory.delete(memory_id)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def remember_user_preference(
        self, 
        user_id: str,
        preference_type: str,
        value: Any
    ) -> Dict[str, Any]:
        """
        Remember a specific user preference
        
        preference_type examples:
        - budget_range: "20000-30000 THB"
        - travel_style: "luxury", "budget", "adventure"
        - preferred_destinations: ["Japan", "Europe"]
        - group_size: "couple", "family", "solo"
        """
        content = f"User preference - {preference_type}: {value}"
        return self.add_memory(
            content=content,
            user_id=user_id,
            memory_type="preference",
            metadata={"preference_type": preference_type, "value": str(value)}
        )
    
    def remember_analysis_result(
        self,
        user_id: str,
        itinerary_name: str,
        summary: str,
        score: Optional[float] = None
    ) -> Dict[str, Any]:
        """Remember an analysis result for future reference"""
        content = f"Analyzed itinerary '{itinerary_name}': {summary}"
        return self.add_memory(
            content=content,
            user_id=user_id,
            memory_type="analysis",
            metadata={
                "itinerary_name": itinerary_name,
                "score": score
            }
        )
    
    def get_user_context(self, user_id: str, query: str = "") -> str:
        """
        Get relevant user context for personalization
        
        Returns a string that can be added to AI prompts for context
        """
        # Get preferences
        prefs = self.search_memories(
            query="user preference budget style destination",
            user_id=user_id,
            limit=5
        )
        
        # Get recent analyses
        analyses = self.search_memories(
            query=query or "itinerary analysis",
            user_id=user_id,
            limit=3
        )
        
        context_parts = []
        
        if prefs.get("memories"):
            context_parts.append("User Preferences:")
            for mem in prefs["memories"]:
                context_parts.append(f"  - {mem.get('memory', '')}")
        
        if analyses.get("memories"):
            context_parts.append("\nRecent Analyses:")
            for mem in analyses["memories"]:
                context_parts.append(f"  - {mem.get('memory', '')}")
        
        return "\n".join(context_parts) if context_parts else ""

