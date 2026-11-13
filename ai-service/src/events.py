"""
CoalGuard.AI — Real-Time Event Streaming

Kafka-based event distribution for the AI intelligence subsystem.
Publishes domain events and consumes events from the Fastify backend.
"""

from __future__ import annotations

from typing import Dict, Any, Optional, List, Callable, Awaitable
from datetime import datetime
import json
import asyncio
import logging
from enum import Enum

try:
    from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False

from .config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """Domain event types for the CoalGuard.AI platform."""

    # Document events
    DOCUMENT_UPLOADED = "document.uploaded"
    DOCUMENT_PROCESSED = "document.processed"
    DOCUMENT_FAILED = "document.failed"

    # Inspection events
    INSPECTION_SUBMITTED = "inspection.submitted"
    INSPECTION_COMPLETED = "inspection.completed"
    INSPECTION_ANOMALY_DETECTED = "inspection.anomaly_detected"

    # Safety events
    SAFETY_INCIDENT_REPORTED = "safety.incident_reported"
    SAFETY_OBSERVATION_CREATED = "safety.observation_created"

    # Compliance events
    COMPLIANCE_VIOLATION_CREATED = "compliance.violation_created"
    COMPLIANCE_OVERDUE = "compliance.overdue"
    COMPLIANCE_SUBMITTED = "compliance.submitted"

    # Corrective action events
    CORRECTIVE_ACTION_ASSIGNED = "corrective_action.assigned"
    CORRECTIVE_ACTION_OVERDUE = "corrective_action.overdue"
    CORRECTIVE_ACTION_COMPLETED = "corrective_action.completed"

    # Environmental events
    ENVIRONMENTAL_EXCEEDANCE = "environmental.exceedance"
    ENVIRONMENTAL_ALERT = "environmental.alert"

    # Production events
    PRODUCTION_ANOMALY_DETECTED = "production.anomaly_detected"
    PRODUCTION_DEVIATION = "production.deviation"

    # AI events
    AI_ANOMALY_DETECTED = "ai.anomaly_detected"
    AI_PREDICTION_GENERATED = "ai.prediction_generated"
    AI_INVESTIGATION_STARTED = "ai.investigation_started"
    AI_RISK_ASSESSMENT_COMPLETED = "ai.risk_assessment_completed"
    AI_NOTIFICATION_SENT = "ai.notification_sent"


class EventPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class CoalGuardEvent:
    """Standard event envelope for CoalGuard.AI."""

    def __init__(
        self,
        event_type: str,
        mine_id: str,
        entity_type: str,
        entity_id: str,
        payload: Dict[str, Any],
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
        priority: EventPriority = EventPriority.MEDIUM,
        source_service: str = "ai-service",
    ):
        self.event_id = f"evt-{uuid.uuid4().hex[:12]}"
        self.event_type = event_type
        self.mine_id = mine_id
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.payload = payload
        self.correlation_id = correlation_id
        self.causation_id = causation_id
        self.priority = priority.value
        self.source_service = source_service
        self.timestamp = datetime.utcnow().isoformat()
        self.schema_version = "1.0"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "mine_id": self.mine_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "payload": self.payload,
            "correlation_id": self.correlation_id,
            "causation_id": self.causation_id,
            "priority": self.priority,
            "source_service": self.source_service,
            "timestamp": self.timestamp,
            "schema_version": self.schema_version,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)


import uuid  # noqa: E402


