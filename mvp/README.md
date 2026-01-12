# 🗺️ Travel Itinerary Intelligence Platform - MVP

An advanced AI-powered system for in-depth travel itinerary comparison, analysis, and strategic planning. This MVP demonstrates the core capabilities of the platform using a sophisticated Hybrid Retrieval-Augmented Generation (RAG) architecture, enriched with real-time web data and powered by a collaborative multi-agent system.

## 🌟 Core Features

| Feature | Description |
|---------|-------------|
| 📄 **Multi-Format Ingestion** | Seamlessly upload and parse itineraries from PDF, DOCX, and image formats |
| 🧠 **Hybrid RAG Engine** | Combines vector-based similarity search with knowledge graph traversal for superior contextual retrieval |
| 🌐 **Web-Enabled Enrichment** | Deploys an autonomous web search agent to augment internal data with real-time information from the internet |
| 🏗️ **Automated Knowledge Graph** | Automatically extracts key entities and relationships from documents to build a structured, queryable knowledge graph |
| 📊 **Structured Data Extraction** | Intelligently identifies and extracts key data points like pricing, flight details, destinations, and inclusions for easy comparison |
| 🤖 **Multi-Agent Analysis** | Utilizes a team of specialized AI agents for strategic analysis, including market positioning and competitive assessment |
| 📈 **Strategic Reporting** | Generates comprehensive, human-readable reports that synthesize findings and provide actionable business intelligence |

## 🏗️ System Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React 19, TypeScript, Vite | User interface for file management, analysis visualization, and results exploration |
| **Backend Services** | Python FastAPI | API gateway, workflow orchestration, and service coordination |
| **AI Orchestration** | LangChain, CrewAI | Data processing chains, vectorization, and multi-agent coordination |
| **Vector Database** | ChromaDB | Stores high-dimensional vector embeddings for similarity search |
| **Knowledge Graph** | ArangoDB | Models entities and relationships as a graph for contextual queries |
| **PDF Processing** | PyMuPDF (fitz) | Reliable PDF text extraction with superior handling of complex layouts |

### Architectural Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  User Interface (React)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Upload     │  │  Analysis   │  │  Knowledge Base     │  │
│  │  Component  │  │  Output     │  │  Manager            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend Orchestration (FastAPI)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ PDF          │  │ AI Agents    │  │ RAG &            │   │
│  │ Extractor    │  │ Orchestrator │  │ Enrichment       │   │
│  │ (PyMuPDF)    │  │ (CrewAI)     │  │ Service          │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  Vector DB   │  │ Knowledge    │  │  Web Search Agent    │
│  (ChromaDB)  │  │ Graph        │  │  (EXA)               │
│              │  │ (ArangoDB)   │  │                      │
└──────────────┘  └──────────────┘  └──────────────────────┘
        │                   │
        └───────────────────┼───────────────────┐
                            ▼                   ▼
                    ┌──────────────┐  ┌──────────────────┐
                    │ Multi-Agent  │  │ Memory Agent     │
                    │ System       │  │ (Mem0)           │
                    │              │  │                  │
                    │ • Document   │  │ • User           │
                    │   Analyst    │  │   Preferences   │
                    │ • Market     │  │ • Analysis       │
                    │   Researcher │  │   History        │
                    │ • Strategic  │  │ • Trends         │
                    │   Advisor    │  │                  │
                    │ • Product    │  │                  │
                    │   Launch     │  │                  │
                    │ • Consultant │  │                  │
                    └──────────────┘  └──────────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │ Strategic Report │
                    │ Generation       │
                    └──────────────────┘
