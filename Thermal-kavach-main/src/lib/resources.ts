import { apiRequest } from './api'
import type { UserLocation } from './location'
import type { Ward } from './weather'

export type ResourceService = 'cooling' | 'hospital' | 'water'
export type Resource = { id: string; name: string; latitude: number; longitude: number; address?: string; services: ResourceService[]; type: 'cooling' | 'hospital' }
export type HospitalResult = { resources: Resource[]; fromCache: boolean }

const fallbackCoolingCenters: Resource[] = [
  { id: 'cooling-dehgam-1', name: 'Dehgam Community Hall', latitude: 23.2512, longitude: 72.6578, address: 'Dehgam Main Road', services: ['cooling'], type: 'cooling' },
  { id: 'cooling-dehgam-2', name: 'Dehgam Government Hospital Relief Point', latitude: 23.2456, longitude: 72.6688, address: 'Near Taluka Office', services: ['cooling'], type: 'cooling' },
]

const ahmedabadCoolingFallback: Resource[] = [
  { id: 'ahmedabad-cooling-1', name: 'Ahmedabad Municipal Cooling Centre', latitude: 23.0225, longitude: 72.5714, address: 'Ahmedabad municipal area', services: ['cooling'], type: 'cooling' },
  { id: 'ahmedabad-cooling-2', name: 'Ahmedabad Community Relief Centre', latitude: 23.0469, longitude: 72.5314, address: 'Ahmedabad municipal area', services: ['cooling'], type: 'cooling' },
]

export function distanceKm(from: UserLocation, to: Resource) {
  const earthRadius = 6371
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearingDegrees(from: UserLocation, to: Resource) {
  const latitudeOne = from.latitude * Math.PI / 180
  const latitudeTwo = to.latitude * Math.PI / 180
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180
  return (Math.atan2(Math.sin(longitudeDelta) * Math.cos(latitudeTwo), Math.cos(latitudeOne) * Math.sin(latitudeTwo) - Math.sin(latitudeOne) * Math.cos(latitudeTwo) * Math.cos(longitudeDelta)) * 180 / Math.PI + 360) % 360
}

export async function loadCoolingCenters(): Promise<Resource[]> {
  const records = (await apiRequest<Array<{ id: string; name: string; latitude: number; longitude: number; address?: string }>>('/cooling-centers')).map(record => ({ ...record, services: ['cooling'] as ResourceService[], type: 'cooling' as const }))
  const coolingCenters = records.length ? records : [...fallbackCoolingCenters, ...(await loadAhmedabadCoolingCenters())]
  return mergeWaterPoints(coolingCenters, await loadWaterPoints())
}

export async function loadAhmedabadCoolingCenters(): Promise<Resource[]> {
  const bbox = '22.9,72.4,23.2,72.8'
  const queryText = `[out:json];(node[amenity~"community_centre|social_centre|shelter"](${bbox});way[amenity~"community_centre|social_centre|shelter"](${bbox}););out center tags;`
  for (const endpoint of ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(queryText)}`, { signal: controller.signal })
      if (!response.ok) continue
      const data = await response.json() as { elements: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }> }
      const records = data.elements.map(element => ({ id: `ahmedabad-${element.id}`, name: element.tags?.name ?? 'Ahmedabad community cooling resource', latitude: element.lat ?? element.center?.lat ?? 23.0225, longitude: element.lon ?? element.center?.lon ?? 72.5714, services: ['cooling'] as ResourceService[], type: 'cooling' as const }))
      if (records.length) return records
    } catch { /* Use the next endpoint or local fallback. */ } finally { window.clearTimeout(timeout) }
  }
  return ahmedabadCoolingFallback
}

async function loadWaterPoints(): Promise<Resource[]> {
  const bbox = '22.9,72.4,23.2,72.8'
  const queryText = `[out:json];(node[amenity=drinking_water](${bbox});node[man_made=water_tap](${bbox}););out center tags;`
  for (const endpoint of ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(queryText)}`, { signal: controller.signal })
      if (!response.ok) continue
      const data = await response.json() as { elements: Array<{ id: number; lat?: number; lon?: number; tags?: { name?: string } }> }
      return data.elements.map(element => ({ id: `water-${element.id}`, name: element.tags?.name ?? 'Drinking water point', latitude: element.lat ?? 23.0225, longitude: element.lon ?? 72.5714, services: ['water'] as ResourceService[], type: 'cooling' as const }))
    } catch { /* Try the next Overpass endpoint. */ } finally { window.clearTimeout(timeout) }
  }
  return []
}

