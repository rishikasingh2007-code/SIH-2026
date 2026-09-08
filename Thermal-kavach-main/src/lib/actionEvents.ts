import { apiRequest } from './api'
import { calculateRisk, type RiskLevel, type Ward } from './weather'
import type { HeatCaseReport } from './healthReports'
import type { Resource } from './resources'

export type ActionEvent = { id?: string; type: 'cooling_center' | 'work_hours' | 'grid_alert' | 'sms' | 'whatsapp' | 'emergency'; ward: string; status: 'triggered' | 'sent' | 'pending'; message: string; timestamp: string; riskLevel?: RiskLevel; idempotencyKey?: string }
const localKey = 'thermal-kavach-action-events-v1'

function localEvents() { try { return JSON.parse(localStorage.getItem(localKey) ?? '[]') as ActionEvent[] } catch { return [] } }
function saveLocal(events: ActionEvent[]) { localStorage.setItem(localKey, JSON.stringify(events.slice(0, 100))) }

export async function loadActionEvents(): Promise<ActionEvent[]> {
  const events = await apiRequest<Array<{ id: number; action_type: ActionEvent['type']; ward_id: string; status: ActionEvent['status']; message: string | null; timestamp: string; risk_level: string; idempotency_key: string }>>('/action-log')
  return events.map(event => ({ id: String(event.id), type: event.action_type, ward: event.ward_id, status: event.status, message: event.message ?? '', timestamp: event.timestamp, riskLevel: event.risk_level.replace('_', ' ').replace(/\b\w/g, character => character.toUpperCase()) as RiskLevel, idempotencyKey: event.idempotency_key }))
}

export async function recordActionEvent(event: Omit<ActionEvent, 'timestamp' | 'id'>) {
  const complete = { ...event, timestamp: new Date().toISOString() }
  const events = localEvents()
  if (events.some(item => item.type === event.type && item.ward === event.ward && item.message === event.message && Date.now() - new Date(item.timestamp).getTime() < 6 * 60 * 60 * 1000)) return complete
  await apiRequest('/action-log', { method: 'POST', body: JSON.stringify({ action_type: event.type, ward_id: event.ward, status: event.status, message: event.message, risk_level: event.riskLevel?.toLowerCase().replace(' ', '_') ?? 'low', idempotency_key: event.idempotencyKey ?? `${event.ward}-${event.type}-${Date.now()}` }) })
  events.unshift(complete); saveLocal(events)
  return complete
}

export async function triggerWardActions(wards: Ward[], reports: HeatCaseReport[], existingEvents: ActionEvent[] = []) {
  const events: ActionEvent[] = []
  const loggedKeys = new Set(existingEvents.map(event => event.idempotencyKey).filter((key): key is string => Boolean(key)))
  const today = new Date().toISOString().slice(0, 10)
  const queueAction = async (ward: Ward, risk: RiskLevel, type: ActionEvent['type'], message: string) => {
    const idempotencyKey = `${ward.code}-${type}-${risk}-${today}`
    if (loggedKeys.has(idempotencyKey)) return
    loggedKeys.add(idempotencyKey)
    events.push(await recordActionEvent({ type, ward: ward.code, status: 'triggered', message, riskLevel: risk, idempotencyKey }))
  }
  for (const ward of wards) {
    if (!ward.weather) continue
    const risk = calculateRisk(ward, ward.weather.current).riskLevel
    if (risk === 'High' || risk === 'Extreme') {
      const reported = reports.filter(report => report.ward === ward.code && Date.now() - new Date(report.timestamp).getTime() < 86400000).length
      await queueAction(ward, risk, 'cooling_center', `Activate cooling support for ${ward.name} (${risk} WBGT risk).`)
      if (risk === 'Extreme' || reported >= 3) await queueAction(ward, risk, 'work_hours', `Shift outdoor work hours in ${ward.name} to protect exposed workers.`)
      if (risk === 'Extreme') await queueAction(ward, risk, 'grid_alert', `Send demand alert to the DISCOM zone serving ${ward.name}.`)
    }
  }
  return events
}

export async function sendEmergencySms(contact: string, message: string) {
  const response = await fetch('/api/emergency-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact, message }) })
  if (!response.ok) throw new Error('SMS_ENDPOINT_UNAVAILABLE')
}

export function actionError(error: unknown) { if (error instanceof Error && error.message === 'SMS_ENDPOINT_UNAVAILABLE') return 'Emergency help is shown, but SMS delivery needs the server notification endpoint.'; return error instanceof Error ? error.message : 'Action could not be completed.' }

export function resourceActionMessage(resource: Resource) { return `Citizen emergency surfaced ${resource.services.join(', ')}: ${resource.name}.` }
