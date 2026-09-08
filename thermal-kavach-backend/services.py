from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from models import ActionLog, ActionTriggeredBy, HeatZone, HealthReport, RiskTier, Ward, WeatherReading
from schemas import ActionLogCreate, HealthReportCreate


def ward_weather_statement():
    latest = (
        select(
            WeatherReading.id.label("weather_id"),
            WeatherReading.ward_id,
            func.row_number()
            .over(
                partition_by=WeatherReading.ward_id,
                order_by=(WeatherReading.timestamp.desc(), WeatherReading.id.desc()),
            )
            .label("weather_rank"),
        )
        .subquery()
    )
    return (
        select(Ward, WeatherReading)
        .outerjoin(latest, (latest.c.ward_id == Ward.ward_id) & (latest.c.weather_rank == 1))
        .outerjoin(WeatherReading, WeatherReading.id == latest.c.weather_id)
        .order_by(Ward.ward_id)
    )


def get_ward(db: Session, ward_id: str) -> Ward:
    ward = db.get(Ward, ward_id)
    if ward is None:
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward


def report_query(ward_id: str | None = None):
    statement = select(HealthReport, Ward.name.label("ward_name")).join(Ward)
    if ward_id is not None:
        statement = statement.where(HealthReport.ward_id == ward_id)
    return statement.order_by(desc(HealthReport.reported_at), desc(HealthReport.id))


def create_health_report(db: Session, payload: HealthReportCreate) -> HealthReport:
    get_ward(db, payload.ward_id)
    recent_count = db.scalar(
        select(func.count(HealthReport.id)).where(
            HealthReport.ward_id == payload.ward_id,
            HealthReport.reported_at >= datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    if recent_count >= 10:
        raise HTTPException(status_code=429, detail="This ward has reached the hourly report limit")
    report = HealthReport(
        ward_id=payload.ward_id,
        severity=payload.severity,
        source=payload.source,
        notes=payload.notes,
        reporter_contact=payload.reporter_contact,
        reported_at=datetime.now(timezone.utc),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def create_action_log(db: Session, payload: ActionLogCreate) -> ActionLog:
    get_ward(db, payload.ward_id)
    existing = db.scalar(select(ActionLog).where(ActionLog.action_key == payload.idempotency_key))
    if existing:
        return existing
    try:
        triggered_by = ActionTriggeredBy(payload.triggered_by)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid triggered_by value") from error
    event = ActionLog(
        ward_id=payload.ward_id,
        risk_level_at_trigger=payload.risk_level,
        action_type=payload.action_type,
        action_key=payload.idempotency_key,
        status=payload.status,
        message=payload.message,
        triggered_at=datetime.now(timezone.utc),
        triggered_by=triggered_by,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def store_heat_zones(db: Session, feature_collection: dict) -> int:
    generated_at = datetime.now(timezone.utc)
    db.query(HeatZone).delete()
    valid_risks = {tier.value for tier in RiskTier}
    count = 0
    for feature in feature_collection.get("features", []):
        geometry = shape(feature["geometry"])
        risk_tier = feature.get("properties", {}).get("risk_tier")
        if geometry.geom_type != "Polygon" or risk_tier not in valid_risks:
            continue
        db.add(HeatZone(
            risk_tier=risk_tier,
            geometry=from_shape(geometry, srid=4326),
            generated_at=generated_at,
        ))
        count += 1
    db.commit()
    return count


def generate_and_store_heat_zones(db: Session) -> int:
    from scripts.generate_heat_zones import generate_feature_collection

    return store_heat_zones(db, generate_feature_collection())