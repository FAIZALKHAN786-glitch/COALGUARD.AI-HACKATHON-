"""
CoalGuard.AI — RAG (Retrieval-Augmented Generation) Service
"""
from __future__ import annotations
import os
import hashlib
import uuid
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from .database import get_session
from .database import (
    Base, DocumentRecord, DocumentExtractionResult,
    InvestigationRecord, ExternalEvidenceRecord,
    AnomalyFinding, PredictionRecord
)


@dataclass
class RetrievalResult:
    document_id: str
    content: str
    metadata: Dict[str, Any]
    score: float
    source_type: str


class EmbeddingService:
    """Manages text embeddings using sentence-transformers."""

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.embedding_dim = self.model.get_sentence_embedding_dimension()

    def encode(self, texts: List[str]) -> List[List[float]]:
        return self.model.encode(texts, normalize_embeddings=True).tolist()

    def encode_single(self, text: str) -> List[float]:
        return self.model.encode([text], normalize_embeddings=True)[0].tolist()


class VectorStore:
    """ChromaDB vector store for document embeddings."""

    def __init__(self, persist_path: str = "./chroma_db", collection_name: str = "coalguard_docs"):
        self.client = chromadb.PersistentClient(
            path=persist_path,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )

    def add_documents(
        self,
        ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        embeddings: List[List[float]]
    ) -> None:
        self.collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings
        )

    def query(
        self,
        query_embeddings: List[List[float]],
        n_results: int = 10,
        where: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        return self.collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results,
            where=where
        )

    def delete(self, ids: List[str]) -> None:
        self.collection.delete(ids=ids)

    def get(self, ids: List[str]) -> Dict[str, Any]:
        return self.collection.get(ids=ids)


class RAGService:
    """Retrieval-Augmented Generation service for CoalGuard.AI."""

    def __init__(
        self,
        db_session: AsyncSession,
        embedding_service: EmbeddingService,
        vector_store: VectorStore
    ):
        self.db = db_session
        self.embeddings = embedding_service
        self.vector_store = vector_store

    async def index_document(
        self,
        doc_id: str,
        content: str,
        metadata: Dict[str, Any],
        chunk_size: int = 500,
        chunk_overlap: int = 50
    ) -> int:
        """Index a document by chunking and storing embeddings."""
        chunks = self._chunk_text(content, chunk_size, chunk_overlap)
        if not chunks:
            return 0

        chunk_ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
        embeddings = self.embeddings.encode(chunks)

        metadatas = [
            {
                **metadata,
                "doc_id": doc_id,
                "chunk_index": i,
                "chunk_count": len(chunks)
            }
            for i in range(len(chunks))
        ]

        self.vector_store.add_documents(chunk_ids, chunks, metadatas, embeddings)
        return len(chunks)

    async def search(
        self,
        query: str,
        n_results: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        mine_id: Optional[str] = None
    ) -> List[RetrievalResult]:
        """Search for relevant documents."""
        query_embedding = self.embeddings.encode_single(query)

        where_filter = filters or {}
        if mine_id:
            where_filter["mine_id"] = mine_id

        results = self.vector_store.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_filter if where_filter else None
        )

        retrieval_results = []
        if results["documents"]:
            for i, (doc, meta, dist) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            )):
                retrieval_results.append(RetrievalResult(
                    document_id=meta.get("doc_id", results["ids"][0][i]),
                    content=doc,
                    metadata=meta,
                    score=1 - dist,
                    source_type=meta.get("source_type", "document")
                ))

        return retrieval_results

    async def hybrid_search(
        self,
        query: str,
        n_results: int = 10,
        mine_id: Optional[str] = None,
        source_types: Optional[List[str]] = None
    ) -> List[RetrievalResult]:
        """Hybrid search combining vector and keyword search."""
        # Vector search
        vector_results = await self.search(query, n_results * 2, mine_id=mine_id)

        # Keyword search via SQL
        keyword_results = await self._keyword_search(query, n_results, mine_id, source_types)

        # Merge and deduplicate
        merged = self._merge_results(vector_results, keyword_results)

        # Filter by source types if specified
        if source_types:
            merged = [r for r in merged if r.source_type in source_types]

        return merged[:n_results]

    async def _keyword_search(
        self,
        query: str,
        n_results: int,
        mine_id: Optional[str]
    ) -> List[RetrievalResult]:
        """Full-text search using PostgreSQL tsvector."""
        ts_query = " | ".join(query.split())
        sql = text("""
            SELECT d.id, d.name, d.extracted_text, d.mine_id, d.type,
                   ts_rank_cd(to_tsvector('english', d.extracted_text), plainto_tsquery('english', :query)) as rank
            FROM documents d
            WHERE d.extracted_text IS NOT NULL
            AND to_tsvector('english', d.extracted_text) @@ plainto_tsquery('english', :query)
        """)
        params = {"query": ts_query}
        if mine_id:
            sql = text(str(sql) + " AND d.mine_id = :mine_id")
            params["mine_id"] = mine_id
        sql = text(str(sql) + " ORDER BY rank DESC LIMIT :limit")
        params["limit"] = n_results

        result = await self.db.execute(sql, params)
        rows = result.fetchall()

        return [
            RetrievalResult(
                document_id=row.id,
                content=row.extracted_text[:1000] if row.extracted_text else "",
                metadata={
                    "doc_id": row.id,
                    "name": row.name,
                    "type": row.type,
                    "mine_id": row.mine_id
                },
                score=float(row.rank),
                source_type="document"
            )
            for row in rows
        ]

    def _merge_results(
        self,
        vector_results: List[RetrievalResult],
        keyword_results: List[RetrievalResult]
    ) -> List[RetrievalResult]:
        """Merge and deduplicate results from vector and keyword search."""
        seen = set()
        merged = []

        for result in vector_results + keyword_results:
            key = result.document_id
            if key not in seen:
                seen.add(key)
                merged.append(result)

        # Sort by score descending
        merged.sort(key=lambda x: x.score, reverse=True)
        return merged

    def _chunk_text(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        """Split text into overlapping chunks."""
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk = text[start:end]

            # Try to break at sentence boundary
            if end < len(text):
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                break_point = max(last_period, last_newline)
                if break_point > chunk_size // 2:
                    end = start + break_point + 1
                    chunk = text[start:end]

            chunks.append(chunk.strip())
            start = end - chunk_overlap
            if start >= len(text):
                break

        return [c for c in chunks if c]


class RAGQueryEngine:
    """High-level RAG query engine combining retrieval with context building."""

    def __init__(self, rag_service: RAGService):
        self.rag = rag_service

    async def query_with_context(
        self,
        query: str,
        mine_id: Optional[str] = None,
        n_results: int = 5,
        source_types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Retrieve relevant context and build structured response."""
        results = await self.rag.hybrid_search(
            query,
            n_results=n_results,
            mine_id=mine_id,
            source_types=source_types
        )

        context_parts = []
        sources = []
        for r in results:
            context_parts.append(f"[{r.source_type}] {r.content[:500]}")
            sources.append({
                "document_id": r.document_id,
                "source_type": r.source_type,
                "score": r.score,
                "metadata": r.metadata
            })

        context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant documents found."

        return {
            "query": query,
            "context": context,
            "sources": sources,
            "result_count": len(results)
        }


# Factory function
def create_rag_service(
    db_session: AsyncSession,
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    persist_path: str = "./chroma_db"
) -> RAGService:
    embedding_service = EmbeddingService(model_name)
    vector_store = VectorStore(persist_path=persist_path)
    return RAGService(db_session, embedding_service, vector_store)