"""Add API-owned profile, resource, emergency, and action-log fields."""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_api_support_tables"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("action_log", sa.Column("status", sa.String(length=32), nullable=False, server_default="triggered"))
    op.add_column("action_log", sa.Column("message", sa.Text(), nullable=True))
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.String(length=128), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("ward_id", sa.String(length=32), sa.ForeignKey("wards.ward_id"), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "cooling_centers",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "emergency_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ward_id", sa.String(length=32), sa.ForeignKey("wards.ward_id"), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("resource", sa.String(length=255), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("emergency_events")
    op.drop_table("cooling_centers")
    op.drop_table("user_profiles")
    op.drop_column("action_log", "message")
    op.drop_column("action_log", "status")