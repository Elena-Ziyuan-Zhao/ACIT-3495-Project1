FROM python:3.11-slim

RUN useradd -m appuser
workdir /app

COPY requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

USER appuser

CMD [ "python", "main.py" ]