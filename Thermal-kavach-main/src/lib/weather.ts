import { apiRequest } from './api'

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Extreme'

export type Ward = {
  name: string
  code: string
  latitude: number
  longitude: number
  elderly: number
  outdoorWorkers: number
  informalHousing: number
  reportedCases: null
  weather?: WardWeather
}

export type DailyForecast = {
  date: string
  temperature: number
  humidity: number
  wind: number
  solar: number
  wbgt: number
  riskScore: number
  riskLevel: RiskLevel
}

export type WardWeather = {
  current: DailyForecast
  forecast: DailyForecast[]
  fetchedAt: string
}

export type WeatherSnapshot = {
  wards: Ward[]
  fetchedAt: string
  fromCache: boolean
}

export type SelectedLocation = { name: string; latitude: number; longitude: number }

type OpenMeteoResponse = {
  hourly: {
    time: string[]
    temperature_2m: number[]
    relative_humidity_2m: number[]
    wind_speed_10m: number[]
    shortwave_radiation: number[]
  }
}

export const dehgamWards: Ward[] = [
  ['Dehgam Central', 'W-01', 23.2512, 72.6578, 13, 28, 22],
  ['Dehgam East', 'W-02', 23.2557, 72.6714, 18, 12, 9],
  ['Dehgam West', 'W-03', 23.2484, 72.6442, 15, 22, 16],
  ['Dehgam North', 'W-04', 23.2641, 72.6588, 11, 17, 8],
  ['Dehgam South', 'W-05', 23.2368, 72.6615, 16, 35, 31],
  ['Vavol Road', 'W-06', 23.2453, 72.6782, 14, 15, 12],
  ['Baliyasan Road', 'W-07', 23.2371, 72.6429, 10, 24, 18],
  ['Limbodra Road', 'W-08', 23.2692, 72.6815, 12, 31, 26],
  ['Jindva Road', 'W-09', 23.2731, 72.6475, 17, 20, 14],
  ['Rakhial Road', 'W-10', 23.2288, 72.6746, 9, 29, 21],
].map(([name, code, latitude, longitude, elderly, outdoorWorkers, informalHousing]) => ({
  name: name as string,
  code: code as string,
  latitude: latitude as number,
  longitude: longitude as number,
  elderly: elderly as number,
  outdoorWorkers: outdoorWorkers as number,
  informalHousing: informalHousing as number,
  reportedCases: null,
}))

export function generateWardsAround(location: SelectedLocation, count = 10): Ward[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    const radius = index % 2 ? 0.035 : 0.02
    return { name: `${location.name.split(',')[0]} Area ${String(index + 1).padStart(2, '0')}`, code: `W-${String(index + 1).padStart(2, '0')}`, latitude: location.latitude + Math.sin(angle) * radius, longitude: location.longitude + Math.cos(angle) * radius, elderly: 10 + (index * 3) % 11, outdoorWorkers: 15 + (index * 5) % 21, informalHousing: 8 + (index * 4) % 24, reportedCases: null }
  })
}

export function calculateWbgt(temperature: number, humidity: number, solar: number, wind = 0) {
  const wetBulb = temperature * Math.atan(0.151977 * Math.sqrt(humidity + 8.313659))
    + Math.atan(temperature + humidity) - Math.atan(humidity - 1.676331)
    + 0.00391838 * humidity ** 1.5 * Math.atan(0.023101 * humidity) - 4.686035
  const globe = temperature + Math.min(240, solar) / 170 - Math.min(4, wind) * 0.08
  return 0.7 * wetBulb + 0.2 * globe + 0.1 * temperature
}

export function wbgtRiskLevel(wbgt: number): RiskLevel {
  if (wbgt < 27.8) return 'Low'
  if (wbgt < 29.4) return 'Moderate'
  if (wbgt < 31.1) return 'High'
  return 'Extreme'
}

export function calculateRisk(ward: Ward, forecast: DailyForecast) {
  const vulnerability = ward.elderly * 0.35 + ward.outdoorWorkers * 0.4 + ward.informalHousing * 0.25
  const score = Math.min(99, Math.max(0, Math.round((forecast.wbgt - 25) * 9 + vulnerability * 0.35)))
  const riskLevel = wbgtRiskLevel(forecast.wbgt)
  return { ...forecast, riskScore: score, riskLevel }
}

function average(values: number[]) {
  const valid = values.filter(value => Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0
}

function dayForecast(response: OpenMeteoResponse, dayIndex: number, ward: Ward): DailyForecast {
  const start = dayIndex * 24
  const temperature = average(response.hourly.temperature_2m.slice(start, start + 24))
  const humidity = average(response.hourly.relative_humidity_2m.slice(start, start + 24))
  const wind = average(response.hourly.wind_speed_10m.slice(start, start + 24))
  const solar = average(response.hourly.shortwave_radiation.slice(start, start + 24))
  const wbgt = calculateWbgt(temperature, humidity, solar, wind)
  return calculateRisk(ward, {
    date: response.hourly.time[start]?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    temperature: Number(temperature.toFixed(1)), humidity: Math.round(humidity), wind: Math.round(wind), solar: Math.round(solar), wbgt: Number(wbgt.toFixed(1)), riskScore: 0, riskLevel: 'Low',
  })
}

async function fetchWardWeather(ward: Ward): Promise<Ward> {
  const data = await apiRequest<OpenMeteoResponse>(`/weather/wards/${encodeURIComponent(ward.code)}`)
  const forecast = Array.from({ length: 5 }, (_, index) => dayForecast(data, index, ward))
  return { ...ward, weather: { current: forecast[0], forecast, fetchedAt: new Date().toISOString() } }
}

const cacheKey = 'thermal-kavach-weather-v1'

export async function fetchWeatherSnapshot(targetWards: Ward[] = dehgamWards): Promise<WeatherSnapshot> {
  const locationCacheKey = targetWards === dehgamWards ? cacheKey : `${cacheKey}-${targetWards[0]?.latitude.toFixed(2)}-${targetWards[0]?.longitude.toFixed(2)}`
  try {
    const liveWards = await Promise.all(targetWards.map(fetchWardWeather))
    const snapshot = { wards: liveWards, fetchedAt: new Date().toISOString(), fromCache: false }
    localStorage.setItem(locationCacheKey, JSON.stringify(snapshot))
    return snapshot
  } catch (error) {
    const cached = localStorage.getItem(locationCacheKey)
    if (!cached) throw error
    return { ...(JSON.parse(cached) as WeatherSnapshot), fromCache: true }
  }
}

export function findNearestWard(latitude: number, longitude: number, wards: Ward[]) {
  return wards.reduce((nearest, ward) => {
    const distance = (ward.latitude - latitude) ** 2 + (ward.longitude - longitude) ** 2
    const nearestDistance = (nearest.latitude - latitude) ** 2 + (nearest.longitude - longitude) ** 2
    return distance < nearestDistance ? ward : nearest
  }, wards[0])
}
