from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

from routers import embeddings, images

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up embedding model connection on startup
    print("ML service starting...")
    yield
    print("ML service shutting down...")

app = FastAPI(title="ohm. ML service", lifespan=lifespan)

app.include_router(embeddings.router, prefix="/embed")
app.include_router(images.router, prefix="/image")

@app.get("/health")
async def health():
    return {"status": "ok"}
