"""Earth Engine boundary/LST smoke test for the real PostGIS ward boundary.

Required environment variables:
    DATABASE_URL: SQLAlchemy/PostGIS connection string.
    EE_PROJECT: Google Cloud project used by Earth Engine.
    EE_LST_COLLECTION: Earth Engine image collection ID.
    EE_LST_BAND: band containing the heat value.
    EE_LST_SCALE: optional numeric scale factor, default 1.
    EE_LST_OFFSET: optional numeric offset, default 0.

The returned image is clipped to the union of wards.boundary. This module does
not classify LST as WBGT; the heat-zone generator enforces that distinction.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import ee
import geopandas as gpd
from dotenv import load_dotenv
from shapely.geometry import shape
from sqlalchemy import create_engine, text


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def load_boundary_geojson() -> dict:
    database_url = os.environ["DATABASE_URL"]
    with create_engine(database_url, pool_pre_ping=True).connect() as connection:
        row = connection.execute(
            text("SELECT ST_AsGeoJSON(ST_Union(boundary)) FROM wards WHERE boundary IS NOT NULL")
        ).scalar_one_or_none()
    if not row:
        raise RuntimeError("No populated wards.boundary geometry was found")
    return json.loads(row)


def load_region() -> ee.Geometry:
    boundary = gpd.GeoDataFrame(
        geometry=[shape(load_boundary_geojson())], crs="EPSG:4326"
    )
    geo_interface = boundary.geometry.iloc[0].__geo_interface__
    return ee.Geometry(geo_interface)


def initialize_earth_engine() -> None:
    ee.Initialize(project=os.environ["EE_PROJECT"])


def load_latest_clipped_lst_image(region: ee.Geometry) -> ee.Image:
    collection_id = os.environ["EE_LST_COLLECTION"]
    band = os.environ["EE_LST_BAND"]
    days = int(os.environ.get("EE_LST_LOOKBACK_DAYS", "16"))
    scale = float(os.environ.get("EE_LST_SCALE", "1"))
    offset = float(os.environ.get("EE_LST_OFFSET", "0"))
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    image = (
        ee.ImageCollection(collection_id)
        .filterDate(start.isoformat(), end.isoformat())
        .filterBounds(region)
        .sort("system:time_start", False)
        .first()
    )
    if image is None:
        raise RuntimeError(f"No image found in Earth Engine collection {collection_id}")
    return ee.Image(image).select(band).multiply(scale).add(offset).clip(region)


def boundary_extent(region: ee.Geometry) -> list[float]:
    return region.bounds().coordinates().getInfo()[0]


def main() -> None:
    initialize_earth_engine()
    region = load_region()
    print(f"Boundary extent before clip: {boundary_extent(region)}")
    image = load_latest_clipped_lst_image(region)
    clipped_geometry = image.geometry()
    print(f"Boundary extent after clip: {boundary_extent(clipped_geometry)}")
    print(f"Earth Engine image: {image.getInfo().get('id', 'latest clipped image')}")


if __name__ == "__main__":
    main()