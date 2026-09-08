"""Store generated standalone heat-zone polygons."""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision: str = "003_heat_zones"
down_revision: Union[str, None] = "002_api_support_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "heat_zones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("risk_tier", sa.Enum("low", "moderate", "high", "very_high", "extreme", name="risk_tier", create_type=False), nullable=False),
        sa.Column("geometry", Geometry(geometry_type="POLYGON", srid=4326), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("heat_zones")