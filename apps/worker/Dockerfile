FROM python:3.12-slim

WORKDIR /app
ARG NODE_VERSION=22.12.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm -f /tmp/node.tar.xz \
  && npm install -g @circle-fin/cli \
  && apt-get purge -y --auto-remove curl xz-utils \
  && rm -rf /var/lib/apt/lists/*
COPY apps/worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY apps/worker /app/apps/worker
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "apps.worker.main:app", "--host", "0.0.0.0", "--port", "8000"]
