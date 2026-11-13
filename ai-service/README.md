# CoalGuard.AI — AI Intelligence Subsystem

## Overview

This is the FastAPI-based AI intelligence subsystem for CoalGuard.AI, providing a complete, production-oriented intelligence system that integrates with the existing Fastify backend and Next.js frontend through a shared PostgreSQL database.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CoalGuard.AI Platform                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 14)     │  Backend (Fastify)                             │
│  - Dashboard               │  - Transactional API                           │
│  - Documents & OCR         │  - Auth & RBAC                                 │
│  - Maps & GIS              │  - Documents & OCR                             │
│  - Analytics               │  - Inspections, Safety, etc.                   │
└──────────────┬──────────────┴──────────────┬────────────────────────────────┘
               │                               │
               ▼                               ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │              AI Intelligence Service (FastAPI)                    │
        │  ┌─────────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐  │
        │  │ Anomaly     │ │ Prediction  │ │ Investigation│ │ Research   │  │
        │  │ Detection   │ │ Engine      │ │ Workflows    │ │ (RAG)      │  │
        │  │ (ML + Stat) │ │ (XGBoost/   │ │ (LangGraph)  │ │            │  │
        │  └─────────────┘ │ RF / LR)    │ └────────────┘ └────────────┘  │
        │  ┌─────────────┐ └─────────────┘ ┌────────────┐ ┌────────────┐  │
        │  │ Training    │ │ Event       │ │ Notifications│ │ Agentic    │  │
        │  │ Pipeline    │ │ Streaming   │ │ Service      │ │ AI         │  │
        │  │ (Model Reg) │ │ (Kafka)     │ │              │ │ Assistant  │  │
        │  └─────────────┘ └─────────────┘ └────────────┘ └────────────┘  │
        └──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   PostgreSQL 16      │
                    │  (shared database)   │
                    └──────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 16 (shared with main backend)
- Kafka (optional, for event streaming)
- Docker & Docker Compose (recommended)

### Development Setup

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Install dependencies
pip install -e .

# 3. Run database migrations
# The migration 007_ai_intelligence.sql creates all required tables
cd ../backend
npm run db:migrate

# 4. Start the AI service
uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload
```

### With Docker Compose

```bash
docker-compose up --build
```

This starts:
- PostgreSQL on port 55432
- Fastify backend on port 4000
- Next.js frontend on port 3000
- **FastAPI AI Service on port 8001**

## API Endpoints

### Anomaly Detection (ML + Statistical)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/anomaly/rules` | GET | List detection rules |
| `/api/v1/anomaly/rules` | POST | Create detection rule |
| `/api/v1/anomaly/findings` | GET | List anomaly findings |
| `/api/v1/anomaly/findings/{id}` | GET | Get finding details |
| `/api/v1/anomaly/findings/{id}/status` | PATCH | Update investigation status |
| `/api/v1/anomaly/findings/{id}/evidence` | GET/POST | Manage evidence links |

### ML-Based Anomaly Detection
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/ml-anomaly/detect` | POST | Detect anomalies (Isolation Forest, DBSCAN, Statistical) |
| `/api/v1/ml-anomaly/detect/single` | POST | Detect anomaly in single record |
| `/api/v1/ml-anomaly/train` | POST | Train Isolation Forest model |
| `/api/v1/ml-anomaly/models` | GET | List trained models |
| `/api/v1/ml-anomaly/models/{version}/load` | POST | Load a specific model version |
| `/api/v1/ml-anomaly/persist` | POST | Persist anomaly to database |
| `/api/v1/ml-anomaly/health` | GET | Service health |

### Predictive Risk Engine
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/prediction/targets` | GET/POST | Manage prediction targets |
| `/api/v1/prediction/records` | GET | List predictions |
| `/api/v1/prediction/records/{id}` | GET | Get prediction details |
| `/api/v1/prediction/records/{id}/outcome` | POST | Link actual outcome |
| `/api/v1/prediction/models` | GET | List models |
| `/api/v1/prediction/models/{id}/versions` | GET | List model versions |
| `/api/v1/prediction/evaluation` | POST | Record evaluation metrics |
| `/api/v1/prediction/evaluation/{model_id}` | GET | List evaluations |

### Investigation Workflows (LangGraph Agent)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agent/investigations` | POST | Start autonomous investigation |
| `/api/v1/agent/investigations/{id}/status` | GET | Get investigation status |
| `/api/v1/agent/investigations/{id}/approve` | POST | Approve human review |
| `/api/v1/agent/investigations/{id}/resume` | POST | Resume paused investigation |
| `/api/v1/agent/investigations` | GET | List investigations |
| `/api/v1/agent/health` | GET | Agent health |

### Model Training Pipeline
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/training/targets` | GET/POST | Manage prediction targets |
| `/api/v1/training/train` | POST | Train model (background) |
| `/api/v1/training/models` | GET | List registered models |
| `/api/v1/training/models/{id}/versions` | GET | List model versions |
| `/api/v1/training/models/{id}/versions/{vid}/promote` | POST | Promote to production |
| `/api/v1/training/models/{id}/rollback` | POST | Rollback model |
| `/api/v1/training/evaluate` | POST | Evaluate model on window |
| `/api/v1/training/evaluation/{model_id}` | GET | List evaluations |
| `/api/v1/training/training/runs` | GET | List training runs |

### External Research (RAG + Web)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/research/sources` | GET/POST | Manage external sources |
| `/api/v1/research/queries` | GET/POST | Create research queries |
| `/api/v1/research/queries/{id}/execute` | POST | Execute search query |
| `/api/v1/research/queries/{id}/evidence` | GET | List evidence |
| `/api/v1/research/factor-comparison` | POST | Compare external vs internal |
| `/api/v1/research/investigations/{id}/factor-comparisons` | GET | List comparisons |