function mergeWaterPoints(coolingCenters: Resource[], waterPoints: Resource[]) {
  const merged = coolingCenters.map(center => ({ ...center, services: [...center.services] }))
  for (const waterPoint of waterPoints) {
    const nearby = merged.find(center => distanceKm(center, waterPoint) <= 0.05)
    if (nearby) {
      if (!nearby.services.includes('water')) nearby.services.push('water')
    } else {
      merged.push(waterPoint)
    }
  }
  return merged
}

export async function loadNearbyHospitals(location: UserLocation): Promise<Resource[]> {
  const result = await loadNearbyHospitalsWithStatus(location)
  return result.resources
}

const hospitalCacheTtl = 24 * 60 * 60 * 1000
const hospitalCacheKey = (location: UserLocation) => `thermal-kavach-hospitals-${location.latitude.toFixed(2)}-${location.longitude.toFixed(2)}`
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

async function fetchHospitals(endpoint: string, queryText: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${endpoint}?data=${encodeURIComponent(queryText)}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Hospital lookup returned ${response.status}`)
    const data = await response.json() as { elements: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string; 'addr:street'?: string } }> }
    return data.elements
  } finally { window.clearTimeout(timeout) }
}

export async function loadNearbyHospitalsWithStatus(location: UserLocation): Promise<HospitalResult> {
  const delta = 0.12
  const bbox = `${location.latitude - delta},${location.longitude - delta},${location.latitude + delta},${location.longitude + delta}`
  const queryText = `[out:json];(node[amenity=hospital](${bbox});way[amenity=hospital](${bbox});relation[amenity=hospital](${bbox}););out center tags;`
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const elements = await fetchHospitals(endpoint, queryText)
        const resources = elements.map(element => ({ id: `hospital-${element.id}`, name: element.tags?.name ?? 'Nearby hospital', latitude: element.lat ?? element.center?.lat ?? location.latitude, longitude: element.lon ?? element.center?.lon ?? location.longitude, address: element.tags?.['addr:street'], services: ['hospital'] as ResourceService[], type: 'hospital' as const }))
        localStorage.setItem(hospitalCacheKey(location), JSON.stringify({ timestamp: Date.now(), resources }))
        return { resources, fromCache: false }
      } catch { await wait(250 * (attempt + 1)) }
    }
  }
  try {
    const cached = JSON.parse(localStorage.getItem(hospitalCacheKey(location)) ?? 'null') as { timestamp: number; resources: Resource[] } | null
    if (cached?.resources?.length && Date.now() - cached.timestamp < hospitalCacheTtl) return { resources: cached.resources.map(resource => ({ ...resource, services: resource.services ?? [resource.type] })), fromCache: true }
  } catch { /* Ignore malformed cache and return the live failure. */ }
  return { resources: [], fromCache: false }
}

export async function logEmergencyEvent(location: UserLocation, ward: Ward, resource: Resource) {
  await apiRequest('/emergency-events', { method: 'POST', body: JSON.stringify({ ward_id: ward.code, latitude: location.latitude, longitude: location.longitude, resource: resource.name, resource_type: resource.services.join(',') }) })
}

export function directionsUrl(resource: Resource) { return `https://www.google.com/maps/dir/?api=1&destination=${resource.latitude},${resource.longitude}` }
