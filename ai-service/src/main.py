"""
CoalGuard.AI — AI Intelligence FastAPI Application
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timedelta
import os

from .config import get_settings
from .database import init_db, get_session, Base

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown


app = FastAPI(
    title="CoalGuard.AI Intelligence API",
    description="AI Intelligence Subsystem for anomaly detection, prediction, investigation, research, and agentic workflows",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "coalguard-ai-intelligence",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "0.2.0",
    }


# Include routers
from .routes import anomaly, prediction, investigation, research, notification
from .routes import agent, training, events, ml_anomaly, chatbot

app.include_router(anomaly.router, prefix="/api/v1/anomaly", tags=["anomaly"])
app.include_router(ml_anomaly.router, prefix="/api/v1/ml-anomaly", tags=["ml-anomaly"])
app.include_router(prediction.router, prefix="/api/v1/prediction", tags=["prediction"])
app.include_router(investigation.router, prefix="/api/v1/investigation", tags=["investigation"])
app.include_router(research.router, prefix="/api/v1/research", tags=["research"])
app.include_router(notification.router, prefix="/api/v1/ai-notification", tags=["ai-notification"])
app.include_router(agent.router, prefix="/api/v1/agent", tags=["agent"])
app.include_router(training.router, prefix="/api/v1/training", tags=["training"])
app.include_router(events.router, prefix="/api/v1/events", tags=["events"])
app.include_router(chatbot.router, prefix="/api/v1/chat", tags=["chat"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)