### AI Notifications
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/ai-notification/records` | GET/POST | Manage AI notifications |
| `/api/v1/ai-notification/records/{id}` | GET | Get notification |
| `/api/v1/ai-notification/records/{id}/acknowledge` | PATCH | Acknowledge notification |
| `/api/v1/ai-notification/records/{id}/status` | PATCH | Update delivery status |

### Event Streaming (Kafka)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/events/publish` | POST | Publish single event |
| `/api/v1/events/publish/batch` | POST | Publish batch events |
| `/api/v1/events/consume/start` | POST | Start event consumption |
| `/api/v1/events/consume/stop` | POST | Stop consumption |
| `/api/v1/events/handlers/register` | POST | Register event handler |
| `/api/v1/events/health` | GET | Event streaming health |
| `/api/v1/events/topics` | GET | List available topics |
| `/api/v1/events/bridge/process` | POST | Process via AI bridge |

## Database Schema (28 Tables)

Migration `007_ai_intelligence.sql` creates:

**Anomaly Detection**: `anomaly_rule_definitions`, `anomaly_findings`, `anomaly_evidence`
**Features**: `feature_definitions`, `feature_snapshots`
**Prediction**: `prediction_targets`, `prediction_records`, `prediction_outcomes`
**Models**: `model_registry_entries`, `model_versions`, `model_training_runs`, `model_evaluation_metrics`, `model_drift_events`
**Investigations**: `investigation_records`, `investigation_evidence_links`, `investigation_decisions`, `risk_assessment_records`
**Research**: `external_source_registry`, `research_queries`, `external_evidence_records`, `factor_comparison_results`
**Notifications**: `ai_notification_records`

## Integration with Main Backend

The AI service shares the **same PostgreSQL database** as the Fastify backend:

1. **Direct data access** - Queries mine, inspection, safety records directly
2. **Shared audit trail** - Uses existing `appendAudit` infrastructure
3. **Consistent RBAC** - Same mine/subsidiary scope enforcement
4. **Event-driven triggers** - Backend publishes events via Kafka; AI service consumes

### Triggering AI Analysis from Backend

The Fastify backend can trigger AI analysis by publishing events:

```typescript
// In Fastify route after committing a record
const event = new CoalGuardEvent(
  eventType: 'inspection.submitted',
  mineId: mineId,
  entityType: 'inspection',
  entityId: inspectionId,
  payload: { ...inspectionData },
);
await eventProducer.publish(event);
```

The AI service consumes this and triggers anomaly detection, prediction, and investigation workflows.

## Security

- **Authentication**: JWT tokens validated against shared `user_sessions` table
- **Authorization**: Mine/subsidiary scope enforced on every query
- **External URLs**: Restricted to approved domains; no internal network access
- **Content Security**: All external content treated as untrusted
- **Audit Logging**: All AI actions logged via shared `appendAudit`
- **No secrets in code**: All credentials via environment variables

## Testing

```bash
# Run unit tests
pytest test/ -v

# Run with coverage
pytest test/ --cov=src --cov-report=html
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@127.0.0.1:55432/coalguard` | Shared PostgreSQL |
| `AUTH_MODE` | `development` | `development` or `oidc` |
| `CORS_ORIGINS` | `http://localhost:3000` | Frontend origins |
| `SEARCH_PROVIDER` | `mock` | `mock`, `serpapi`, `bing` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Kafka bootstrap servers |
| `MAX_BYTES` | `5242880` | Max upload size |
| `WORKFLOW_MAX_DURATION_MINUTES` | `60` | Workflow timeout |
| `CHROMA_PATH` | `./chroma_db` | Vector DB path |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | RAG embedding model |

## Capability Classification

| Capability | Status | Notes |
|------------|--------|-------|
| Rule-based anomaly detection | VERIFIED | Deterministic, auditable rules |
| Statistical anomaly detection | VERIFIED | Z-score, IQR methods |
| ML anomaly detection (Isolation Forest) | VERIFIED | Model training + inference |
| Predictive risk engine | VERIFIED | Calibrated probabilities, risk bands |
| Model training pipeline | VERIFIED | Training, evaluation, registry, promotion |
| Investigation workflows (LangGraph) | VERIFIED | 15-stage state machine |
| External research (RAG) | VERIFIED | Vector search + keyword search |
| Factor comparison | VERIFIED | External vs internal factor matching |
| AI notifications | VERIFIED | Risk-prioritized alerts |
| Event streaming (Kafka) | VERIFIED | Publish/subscribe with bridge |
| Model versioning & rollback | VERIFIED | Registry with staging/production |
| Real-time event processing | CODE-VERIFIED | Bridge implemented, needs Kafka cluster |
| Document intelligence (OCR) | CODE-VERIFIED | Uses main backend OCR |
| Vector retrieval (RAG with ChromaDB) | CODE-VERIFIED | ChromaDB configured, needs indexing |
| Automated model retraining | BLOCKED | Requires scheduled jobs infrastructure |
| PostGIS geospatial analysis | BLOCKED | Requires PostGIS extension |
| TimescaleDB time-series | BLOCKED | Requires TimescaleDB extension |

## License

Internal use only — CoalGuard.AI Platform