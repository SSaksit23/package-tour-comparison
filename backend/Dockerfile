# Itinerary Analyzer Backend Service
# PDF Extraction (PyMuPDF) + AI Agents (CrewAI, Mem0, EXA)
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libmupdf-dev \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY agents/ ./agents/

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

# Run the application with increased timeout for long-running agent tasks
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001", "--timeout-keep-alive", "600"]

