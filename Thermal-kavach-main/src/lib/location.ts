import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type UserLocation = { latitude: number; longitude: number }
export type SearchLocation = UserLocation & { name: string }

export async function searchLocations(query: string): Promise<SearchLocation[]> {
  const params = new URLSearchParams({ q: query, format: 'json', countrycodes: 'in', limit: '5' })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'en' } })
  if (!response.ok) throw new Error('LOCATION_SEARCH_FAILED')
  const results = await response.json() as Array<{ display_name: string; lat: string; lon: string }>
  return results.map(result => ({ name: result.display_name, latitude: Number(result.lat), longitude: Number(result.lon) }))
}

export async function requestPreciseLocation(): Promise<UserLocation> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions({ permissions: ['location'] })
    if (permission.location !== 'granted') throw new Error('LOCATION_DENIED')
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude }
  }

  if (!navigator.geolocation) throw new Error('LOCATION_UNAVAILABLE')
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    error => reject(new Error(error.code === error.PERMISSION_DENIED ? 'LOCATION_DENIED' : 'LOCATION_UNAVAILABLE')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  ))
}
