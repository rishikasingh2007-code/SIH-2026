import enum
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class RiskTier(str, enum.Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"
    EXTREME = "extreme"


class HealthReportSeverity(str, enum.Enum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class HealthReportSource(str, enum.Enum):
    CITIZEN_SELF_REPORT = "citizen_self_report"
    HOSPITAL = "hospital"


class AlertChannel(str, enum.Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    PUSH = "push"


class AlertStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"


class ActionTriggeredBy(str, enum.Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class Ward(Base):
    __tablename__ = "wards"

    ward_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    boundary: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326), nullable=True
    )
    elderly_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    outdoor_worker_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    informal_housing_pct: Mapped[float | None] = mapped_column(Float, nullable=True)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    ward_id: Mapped[str | None] = mapped_column(ForeignKey("wards.ward_id"), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CoolingCenter(Base):
    __tablename__ = "cooling_centers"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)


class EmergencyEvent(Base):
    __tablename__ = "emergency_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.ward_id"), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    resource: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HeatZone(Base):
    __tablename__ = "heat_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    risk_tier: Mapped[RiskTier] = mapped_column(
        Enum(RiskTier, name="risk_tier"), nullable=False
    )
    geometry: Mapped[object] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326), nullable=False
    )
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WeatherReading(Base):
    __tablename__ = "weather_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.ward_id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    humidity_pct: Mapped[float] = mapped_column(Float, nullable=False)
    wind_kmh: Mapped[float] = mapped_column(Float, nullable=False)
    wbgt_c: Mapped[float] = mapped_column(Float, nullable=False)
    risk_tier: Mapped[RiskTier] = mapped_column(
        Enum(RiskTier, name="risk_tier"), nullable=False
    )


class HealthReport(Base):
    __tablename__ = "health_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.ward_id"), nullable=False)
    severity: Mapped[HealthReportSeverity] = mapped_column(
        Enum(HealthReportSeverity, name="health_report_severity"), nullable=False
    )
    source: Mapped[HealthReportSource] = mapped_column(
        Enum(HealthReportSource, name="health_report_source"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reporter_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)


class ActionLog(Base):
    __tablename__ = "action_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.ward_id"), nullable=False)
    risk_level_at_trigger: Mapped[RiskTier] = mapped_column(
        Enum(RiskTier, name="risk_tier"), nullable=False
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    action_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="triggered")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    triggered_by: Mapped[ActionTriggeredBy] = mapped_column(
        Enum(ActionTriggeredBy, name="action_triggered_by"), nullable=False
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.ward_id"), nullable=False)
    channel: Mapped[AlertChannel] = mapped_column(
        Enum(AlertChannel, name="alert_channel"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    triggered_by: Mapped[int] = mapped_column(
        ForeignKey("action_log.id"), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus, name="alert_status"), nullable=False
    )
