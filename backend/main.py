from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.database import engine, Base
import models.job

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

@app.get("/health")
def health():
    return {"status": "ok"}