class EventProducer:
    """Kafka event producer for publishing domain events."""

    def __init__(
        self,
        bootstrap_servers: str = "localhost:9092",
        topic_prefix: str = "coalguard",
    ):
        self.bootstrap_servers = bootstrap_servers
        self.topic_prefix = topic_prefix
        self.producer: Optional[AIOKafkaProducer] = None
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the Kafka producer."""
        if not KAFKA_AVAILABLE:
            logger.warning("aiokafka not installed. Event streaming will use in-memory mode.")
            self._initialized = True
            return

        try:
            self.producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                acks="all",
                retries=3,
            )
            await self.producer.start()
            self._initialized = True
            logger.info(f"Kafka producer initialized at {self.bootstrap_servers}")
        except Exception as e:
            logger.error(f"Failed to initialize Kafka producer: {e}")
            self._initialized = True  # Continue in fallback mode

    async def publish(self, event: CoalGuardEvent) -> bool:
        """Publish an event to Kafka."""
        if not self._initialized:
            await self.initialize()

        topic = f"{self.topic_prefix}.{event.event_type}"

        if self.producer:
            try:
                await self.producer.send_and_wait(
                    topic=topic,
                    key=event.event_id,
                    value=event.to_dict(),
                )
                logger.debug(f"Published event {event.event_id} to {topic}")
                return True
            except Exception as e:
                logger.error(f"Failed to publish event {event.event_id}: {e}")
                return False
        else:
            # Fallback: log event (in-memory mode)
            logger.info(f"EVENT (fallback): {topic} | {event.event_id} | {event.event_type}")
            return True

    async def publish_batch(self, events: List[CoalGuardEvent]) -> List[bool]:
        """Publish multiple events."""
        results = []
        for event in events:
            results.append(await self.publish(event))
        return results

    async def close(self) -> None:
        """Close the producer."""
        if self.producer:
            await self.producer.stop()


class EventConsumer:
    """Kafka event consumer for consuming domain events from other services."""

    def __init__(
        self,
        bootstrap_servers: str = "localhost:9092",
        group_id: str = "ai-service",
        topics: Optional[List[str]] = None,
    ):
        self.bootstrap_servers = bootstrap_servers
        self.group_id = group_id
        self.topics = topics or []
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.handlers: Dict[str, List[Callable[[CoalGuardEvent], Awaitable[None]]]] = {}
        self._running = False

    def register_handler(self, event_type: str, handler: Callable[[CoalGuardEvent], Awaitable[None]]) -> None:
        """Register a handler for an event type."""
        if event_type not in self.handlers:
            self.handlers[event_type] = []
        self.handlers[event_type].append(handler)

    async def initialize(self) -> None:
        """Initialize the Kafka consumer."""
        if not KAFKA_AVAILABLE:
            logger.warning("aiokafka not installed. Event consumption will not be available.")
            return

        try:
            self.consumer = AIOKafkaConsumer(
                *self.topics,
                bootstrap_servers=self.bootstrap_servers,
                group_id=self.group_id,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="latest",
                enable_auto_commit=True,
            )
            await self.consumer.start()
            logger.info(f"Kafka consumer initialized for topics: {self.topics}")
        except Exception as e:
            logger.error(f"Failed to initialize Kafka consumer: {e}")

    async def consume(self) -> None:
        """Start consuming events."""
        if not self.consumer:
            logger.error("Consumer not initialized")
            return

        self._running = True
        logger.info(f"Starting event consumption for {self.topics}")

        try:
            async for msg in self.consumer:
                if not self._running:
                    break

                try:
                    event_data = msg.value
                    event = CoalGuardEvent(
                        event_id=event_data.get("event_id", ""),
                        event_type=event_data.get("event_type", ""),
                        mine_id=event_data.get("mine_id", ""),
                        entity_type=event_data.get("entity_type", ""),
                        entity_id=event_data.get("entity_id", ""),
                        payload=event_data.get("payload", {}),
                        correlation_id=event_data.get("correlation_id"),
                        causation_id=event_data.get("causation_id"),
                        priority=EventPriority(event_data.get("priority", "medium")),
                        source_service=event_data.get("source_service", "unknown"),
                    )

                    logger.info(f"Received event: {event.event_type} | {event.event_id}")

                    # Dispatch to handlers
                    handlers = self.handlers.get(event.event_type, [])
                    for handler in handlers:
                        try:
                            await handler(event)
                        except Exception as e:
                            logger.error(f"Handler error for {event.event_type}: {e}")

                except Exception as e:
                    logger.error(f"Error processing message: {e}")

        except Exception as e:
            logger.error(f"Consumer error: {e}")
        finally:
            await self.stop()

    async def stop(self) -> None:
        """Stop consuming."""
        self._running = False
        if self.consumer:
            await self.consumer.stop()


# ---------------------------------------------------------------------------
# Event Bridge - connects Fastify backend events to AI service
# ---------------------------------------------------------------------------

class EventBridge:
    """Bridges events from the Fastify backend to the AI service."""

    def __init__(
        self,
        producer: EventProducer,
        investigation_agent=None,
        anomaly_service=None,
    ):
        self.producer = producer
        self.investigation_agent = investigation_agent
        self.anomaly_service = anomaly_service
        self.event_handlers: Dict[str, Callable] = {}

    def register_handler(self, event_type: str, handler: Callable) -> None:
        """Register an event handler."""
        self.event_handlers[event_type] = handler

    async def handle_event(self, event: CoalGuardEvent) -> None:
        """Handle an incoming event from the backend."""
        logger.info(f"EventBridge handling: {event.event_type}")

        # Dispatch to registered handlers
        handler = self.event_handlers.get(event.event_type)
        if handler:
            try:
                await handler(event)
            except Exception as e:
                logger.error(f"Handler error for {event.event_type}: {e}")

        # Default AI processing based on event type
        await self._process_ai_event(event)

        # Publish AI response event
        await self._publish_ai_response(event)

    async def _process_ai_event(self, event: CoalGuardEvent) -> None:
        """Process event through AI pipeline."""
        try:
            # Example: If inspection submitted, trigger anomaly detection
            if event.event_type == EventType.INSPECTION_SUBMITTED:
                await self._handle_inspection_submitted(event)

            elif event.event_type == EventType.SAFETY_INCIDENT_REPORTED:
                await self._handle_safety_incident(event)

            elif event.event_type == EventType.COMPLIANCE_VIOLATION_CREATED:
                await self._handle_compliance_violation(event)

            elif event.event_type == EventType.PRODUCTION_ANOMALY_DETECTED:
                await self._handle_production_anomaly(event)

        except Exception as e:
            logger.error(f"AI processing error for {event.event_type}: {e}")

    async def _handle_inspection_submitted(self, event: CoalGuardEvent) -> None:
        """Handle inspection submitted event."""
        payload = event.payload
        mine_id = event.mine_id

        # Run ML anomaly detection on inspection data
        if self.anomaly_service:
            try:
                anomaly_results = await self.anomaly_service.detect_anomalies(
                    records=[payload],
                    feature_columns=["severity", "priority", "risk_score"],
                    method="statistical",
                )

                for result in anomaly_results:
                    if result.get("is_anomaly"):
                        # Persist anomaly
                        anomaly_id = await self.anomaly_service.persist_anomaly(
                            mine_id=mine_id,
                            category="mine_safety",
                            severity=result.get("severity", "medium"),
                            detection_method="statistical",
                            observed_values=payload,
                            expected_baseline={},
                            deviation_magnitude=abs(result.get("anomaly_score", 0)),
                            confidence=abs(result.get("anomaly_score", 0)),
                        )

                        # Publish AI anomaly detected event
                        ai_event = CoalGuardEvent(
                            event_type=EventType.AI_ANOMALY_DETECTED,
                            mine_id=mine_id,
                            entity_type="anomaly",
                            entity_id=anomaly_id,
                            payload={
                                "anomaly_id": anomaly_id,
                                "source_event_id": event.event_id,
                                "anomaly_score": result.get("anomaly_score"),
                                "severity": result.get("severity"),
                            },
                            correlation_id=event.correlation_id,
                            causation_id=event.event_id,
                            priority=EventPriority.HIGH,
                        )
                        await self.producer.publish(ai_event)

            except Exception as e:
                logger.error(f"Anomaly detection error: {e}")

    async def _handle_safety_incident(self, event: CoalGuardEvent) -> None:
        """Handle safety incident reported event."""
        # Start investigation if critical
        payload = event.payload
        severity = payload.get("severity", "low")

        if severity in ("high", "critical") and self.investigation_agent:
            import uuid
            investigation_id = f"inv-{uuid.uuid4().hex[:12]}"

            # Start investigation asynchronously
            asyncio.create_task(
                self.investigation_agent.run_investigation(
                    investigation_id=investigation_id,
                    mine_id=event.mine_id,
                    trigger_event_type="safety_incident",
                    trigger_event_id=event.event_id,
                    correlation_id=event.correlation_id,
                )
            )

            # Publish investigation started event
            ai_event = CoalGuardEvent(
                event_type=EventType.AI_INVESTIGATION_STARTED,
                mine_id=event.mine_id,
                entity_type="investigation",
                entity_id=investigation_id,
                payload={
                    "investigation_id": investigation_id,
                    "source_event_id": event.event_id,
                    "trigger": "safety_incident",
                    "severity": severity,
                },
                correlation_id=event.correlation_id,
                causation_id=event.event_id,
                priority=EventPriority.CRITICAL,
            )
            await self.producer.publish(ai_event)

    async def _handle_compliance_violation(self, event: CoalGuardEvent) -> None:
        """Handle compliance violation created event."""
        payload = event.payload
        mine_id = event.mine_id

        # Publish risk assessment event
        ai_event = CoalGuardEvent(
            event_type=EventType.AI_RISK_ASSESSMENT_COMPLETED,
            mine_id=mine_id,
            entity_type="compliance_violation",
            entity_id=event.entity_id,
            payload={
                "violation_id": event.entity_id,
                "severity": payload.get("severity", "medium"),
                "category": payload.get("category", "other"),
                "risk_level": "medium",  # Would be computed
            },
            correlation_id=event.correlation_id,
            causation_id=event.event_id,
            priority=EventPriority.HIGH,
        )
        await self.producer.publish(ai_event)

    async def _handle_production_anomaly(self, event: CoalGuardEvent) -> None:
        """Handle production anomaly detected event."""
        payload = event.payload
        mine_id = event.mine_id

        # Publish AI notification
        ai_event = CoalGuardEvent(
            event_type=EventType.AI_NOTIFICATION_SENT,
            mine_id=mine_id,
            entity_type="production_anomaly",
            entity_id=event.entity_id,
            payload={
                "anomaly_id": event.entity_id,
                "metric": payload.get("metric", "production_tonnes"),
                "direction": payload.get("direction", "above"),
                "severity": payload.get("severity", "medium"),
                "message": f"Production anomaly detected: {payload.get('metric')} is {payload.get('direction')} expected range",
            },
            correlation_id=event.correlation_id,
            causation_id=event.event_id,
            priority=EventPriority.HIGH,
        )
        await self.producer.publish(ai_event)

    async def _publish_ai_response(self, event: CoalGuardEvent) -> None:
        """Publish AI response event."""
        response_event = CoalGuardEvent(
            event_type=f"ai.response.{event.event_type}",
            mine_id=event.mine_id,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            payload={
                "processed_by": "ai-service",
                "original_event_id": event.event_id,
                "processing_timestamp": datetime.utcnow().isoformat(),
            },
            correlation_id=event.correlation_id,
            causation_id=event.event_id,
            priority=EventPriority.LOW,
        )
        await self.producer.publish(response_event)


# ---------------------------------------------------------------------------
# Global instances
# ---------------------------------------------------------------------------

event_producer = EventProducer()
event_consumer = EventConsumer()
event_bridge = EventBridge(
    producer=event_producer,
)

__all__ = [
    "EventType",
    "EventPriority",
    "CoalGuardEvent",
    "EventProducer",
    "EventConsumer",
    "EventBridge",
    "event_producer",
    "event_consumer",
    "event_bridge",
]
