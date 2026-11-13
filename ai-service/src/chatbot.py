"""
CoalGuard.AI — AI Assistant Chatbot Service

Provides a conversational AI assistant that uses:
- RAG (Retrieval-Augmented Generation) over authorized documents
- Multi-agent reasoning via LangGraph investigation workflow
- AI risk analysis and prediction insights
- Mine-scoped access control
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any, AsyncGenerator
from datetime import datetime
import uuid
import json
import logging
import httpx

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from .config import get_settings
from .database import get_session, async_session
from .database import (
    InvestigationRecord,
    AnomalyFinding,
    PredictionRecord,
    ExternalEvidenceRecord,
    FactorComparisonResult,
    RiskAssessmentRecord,
    AINotificationRecord,
    ResearchQuery,
    ExternalEvidenceRecord,
)
from .rag import create_rag_service, RAGQueryEngine
from .agent import InvestigationAgent

settings = get_settings()
logger = logging.getLogger(__name__)


class ChatMessage:
    """Represents a chat message."""

    def __init__(
        self,
        role: str,
        content: str,
        citations: Optional[List[Dict[str, Any]]] = None,
        risk_assessment: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ):
        self.role = role
        self.content = content
        self.citations = citations or []
        self.risk_assessment = risk_assessment
        self.timestamp = timestamp or datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "citations": self.citations,
            "risk_assessment": self.risk_assessment,
            "timestamp": self.timestamp,
        }


class ChatSession:
    """Manages a chat conversation session."""

    def __init__(self, session_id: str, user_id: str, mine_ids: List[str]):
        self.session_id = session_id
        self.user_id = user_id
        self.mine_ids = mine_ids
        self.messages: List[ChatMessage] = []
        self.created_at = datetime.utcnow().isoformat()
        self.updated_at = self.created_at

    def add_message(self, message: ChatMessage) -> None:
        self.messages.append(message)
        self.updated_at = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "mine_ids": self.mine_ids,
            "messages": [m.to_dict() for m in self.messages],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class ChatbotService:
    """
    AI Assistant chatbot service that combines:
    1. RAG retrieval over authorized documents
    2. Multi-agent investigation workflow
    3. AI risk analysis and predictions
    4. Mine-scoped access control
    """

    def __init__(self):
        self.sessions: Dict[str, ChatSession] = {}
        self._rag_service = None
        self._agent = None

    def _get_rag_service(self, db_session) -> RAGQueryEngine:
        if self._rag_service is None:
            from .rag import create_rag_service
            rag_service = create_rag_service(db_session)
            self._rag_service = RAGQueryEngine(rag_service)
        return self._rag_service

    def _get_agent(self) -> InvestigationAgent:
        if self._agent is None:
            self._agent = InvestigationAgent()
        return self._agent

    def create_session(
        self, user_id: str, mine_ids: List[str]
    ) -> ChatSession:
        """Create a new chat session."""
        session_id = f"chat-{uuid.uuid4().hex[:12]}"
        session = ChatSession(session_id, user_id, mine_ids)
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Get an existing chat session."""
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """Delete a chat session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False

    def list_sessions(self, user_id: str) -> List[ChatSession]:
        """List all sessions for a user."""
        return [s for s in self.sessions.values() if s.user_id == user_id]

    async def chat(
        self,
        session_id: str,
        user_message: str,
        user_id: str,
        mine_ids: List[str],
    ) -> ChatMessage:
        """
        Process a user message through the AI assistant pipeline:
        1. Retrieve relevant context via RAG
        2. Run agent investigation if needed
        3. Generate risk assessment if relevant
        4. Return grounded response with citations
        """
        session = self.get_session(session_id)
        if not session:
            session = self.create_session(user_id, mine_ids)

        # Add user message
        user_msg = ChatMessage(role="user", content=user_message)
        session.add_message(user_msg)

        async with async_session() as db_session:
            # Step 1: RAG retrieval for relevant context
            rag = self._get_rag_service(db_session)
            rag_result = await rag.query_with_context(
                query=user_message,
                mine_ids=session.mine_ids if session.mine_ids else None,
                n_results=5,
            )

            # Step 2: Check if this is a risk-related query
            risk_keywords = [
                "risk", "anomaly", "violation", "incident", "safety",
                "compliance", "overdue", "critical", "hazard", "alert",
            ]
            is_risk_query = any(kw in user_message.lower() for kw in risk_keywords)

            risk_assessment = None
            if is_risk_query:
                # Get recent risk assessments for user's mines
                from sqlalchemy import select
                from .database import RiskAssessmentRecord
                result = await db_session.execute(
                    select(RiskAssessmentRecord)
                    .where(RiskAssessmentRecord.mine_id.in_(session.mine_ids))
                    .order_by(RiskAssessmentRecord.created_at.desc())
                    .limit(5)
                )
                recent_assessments = result.scalars().all()
                if recent_assessments:
                    risk_assessment = {
                        "risk_level": recent_assessments[0].operational_risk_band,
                        "event_category": recent_assessments[0].event_category,
                        "probability": recent_assessments[0].estimated_probability,
                        "explanation": recent_assessments[0].explanation,
                    }

            # Step 3: Run agent investigation for complex queries
            investigation_keywords = [
                "investigate", "why", "cause", "factor", "correlate",
                "explain", "analyze", "review", "audit",
            ]
            is_investigation = any(kw in user_message.lower() for kw in investigation_keywords)

            agent_context = None
            if is_investigation and session.mine_ids:
                agent = self._get_agent()
                try:
                    inv_result = await agent.run_investigation(
                        investigation_id=f"chat-{session_id}",
                        mine_id=session.mine_ids[0] if session.mine_ids else "",
                        trigger_event_type="user_query",
                        trigger_event_id=session_id,
                        correlation_id=session_id,
                    )
                    agent_context = inv_result
                except Exception as e:
                    logger.warning(f"Agent investigation failed: {e}")

            # Step 4: Generate grounded response
            response = self._generate_response(
                user_message=user_message,
                rag_context=rag_result,
                risk_assessment=risk_assessment,
                agent_context=agent_context,
            )

            assistant_msg = ChatMessage(
                role="assistant",
                content=response["content"],
                citations=response["citations"],
                risk_assessment=risk_assessment,
            )
            session.add_message(assistant_msg)

            return assistant_msg

    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> str:
        """
        Call the LLM provider using CHATBOT_API_KEY.
        
        Supports OpenAI-compatible chat completions API.
        If no API key is configured, returns an error message.
        """
        api_key = settings.chatbot_api_key
        if not api_key:
            raise ValueError(
                "CHATBOT_API_KEY is not configured. "
                "Please set the CHATBOT_API_KEY environment variable to use the AI assistant."
            )

        # Determine provider from API key prefix or default to OpenAI-compatible
        # You can extend this to support Anthropic, Azure, etc.
        base_url = settings.chatbot_base_url if hasattr(settings, 'chatbot_base_url') else "https://api.openai.com/v1"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": settings.chatbot_model if hasattr(settings, 'chatbot_model') else "gpt-3.5-turbo",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as e:
            logger.error(f"LLM API error: {e.response.status_code} - {e.response.text}")
            raise ValueError(f"LLM API error: {e.response.status_code}")
        except Exception as e:
            logger.error(f"LLM API call failed: {e}")
            raise ValueError(f"LLM API call failed: {str(e)}")

    async def _generate_response(
        self,
        user_message: str,
        rag_result: Dict[str, Any],
        risk_assessment: Optional[Dict[str, Any]],
        agent_context: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Generate a grounded response using the LLM API with CHATBOT_API_KEY.
        """
        context_parts = rag_result.get("context", "")
        sources = rag_result.get("sources", [])

        # Build system prompt with context
        system_prompt = """You are CoalGuard.AI Assistant, an AI assistant for coal mining governance and compliance.

You have access to the following context from authorized records:
{context}

Use this information to answer the user's question. Always cite your sources when referencing specific documents. 
If the information is not available in the provided context, say so clearly - do not fabricate information.
Always distinguish between factual observations from records and model predictions/risk assessments.
Be concise and professional.

Available context:
{context_text}"""

        context_text = context_parts if context_parts and context_parts != "No relevant documents found." else "No relevant documents found in the knowledge base."

        messages = [
            {"role": "system", "content": system_prompt.format(context_text=context_text)},
        ]

        # Add risk assessment context if available
        if risk_assessment:
            risk_context = (
                f"\n\nRisk Assessment Context:\n"
                f"- Risk Level: {risk_assessment.get('risk_level', 'unknown')}\n"
                f"- Event Category: {risk_assessment.get('event_category', 'N/A')}\n"
                f"- Probability: {risk_assessment.get('probability', 'N/A')}\n"
                f"- Explanation: {risk_assessment.get('explanation', 'No details available')}"
            )
            messages[0]["content"] += risk_context

        # Add agent investigation context if available
        if agent_context and agent_context.get("risk_assessment"):
            ra = agent_context["risk_assessment"]
            agent_context_text = (
                f"\n\nInvestigation Findings:\n"
                f"- Stage: {agent_context.get('current_stage', 'unknown')}\n"
                f"- Risk Assessment: {ra.get('operational_risk_band', 'unknown')}\n"
                f"- Explanation: {ra.get('explanation', 'No details available')}"
            )
            messages[0]["content"] += agent_context_text

        messages.append({"role": "user", "content": user_message})

        try:
            llm_response = await self._call_llm(messages)
        except ValueError as e:
            # Fallback to context-only response if LLM is unavailable
            logger.warning(f"LLM call failed, falling back to context-only: {e}")
            response_parts = []
            if context_parts and context_parts != "No relevant documents found.":
                response_parts.append(f"Based on available records:\n{context_parts}")
            if risk_assessment:
                response_parts.append(
                    f"\n\n**Risk Assessment:**\n"
                    f"- Risk Level: {risk_assessment.get('risk_level', 'unknown')}\n"
                    f"- Event Category: {risk_assessment.get('event_category', 'N/A')}\n"
                    f"- Explanation: {risk_assessment.get('explanation', 'No details available')}"
                )
            if agent_context and agent_context.get("risk_assessment"):
                ra = agent_context["risk_assessment"]
                response_parts.append(
                    f"\n\n**Investigation Findings:**\n"
                    f"- Stage: {agent_context.get('current_stage', 'unknown')}\n"
                    f"- Risk Assessment: {ra.get('operational_risk_band', 'unknown')}\n"
                    f"- Explanation: {ra.get('explanation', 'No details available')}"
                )
            if not response_parts:
                response_parts.append(
                    "I don't have enough information in the available records to answer that question. "
                    "Please try asking about a specific mine, inspection, incident, or compliance matter."
                )
            return {
                "content": "\n".join(response_parts),
                "citations": [],
                "llm_error": str(e),
            }

        # Build citations from sources
        citations = []
        for src in sources[:5]:
            citations.append({
                "document_id": src.get("document_id", ""),
                "source_type": src.get("source_type", "document"),
                "score": src.get("score", 0),
                "metadata": src.get("metadata", {}),
            })

        return {
            "content": llm_response,
            "citations": citations,
        }


# Singleton instance
chatbot_service = ChatbotService()