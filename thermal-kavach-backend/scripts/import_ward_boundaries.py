"""Import LGD panchayat boundaries into the existing wards.boundary column.

The script is intentionally dry-run by default. Use --write only after reviewing
its match-count and unmatched-name output.

Examples:
    python scripts/import_ward_boundaries.py --source data/LGD_panchayats.parquet
    python scripts/import_ward_boundaries.py --write
"""
from __future__ import annotations

import argparse
import tempfile
import urllib.request
from pathlib import Path

import geopandas as gpd
from geoalchemy2.shape import from_shape
from sqlalchemy import select, text

from database import SessionLocal
from models import Ward

SOURCE_URL = (
    "https://github.com/yashveeeeeeer/india-geodata/releases/download/"
    "admin/panchayats/LGD_Panchayats.geojsonl.7z"
)
DISTRICT = "Gandhinagar"
TALUKA = "Dehgam"


def normalized(value: object) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def column_name(columns: list[str], candidates: tuple[str, ...], label: str) -> str:
    by_normalized = {normalized(column).replace("_", " "): column for column in columns}
    for candidate in candidates:
        match = by_normalized.get(normalized(candidate).replace("_", " "))
        if match:
            return match
    raise ValueError(
        f"Could not find the {label} column. Available columns: {', '.join(columns)}"
    )


def download_and_extract(source_url: str, work_dir: Path) -> Path:
    archive = work_dir / "LGD_Panchayats.geojsonl.7z"
    print(f"Downloading boundary source: {source_url}")
    urllib.request.urlretrieve(source_url, archive)
    try:
        import py7zr
    except ImportError as error:
        raise RuntimeError(
            "7z input requires py7zr. Install dependencies with: "
            "python -m pip install -r requirements.txt"
        ) from error
    extract_dir = work_dir / "extracted"
    extract_dir.mkdir()
    with py7zr.SevenZipFile(archive, mode="r") as compressed:
        compressed.extractall(path=extract_dir)
    files = list(extract_dir.rglob("*.geojsonl")) + list(extract_dir.rglob("*.geojson"))
    if not files:
        raise FileNotFoundError("The archive did not contain a GeoJSON/GeoJSONL file")
    return files[0]


def load_source(source: str | None, work_dir: Path) -> gpd.GeoDataFrame:
    if source and source.lower().endswith(".parquet"):
        print(f"Reading parquet source: {source}")
        return gpd.read_parquet(source)
    source_path = Path(source) if source and Path(source).exists() else None
    path = source_path or download_and_extract(source or SOURCE_URL, work_dir)
    print(f"Reading boundary source: {path}")
    return gpd.read_file(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        help="Local parquet/GeoJSON source, or a URL to a .7z archive. Defaults to the LGD release URL.",
    )
    parser.add_argument("--district", default=DISTRICT)
    parser.add_argument("--taluka", default=TALUKA)
    parser.add_argument("--district-column")
    parser.add_argument("--taluka-column")
    parser.add_argument("--name-column")
    parser.add_argument("--write", action="store_true", help="Write matched geometries to wards.boundary")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with tempfile.TemporaryDirectory(prefix="thermal-kavach-boundaries-") as temporary:
        source = load_source(args.source, Path(temporary))
        if source.crs is None:
            raise ValueError("Boundary source has no CRS; refusing to write ambiguous geometry")
        source = source.to_crs("EPSG:4326")
        columns = [str(column) for column in source.columns if column != source.geometry.name]
        district_column = args.district_column or column_name(
            columns, ("district", "district_name", "districtname"), "district"
        )
        taluka_column = args.taluka_column or column_name(
            columns, ("taluka", "taluka_name", "subdistrict", "sub_district"), "taluka"
        )
        name_column = args.name_column or column_name(
            columns,
            ("panchayat", "panchayat_name", "gram_panchayat", "gram_panchayat_name", "name"),
            "panchayat name",
        )
        filtered = source[
            (source[district_column].map(normalized) == normalized(args.district))
            & (source[taluka_column].map(normalized) == normalized(args.taluka))
        ].copy()
        print(
            f"Gandhinagar district / Dehgam taluka match count: {len(filtered)} "
            f"(columns: {district_column}, {taluka_column}, {name_column})"
        )
        if filtered.empty:
            raise RuntimeError("No boundary records matched the requested district and taluka")

        with SessionLocal() as db:
            wards = db.scalars(select(Ward).order_by(Ward.ward_id)).all()
            boundaries = {
                normalized(row[name_column]): row.geometry
                for _, row in filtered.iterrows()
                if row.geometry is not None and not row.geometry.is_empty
            }
            ward_names = {normalized(ward.name): ward.name for ward in wards}
            unmatched_source = sorted(set(boundaries) - set(ward_names))
            unmatched_wards = sorted(set(ward_names) - set(boundaries))
            print(f"Unmatched source names ({len(unmatched_source)}): {unmatched_source}")
            print(f"Unmatched existing ward names ({len(unmatched_wards)}): {unmatched_wards}")
            matched = sorted(set(boundaries) & set(ward_names))
            print(f"Exact ward-name matches: {len(matched)}")
            if not args.write:
                print("Dry run only; no database rows changed. Re-run with --write to update wards.boundary.")
                return
            if unmatched_source or unmatched_wards:
                raise RuntimeError("Refusing to write while names are unmatched; resolve names explicitly first")
            for ward in wards:
                geometry = boundaries[normalized(ward.name)]
                if geometry.geom_type != "Polygon":
                    raise ValueError(
                        f"{ward.name!r} has geometry type {geometry.geom_type}; "
                        "the existing wards.boundary column requires POLYGON"
                    )
                ward.boundary = from_shape(geometry, srid=4326)
            db.commit()

            populated = db.scalar(
                text("SELECT count(*) FROM wards WHERE boundary IS NOT NULL")
            )
            print(f"Boundary verification: {populated}/{len(wards)} wards have non-null boundaries")
            if populated != len(wards):
                raise RuntimeError("Boundary verification failed")


if __name__ == "__main__":
    main()
