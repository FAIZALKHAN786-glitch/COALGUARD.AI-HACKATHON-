"""
CoalGuard.AI — Event Streaming Routes
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..events import (
    event_producer, event_consumer, event_bridge,
    CoalGuardEvent, EventType, EventPriority,
    KAFKA_AVAILABLE,
)

router = APIRouter()


@router.post("/events/publish", response_model=Dict[str, Any])
async def publish_event(
    request: Dict[str, Any],
):
    """Publish a domain event to Kafka."""
    event = CoalGuardEvent(
        event_type=request["event_type"],
        mine_id=request["mine_id"],
        entity_type=request["entity_type"],
        entity_id=request["entity_id"],
        payload=request.get("payload", {}),
        correlation_id=request.get("correlation_id"),
        causation_id=request.get("causation_id"),
        priority=EventPriority(request.get("priority", "medium")),
        source_service=request.get("source_service", "api"),
    )

    success = await event_producer.publish(event)

    return {
        "event_id": event.event_id,
        "published": success,
        "topic": f"coalguard.{event.event_type}",
    }


@router.post("/events/publish/batch", response_model=Dict[str, Any])
async def publish_batch_events(
    request: Dict[str, Any],
):
    """Publish multiple events."""
    events = []
    for evt_data in request.get("events", []):
        event = CoalGuardEvent(
            event_type=evt_data["event_type"],
            mine_id=evt_data["mine_id"],
            entity_type=evt_data["entity_type"],
            entity_id=evt_data["entity_id"],
            payload=evt_data.get("payload", {}),
            correlation_id=evt_data.get("correlation_id"),
            causation_id=evt_data.get("causation_id"),
            priority=EventPriority(evt_data.get("priority", "medium")),
            source_service=evt_data.get("source_service", "api"),
        )
        events.append(event)

    results = await event_producer.publish_batch(events)

    return {
        "published_count": sum(1 for r in results if r),
        "total_count": len(results),
        "event_ids": [e.event_id for e in events],
    }


@router.post("/events/consume/start", response_model=Dict[str, Any])
async def start_consumption(
    request: Dict[str, Any],
    background_tasks: BackgroundTasks,
):
    """Start consuming events from Kafka."""
    topics = request.get("topics", ["coalguard.inspection.submitted", "coalguard.safety.incident_reported"])

    event_consumer.topics = topics

    async def _consume():
        await event_consumer.initialize()
        await event_consumer.consume()

    background_tasks.add_task(_consume)

    return {
        "status": "consumption_started",
        "topics": topics,
        "group_id": event_consumer.group_id,
    }


@router.post("/events/consume/stop", response_model=Dict[str, Any])
async def stop_consumption():
    """Stop event consumption."""
    await event_consumer.stop()
    return {"status": "consumption_stopped"}


@router.post("/events/handlers/register", response_model=Dict[str, Any])
async def register_event_handler(
    request: Dict[str, Any],
):
    """Register a handler for an event type."""
    event_type = request["event_type"]
    handler_name = request.get("handler_name", "default")

    # Register a placeholder handler
    async def default_handler(event):
        from ..events import logger
        logger.info(f"Default handler for {event_type}: {event.event_id}")

    event_consumer.register_handler(event_type, default_handler)

    return {
        "event_type": event_type,
        "handler": handler_name,
        "registered": True,
    }


@router.get("/events/health", response_model=Dict[str, Any])
async def events_health():
    """Check event streaming health."""
    return {
        "kafka_available": KAFKA_AVAILABLE,
        "producer_initialized": event_producer._initialized,
        "consumer_topics": event_consumer.topics,
        "consumer_group": event_consumer.group_id,
        "registered_handlers": list(event_consumer.handlers.keys()),
        "bootstrap_servers": event_producer.bootstrap_servers,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/events/bridge/process", response_model=Dict[str, Any])
async def process_event_through_bridge(
    request: Dict[str, Any],
):
    """Process an event through the AI event bridge."""
    event = CoalGuardEvent(
        event_type=request["event_type"],
        mine_id=request["mine_id"],
        entity_type=request["entity_type"],
        entity_id=request["entity_id"],
        payload=request.get("payload", {}),
        correlation_id=request.get("correlation_id"),
        causation_id=request.get("causation_id"),
        priority=EventPriority(request.get("priority", "medium")),
        source_service=request.get("source_service", "backend"),
    )

    await event_bridge.handle_event(event)

    return {
        "event_id": event.event_id,
        "processed": True,
        "bridge": "ai-service",
    }


@router.get("/events/topics", response_model=Dict[str, Any])
async def list_event_topics():
    """List available event topics."""
    topics = []
    for event_type in EventType:
        topics.append({
            "topic": f"coalguard.{event_type.value}",
            "event_type": event_type.value,
        })
    return {
        "topics": topics,
        "topic_prefix": "coalguard",
        "count": len(topics),
    }
