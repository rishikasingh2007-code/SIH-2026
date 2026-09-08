"""Create initial heat-health schema.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-09-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry


revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    risk_tier = sa.Enum(
        "low", "moderate", "high", "very_high", "extreme", name="risk_tier"
    )
    health_report_severity = sa.Enum(
        "mild", "moderate", "severe", name="health_report_severity"
    )
    health_report_source = sa.Enum(
        "citizen_self_report", "hospital", name="health_report_source"
    )
    alert_channel = sa.Enum("sms", "whatsapp", "push", name="alert_channel")
    alert_status = sa.Enum("queued", "sent", "failed", name="alert_status")
    action_triggered_by = sa.Enum("manual", "automatic", name="action_triggered_by")

    op.create_table(
        "wards",
        sa.Column("ward_id", sa.String(length=32), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("boundary", Geometry(geometry_type="POLYGON", srid=4326), nullable=True),
        sa.Column("elderly_pct", sa.Float(), nullable=True),
        sa.Column("outdoor_worker_pct", sa.Float(), nullable=True),
        sa.Column("informal_housing_pct", sa.Float(), nullable=True),
    )
    op.create_table(
        "weather_readings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ward_id", sa.String(length=32), sa.ForeignKey("wards.ward_id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("temp_c", sa.Float(), nullable=False),
        sa.Column("humidity_pct", sa.Float(), nullable=False),
        sa.Column("wind_kmh", sa.Float(), nullable=False),
        sa.Column("wbgt_c", sa.Float(), nullable=False),
        sa.Column("risk_tier", risk_tier, nullable=False),
    )
    op.create_table(
        "health_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ward_id", sa.String(length=32), sa.ForeignKey("wards.ward_id"), nullable=False),
        sa.Column("severity", health_report_severity, nullable=False),
        sa.Column("source", health_report_source, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reporter_contact", sa.String(length=255), nullable=True),
    )
    op.create_table(
        "action_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ward_id", sa.String(length=32), sa.ForeignKey("wards.ward_id"), nullable=False),
        sa.Column("risk_level_at_trigger", risk_tier, nullable=False),
        sa.Column("action_type", sa.String(length=100), nullable=False),
        sa.Column("action_key", sa.String(length=255), nullable=False, unique=True),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("triggered_by", action_triggered_by, nullable=False),
    )
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ward_id", sa.String(length=32), sa.ForeignKey("wards.ward_id"), nullable=False),
        sa.Column("channel", alert_channel, nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("triggered_by", sa.Integer(), sa.ForeignKey("action_log.id"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", alert_status, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("action_log")
    op.drop_table("health_reports")
    op.drop_table("weather_readings")
    op.drop_table("wards")

    bind = op.get_bind()
    for enum_name in (
        "action_triggered_by",
        "alert_status",
        "alert_channel",
        "health_report_source",
        "health_report_severity",
        "risk_tier",
    ):
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
