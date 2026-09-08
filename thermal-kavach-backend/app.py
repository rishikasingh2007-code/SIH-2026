import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import router


app = FastAPI(title="Thermal Kavach API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):517[0-9]+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

scheduler = BackgroundScheduler()


def refresh_heat_zones() -> None:
    from database import SessionLocal
    from services import generate_and_store_heat_zones

    db = SessionLocal()
    try:
        count = generate_and_store_heat_zones(db)
        logging.getLogger(__name__).info("Heat-zone refresh completed: count=%s", count)
    except Exception:
        logging.getLogger(__name__).exception("Heat-zone refresh failed")
    finally:
        db.close()


@app.on_event("startup")
def start_scheduler() -> None:
    if os.environ.get("HEAT_ZONES_SCHEDULER_ENABLED", "true").lower() == "true":
        scheduler.add_job(
            refresh_heat_zones,
            CronTrigger(day_of_week="sun", hour=3, minute=0),
            id="weekly-heat-zones",
            replace_existing=True,
        )
        scheduler.start()


@app.on_event("shutdown")
def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}