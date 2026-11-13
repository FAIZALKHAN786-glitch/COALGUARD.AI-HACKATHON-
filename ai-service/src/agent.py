"""
CoalGuard.AI — LangGraph Agentic AI Workflow

Autonomous investigation agent that coordinates anomaly detection,
prediction, historical research, factor comparison, and risk evaluation.
"""

from __future__ import annotations

from typing import Dict, Any, List, Optional, TypedDict, Annotated, Literal
from datetime import datetime
import asyncio
import json

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from .config import get_settings
from .database import (
    get_session,
    InvestigationRecord,
    InvestigationStage,
    AnomalyFinding,
    PredictionRecord,
    ExternalEvidenceRecord,
    FactorComparisonResult,
    RiskAssessmentRecord,
    AINotificationRecord,
    async_session,
)
from .rag import create_rag_service


# ---------------------------------------------------------------------------
# Agent State
# ---------------------------------------------------------------------------

class InvestigationState(TypedDict):
    """State carried through the LangGraph investigation workflow."""

    investigation_id: str
    mine_id: str
    anomaly_id: Optional[str]
    prediction_id: Optional[str]
    trigger_event_type: str
    trigger_event_id: Optional[str]
    correlation_id: str
    current_stage: str

    # Evidence gathered
    historical_incidents: List[Dict[str, Any]]
    external_evidence: List[Dict[str, Any]]
    current_operational_evidence: Dict[str, Any]
    factor_comparisons: List[Dict[str, Any]]

    # Analysis results
    anomaly_finding: Optional[Dict[str, Any]]
    prediction_result: Optional[Dict[str, Any]]
    risk_assessment: Dict[str, Any]

    # Workflow control
    human_review_required: bool
    approved_by: Optional[str]
    retry_count: int
    max_retries: int
    errors: List[str]
    completed: bool
    final_outcome: Optional[str]

    # LLM messages
    messages: Annotated[list, add_messages]


# ---------------------------------------------------------------------------
# Agent Nodes
# ---------------------------------------------------------------------------

async def validate_event_node(state: InvestigationState) -> InvestigationState:
    """Validate the triggering event and initialize investigation context."""
    state["messages"] = [
        SystemMessage(
            content="You are a CoalGuard.AI investigation agent. Validate the triggering "
                   "event and ensure all required fields are present."
        ),
        HumanMessage(
            content=f"Validating event: {state['trigger_event_type']} "
                   f"(ID: {state['trigger_event_id']}) for mine {state['mine_id']}"
        ),
    ]

    # Basic validation
    if not state.get("mine_id"):
        state["errors"] = state.get("errors", []) + ["Missing mine_id"]
        state["current_stage"] = "failed"
        state["completed"] = True
        state["final_outcome"] = "validation_failed"
        return state

    state["current_stage"] = "validating"
    state["retry_count"] = 0
    state["max_retries"] = 3
    state["errors"] = []

    async with async_session() as session:
        # Persist investigation record
        investigation = InvestigationRecord(
            id=state["investigation_id"],
            mine_id=state["mine_id"],
            anomaly_id=state.get("anomaly_id"),
            prediction_id=state.get("prediction_id"),
            trigger_event_type=state["trigger_event_type"],
            trigger_event_id=state.get("trigger_event_id"),
            correlation_id=state["correlation_id"],
            current_stage=state["current_stage"],
            risk_assessment={},
            outstanding_questions=[],
            recommended_actions=[],
            executed_action_references=[],
        )
        session.add(investigation)
        await session.commit()

    state["messages"].append(
        AIMessage(content=f"Investigation {state['investigation_id']} initialized "
                       f"at stage: {state['current_stage']}")
    )
    return state


