from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx
import redis
from sqlalchemy.orm import Session

from models import Ward

logger = logging.getLogger(__name__)
CACHE_TTL_SECONDS = 900
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(
        os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=2,
    )


def _weather_params(ward: Ward) -> dict[str, str]:
    return {
        "latitude": str(ward.latitude),
        "longitude": str(ward.longitude),
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation",
        "forecast_days": "5",
        "timezone": "auto",
    }


def _fetch_open_meteo(ward: Ward) -> dict[str, Any]:
    response = httpx.get(OPEN_METEO_URL, params=_weather_params(ward), timeout=15)
    response.raise_for_status()
    return response.json()


def fetch_ward_weather(db: Session, ward_id: str) -> dict[str, Any]:
    ward = db.get(Ward, ward_id)
    if ward is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Ward not found")

    cache_key = f"weather:ward:{ward_id}"
    try:
        cached = _redis_client().get(cache_key)
        if cached:
            logger.info("Weather cache HIT: ward_id=%s", ward_id)
            return json.loads(cached)
    except Exception:
        logger.exception("Weather Redis read failed: ward_id=%s", ward_id)

    logger.info("Weather cache MISS: ward_id=%s", ward_id)
    weather = _fetch_open_meteo(ward)
    try:
        _redis_client().setex(cache_key, CACHE_TTL_SECONDS, json.dumps(weather))
        logger.info("Weather cached: ward_id=%s, ttl=900s", ward_id)
    except Exception:
        logger.exception("Weather Redis write failed: ward_id=%s", ward_id)
    return weather
