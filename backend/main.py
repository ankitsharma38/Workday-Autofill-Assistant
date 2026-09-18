from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import parse_resume, map_fields

app = FastAPI(title="Workday Autofill Backend", version="1.0.0")

# NOTE: tighten allow_origins to your extension's chrome-extension://<id> before shipping.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_resume.router)
app.include_router(map_fields.router)


@app.get("/health")
def health():
    return {"status": "ok"}
