import { apiRequest } from './api'

export type HeatZoneFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, {
  risk_tier: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme'
  generated_at: string
}>

export async function loadHeatZones() {
  return apiRequest<HeatZoneFeatureCollection>('/heat-zones/geojson')
}
