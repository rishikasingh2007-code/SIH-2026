import { apiRequest } from './api'

export type ReportSeverity = 'mild' | 'moderate' | 'severe'
export type HeatCaseReport = { ward: string; timestamp: string; severity: ReportSeverity; notes: string; source: 'hospital' | 'citizen' | 'citizen_self_report' }

type ApiReport = { ward_id: string; reported_at: string; severity: ReportSeverity; notes: string | null; source: HeatCaseReport['source'] }
function toReport(report: ApiReport): HeatCaseReport { return { ward: report.ward_id, timestamp: report.reported_at, severity: report.severity, notes: report.notes ?? '', source: report.source } }

export async function submitHeatCaseReport(report: Omit<HeatCaseReport, 'timestamp'>) {
  const created = await apiRequest<ApiReport>('/health/report', { method: 'POST', body: JSON.stringify({ ward_id: report.ward, severity: report.severity, source: report.source === 'citizen' ? 'citizen_self_report' : report.source, notes: report.notes || null }) })
  return toReport(created)
}

export async function loadHeatCaseReports(): Promise<{ reports: HeatCaseReport[]; fromLocalDemo: boolean }> {
  const reports = await apiRequest<ApiReport[]>('/health/reports')
  return { reports: reports.map(toReport), fromLocalDemo: false }
}

export function subscribeHeatCaseReports(onChange: (reports: HeatCaseReport[], fromLocalDemo: boolean) => void, onError: (error: unknown) => void) {
  let active = true
  const refresh = () => { void loadHeatCaseReports().then(result => { if (active) onChange(result.reports, false) }).catch(onError) }
  refresh()
  const timer = window.setInterval(refresh, 30_000)
  return () => { active = false; window.clearInterval(timer) }
}

export function healthCaseError(error: unknown) {
  if (error instanceof Error && error.message === 'WARD_RATE_LIMIT') return 'This ward has reached the demo limit of 10 reports per hour.'
  return error instanceof Error ? error.message : 'Could not save the heat-health report.'
}
