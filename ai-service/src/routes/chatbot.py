"""
CoalGuard.AI — AI Assistant Chatbot Routes

REST API for conversational AI assistant with RAG, agent reasoning, and risk analysis.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..chatbot import chatbot_service, ChatSession, ChatMessage

router = APIRouter()


@router.post("/sessions", response_model=Dict[str, Any])
async def create_chat_session(
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session),
):
    """Create a new chat session."""
    user_id = request.get("user_id", "anonymous")
    mine_ids = request.get("mine_ids", [])
    chat_session = chatbot_service.create_session(user_id, mine_ids)
    return chat_session.to_dict()


@router.get("/sessions", response_model=List[Dict[str, Any]])
async def list_chat_sessions(
    user_id: str = Query(..., description="User ID"),
):
    """List all chat sessions for a user."""
    sessions = chatbot_service.list_sessions(user_id)
    return [s.to_dict() for s in sessions]


@router.get("/sessions/{session_id}", response_model=Dict[str, Any])
async def get_chat_session(
    session_id: str,
):
    """Get a specific chat session."""
    session = chatbot_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session.to_dict()


@router.delete("/sessions/{session_id}", response_model=Dict[str, Any])
async def delete_chat_session(
    session_id: str,
):
    """Delete a chat session."""
    success = chatbot_service.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "deleted", "session_id": session_id}


@router.post("/sessions/{session_id}/message", response_model=Dict[str, Any])
async def send_message(
    session_id: str,
    request: Dict[str, Any],
    db_session: AsyncSession = Depends(get_session),
):
    """Send a message to the AI assistant."""
    session = chatbot_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    user_message = request.get("message", "")
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    user_id = request.get("user_id", session.user_id)
    mine_ids = request.get("mine_ids", session.mine_ids)

    try:
        response = await chatbot_service.chat(
            session_id=session_id,
            user_message=user_message,
            user_id=user_id,
            mine_ids=mine_ids,
        )
        return response.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=Dict[str, Any])
async def chatbot_health():
    """Check chatbot service health."""
    return {
        "service": "ai_assistant",
        "status": "healthy",
        "active_sessions": len(chatbot_service.sessions),
        "timestamp": datetime.utcnow().isoformat(),
    }