"""
CoalGuard.AI — Research & Factor Comparison Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

from ..database import get_session
from ..database import (
    ResearchQuery, ExternalSourceRegistry, ExternalEvidenceRecord,
    FactorComparisonResult, SourceCategory, SourceType,
    ResearchStatusEnum, Reliability, Relevance, ComparisonResult
)

router = APIRouter()


@router.post("/sources", response_model=dict)
async def register_source(
    source_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ExternalSourceRegistry, SourceType
    source = ExternalSourceRegistry(
        id=str(uuid4()),
        source_name=source_data["source_name"],
        publisher=source_data.get("publisher"),
        source_type=SourceType(source_data["source_type"]),
        base_url=source_data.get("base_url"),
        jurisdiction=source_data.get("jurisdiction"),
        credibility_score=source_data.get("credibility_score"),
        requires_credentials=source_data.get("requires_credentials", False),
        active=source_data.get("active", True),
        notes=source_data.get("notes"),
    )
    session.add(source)
    await session.commit()
    return {"id": source.id, "source_name": source.source_name, "source_type": source.source_type.value}


@router.get("/sources", response_model=List[dict])
async def list_sources(
    active: Optional[bool] = True,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ExternalSourceRegistry
    stmt = select(ExternalSourceRegistry)
    if active is not None:
        stmt = stmt.where(ExternalSourceRegistry.active == active)
    stmt = stmt.order_by(ExternalSourceRegistry.source_name)
    result = await session.execute(stmt)
    sources = result.scalars().all()
    return [
        {
            "id": s.id,
            "source_name": s.source_name,
            "publisher": s.publisher,
            "source_type": s.source_type.value,
            "base_url": s.base_url,
            "jurisdiction": s.jurisdiction,
            "credibility_score": s.credibility_score,
            "requires_credentials": s.requires_credentials,
            "active": s.active,
        }
        for s in sources
    ]


@router.post("/queries", response_model=dict)
async def create_query(
    query_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ResearchQuery, ResearchStatusEnum, SourceCategory
    query = ResearchQuery(
        id=str(uuid4()),
        investigation_id=query_data.get("investigation_id"),
        query_text=query_data["query_text"],
        source_category=SourceCategory(query_data["source_category"]),
        provider=query_data["provider"],
        status=ResearchStatusEnum.pending,
    )
    session.add(query)
    await session.commit()
    return {"id": query.id, "status": query.status.value}


@router.post("/queries/{query_id}/execute", response_model=dict)
async def execute_query(
    query_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ResearchQuery, ExternalEvidenceRecord, ResearchStatusEnum, Reliability, Relevance
    query = await session.get(ResearchQuery, query_id)
    if not query:
        raise HTTPException(status_code=404, detail="Research query not found")
    
    # In a real implementation, this would call an external search API
    # For now, we'll simulate with mock results
    mock_results = [
        {
            "source_title": f"Sample Report for: {query.query_text}",
            "source_url": "https://example.gov/report/123",
            "publisher": "DGMS",
            "publication_date": "2024-01-15",
            "relevant_passage": "Maintenance deficiencies were identified as a contributing factor...",
            "reliability": "high",
            "relevance": "direct",
            "limitation": "Report covers different equipment configuration",
        }
    ]
    
    query.status = ResearchStatusEnum.completed
    query.results_count = len(mock_results)
    query.completed_at = datetime.utcnow()
    
    for i, result in enumerate(mock_results):
        evidence = ExternalEvidenceRecord(
            id=str(uuid4()),
            research_query_id=query_id,
            source_id=None,
            source_title=result["source_title"],
            source_url=result["source_url"],
            publisher=result["publisher"],
            publication_date=datetime.fromisoformat(result["publication_date"]),
            retrieval_timestamp=datetime.utcnow(),
            relevant_passage=result["relevant_passage"],
            reliability=Reliability(result["reliability"]),
            relevance=Relevance(result["relevance"]),
            limitation=result.get("limitation"),
        )
        session.add(evidence)
    
    await session.commit()
    return {"query_id": query_id, "status": "completed", "results_found": len(mock_results)}


@router.get("/queries", response_model=List[dict])
async def list_queries(
    investigation_id: Optional[str] = None,
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ResearchQuery)
    if investigation_id:
        stmt = stmt.where(ResearchQuery.investigation_id == investigation_id)
    if status:
        stmt = stmt.where(ResearchQuery.status == status)
    stmt = stmt.order_by(desc(ResearchQuery.created_at))
    result = await session.execute(stmt)
    queries = result.scalars().all()
    return [
        {
            "id": q.id,
            "investigation_id": q.investigation_id,
            "query_text": q.query_text,
            "source_category": q.source_category.value,
            "provider": q.provider,
            "status": q.status.value,
            "results_count": q.results_count,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "completed_at": q.completed_at.isoformat() if q.completed_at else None,
            "error_message": q.error_message,
        }
        for q in queries
    ]


@router.get("/queries/{query_id}/evidence", response_model=List[dict])
async def list_evidence(
    query_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ExternalEvidenceRecord
    stmt = select(ExternalEvidenceRecord).where(ExternalEvidenceRecord.research_query_id == query_id)
    result = await session.execute(stmt)
    evidence = result.scalars().all()
    return [
        {
            "id": e.id,
            "source_title": e.source_title,
            "source_url": e.source_url,
            "publisher": e.publisher,
            "publication_date": e.publication_date.isoformat() if e.publication_date else None,
            "retrieval_timestamp": e.retrieval_timestamp.isoformat() if e.retrieval_timestamp else None,
            "relevant_passage": e.relevant_passage,
            "reliability": e.reliability.value,
            "relevance": e.relevance.value,
            "limitation": e.limitation,
        }
        for e in evidence
    ]


@router.post("/factor-comparison", response_model=dict)
async def compare_factor(
    comparison_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import FactorComparisonResult, ComparisonResult
    comparison = FactorComparisonResult(
        id=str(uuid4()),
        investigation_id=comparison_data["investigation_id"],
        external_evidence_id=comparison_data.get("external_evidence_id"),
        factor_name=comparison_data["factor_name"],
        factor_category=comparison_data["factor_category"],
        comparison_result=ComparisonResult(comparison_data["comparison_result"]),
        internal_field=comparison_data.get("internal_field"),
        internal_value=comparison_data.get("internal_value"),
        external_value=comparison_data["external_value"],
        match_reasoning=comparison_data.get("match_reasoning"),
        data_available=comparison_data.get("data_available", False),
        current_within_limits=comparison_data.get("current_within_limits"),
        limitation=comparison_data.get("limitation"),
    )
    session.add(comparison)
    await session.commit()
    return {"id": comparison.id, "comparison_result": comparison.comparison_result.value}


@router.get("/investigations/{inv_id}/factor-comparisons", response_model=List[dict])
async def list_factor_comparisons(
    inv_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import FactorComparisonResult
    stmt = select(FactorComparisonResult).where(FactorComparisonResult.investigation_id == inv_id).order_by(desc(FactorComparisonResult.compared_at))
    result = await session.execute(stmt)
    comparisons = result.scalars().all()
    return [
        {
            "id": c.id,
            "factor_name": c.factor_name,
            "factor_category": c.factor_category,
            "comparison_result": c.comparison_result.value,
            "internal_field": c.internal_field,
            "internal_value": c.internal_value,
            "external_value": c.external_value,
            "match_reasoning": c.match_reasoning,
            "data_available": c.data_available,
            "current_within_limits": c.current_within_limits,
            "limitation": c.limitation,
            "compared_at": c.compared_at.isoformat() if c.compared_at else None,
        }
        for c in comparisons
    ]