import json

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from database import SessionLocal
from datetime import datetime, timezone

from models import ActionLog, CoolingCenter, EmergencyEvent, HeatZone, HealthReport, UserProfile, Ward
from schemas import ActionLogCreate, ActionLogResponse, CoolingCenterResponse, EmergencyEventCreate, HealthReportCreate, HealthReportResponse, UserProfileUpsert, WardDetail, WardSummary
from services import create_action_log, create_health_report, get_ward, report_query, ward_weather_statement
from weather_service import fetch_ward_weather

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/weather/wards/{ward_id}")
def read_ward_weather(ward_id: str, db: Session = Depends(get_db)):
    return fetch_ward_weather(db, ward_id)


def ward_payload(ward: Ward, weather) -> WardSummary:
    return WardSummary(
        ward_id=ward.ward_id,
        name=ward.name,
        vulnerability={
            "elderly_pct": ward.elderly_pct,
            "outdoor_worker_pct": ward.outdoor_worker_pct,
            "informal_housing_pct": ward.informal_housing_pct,
        },
        latest_weather=weather,
        latest_risk={"tier": weather.risk_tier, "observed_at": weather.timestamp} if weather else None,
    )


def report_payload(report: HealthReport, ward_name: str | None = None) -> HealthReportResponse:
    return HealthReportResponse(
        id=report.id,
        ward_id=report.ward_id,
        ward_name=ward_name,
        severity=report.severity,
        source=report.source,
        notes=report.notes,
        reporter_contact=report.reporter_contact,
        reported_at=report.reported_at,
    )


@router.get("/wards", response_model=list[WardSummary])
def list_wards(db: Session = Depends(get_db)):
    return [ward_payload(ward, weather) for ward, weather in db.execute(ward_weather_statement())]


@router.get("/wards/{ward_id}", response_model=WardDetail)
def read_ward(ward_id: str, db: Session = Depends(get_db)):
    row = db.execute(ward_weather_statement().where(Ward.ward_id == ward_id)).first()
    if row is None:
        get_ward(db, ward_id)
    ward, weather = row
    reports = db.execute(report_query(ward_id).limit(5)).all()
    return WardDetail(
        **ward_payload(ward, weather).model_dump(),
        recent_reports=[report_payload(report, name) for report, name in reports],
    )


@router.post("/health/report", response_model=HealthReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(payload: HealthReportCreate, db: Session = Depends(get_db)):
    report = create_health_report(db, payload)
    ward_name = db.scalar(select(Ward.name).where(Ward.ward_id == report.ward_id))
    return report_payload(report, ward_name)


@router.get("/health/reports", response_model=list[HealthReportResponse])
def list_reports(ward_id: str | None = Query(default=None, min_length=1, max_length=32), db: Session = Depends(get_db)):
    if ward_id is not None:
        get_ward(db, ward_id)
    return [report_payload(report, name) for report, name in db.execute(report_query(ward_id))]


def action_payload(event: ActionLog) -> ActionLogResponse:
    return ActionLogResponse(
        id=event.id,
        action_type=event.action_type,
        ward_id=event.ward_id,
        status=event.status,
        message=event.message,
        risk_level=event.risk_level_at_trigger,
        idempotency_key=event.action_key,
        timestamp=event.triggered_at,
        triggered_by=event.triggered_by.value,
    )


@router.get("/action-log", response_model=list[ActionLogResponse])
def list_action_log(limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    events = db.scalars(
        select(ActionLog).order_by(desc(ActionLog.triggered_at), desc(ActionLog.id)).offset(offset).limit(limit)
    ).all()
    return [action_payload(event) for event in events]


@router.post("/action-log", response_model=ActionLogResponse, status_code=status.HTTP_201_CREATED)
def write_action_log(payload: ActionLogCreate, db: Session = Depends(get_db)):
    return action_payload(create_action_log(db, payload))


@router.put("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def upsert_user_profile(user_id: str, payload: UserProfileUpsert, db: Session = Depends(get_db)):
    if payload.ward_id is not None:
        ward = db.get(Ward, payload.ward_id) or db.scalar(select(Ward).where(Ward.name == payload.ward_id))
        if ward is None:
            get_ward(db, payload.ward_id)
        payload.ward_id = ward.ward_id
    profile = db.get(UserProfile, user_id)
    if profile is None:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
    for field in ("name", "role", "ward_id", "phone", "email"):
        setattr(profile, field, getattr(payload, field))
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/cooling-centers", response_model=list[CoolingCenterResponse])
def list_cooling_centers(db: Session = Depends(get_db)):
    return db.scalars(select(CoolingCenter).where(CoolingCenter.active.is_(True)).order_by(CoolingCenter.name)).all()


@router.post("/emergency-events", status_code=status.HTTP_201_CREATED)
def create_emergency_event(payload: EmergencyEventCreate, db: Session = Depends(get_db)):
    get_ward(db, payload.ward_id)
    event = EmergencyEvent(
        ward_id=payload.ward_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        resource=payload.resource,
        resource_type=payload.resource_type,
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return {"id": event.id, "status": "recorded"}


@router.get("/heat-zones/geojson")
def heat_zones_geojson(db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            HeatZone.id,
            HeatZone.risk_tier,
            HeatZone.generated_at,
            func.ST_AsGeoJSON(HeatZone.geometry).label("geometry_json"),
        ).order_by(HeatZone.id)
    ).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": zone_id,
                "geometry": json.loads(geometry_json),
                "properties": {"risk_tier": risk_tier.value, "generated_at": generated_at.isoformat()},
            }
            for zone_id, risk_tier, generated_at, geometry_json in rows
        ],
    }