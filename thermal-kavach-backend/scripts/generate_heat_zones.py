"""Generate standalone heat-zone GeoJSON from a configured EE heat image."""
from __future__ import annotations

import json
import os
from pathlib import Path

import ee
from scripts.test_gee_pull import initialize_earth_engine, load_latest_clipped_lst_image, load_region

# These are the existing frontend WBGT thresholds in weather.ts. They are only
# valid when the configured Earth Engine band is already WBGT in degrees Celsius.
WBGT_THRESHOLDS = ((27.8, "low"), (29.4, "moderate"), (31.1, "high"))
RISK_VALUES = {"low": 1, "moderate": 2, "high": 3, "very_high": 4, "extreme": 5}


def classify_heat_image(image: ee.Image) -> ee.Image:
    if os.environ.get("EE_HEAT_VALUE_TYPE", "lst").lower() != "wbgt":
        raise RuntimeError(
            "Refusing to apply WBGT thresholds to ordinary LST. Set "
            "EE_HEAT_VALUE_TYPE=wbgt only when EE_LST_BAND is a WBGT-valued image."
        )
    classified = ee.Image(5)
    for threshold, risk in reversed(WBGT_THRESHOLDS):
        classified = classified.where(image.lt(threshold), RISK_VALUES[risk])
    return classified.rename("risk_code")


def generate_feature_collection() -> dict:
    initialize_earth_engine()
    region = load_region()
    image = load_latest_clipped_lst_image(region)
    classified = classify_heat_image(image)
    scale = int(os.environ.get("EE_VECTOR_SCALE", "1000"))
    vectors = classified.reduceToVectors(
        geometry=region,
        scale=scale,
        geometryType="polygon",
        eightConnected=False,
        labelProperty="risk_code",
        maxPixels=10_000_000,
    )
    features = vectors.getInfo().get("features", [])
    for feature in features:
        code = int(feature.get("properties", {}).get("risk_code", 0))
        feature.setdefault("properties", {})["risk_tier"] = next(
            risk for risk, value in RISK_VALUES.items() if value == code
        )
        feature["properties"].pop("risk_code", None)
    collection = {"type": "FeatureCollection", "features": features}
    print(f"Heat-zone count: {len(features)}")
    breakdown = {}
    for feature in features:
        risk = feature["properties"]["risk_tier"]
        breakdown[risk] = breakdown.get(risk, 0) + 1
    print(f"Heat-zone breakdown: {breakdown}")
    return collection


def write_geojson(output: str | None = None) -> dict:
    collection = generate_feature_collection()
    destination = Path(output or os.environ.get("HEAT_ZONES_GEOJSON", "data/heat_zones.geojson"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(collection), encoding="utf-8")
    print(f"Wrote heat zones to {destination}")
    return collection


if __name__ == "__main__":
    write_geojson()