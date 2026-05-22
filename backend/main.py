from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from models.database import engine, Base
import models.job
from api.routes import upload, jobs

app = FastAPI(title="Alaiy Catalog Builder")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)

app.mount("/uploads", StaticFiles(directory="storage/uploads"), name="uploads")
app.mount("/processed", StaticFiles(directory="storage/processed"), name="processed")

app.include_router(upload.router)
app.include_router(jobs.router)

@app.get("/health")
def health():
    return {"status": "ok"}