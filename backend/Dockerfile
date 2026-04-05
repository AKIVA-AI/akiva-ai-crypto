# Multi-stage build to optimize disk space
FROM python:3.12-slim as builder

WORKDIR /app

# Install build dependencies and clean up immediately
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Upgrade pip and install with minimal cache
RUN pip install --no-cache-dir --upgrade pip

# Copy and install requirements with aggressive cleanup
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt && \
    pip cache purge && \
    find /root/.local -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# Production stage - minimal image
FROM python:3.12-slim as production

# Create non-root user for production
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copy installed packages from builder stage into site-packages
COPY --from=builder /root/.local /home/appuser/.local

# Copy application
COPY --chown=appuser:appuser . .

# Clean up production image
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    pip cache purge

# Ensure Python uses user site packages
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/home/appuser/.local/lib/python3.12/site-packages:$PYTHONPATH

# Switch to non-root user
USER appuser

# Run with uvicorn
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
