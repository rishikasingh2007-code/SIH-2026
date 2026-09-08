import type { Ward } from './weather'

export type WardBoundary = { source: 'overpass' | 'generated'; coordinates: Array<[number, number]> }

export async function loadDehgamBoundary(): Promise<WardBoundary> {
  const queryText = '[out:json];relation["boundary"="administrative"]["name"~"Dehgam",i];out geom;'
  try {
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(queryText)}`)
    if (!response.ok) throw new Error('Overpass boundary request failed')
    const data = await response.json() as { elements?: Array<{ geometry?: Array<{ lat: number; lon: number }> }> }
    const geometry = data.elements?.[0]?.geometry
    if (!geometry || geometry.length < 4) throw new Error('Incomplete Dehgam boundary')
    return { source: 'overpass', coordinates: geometry.map(point => [point.lat, point.lon]) }
  } catch {
    return { source: 'generated', coordinates: [] }
  }
}

export function generatedWardPolygon(ward: Ward) {
  const size = 0.004
  return [[ward.latitude - size, ward.longitude - size], [ward.latitude - size, ward.longitude + size], [ward.latitude + size, ward.longitude + size], [ward.latitude + size, ward.longitude - size]] as Array<[number, number]>
}
