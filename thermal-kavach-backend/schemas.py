from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models import HealthReportSeverity, HealthReportSource, RiskTier


class VulnerabilitySchema(BaseModel):
    elderly_pct: float | None
    outdoor_worker_pct: float | None
    informal_housing_pct: float | None


class WeatherReadingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    temp_c: float
    humidity_pct: float
    wind_kmh: float
    wbgt_c: float
    risk_tier: RiskTier


class RiskSchema(BaseModel):
    tier: RiskTier
    observed_at: datetime


class HealthReportResponse(BaseModel):
    id: int
    ward_id: str
    ward_name: str | None = None
    severity: HealthReportSeverity
    source: HealthReportSource
    notes: str | None
    reporter_contact: str | None = None
    reported_at: datetime


class WardSummary(BaseModel):
    ward_id: str
    name: str
    vulnerability: VulnerabilitySchema
    latest_weather: WeatherReadingSchema | None
    latest_risk: RiskSchema | None


class WardDetail(WardSummary):
    recent_reports: list[HealthReportResponse]


class HealthReportCreate(BaseModel):
    ward_id: str = Field(min_length=1, max_length=32)
    severity: HealthReportSeverity
    source: HealthReportSource
    notes: str | None = Field(default=None, max_length=10_000)
    reporter_contact: str | None = Field(default=None, max_length=255)


class ActionLogResponse(BaseModel):
    id: int
    action_type: str
    ward_id: str
    status: str
    message: str | None
    risk_level: RiskTier
    idempotency_key: str
    timestamp: datetime
    triggered_by: str


class ActionLogCreate(BaseModel):
    action_type: str = Field(min_length=1, max_length=100)
    ward_id: str = Field(min_length=1, max_length=32)
    status: str = Field(min_length=1, max_length=32)
    message: str | None = Field(default=None, max_length=10_000)
    risk_level: RiskTier
    idempotency_key: str = Field(min_length=1, max_length=255)
    triggered_by: str = "manual"


class UserProfileUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: str = Field(min_length=1, max_length=32)
    ward_id: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)


class CoolingCenterResponse(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    address: str | None = None


class EmergencyEventCreate(BaseModel):
    ward_id: str = Field(min_length=1, max_length=32)
    latitude: float
    longitude: float
    resource: str = Field(min_length=1, max_length=255)
    resource_type: str = Field(min_length=1, max_length=64)