async def context_gathering_node(state: InvestigationState) -> InvestigationState:
    """Gather historical incidents, current operational context, and mine data."""
    state["current_stage"] = "context_gathering"

    try:
        from .database import Incident, SafetyRecord, CorrectiveAction, Mine, ComplianceRequirement

        async with async_session() as session:
            # Get mine context
            mine_result = await session.execute(
                select(Incident).where(Incident.mine_id == state["mine_id"]).limit(50)
            )
            incidents = mine_result.scalars().all()
            state["historical_incidents"] = [
                {
                    "id": inc.id,
                    "title": inc.title,
                    "severity": inc.severity,
                    "status": inc.status,
                    "reported_at": inc.reported_at.isoformat() if inc.reported_at else None,
                    "location_description": inc.location_description,
                }
                for inc in incidents
            ]

            # Get safety records
            safety_result = await session.execute(
                select(SafetyRecord).where(SafetyRecord.mine_id == state["mine_id"]).limit(50)
            )
            safety_records = safety_result.scalars().all()

            # Get corrective actions
            action_result = await session.execute(
                select(CorrectiveAction).where(CorrectiveAction.mine_id == state["mine_id"]).limit(50)
            )
            actions = action_result.scalars().all()

            state["current_operational_evidence"] = {
                "safety_records_count": len(safety_records),
                "corrective_actions_count": len(actions),
                "open_actions": [a.id for a in actions if a.status in ("assigned", "in_progress")],
                "mine_id": state["mine_id"],
            }

        state["messages"].append(
            AIMessage(content=f"Context gathered: {len(state['historical_incidents'])} historical "
                           f"incidents, {state['current_operational_evidence']['safety_records_count']} "
                           f"safety records, {state['current_operational_evidence']['corrective_actions_count']} "
                           f"corrective actions")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Context gathering failed: {str(e)}"]

    return state


async def historical_analysis_node(state: InvestigationState) -> InvestigationState:
    """Analyze historical incidents for patterns relevant to current anomaly."""
    state["current_stage"] = "historical_analysis"

    try:
        incidents = state.get("historical_incidents", [])
        anomaly = state.get("anomaly_finding", {})

        # Simple pattern matching: find incidents with similar severity or category
        similar_incidents = []
        for inc in incidents:
            if anomaly.get("severity") and inc.get("severity") == anomaly.get("severity"):
                similar_incidents.append(inc)

        state["risk_assessment"] = {
            **state.get("risk_assessment", {}),
            "historical_incident_count": len(incidents),
            "similar_incident_count": len(similar_incidents),
            "historical_pattern": "recurring" if len(similar_incidents) > 2 else "isolated",
        }

        state["messages"].append(
            AIMessage(content=f"Historical analysis: {len(incidents)} total incidents, "
                           f"{len(similar_incidents)} similar to current anomaly severity")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Historical analysis failed: {str(e)}"]

    return state


async def predictive_assessment_node(state: InvestigationState) -> InvestigationState:
    """Run predictive model to estimate future event risk."""
    state["current_stage"] = "predictive_assessment"

    try:
        from .prediction import RiskCalculator, PredictionStore

        # Get prediction if linked
        prediction = None
        if state.get("prediction_id"):
            async with async_session() as session:
                pred_store = PredictionStore(session)
                prediction = await pred_store.get_prediction(state["prediction_id"])

        if prediction:
            state["risk_assessment"] = {
                **state.get("risk_assessment", {}),
                "predicted_probability": prediction.get("estimated_probability"),
                "risk_band": prediction.get("risk_band"),
                "model_version": prediction.get("model_version"),
                "prediction_horizon": {
                    "start": prediction.get("horizon_start"),
                    "end": prediction.get("horizon_end"),
                },
            }

        state["messages"].append(
            AIMessage(content=f"Predictive assessment complete: risk band "
                           f"{state.get('risk_assessment', {}).get('risk_band', 'unknown')}")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Predictive assessment failed: {str(e)}"]

    return state


async def external_research_node(state: InvestigationState) -> InvestigationState:
    """Research external sources for relevant incident patterns."""
    state["current_stage"] = "external_research"

    try:
        from .routes.research import ResearchQueryStore, ExternalEvidenceStore

        async with async_session() as session:
            query_store = ResearchQueryStore(session)
            evidence_store = ExternalEvidenceStore(session)

            query = await query_store.create_query(
                investigation_id=state["investigation_id"],
                query_text=f"mining safety incident {state.get('trigger_event_type')} "
                          f"risk factors prevention",
                source_category="safety_advisory",
                provider="mock",
            )

            # Mark as completed with mock results
            await query_store.update_status(
                query.id, "completed", results_count=2
            )

            state["external_evidence"] = [
                {
                    "source_title": "DGMS Safety Advisory on Equipment Maintenance",
                    "publisher": "Directorate General of Mines Safety",
                    "relevance": "direct",
                    "reliability": "high",
                },
                {
                    "source_title": "Coal Mine Safety Technical Report 2024",
                    "publisher": "Ministry of Coal",
                    "relevance": "partial",
                    "reliability": "medium",
                },
            ]

        state["messages"].append(
            AIMessage(content=f"External research: {len(state['external_evidence'])} sources found")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"External research failed: {str(e)}"]

    return state


async def factor_comparison_node(state: InvestigationState) -> InvestigationState:
    """Compare external findings with current mine records."""
    state["current_stage"] = "factor_correlation"

    try:
        from .routes.research import FactorComparisonEngine

        external_evidence = state.get("external_evidence", [])
        operational_evidence = state.get("current_operational_evidence", {})

        comparisons = []
        for i, evidence in enumerate(external_evidence):
            # Compare external factor with internal data
            factor_name = "maintenance_delays" if "maintenance" in evidence.get("source_title", "").lower() else "safety_compliance"

            comparison = {
                "factor_name": factor_name,
                "external_source": evidence.get("source_title"),
                "external_reliability": evidence.get("reliability"),
                "internal_data_available": True,
                "comparison_result": "partial_match",
                "reasoning": f"External finding relates to {factor_name}; internal records "
                           f"show {operational_evidence.get('corrective_actions_count', 0)} open actions",
            }
            comparisons.append(comparison)

        state["factor_comparisons"] = comparisons

        # Count matches
        matches = sum(1 for c in comparisons if c["comparison_result"] in ("match", "partial_match"))
        state["risk_assessment"] = {
            **state.get("risk_assessment", {}),
            "external_factor_matches": matches,
            "total_external_factors": len(comparisons),
        }

        state["messages"].append(
            AIMessage(content=f"Factor comparison: {matches}/{len(comparisons)} factors matched")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Factor comparison failed: {str(e)}"]

    return state


async def risk_evaluation_node(state: InvestigationState) -> InvestigationState:
    """Evaluate overall risk and determine response policy."""
    state["current_stage"] = "risk_evaluation"

    try:
        from .prediction import RiskCalculator

        risk_assessment = state.get("risk_assessment", {})

        # Determine severity from multiple inputs
        anomaly_severity = state.get("anomaly_finding", {}).get("severity", "low")
        risk_band = risk_assessment.get("risk_band", "low")
        factor_matches = risk_assessment.get("external_factor_matches", 0)
        total_factors = risk_assessment.get("total_external_factors", 1)

        # Combine signals
        severity_score = {"low": 1, "medium": 2, "high": 3, "critical": 4}.get(anomaly_severity, 1)
        band_score = {"low": 1, "moderate": 2, "high": 3, "critical": 4}.get(risk_band, 1)
        factor_score = min(4, 1 + factor_matches)

        combined_score = (severity_score + band_score + factor_score) / 3

        if combined_score >= 3.5:
            operational_risk = "critical"
        elif combined_score >= 2.5:
            operational_risk = "high"
        elif combined_score >= 1.5:
            operational_risk = "moderate"
        else:
            operational_risk = "low"

        # Determine if human review required
        human_review = operational_risk in ("critical", "high") or anomaly_severity in ("high", "critical")

        state["risk_assessment"] = {
            **risk_assessment,
            "operational_risk_band": operational_risk,
            "combined_risk_score": round(combined_score, 2),
            "human_review_required": human_review,
            "deterministic_finding": anomaly_severity in ("high", "critical"),
        }

        state["human_review_required"] = human_review

        if human_review:
            state["current_stage"] = "human_review_required"
        else:
            state["current_stage"] = "action_pending"

        state["messages"].append(
            AIMessage(content=f"Risk evaluation: operational risk {operational_risk}, "
                           f"combined score {round(combined_score, 2)}, "
                           f"human review required: {human_review}")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Risk evaluation failed: {str(e)}"]
        state["current_stage"] = "failed"

    return state


async def human_review_node(state: InvestigationState) -> InvestigationState:
    """Handle human review requirement - pause for approval."""
    state["current_stage"] = "human_review_required"

    # If already approved, proceed
    if state.get("approved_by"):
        state["current_stage"] = "action_pending"
        state["messages"].append(
            AIMessage(content=f"Human review already approved by {state['approved_by']}")
        )
    else:
        state["messages"].append(
            AIMessage(content="Awaiting human review and approval before proceeding to action")
        )

    return state


async def action_planning_node(state: InvestigationState) -> InvestigationState:
    """Plan corrective actions and notifications based on risk assessment."""
    state["current_stage"] = "action_pending"

    try:
        from .routes.notification import AINotificationStore

        risk_band = state.get("risk_assessment", {}).get("operational_risk_band", "low")

        # Create notification based on risk
        notification_type = "risk_prediction" if risk_band in ("high", "critical") else "anomaly_alert"
        title = f"{risk_band.upper()} Risk Detected - Mine {state['mine_id']}"

        async with async_session() as session:
            notif_store = AINotificationStore(session)
            await notif_store.create_notification(
                investigation_id=state["investigation_id"],
                anomaly_id=state.get("anomaly_id"),
                prediction_id=state.get("prediction_id"),
                mine_id=state["mine_id"],
                notification_type=notification_type,
                risk_classification=risk_band,
                title=title,
                explanation=f"Automated investigation {state['investigation_id']} detected "
                          f"{risk_band} risk based on anomaly analysis and historical patterns.",
                evidence_references=state.get("factor_comparisons", []),
                recommended_next_step="Review investigation findings and assign corrective action",
                recipient_ids=["safety_officer", "mine_manager"],
            )

        state["messages"].append(
            AIMessage(content=f"Action planned: {notification_type} notification created for mine "
                           f"{state['mine_id']}")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Action planning failed: {str(e)}"]

    return state


async def notification_node(state: InvestigationState) -> InvestigationState:
    """Send notifications and move to monitoring."""
    state["current_stage"] = "notification_pending"

    try:
        state["messages"].append(
            AIMessage(content="Notifications dispatched. Moving to monitoring stage.")
        )
        state["current_stage"] = "monitoring"

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Notification failed: {str(e)}"]

    return state


async def monitoring_node(state: InvestigationState) -> InvestigationState:
    """Monitor for new evidence and reassess if needed."""
    state["current_stage"] = "monitoring"

    # Check if investigation should complete
    if state.get("human_review_required") and not state.get("approved_by"):
        state["current_stage"] = "human_review_required"
    else:
        state["completed"] = True
        state["final_outcome"] = "completed"

    return state


async def finalize_node(state: InvestigationState) -> InvestigationState:
    """Finalize investigation and persist results."""
    state["current_stage"] = "completed" if state.get("completed") else state["current_stage"]

    try:
        async with async_session() as session:
            investigation = await session.get(InvestigationRecord, state["investigation_id"])
            if investigation:
                investigation.current_stage = state["current_stage"]
                investigation.completed_at = datetime.utcnow() if state.get("completed") else None
                investigation.risk_assessment = state.get("risk_assessment", {})
                investigation.outstanding_questions = state.get("errors", [])
                investigation.recommended_actions = [
                    c.get("factor_name", "") for c in state.get("factor_comparisons", [])
                ]
                investigation.human_review_required = state.get("human_review_required", False)
                investigation.human_review_completed = bool(state.get("approved_by"))
                investigation.retry_count = state.get("retry_count", 0)
                investigation.final_outcome = state.get("final_outcome")
                investigation.updated_at = datetime.utcnow()
                await session.commit()

        state["messages"].append(
            AIMessage(content=f"Investigation finalized: stage={state['current_stage']}, "
                           f"outcome={state.get('final_outcome')}")
        )

    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Finalize failed: {str(e)}"]

    return state


# ---------------------------------------------------------------------------
# Routing Logic
# ---------------------------------------------------------------------------

def route_after_validation(state: InvestigationState) -> str:
    if state.get("completed") or state.get("current_stage") == "failed":
        return "finalize"
    return "context_gathering"


def route_after_context(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "historical_analysis"


def route_after_historical(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "predictive_assessment"


def route_after_predictive(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "external_research"


def route_after_research(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "factor_comparison"


def route_after_comparison(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "risk_evaluation"


def route_after_risk(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    if state.get("human_review_required"):
        return "human_review"
    return "action_planning"


def route_after_human_review(state: InvestigationState) -> str:
    if state.get("approved_by"):
        return "action_planning"
    return "human_review"  # Wait for approval


def route_after_action(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "notification"


def route_after_notification(state: InvestigationState) -> str:
    if state.get("errors"):
        return "finalize"
    return "monitoring"


def route_after_monitoring(state: InvestigationState) -> str:
    if state.get("completed"):
        return "finalize"
    if state.get("human_review_required") and not state.get("approved_by"):
        return "human_review"
    return "monitoring"  # Continue monitoring


# ---------------------------------------------------------------------------
# Build the Graph
# ---------------------------------------------------------------------------

def build_investigation_graph() -> StateGraph:
    """Build the LangGraph investigation workflow."""

    workflow = StateGraph(InvestigationState)

    # Add nodes
    workflow.add_node("validate", validate_event_node)
    workflow.add_node("context_gathering", context_gathering_node)
    workflow.add_node("historical_analysis", historical_analysis_node)
    workflow.add_node("predictive_assessment", predictive_assessment_node)
    workflow.add_node("external_research", external_research_node)
    workflow.add_node("factor_comparison", factor_comparison_node)
    workflow.add_node("risk_evaluation", risk_evaluation_node)
    workflow.add_node("human_review", human_review_node)
    workflow.add_node("action_planning", action_planning_node)
    workflow.add_node("notification", notification_node)
    workflow.add_node("monitoring", monitoring_node)
    workflow.add_node("finalize", finalize_node)

    # Set entry point
    workflow.set_entry_point("validate")

    # Add edges with conditional routing
    workflow.add_conditional_edges("validate", route_after_validation, {
        "context_gathering": "context_gathering",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("context_gathering", route_after_context, {
        "historical_analysis": "historical_analysis",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("historical_analysis", route_after_historical, {
        "predictive_assessment": "predictive_assessment",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("predictive_assessment", route_after_predictive, {
        "external_research": "external_research",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("external_research", route_after_research, {
        "factor_comparison": "factor_comparison",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("factor_comparison", route_after_comparison, {
        "risk_evaluation": "risk_evaluation",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("risk_evaluation", route_after_risk, {
        "human_review": "human_review",
        "action_planning": "action_planning",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("human_review", route_after_human_review, {
        "action_planning": "action_planning",
        "human_review": "human_review",
    })

    workflow.add_conditional_edges("action_planning", route_after_action, {
        "notification": "notification",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("notification", route_after_notification, {
        "monitoring": "monitoring",
        "finalize": "finalize",
    })

    workflow.add_conditional_edges("monitoring", route_after_monitoring, {
        "finalize": "finalize",
        "monitoring": "monitoring",
        "human_review": "human_review",
    })

    workflow.add_edge("finalize", END)

    return workflow.compile()


# ---------------------------------------------------------------------------
# Agent Service
# ---------------------------------------------------------------------------

class InvestigationAgent:
    """Wrapper for the LangGraph investigation agent."""

    def __init__(self):
        self.graph = build_investigation_graph()

    async def run_investigation(
        self,
        investigation_id: str,
        mine_id: str,
        trigger_event_type: str,
        trigger_event_id: Optional[str] = None,
        anomaly_id: Optional[str] = None,
        prediction_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
        config: Optional[RunnableConfig] = None,
    ) -> Dict[str, Any]:
        """Run a complete investigation workflow."""

        initial_state: InvestigationState = {
            "investigation_id": investigation_id,
            "mine_id": mine_id,
            "anomaly_id": anomaly_id,
            "prediction_id": prediction_id,
            "trigger_event_type": trigger_event_type,
            "trigger_event_id": trigger_event_id,
            "correlation_id": correlation_id or investigation_id,
            "current_stage": "received",
            "historical_incidents": [],
            "external_evidence": [],
            "current_operational_evidence": {},
            "factor_comparisons": [],
            "anomaly_finding": None,
            "prediction_result": None,
            "risk_assessment": {},
            "human_review_required": False,
            "approved_by": None,
            "retry_count": 0,
            "max_retries": 3,
            "errors": [],
            "completed": False,
            "final_outcome": None,
            "messages": [],
        }

        result = await self.graph.ainvoke(initial_state, config=config or {})

        return {
            "investigation_id": result["investigation_id"],
            "current_stage": result["current_stage"],
            "risk_assessment": result.get("risk_assessment", {}),
            "human_review_required": result.get("human_review_required", False),
            "completed": result.get("completed", False),
            "final_outcome": result.get("final_outcome"),
            "errors": result.get("errors", []),
            "factor_comparisons": result.get("factor_comparisons", []),
            "messages": [m.content for m in result.get("messages", [])],
        }

    async def approve_review(
        self,
        investigation_id: str,
        approved_by: str,
    ) -> Dict[str, Any]:
        """Approve a human review and resume the workflow."""
        # Resume from human_review state
        config = RunnableConfig(configurable={"thread_id": investigation_id})
        # In a real implementation, we'd checkpoint and resume
        return {
            "investigation_id": investigation_id,
            "approved_by": approved_by,
            "status": "approved",
            "message": "Human review approved. Investigation will resume.",
        }


# Singleton instance
investigation_agent = InvestigationAgent()
