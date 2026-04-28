import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database.db import init_db
from app.api.routes_auth import router as auth_router
from app.api.routes_users import router as users_router
from app.api.routes_loans import router as loans_router
from app.services.event_listener import start_event_listener

log = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Start blockchain event listener as a background task
    listener_task = asyncio.create_task(start_event_listener())
    log.info("Blockchain event listener started")
    yield
    listener_task.cancel()
    try:
        await listener_task
    except asyncio.CancelledError:
        log.info("Event listener stopped")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(loans_router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
