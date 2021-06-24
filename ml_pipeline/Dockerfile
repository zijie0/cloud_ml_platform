FROM python:3.8-slim
WORKDIR /ml_pipeline
STOPSIGNAL SIGINT

ENV LISTEN_PORT 80

# System dependencies
RUN apt update && apt install -y libgomp1
RUN pip3 install pdm

# Project dependencies
COPY pdm.lock pyproject.toml ./

RUN pdm install --prod --no-lock --no-editable

COPY . .

WORKDIR /ml_pipeline
ENTRYPOINT pdm run uvicorn src.serving.__main__:app --host 0.0.0.0 --port $LISTEN_PORT --workers 2