```

## 📁 Project Structure

```
mvp/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── services/        # API services
│   │   ├── types.ts         # TypeScript types
│   │   ├── App.tsx          # Main app component
│   │   └── main.tsx         # Entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/                  # Python FastAPI backend
│   ├── agents/              # CrewAI agents
│   │   ├── travel_analyst_crew.py
│   │   ├── web_search_agent.py
│   │   ├── product_launch_agent.py
│   │   ├── consultant_agent.py
│   │   └── memory_agent.py
│   ├── services/            # Backend services
│   │   ├── rag_service.py   # Hybrid RAG implementation
│   │   ├── file_parser.py   # Document parsing
│   │   └── knowledge_graph.py  # Knowledge graph builder
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile
│
├── docker-compose.yml       # Docker services configuration
├── .env.example            # Environment variables template
└── README.md               # This file
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **Docker** and Docker Compose
- **API Keys**:
  - OpenAI API key (for LLM and embeddings)
  - EXA API key (optional, for web search)

### Quick Start

1. **Clone and navigate to MVP directory**
   ```bash
   cd mvp
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Development Setup

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## 🔄 Workflow

### Stage 1: Data Ingestion and Processing

1. **Multi-Format Upload**: Users upload travel itineraries via the web interface (PDFs, DOCX files, or images)
2. **Content Extraction**: 
   - PDFs: PyMuPDF extraction
   - DOCX: mammoth.js parsing
   - Images: GPT-4 Vision OCR
3. **Text Chunking**: Extracted text is segmented into semantically meaningful chunks

### Stage 2: Hybrid RAG and Knowledge Enrichment

1. **Vectorization**: Text chunks are converted to embeddings using OpenAI's `text-embedding-3-small`
2. **Vector Storage**: Embeddings stored in ChromaDB for similarity search
3. **Knowledge Graph Construction**: LLM extracts entities (Destination, Attraction, Price, Flight) and relationships, populating ArangoDB
4. **Web-Enabled Enrichment**: Web Search Agent autonomously searches for supplementary data and enriches the knowledge base

### Stage 3: Structured Feature Extraction

System extracts key comparable features:
- **Core Details**: Tour Name, Duration, Price, Currency
- **Travel Logistics**: Flight Numbers, Airlines, Departure/Arrival Times
- **Destinations**: Cities, Countries, Regions
- **Itinerary**: Day-by-day schedule, attractions, meals, accommodation
- **Inclusions/Exclusions**: Detailed lists

### Stage 4: Agentic Analysis and Reporting

Multi-agent system performs deep analysis:

- **Travel Analyst Crew** (CrewAI):
  - Document Analyst: Extracts and structures information
  - Market Researcher: Researches market prices and trends
  - Strategic Advisor: Generates insights and recommendations

- **Smart Product Launch Agent**: Analyzes market positioning and USPs

- **AI Consultant Agent**: Synthesizes insights, identifies trends, provides strategic recommendations (with persistent memory via Mem0)

## 📊 Use Cases

- **Product Development**: Analyze competitor offerings to identify gaps and opportunities
- **Marketing & Sales**: Generate compelling marketing copy with data-backed advantages
- **Strategic Planning**: Understand market trends, pricing strategies, and consumer preferences
- **Operational Efficiency**: Reduce manual effort in analyzing complex itinerary documents

## ⚙️ Configuration

### Environment Variables

See `.env.example` for all available configuration options. Key variables:

```env
# Required
OPENAI_API_KEY=sk-proj-...

# Optional - Web Search
EXA_API_KEY=...

# Database URLs
CHROMA_URL=http://localhost:8000
ARANGO_URL=http://localhost:8529
ARANGO_USER=root
ARANGO_PASSWORD=password123
```

## 📝 API Documentation

### Backend Endpoints

- `POST /api/extract` - Extract text from uploaded PDF/DOCX/image
- `POST /api/analyze` - Analyze itinerary with AI agents
- `POST /api/rag/query` - Query knowledge base with RAG
- `POST /api/knowledge/index` - Index document to knowledge base
- `GET /api/agents/status` - Check agent availability

Full API documentation available at http://localhost:8000/docs

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## 📄 License

MIT License

## 👨‍💻 Author

Saksit Saelow

---

*MVP Version - December 2025*





