import { useEffect, useMemo, useState } from "react";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  Activity,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CloudSun,
  Droplets,
  Hospital,
  LockKeyhole,
  LogOut,
  MapPinned,
  Menu,
  MessageSquareText,
  Navigation,
  ShieldCheck,
  Siren,
  Smartphone,
  SunMedium,
  ThermometerSun,
  Users,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  auth,
  createUserWithEmailAndPassword,
  getUserRole,
  isFirebaseConfigured,
  onAuthStateChanged,
  saveUserProfile,
  sendEmailVerification,
  signOut,
  sendPhoneOtp,
  signInWithEmailAndPassword,
  verifyPhoneOtp,
  updateProfile,
  type PhoneOtpSession,
} from "./lib/firebase";
import { requestPreciseLocation, searchLocations, type SearchLocation } from "./lib/location";
import { healthCaseError, loadHeatCaseReports, submitHeatCaseReport, subscribeHeatCaseReports, type HeatCaseReport, type ReportSeverity } from "./lib/healthReports";
import { bearingDegrees, directionsUrl, distanceKm, loadCoolingCenters, loadNearbyHospitalsWithStatus, logEmergencyEvent, type Resource } from "./lib/resources";
import { actionError, loadActionEvents, recordActionEvent, sendEmergencySms, triggerWardActions, type ActionEvent } from "./lib/actionEvents";
import { loadDehgamBoundary, type WardBoundary } from "./lib/gis";
import { loadHeatZones, type HeatZoneFeatureCollection } from "./lib/heatZones";
import { CircleMarker, GeoJSON, LayersControl, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  calculateRisk,
  wbgtRiskLevel,
  fetchWeatherSnapshot,
  findNearestWard,
  generateWardsAround,
  dehgamWards,
  type SelectedLocation,
  type Ward,
  type WeatherSnapshot,
} from "./lib/weather";
import "./App.css";

function firebaseAuthMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("email-already-in-use")) return "This email is already in use.";
  if (code.includes("weak-password")) return "Password is too weak. Use at least 6 characters.";
  if (code.includes("invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("invalid-phone-number")) return "Enter a valid Indian mobile number.";
  if (code.includes("invalid-verification-code")) return "That OTP is incorrect. Check the message and try again.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait and try again later.";
  return error instanceof Error ? error.message : "Authentication failed. Please try again.";
}

function logAuthFailure(context: string, error: unknown) {
  const details = error instanceof Error ? { message: error.message, code: "code" in error ? String(error.code) : undefined } : { message: String(error) };
  console.error(`[Thermal Kavach auth] ${context}`, details);
}

type LoginScreenProps = {
  authScreen: "login" | "signup";
  setAuthScreen: (screen: "login" | "signup") => void;
  entryMethod: "email" | "phone";
  setEntryMethod: (method: "email" | "phone") => void;
  entryRole: "citizen" | "government";
  setEntryRole: (role: "citizen" | "government") => void;
  entryEmail: string;
  setEntryEmail: (value: string) => void;
  entryName: string;
  setEntryName: (value: string) => void;
  entryPassword: string;
  setEntryPassword: (value: string) => void;
  entryConfirmPassword: string;
  setEntryConfirmPassword: (value: string) => void;
  entryPhone: string;
  setEntryPhone: (value: string) => void;
  entryOtp: string;
  setEntryOtp: (value: string) => void;
  entryOtpSent: boolean;
  entryError: string;
  entryNotice: string;
  onEmailLogin: () => void;
  onResendVerification: () => void;
  onPhoneLogin: () => void;
};

function LocationPicker({ location, onSelect }: { location: SelectedLocation; onSelect: (location: SelectedLocation) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchLocation[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return; }
    const timer = window.setTimeout(() => { setBusy(true); void searchLocations(query.trim()).then(setResults).catch(() => setResults([])).finally(() => setBusy(false)); }, 1000);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <div className="location-picker"><label htmlFor="location-search">Location</label><div className="location-input"><MapPinned size={15} /><input id="location-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={location.name} /><span>{busy ? "Searching..." : ""}</span></div>{results.length > 0 && <div className="location-results">{results.map(result => <button key={`${result.latitude}-${result.longitude}`} onClick={() => { onSelect(result); setQuery(""); setResults([]); }}><strong>{result.name.split(",")[0]}</strong><span>{result.name}</span></button>)}</div>}<small>Selected: {location.name}</small></div>;
}

function LoginScreen(props: LoginScreenProps) {
  return <EmailAuthScreen props={props} />;
  /*
  const account = props.entryRole === "government"
    ? { email: "admin@thermalkavach.demo", password: "Gov@1234" }
    : { email: "citizen@thermalkavach.demo", password: "Citizen@1234" };
  return <div className="auth-screen"><div className="auth-visual"><div className="auth-brand"><div className="brand-mark"><ShieldCheck size={27} /></div><div><strong>Thermal Kavach</strong><span>Heat health intelligence</span></div></div><div className="auth-visual-copy"><p className="eyebrow">WARD-LEVEL PROTECTION</p><h1>Know the heat.<br /><em>Act in time.</em></h1><p>Localized heat risk, human impact, and clear action for every community.</p></div><div className="auth-visual-stats"><span><strong>24</strong> wards monitored</span><span><strong>5 day</strong> forecast horizon</span></div></div><div className="auth-card"><div className="auth-card-top"><span>Secure access</span><div className="auth-switch"><button className={props.authScreen === "login" ? "active" : ""} onClick={() => props.setAuthScreen("login")}>Log in</button><button className={props.authScreen === "signup" ? "active" : ""} onClick={() => props.setAuthScreen("signup")}>Sign up</button></div></div><h2>{props.authScreen === "login" ? "Welcome back" : "Create your account"}</h2><p className="auth-intro">Access trusted heat-health intelligence for your area.</p><label htmlFor="entry-role">Account type</label><select className="role-select" id="entry-role" value={props.entryRole} onChange={event => props.setEntryRole(event.target.value as "citizen" | "government")}><option value="citizen">Citizen / resident</option><option value="government">Government operations</option></select><div className="auth-methods"><button className={props.entryMethod === "email" ? "auth-method active" : "auth-method"} onClick={() => props.setEntryMethod("email")}><MessageSquareText size={14} /> Email &amp; password</button><button className={props.entryMethod === "phone" ? "auth-method active" : "auth-method"} onClick={() => props.setEntryMethod("phone")}><Smartphone size={14} /> Phone OTP</button></div>{props.entryMethod === "email" ? <><label htmlFor="entry-email">Email address</label><input className="auth-input" id="entry-email" type="email" value={props.entryEmail} onChange={event => props.setEntryEmail(event.target.value)} placeholder="name@example.com" /><label htmlFor="entry-password">Password</label><input className="auth-input" id="entry-password" type="password" value={props.entryPassword} onChange={event => props.setEntryPassword(event.target.value)} placeholder="Your password" /><button className="auth-primary" onClick={props.onEmailLogin}>{props.authScreen === "login" ? "Log in securely" : "Create account"} <ArrowUpRight size={16} /></button></> : <><label htmlFor="entry-phone">Mobile number</label><div className="phone-field"><span>+91</span><input id="entry-phone" value={props.entryPhone} onChange={event => props.setEntryPhone(event.target.value)} placeholder="10-digit number" inputMode="numeric" /></div>{props.entryOtpSent && <><label htmlFor="entry-otp">Demo OTP</label><input className="auth-input" id="entry-otp" value={props.entryOtp} onChange={event => props.setEntryOtp(event.target.value)} placeholder="Enter 6-digit OTP" inputMode="numeric" /></>}<button className="auth-primary" onClick={props.onPhoneLogin}>{props.entryOtpSent ? "Verify OTP" : "Send OTP"} <ArrowUpRight size={16} /></button></>} {props.entryError && <p className="auth-error" role="alert">{props.entryError}</p>}<div className="demo-credentials"><p><Zap size={13} /> Demo access</p><span>Email: <b>{account.email}</b></span><span>Password: <b>{account.password}</b></span><span>Phone: <b>9999999999</b> · OTP: <b>123456</b></span></div><p className="auth-foot"><LockKeyhole size={13} /> Your account is protected by Firebase Authentication.</p></div></div>;
  */
}

export function LegacyEmailAuthScreen({ props }: { props: LoginScreenProps }) {
  const isSignup = props.authScreen === "signup";
  return <div className="auth-screen"><div className="auth-visual"><div className="auth-brand"><div className="brand-mark"><ShieldCheck size={27} /></div><div><strong>Thermal Kavach</strong><span>Heat health intelligence</span></div></div><div className="auth-visual-copy"><p className="eyebrow">WARD-LEVEL PROTECTION</p><h1>Know the heat.<br /><em>Act in time.</em></h1><p>Localized heat risk, human impact, and clear action for every community.</p></div><div className="auth-visual-stats"><span><strong>24</strong> wards monitored</span><span><strong>5 day</strong> forecast horizon</span></div></div><div className="auth-card"><div className="auth-card-top"><span>Secure access</span><div className="auth-switch"><button className={!isSignup ? "active" : ""} onClick={() => props.setAuthScreen("login")}>Log in</button><button className={isSignup ? "active" : ""} onClick={() => props.setAuthScreen("signup")}>Sign up</button></div></div><h2>{isSignup ? "Create your account" : "Welcome back"}</h2><p className="auth-intro">Access trusted heat-health intelligence for your area.</p>{props.entryNotice && <p className="auth-success" role="status">{props.entryNotice}</p>}{isSignup && <><label htmlFor="entry-name">Full name</label><input className="auth-input" id="entry-name" value={props.entryName} onChange={event => props.setEntryName(event.target.value)} placeholder="Your full name" /><label htmlFor="entry-role">Role</label><select className="role-select" id="entry-role" value={props.entryRole} onChange={event => props.setEntryRole(event.target.value as "citizen" | "government")}><option value="citizen">Citizen</option><option value="government">Government Official</option></select></>}<label htmlFor="entry-email">Email address</label><input className="auth-input" id="entry-email" type="email" value={props.entryEmail} onChange={event => props.setEntryEmail(event.target.value)} placeholder="name@example.com" /><label htmlFor="entry-password">Password</label><input className="auth-input" id="entry-password" type="password" value={props.entryPassword} onChange={event => props.setEntryPassword(event.target.value)} placeholder="At least 6 characters" />{isSignup && <><label htmlFor="entry-confirm-password">Confirm password</label><input className="auth-input" id="entry-confirm-password" type="password" value={props.entryConfirmPassword} onChange={event => props.setEntryConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></>}<button className="auth-primary" onClick={props.onEmailLogin}>{isSignup ? "Create account" : "Log in"} <ArrowUpRight size={16} /></button>{props.entryError && <p className="auth-error" role="alert">{props.entryError}</p>}</div></div>;
}

function EmailAuthScreen({ props }: { props: LoginScreenProps }) {
  const isSignup = props.authScreen === "signup";
  return <div className="auth-screen"><div className="auth-visual"><div className="auth-brand"><div className="brand-mark"><ShieldCheck size={27} /></div><div><strong>Thermal Kavach</strong><span>Heat health intelligence</span></div></div><div className="auth-visual-copy"><p className="eyebrow">WARD-LEVEL PROTECTION</p><h1>Know the heat.<br /><em>Act in time.</em></h1><p>Localized heat risk, clear action for every community.</p></div><div className="auth-visual-stats"><span><strong>24</strong> wards monitored</span><span><strong>5 day</strong> forecast horizon</span></div></div><div className="auth-card"><div className="auth-card-top"><span>Secure access</span><div className="auth-switch"><button type="button" className={!isSignup ? "active" : ""} onClick={() => props.setAuthScreen("login")}>Log in</button><button type="button" className={isSignup ? "active" : ""} onClick={() => props.setAuthScreen("signup")}>Sign up</button></div></div><h2>{isSignup ? "Create your account" : "Welcome back"}</h2><p className="auth-intro">Access trusted heat-health intelligence for your area.</p>{props.entryNotice && <p className="auth-success" role="status">{props.entryNotice}</p>}{isSignup && <><label htmlFor="entry-name">Full name</label><input className="auth-input" id="entry-name" value={props.entryName} onChange={event => props.setEntryName(event.target.value)} placeholder="Your full name" /><label htmlFor="entry-role">Role</label><select className="role-select" id="entry-role" value={props.entryRole} onChange={event => props.setEntryRole(event.target.value as "citizen" | "government")}><option value="citizen">Citizen</option><option value="government">Government Official</option></select></>}<label htmlFor="entry-email">Email address</label><input className="auth-input" id="entry-email" type="email" value={props.entryEmail} onChange={event => props.setEntryEmail(event.target.value)} placeholder="name@example.com" /><label htmlFor="entry-password">Password</label><input className="auth-input" id="entry-password" type="password" value={props.entryPassword} onChange={event => props.setEntryPassword(event.target.value)} placeholder="At least 6 characters" />{isSignup && <><label htmlFor="entry-confirm-password">Confirm password</label><input className="auth-input" id="entry-confirm-password" type="password" value={props.entryConfirmPassword} onChange={event => props.setEntryConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></>}<button className="auth-primary" onClick={props.onEmailLogin}>{isSignup ? "Create account" : "Log in"} <ArrowUpRight size={16} /></button>{!isSignup && <button className="resend-button" onClick={props.onResendVerification}>Resend verification email</button>}{props.entryError && <p className="auth-error" role="alert">{props.entryError}</p>}</div></div>;
}

export function RealLoginScreen({ props }: { props: LoginScreenProps }) {
  const isSignup = props.authScreen === "signup";
  return <div className="auth-screen"><div className="auth-visual"><div className="auth-brand"><div className="brand-mark"><ShieldCheck size={27} /></div><div><strong>Thermal Kavach</strong><span>Heat health intelligence</span></div></div><div className="auth-visual-copy"><p className="eyebrow">WARD-LEVEL PROTECTION</p><h1>Know the heat.<br /><em>Act in time.</em></h1><p>Localized heat risk, human impact, and clear action for every community.</p></div><div className="auth-visual-stats"><span><strong>24</strong> wards monitored</span><span><strong>5 day</strong> forecast horizon</span></div></div><div className="auth-card"><div className="auth-card-top"><span>Secure access</span><div className="auth-switch"><button className={!isSignup ? "active" : ""} onClick={() => props.setAuthScreen("login")}>Log in</button><button className={isSignup ? "active" : ""} onClick={() => props.setAuthScreen("signup")}>Sign up</button></div></div><h2>{isSignup ? "Create your account" : "Welcome back"}</h2><p className="auth-intro">Access trusted heat-health intelligence for your area.</p>{props.entryNotice && <p className="auth-success" role="status">{props.entryNotice}</p>}<label htmlFor="entry-role">Account type</label><select className="role-select" id="entry-role" value={props.entryRole} onChange={event => props.setEntryRole(event.target.value as "citizen" | "government")}><option value="citizen">Citizen / resident</option><option value="government">Government operations</option></select><div className="auth-methods"><button className={props.entryMethod === "email" ? "auth-method active" : "auth-method"} onClick={() => props.setEntryMethod("email")}><MessageSquareText size={14} /> Email &amp; password</button><button className={props.entryMethod === "phone" ? "auth-method active" : "auth-method"} onClick={() => props.setEntryMethod("phone")}><Smartphone size={14} /> Phone OTP</button></div>{props.entryMethod === "email" ? <><>{isSignup && <><label htmlFor="entry-name">Full name</label><input className="auth-input" id="entry-name" value={props.entryName} onChange={event => props.setEntryName(event.target.value)} placeholder="Your full name" /></>}</><label htmlFor="entry-email">Email address</label><input className="auth-input" id="entry-email" type="email" value={props.entryEmail} onChange={event => props.setEntryEmail(event.target.value)} placeholder="name@example.com" /><label htmlFor="entry-password">Password</label><input className="auth-input" id="entry-password" type="password" value={props.entryPassword} onChange={event => props.setEntryPassword(event.target.value)} placeholder="At least 6 characters" /><button className="auth-primary" onClick={props.onEmailLogin}>{isSignup ? "Create account" : "Log in"} <ArrowUpRight size={16} /></button></> : <>{isSignup && <><label htmlFor="entry-phone-name">Full name</label><input className="auth-input" id="entry-phone-name" value={props.entryName} onChange={event => props.setEntryName(event.target.value)} placeholder="Your full name" /></>}<label htmlFor="entry-phone">Mobile number</label><div className="phone-field"><span>+91</span><input id="entry-phone" value={props.entryPhone} onChange={event => props.setEntryPhone(event.target.value)} placeholder="10-digit number" inputMode="numeric" /></div>{props.entryOtpSent && <><label htmlFor="entry-otp">Verification code</label><input className="auth-input" id="entry-otp" value={props.entryOtp} onChange={event => props.setEntryOtp(event.target.value)} placeholder="6-digit OTP" inputMode="numeric" /></>}<button className="auth-primary" onClick={props.onPhoneLogin}>{props.entryOtpSent ? "Verify & continue" : "Send OTP"} <ArrowUpRight size={16} /></button></>}{props.entryError && <p className="auth-error" role="alert">{props.entryError}</p>}<p className="auth-foot"><LockKeyhole size={13} /> Secure Firebase Authentication</p></div></div>;
}

function MapViewport({ wards }: { wards: Ward[] }) {
  const map = useMap();
  const [heatZones, setHeatZones] = useState<HeatZoneFeatureCollection | null>(null);
  useEffect(() => {
    if (wards.length) map.fitBounds(wards.map(ward => [ward.latitude, ward.longitude] as [number, number]), { padding: [30, 30] });
  }, [map, wards]);
  useEffect(() => {
    let active = true;
    void loadHeatZones().then(zones => { if (active) setHeatZones(zones); }).catch(() => { if (active) setHeatZones(null); });
    return () => { active = false; };
  }, []);
  return <LayersControl position="topright"><LayersControl.Overlay checked name="Heat zones">{heatZones && <GeoJSON data={heatZones} style={feature => ({ color: riskColor(String(feature?.properties?.risk_tier ?? "low").replace("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())), weight: 1, fillOpacity: 0.28 })} />}</LayersControl.Overlay></LayersControl>;
}

function riskColor(level: string) {
  return level === "Extreme" ? "#8f263c" : level === "High" ? "#dc7657" : level === "Moderate" ? "#d7a93d" : "#5ca36b";
}

function WardRiskMap({ wards, selectedWard, onSelect }: { wards: Ward[]; selectedWard: Ward; onSelect: (ward: Ward) => void }) {
  const selected = wards[0];
  const selectedRisk = selectedWard.weather ? calculateRisk(selectedWard, selectedWard.weather.current) : null;
  return <section className="gis-map-screen"><div className="gis-map-card panel"><div className="panel-heading"><div><p className="eyebrow compact">LIVE GIS VIEW</p><h2>Ward risk map</h2><p>Live WBGT risk by ward centroid. Select a marker for details.</p></div><div className="map-legend"><span><i className="low-dot" /> Low</span><span><i className="moderate-dot" /> Moderate</span><span><i className="high-dot" /> High</span><span><i className="extreme-dot" /> Extreme</span></div></div><MapContainer className="leaflet-map" center={[selected?.latitude ?? 23.25, selected?.longitude ?? 72.66]} zoom={13} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapViewport wards={wards} />{wards.map(ward => { const risk = ward.weather ? calculateRisk(ward, ward.weather.current) : null; return <CircleMarker key={ward.code} center={[ward.latitude, ward.longitude]} radius={risk ? 13 : 10} pathOptions={{ color: "#fff", weight: 2, fillColor: riskColor(risk?.riskLevel ?? "Low"), fillOpacity: .9 }} eventHandlers={{ click: () => onSelect(ward) }}><Popup><strong>{ward.code} · {ward.name}</strong><br />WBGT: {risk?.wbgt ?? "Loading"}°C<br />Risk: {risk?.riskLevel ?? "Loading"}</Popup></CircleMarker>; })}</MapContainer><div className="map-selected-detail"><div><p className="eyebrow compact">SELECTED AREA CONDITION</p><h3>{selectedWard.name}</h3><span>WBGT {selectedRisk?.wbgt ?? "--"}°C · {selectedRisk?.riskLevel ?? "Loading"} · score {selectedRisk?.riskScore ?? "--"}/100</span></div><div>{selectedWard.weather?.forecast.slice(0, 5).map(day => <span key={day.date}>{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}: {day.riskLevel}</span>)}</div></div></div><div className="gis-ward-list panel"><p className="eyebrow compact">WARD REGISTER</p>{wards.map(ward => { const risk = ward.weather ? calculateRisk(ward, ward.weather.current) : null; return <button key={ward.code} onClick={() => onSelect(ward)}><span>{ward.code}</span><strong>{ward.name}</strong><b className={`comparison-risk ${risk?.riskLevel.toLowerCase() ?? ""}`}>{risk?.riskLevel ?? "Loading"}</b></button>; })}</div></section>;
}

function TabScreen({ tab, wards }: { tab: string; wards: Ward[] }) {
  const details: Record<string, { icon: typeof MapPinned; title: string; description: string; rows: string[] }> = {
    "Ward map": { icon: MapPinned, title: "Ward risk map", description: "Select a ward to inspect its live WBGT and vulnerability profile.", rows: wards.map(ward => `${ward.code}  ·  ${ward.name}  ·  ${ward.weather ? calculateRisk(ward, ward.weather.current).riskLevel : "Loading weather"}`) },
    "Health reports": { icon: Hospital, title: "Heat-health reporting", description: "Hospital reporting feed is ready for verified case data.", rows: ["Reported heat cases will appear here once a facility submits a case.", "Open-Meteo supplies weather only; it does not provide clinical records."] },
    "Action centre": { icon: Siren, title: "Action centre", description: "Operational actions linked to live ward risk thresholds.", rows: ["Cooling centre activation · Ready", "Outdoor work-hour shift · Ready", "Ward officer notification · Ready"] },
    "Alert channels": { icon: MessageSquareText, title: "Alert channels", description: "Configure the regional channels used for public warnings.", rows: ["SMS dispatch · Firebase / provider connection pending", "WhatsApp dispatch · Provider template required", "In-app alerts · Enabled"] },
    "Population layers": { icon: Users, title: "Population vulnerability", description: "Review demographic factors used in the mortality risk score.", rows: ["Elderly population density · Weighted", "Outdoor worker density · Weighted", "Informal housing exposure · Weighted"] },
  };
  const detail = details[tab] ?? details["Ward map"];
  const Icon = detail.icon;
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  if (tab === "Population layers") {
    const rows = [
      { label: "Elderly population density", value: wards[0]?.elderly ?? 0, weight: 35 },
      { label: "Outdoor worker density", value: wards[0]?.outdoorWorkers ?? 0, weight: 40 },
      { label: "Informal housing exposure", value: wards[0]?.informalHousing ?? 0, weight: 25 },
    ];
    return <section className="tab-screen"><div className="tab-screen-heading"><div className="tab-screen-icon"><Users size={22} /></div><div><p className="eyebrow compact">OPERATIONS MODULE</p><h2>Population vulnerability</h2><p>Review demographic factors used in the mortality risk score.</p></div></div><div className="tab-screen-list">{rows.map((row, index) => <div className="population-row" key={row.label}><button onClick={() => setExpandedRow(expandedRow === index ? null : index)}><span>{String(index + 1).padStart(2, "0")}</span><p>{row.label} · Weighted</p><ChevronRight size={16} /></button>{expandedRow === index && <small>{row.value}% ward exposure × {row.weight}% score weight = {(row.value * row.weight / 100).toFixed(2)} weighted points.</small>}</div>)}</div></section>;
  }
  return <section className="tab-screen"><div className="tab-screen-heading"><div className="tab-screen-icon"><Icon size={22} /></div><div><p className="eyebrow compact">OPERATIONS MODULE</p><h2>{detail.title}</h2><p>{detail.description}</p></div></div><div className="tab-screen-list">{detail.rows.map((row, index) => <div key={row}><span>{String(index + 1).padStart(2, "0")}</span><p>{row}</p><ChevronRight size={16} /></div>)}</div></section>;
}

function HealthReportsScreen({ wards, reports, onSubmit }: { wards: Ward[]; reports: HeatCaseReport[]; onSubmit: (report: Omit<HeatCaseReport, "timestamp">) => Promise<void> }) {
  const [ward, setWard] = useState(wards[0]?.code ?? "")
  const [severity, setSeverity] = useState<ReportSeverity>("moderate")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const submit = async () => {
    setBusy(true); setMessage("")
    try { await onSubmit({ ward, severity, notes, source: "hospital" }); setNotes(""); setMessage("Heat-health case saved successfully.") } catch (error) { setMessage(healthCaseError(error)) } finally { setBusy(false) }
  }
  return <section className="health-reports-screen"><div className="report-form panel"><div className="tab-screen-heading"><div className="tab-screen-icon"><Hospital size={22} /></div><div><p className="eyebrow compact">HOSPITAL FEEDBACK LOOP</p><h2>Report heat-health case</h2><p>Submit verified hospital observations to improve ward-level response.</p></div></div><label htmlFor="report-ward">Ward</label><select className="role-select" id="report-ward" value={ward} onChange={event => setWard(event.target.value)}>{wards.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select><label htmlFor="report-severity">Severity</label><select className="role-select" id="report-severity" value={severity} onChange={event => setSeverity(event.target.value as ReportSeverity)}><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select><label htmlFor="report-notes">Notes <span>(optional)</span></label><textarea className="report-notes" id="report-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add clinical or exposure context" rows={4} /><button className="signup-button report-submit" disabled={busy} onClick={submit}><Hospital size={16} /> {busy ? "Saving..." : "Submit hospital report"}</button>{message && <p className={message.includes("successfully") ? "report-success" : "auth-error"} role="status">{message}</p>}</div><div className="report-comparison panel"><p className="eyebrow compact">CLOSED-LOOP MONITOR</p><h2>Predicted vs reported</h2><p className="comparison-copy">Live WBGT tier compared with reports received in the last 24 hours.</p>{wards.map(item => { const risk = item.weather ? calculateRisk(item, item.weather.current) : null; const count = reports.filter(report => report.ward === item.code && Date.now() - new Date(report.timestamp).getTime() < 86400000).length; return <div className="comparison-row" key={item.code}><div><strong>{item.name}</strong><span>{item.code} · predicted <b className={`comparison-risk ${risk?.riskLevel.toLowerCase() ?? ""}`}>{risk?.riskLevel ?? "Loading"}</b></span></div><strong>{count}<small> reports</small></strong></div> })}</div></section>;
}

function CitizenHomeScreen({ ward, risk, forecast, location, onLocationSelect, onAlerts, locationPromptVisible, locationMessage, onAllowLocation, onUseWard, onNearby }: { ward: Ward; risk: ReturnType<typeof calculateRisk> | null; forecast: NonNullable<Ward["weather"]>["forecast"]; location: SelectedLocation; onLocationSelect: (location: SelectedLocation) => void; onAlerts: () => void; locationPromptVisible: boolean; locationMessage: string; onAllowLocation: () => void; onUseWard: () => void; onNearby: () => void }) {
  const advisory = risk?.riskLevel === "Extreme" ? "Avoid outdoor activity now. Move to a cooling center and drink water or ORS." : risk?.riskLevel === "High" ? "Avoid strenuous outdoor work from 12:00 to 16:00 and stay hydrated." : "Stay hydrated and take breaks in shade during the warmest hours.";
  return <section className="citizen-home-screen"><LocationPicker location={location} onSelect={onLocationSelect} /><div className="citizen-hero panel"><div><p className="eyebrow compact">YOUR LOCAL SAFETY VIEW</p><h2>{ward.name}</h2><p>Live heat-health guidance for your nearest ward in {location.name}.</p></div><span className={`risk-tag ${risk?.riskLevel.toLowerCase() ?? "neutral"}`}>{risk?.riskLevel.toUpperCase() ?? "LOADING"}</span></div>{locationPromptVisible && <div className="location-prompt"><div><MapPinned size={19} /><p><strong>Precise location permission</strong><span>Thermal Kavach needs your location to show accurate heat risk and nearby cooling centers.</span></p></div><div><button className="prompt-secondary" onClick={onUseWard}>Use ward selection</button><button className="signup-button" onClick={onAllowLocation}>Use my location</button></div></div>}{locationMessage && <p className="location-message">{locationMessage}</p>}<div className="citizen-risk-grid"><div className="panel citizen-risk-card"><p className="eyebrow compact">HEAT STRESS INDEX ENGINE</p><div className="citizen-score">{risk?.wbgt ?? "--"}<small>°C WBGT</small></div><p>Computed from live temperature, humidity, wind speed, and solar radiation.</p><div className="citizen-risk-detail"><span>Risk score <b>{risk?.riskScore ?? "--"}/100</b></span><span>Category <b>{risk?.riskLevel ?? "Loading"}</b></span></div><button className="signup-button" onClick={onNearby}><MapPinned size={16} /> Find nearby help</button></div><div className="panel citizen-forecast-card"><p className="eyebrow compact">3-5 DAY FORECAST</p><div className="citizen-chart">{forecast.map(day => <div key={day.date}><i style={{ height: `${Math.min(100, day.riskScore)}%` }} /><span>{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}</span><b>{day.temperature}°</b></div>)}</div></div></div><div className="panel citizen-advisory"><div><p className="eyebrow compact">ALERT / ADVISORY</p><h3>{risk?.riskLevel ?? "Current"} heat guidance</h3><p>{advisory}</p></div><BellRing size={22} /></div></section>;
  return <section className="citizen-home-screen"><LocationPicker location={location} onSelect={onLocationSelect} /><div className="citizen-hero panel"><div><p className="eyebrow compact">YOUR LOCAL SAFETY VIEW</p><h2>{ward.name}</h2><p>Live heat-health guidance for your nearest ward in {location.name}.</p></div><div className="citizen-hero-actions"><span className={`risk-tag ${risk?.riskLevel.toLowerCase() ?? "neutral"}`}>{risk?.riskLevel.toUpperCase() ?? "LOADING"}</span><button className="signup-button" onClick={onAlerts}><BellRing size={15} /> Sign up for alerts</button></div></div>{locationPromptVisible && <div className="location-prompt"><div><MapPinned size={19} /><p><strong>Precise location permission</strong><span>Thermal Kavach needs your location to show accurate heat risk and nearby cooling centers.</span></p></div><div><button className="prompt-secondary" onClick={onUseWard}>Choose a location manually</button><button className="signup-button" onClick={onAllowLocation}>Use my location</button></div></div>}{locationMessage && <p className="location-message">{locationMessage}</p>}<div className="citizen-risk-grid"><div className="panel citizen-risk-card"><p className="eyebrow compact">HEAT STRESS INDEX ENGINE</p><div className="citizen-score">{risk?.wbgt ?? "--"}<small>°C WBGT</small></div><p>Computed from live temperature, humidity, wind speed, and solar radiation.</p><div className="citizen-risk-detail"><span>Risk score <b>{risk?.riskScore ?? "--"}/100</b></span><span>Category <b>{risk?.riskLevel ?? "Loading"}</b></span></div><button className="signup-button" onClick={onNearby}><MapPinned size={16} /> Find nearby help</button></div><div className="panel citizen-forecast-card"><p className="eyebrow compact">3-5 DAY FORECAST</p><div className="citizen-chart">{forecast.map(day => <div key={day.date}><i style={{ height: `${Math.min(100, day.riskScore)}%` }} /><span>{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}</span><b>{day.temperature}°</b></div>)}</div></div></div><div className="panel citizen-advisory"><div><p className="eyebrow compact">ALERT / ADVISORY</p><h3>{risk?.riskLevel ?? "Current"} heat guidance</h3><p>{advisory}</p></div><BellRing size={22} /></div></section>;
}

function CitizenResourcesScreen({ ward, location, onEmergency }: { ward: Ward; location: { latitude: number; longitude: number } | null; onEmergency: (resource: Resource | null, location: { latitude: number; longitude: number }, contact: string) => void }) {
  const currentLocation = location ?? { latitude: ward.latitude, longitude: ward.longitude };
  const [resources, setResources] = useState<Resource[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [emergencyResource, setEmergencyResource] = useState<Resource | null>(null); const [contact, setContact] = useState("");
  useEffect(() => { let cancelled = false; const load = async () => { setLoading(true); setError(""); const coolingPromise = loadCoolingCenters().catch(() => []); const hospitalPromise = loadNearbyHospitalsWithStatus(currentLocation); const [cooling, hospitals] = await Promise.all([coolingPromise, hospitalPromise]); if (!cancelled) { setResources([...cooling, ...hospitals.resources].sort((a, b) => distanceKm(currentLocation, a) - distanceKm(currentLocation, b))); if (hospitals.fromCache) setError("Couldn&apos;t reach hospital data right now, showing last known results."); else if (!hospitals.resources.length) setError("Couldn&apos;t reach hospital data right now. Cooling centers remain available."); } if (!cancelled) setLoading(false); }; void load(); return () => { cancelled = true; }; }, [currentLocation.latitude, currentLocation.longitude, ward.code]);
  const triggerEmergency = () => { const cooling = resources.filter(resource => resource.services.includes("cooling")).sort((a, b) => distanceKm(currentLocation, a) - distanceKm(currentLocation, b))[0]; const hospital = resources.filter(resource => resource.services.includes("hospital")).sort((a, b) => distanceKm(currentLocation, a) - distanceKm(currentLocation, b))[0]; const resource = cooling ?? hospital; if (resource) { setEmergencyResource(resource); onEmergency(resource, currentLocation, contact); } };
  return <section className="resources-screen"><div className="resource-header"><div><p className="eyebrow compact">NEARBY RESOURCES</p><h2>Help around {ward.name}</h2><p>Cooling centers and hospitals ranked by distance from your location.</p></div><button className="emergency-button" onClick={triggerEmergency}><Siren size={17} /> I&apos;m not feeling well</button></div><div className="emergency-contact"><label htmlFor="emergency-contact">Emergency contact for SMS (optional)</label><input id="emergency-contact" className="auth-input" value={contact} onChange={event => setContact(event.target.value)} placeholder="+91 98765 43210" inputMode="tel" /></div>{emergencyResource && <div className="emergency-result"><strong>Go now: {emergencyResource.name}</strong><span>{distanceKm(currentLocation, emergencyResource).toFixed(1)} km away · {emergencyResource.type === "cooling" ? "Cooling center" : "Hospital"}</span><a href={directionsUrl(emergencyResource)} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a></div>}{error && <div className="weather-status error"><CircleAlert size={16} /> {error}</div>}{loading ? <div className="resource-loading">Finding nearby resources...</div> : <div className="resource-list">{resources.map(resource => { const destination = directionsUrl(resource); const distance = distanceKm(currentLocation, resource); const bearing = bearingDegrees(currentLocation, resource); return <a className="resource-item" href={destination} target="_blank" rel="noreferrer" key={resource.id} aria-label={`Navigate to ${resource.name}`}><div className={`resource-icon ${resource.type}`}><MapPinned size={17} /></div><div><strong>{resource.name}</strong><span>{resource.address || (resource.type === "cooling" ? "Government cooling center" : "OpenStreetMap hospital")}</span></div><div className="resource-navigation"><span><i style={{ transform: `rotate(${bearing}deg)` }} aria-hidden="true"><Navigation size={15} /></i>{distance.toFixed(1)} km</span><b>Navigate</b></div></a>})}</div>}</section>;
}

function ActionCentreScreen({ events, wards, onRun }: { events: ActionEvent[]; wards: Ward[]; onRun: () => Promise<void> }) {
  const actionableWards = wards.filter(ward => ward.weather && ["High", "Extreme"].includes(calculateRisk(ward, ward.weather.current).riskLevel));
  const triggeredEvents = events.filter(event => event.status === "triggered");
  return <section className="action-centre-screen"><div className="resource-header"><div><p className="eyebrow compact">AUTOMATED RESPONSE</p><h2>Action centre</h2><p>Auditable actions triggered from live ward risk thresholds.</p></div><button className="signup-button" onClick={() => void onRun()}><Zap size={16} /> Evaluate live risks</button></div><div className="action-summary"><div><strong>{actionableWards.length}</strong><span>{actionableWards.length ? "Wards triggering action" : "Wards above threshold right now"}</span></div><div><strong>{triggeredEvents.length}</strong><span>Triggered actions in audit</span></div><div><strong>{events.length ? "Live" : "Ready"}</strong><span>Server audit state</span></div></div><div className="action-feed panel"><p className="eyebrow compact">AUDIT LOG</p>{events.length ? events.slice(0, 12).map(event => <div className="action-feed-row" key={`${event.type}-${event.ward}-${event.timestamp}`}><span className={`action-type ${event.type}`}><Zap size={14} /></span><div><strong>{event.message}</strong><span>{event.ward} · {new Date(event.timestamp).toLocaleString("en-IN")}</span></div><b>{event.status}</b></div>) : <p className="empty-feed">No wards above threshold right now. Live risk evaluation is complete.</p>}</div></section>;
}

function AlertChannelsScreen({ onTest }: { onTest: (channel: "sms" | "whatsapp") => Promise<void> }) {
  const [message, setMessage] = useState("");
  const test = async (channel: "sms" | "whatsapp") => { try { await onTest(channel); setMessage(`${channel.toUpperCase()} test queued. Add the server provider credentials to deliver it.`); } catch (error) { setMessage(actionError(error)); } };
  return <section className="channels-screen"><div className="resource-header"><div><p className="eyebrow compact">PUBLIC NOTIFICATION NETWORK</p><h2>Alert channels</h2><p>Provider credentials stay server-side. Dispatches are logged for audit.</p></div><MessageSquareText size={25} className="zap-icon" /></div><div className="channel-grid"><div className="panel channel-card"><Smartphone size={23} /><h3>SMS regional alerts</h3><p>Send ward-level warnings to registered contacts.</p><button className="signup-button" onClick={() => test("sms")}>Queue test SMS</button></div><div className="panel channel-card"><MessageSquareText size={23} /><h3>WhatsApp alerts</h3><p>Use approved regional templates for public advisories.</p><button className="signup-button" onClick={() => test("whatsapp")}>Queue test WhatsApp</button></div></div>{message && <p className="report-success">{message}</p>}</section>;
}

function App() {
  useEffect(() => {
    const applyNativeUI = async () => {
      if (!(window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: "#0e4545" });
    };
    void applyNativeUI();
  }, []);

  const defaultLocation: SelectedLocation = { name: "Dehgam, Gandhinagar, Gujarat", latitude: 23.2512, longitude: 72.6578 };
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authScreen, setAuthScreen] = useState<"login" | "signup">("login");
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [activeWard, setActiveWard] = useState<Ward>(dehgamWards[0]);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation>(() => { try { return JSON.parse(localStorage.getItem("thermal-kavach-selected-location") ?? "null") ?? defaultLocation; } catch { return defaultLocation; } });
  const [selectedWards, setSelectedWards] = useState<Ward[]>(() => selectedLocation.name.startsWith("Dehgam") ? dehgamWards : generateWardsAround(selectedLocation));
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [showSignup, setShowSignup] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSession, setOtpSession] = useState<PhoneOtpSession | null>(null);
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [role, setRole] = useState<"citizen" | "government">("citizen");
  const [dashboardRole, setDashboardRole] = useState<"citizen" | "government">(
    "government",
  );
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");
  const [emailMode, setEmailMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entryMethod, setEntryMethod] = useState<"email" | "phone">("email");
  const [entryRole, setEntryRole] = useState<"citizen" | "government">("citizen");
  const [entryPhone, setEntryPhone] = useState("");
  const [entryOtp, setEntryOtp] = useState("");
  const [entryOtpSent, setEntryOtpSent] = useState(false);
  const [entryEmail, setEntryEmail] = useState("");
  const [entryPassword, setEntryPassword] = useState("");
  const [entryConfirmPassword, setEntryConfirmPassword] = useState("");
  const [entryName, setEntryName] = useState("");
  const [entryError, setEntryError] = useState("");
  const [entryOtpSession, setEntryOtpSession] = useState<PhoneOtpSession | null>(null);
  const [entryNotice, setEntryNotice] = useState("");
  const [healthReports, setHealthReports] = useState<HeatCaseReport[]>([]);
  const [healthReportsLoading, setHealthReportsLoading] = useState(false);
  const [healthReportError, setHealthReportError] = useState("");
  const [actionEvents, setActionEvents] = useState<ActionEvent[]>([]);
  const [boundary, setBoundary] = useState<WardBoundary | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => {
    if (!resendSeconds) return;
    const timer = window.setInterval(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);
  const selectedRisk = useMemo(
    () => activeWard.weather ? calculateRisk(activeWard, activeWard.weather.current) : null,
    [activeWard],
  );
  const currentForecast = activeWard.weather?.forecast ?? [];
  const vulnerabilityDrivers = [
    { label: "outdoor worker density", value: activeWard.outdoorWorkers, weight: 0.4 },
    { label: "elderly resident density", value: activeWard.elderly, weight: 0.35 },
    { label: "informal housing exposure", value: activeWard.informalHousing, weight: 0.25 },
  ].sort((first, second) => second.weight - first.weight);
  const nextRiskTier = selectedRisk?.riskLevel === "Low" ? "Moderate" : selectedRisk?.riskLevel === "Moderate" ? "High" : selectedRisk?.riskLevel === "High" ? "Extreme" : null;
  const nextRiskThreshold = nextRiskTier === "Moderate" ? 35 : nextRiskTier === "High" ? 60 : nextRiskTier === "Extreme" ? 80 : null;
  const nextRiskDay = nextRiskThreshold === null ? -1 : currentForecast.findIndex((day, index) => index > 0 && day.riskScore >= nextRiskThreshold);
  const hoursUntilNextRisk = nextRiskDay > 0 ? nextRiskDay * 24 : null;
  const liveWards = weatherSnapshot?.wards ?? selectedWards;
  const highRiskCount = liveWards.filter(ward => ward.weather && calculateRisk(ward, ward.weather.current).riskLevel === "High" || ward.weather && calculateRisk(ward, ward.weather.current).riskLevel === "Extreme").length;
  const cityWbgt = liveWards.length && liveWards.every(ward => ward.weather)
    ? liveWards.reduce((sum, ward) => sum + (ward.weather?.current.wbgt ?? 0), 0) / liveWards.length
    : null;
  const cityRisk = liveWards.length && liveWards.every(ward => ward.weather)
    ? Math.round(liveWards.reduce((sum, ward) => sum + (ward.weather ? calculateRisk(ward, ward.weather.current).riskScore : 0), 0) / liveWards.length)
    : null;
  const cityRiskLevel = cityWbgt === null ? "LOADING" : `${wbgtRiskLevel(cityWbgt).toUpperCase()} STRESS`;
  const recentReportCount = healthReports.filter(report => Date.now() - new Date(report.timestamp).getTime() < 86400000).length;
  const displayName = auth?.currentUser?.displayName || auth?.currentUser?.email?.split("@")[0] || (dashboardRole === "government" ? "Admin" : "Citizen");
  const timeOfDay = new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening";
  const requestCitizenLocation = async () => {
    setLocationMessage("Requesting precise location...");
    try {
      const location = await requestPreciseLocation();
      setUserLocation(location);
      const nearest = findNearestWard(location.latitude, location.longitude, liveWards);
      setActiveWard(nearest);
      const selected = { name: nearest.name, latitude: location.latitude, longitude: location.longitude };
      setSelectedLocation(selected);
      localStorage.setItem("thermal-kavach-selected-location", JSON.stringify(selected));
      setLocationMessage(`Location matched to ${nearest.name}`);
      setLocationPromptVisible(false);
    } catch (error) {
      setLocationMessage(error instanceof Error && error.message === "LOCATION_DENIED" ? "Location permission was denied. Select your ward manually." : "Location is unavailable. Select your ward manually.");
    }
  };
  const handleLocationSelect = (location: SelectedLocation) => {
    setSelectedLocation(location);
    localStorage.setItem("thermal-kavach-selected-location", JSON.stringify(location));
    const wards = location.name.startsWith("Dehgam") ? dehgamWards : generateWardsAround(location);
    setSelectedWards(wards);
    setWeatherSnapshot(null);
    setActiveWard(wards[0]);
    setLocationMessage(`Location selected: ${location.name.split(",")[0]}`);
  };
  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setIsAuthenticated(false);
    setDashboardRole("government");
    setActiveTab("Overview");
    setLocationPromptVisible(false);
    setUserLocation(null);
  };
  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      setWeatherLoading(true);
      try {
        const snapshot = await fetchWeatherSnapshot(selectedWards);
        if (cancelled) return;
        setWeatherSnapshot(snapshot);
        setActiveWard(current => snapshot.wards.find(ward => ward.code === current.code) ?? snapshot.wards[0]);
        setWeatherError(snapshot.fromCache ? "Forecast unavailable, showing last cached data." : "");
      } catch {
        if (!cancelled) setWeatherError("Forecast unavailable and no cached data is available yet.");
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };
    void loadWeather();
    const timer = window.setInterval(loadWeather, 2 * 60 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedWards]);
  const refreshHealthReports = async () => {
    setHealthReportsLoading(true);
    try { const result = await loadHeatCaseReports(); setHealthReports(result.reports); setHealthReportError(""); } catch (error) { setHealthReportError(healthCaseError(error)); } finally { setHealthReportsLoading(false); }
  };
  useEffect(() => {
    if (!isAuthenticated || dashboardRole !== "government") return;
    setHealthReportsLoading(true);
    const unsubscribe = subscribeHeatCaseReports((reports) => {
      setHealthReports(reports)
      setHealthReportError("")
      setHealthReportsLoading(false)
    }, error => { setHealthReportError(healthCaseError(error)); setHealthReportsLoading(false); })
    return unsubscribe
  }, [isAuthenticated, dashboardRole])
  useEffect(() => { if (isAuthenticated && dashboardRole === "government") void loadActionEvents().then(setActionEvents); }, [isAuthenticated, dashboardRole]);
  useEffect(() => {
    if (!isAuthenticated || dashboardRole !== "government" || !weatherSnapshot) return;
    void triggerWardActions(weatherSnapshot.wards, healthReports, actionEvents).then(created => setActionEvents(current => {
      const known = new Set(current.map(event => `${event.type}-${event.ward}-${event.message}`));
      return [...created.filter(event => !known.has(`${event.type}-${event.ward}-${event.message}`)), ...current];
    }));
  }, [isAuthenticated, dashboardRole, weatherSnapshot, healthReports]);
  useEffect(() => { if (isAuthenticated) void loadDehgamBoundary().then(setBoundary); }, [isAuthenticated]);

  const enterDashboard = (selectedRole: "citizen" | "government") => {
    setDashboardRole(selectedRole);
    setActiveTab(selectedRole === "government" ? "Overview" : "Citizen home");
    setIsAuthenticated(true);
    if (selectedRole === "citizen") setLocationPromptVisible(true);
  };

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) return;
    return onAuthStateChanged(firebaseAuth, async user => {
      if (!user || authScreen === "signup") return;
      await user.reload();
      if (!user.emailVerified) {
        setEntryError("Please verify your email before continuing. Check your inbox for the verification link.");
        await signOut(firebaseAuth);
        return;
      }
      try {
        const selectedRole = await getUserRole(user.uid);
        enterDashboard(selectedRole);
      } catch (error) {
        setEntryError(firebaseAuthMessage(error));
        await signOut(firebaseAuth);
      }
    });
  }, [authScreen]);

  const handleEntryLogin = async () => {
    setEntryError("");
    setEntryNotice("");
    if (!auth) { setEntryError("Firebase authentication is not configured. Add your Firebase values to Thermal-kavach-main/.env.local and restart the frontend."); return; }
    if (!entryEmail.includes("@") || entryPassword.length < 6 || (authScreen === "signup" && (!entryName.trim() || !entryConfirmPassword || entryPassword !== entryConfirmPassword))) { setEntryError(authScreen === "signup" && entryPassword !== entryConfirmPassword ? "Passwords do not match." : "Enter your name, email, and a password of at least 6 characters."); return; }
    try {
      const credential = authScreen === "signup" ? await createUserWithEmailAndPassword(auth, entryEmail.trim(), entryPassword) : await signInWithEmailAndPassword(auth, entryEmail.trim(), entryPassword);
      if (authScreen === "signup") {
        await updateProfile(credential.user, { displayName: entryName.trim() });
        console.info("[Thermal Kavach auth] account creation succeeded", { email: entryEmail.trim() });
        try {
          await sendEmailVerification(credential.user);
        } catch (error) {
          logAuthFailure("verification email request failed", error);
          throw error;
        }
        console.info("[Thermal Kavach auth] verification email request succeeded", { email: entryEmail.trim() });
        setEntryConfirmPassword("");
        setAuthScreen("login");
        setEntryNotice(`Verification email sent to ${entryEmail.trim()}. Please check your inbox.`);
        try {
          await saveUserProfile(credential.user, { name: entryName.trim(), email: entryEmail.trim(), role: entryRole, ward: selectedLocation.name });
        } catch (error) {
          logAuthFailure("profile persistence after signup failed", error);
          setEntryError("Verification email was sent, but your profile could not be saved. Please try again or contact support.");
        }
        await signOut(auth);
        return;
      }
      await credential.user.reload();
      if (!credential.user.emailVerified) {
        await signOut(auth);
        setEntryError("Please verify your email before continuing. Check your inbox for the verification link.");
        return;
      }
      enterDashboard(await getUserRole(credential.user.uid));
    } catch (error) {
      logAuthFailure(authScreen === "signup" ? "signup failed" : "login failed", error);
      if (authScreen === "signup" && typeof error === "object" && error && "code" in error && String(error.code) === "auth/email-already-in-use") {
        setAuthScreen("login");
        setEntryNotice("This email is already registered. Enter your password and use Resend verification email if needed.");
      } else {
        setEntryError(firebaseAuthMessage(error));
      }
    }
  };

  const handleResendVerification = async () => {
    setEntryError("");
    setEntryNotice("");
    if (!auth) { setEntryError("Firebase authentication is not configured. Add your Firebase values to Thermal-kavach-main/.env.local and restart the frontend."); return; }
    if (!entryEmail.includes("@") || entryPassword.length < 6) { setEntryError("Enter the email and password for your existing account first."); return; }
    try {
      const credential = await signInWithEmailAndPassword(auth, entryEmail.trim(), entryPassword);
      await credential.user.reload();
      if (credential.user.emailVerified) {
        await signOut(auth);
        setEntryNotice("This email is already verified. Log in to continue.");
        return;
      }
      try {
        await sendEmailVerification(credential.user);
      } catch (error) {
        logAuthFailure("verification email request failed during resend", error);
        throw error;
      }
      console.info("[Thermal Kavach auth] verification email resend succeeded", { email: entryEmail.trim() });
      await signOut(auth);
      setEntryNotice(`Verification email sent to ${entryEmail.trim()}. Please check your inbox.`);
    } catch (error) {
      logAuthFailure("verification email resend failed", error);
      setEntryError(firebaseAuthMessage(error));
      if (auth.currentUser) await signOut(auth);
    }
  };

  const handleEntryOtp = async () => {
    setEntryError("");
    const digits = entryPhone.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) { setEntryError("Enter a valid 10-digit Indian mobile number."); return; }
    try {
      if (!entryOtpSent) { setEntryOtpSession(await sendPhoneOtp(`+91${digits}`, "entry-recaptcha-container")); setEntryOtpSent(true); return; }
      if (!entryOtpSession || entryOtp.trim().length !== 6) { setEntryError("Enter the 6-digit OTP sent to your phone."); return; }
      await verifyPhoneOtp(entryOtpSession, entryOtp.trim());
      if (authScreen === "signup") { if (!entryName.trim()) { setEntryError("Enter your full name."); return; } const user = auth?.currentUser; if (!user) throw new Error("Authentication session was not created."); await saveUserProfile(user, { name: entryName.trim(), phone: `+91${digits}`, role: entryRole, ward: selectedLocation.name }); }
      enterDashboard(entryRole);
    } catch (error) { setEntryError(firebaseAuthMessage(error)); }
  };

  if (!isAuthenticated) {
    return <LoginScreen authScreen={authScreen} setAuthScreen={setAuthScreen} entryMethod={entryMethod} setEntryMethod={setEntryMethod} entryRole={entryRole} setEntryRole={setEntryRole} entryEmail={entryEmail} setEntryEmail={setEntryEmail} entryName={entryName} setEntryName={setEntryName} entryPassword={entryPassword} setEntryPassword={setEntryPassword} entryConfirmPassword={entryConfirmPassword} setEntryConfirmPassword={setEntryConfirmPassword} entryPhone={entryPhone} setEntryPhone={setEntryPhone} entryOtp={entryOtp} setEntryOtp={setEntryOtp} entryOtpSent={entryOtpSent} entryError={entryError} entryNotice={entryNotice} onEmailLogin={() => void handleEntryLogin()} onResendVerification={() => void handleResendVerification()} onPhoneLogin={() => void handleEntryOtp()} />;
  }
  const authMessage = (error: unknown) => {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code.includes("invalid-phone-number"))
      return "Enter a valid Indian mobile number.";
    if (code.includes("too-many-requests"))
      return "Too many attempts. Please wait and try again later.";
    if (code.includes("invalid-verification-code"))
      return "That OTP is incorrect. Check the message and try again.";
    if (code.includes("code-expired") || code.includes("session-expired"))
      return "This OTP has expired. Request a new code.";
    if (error instanceof Error && error.message === "OTP_SENT_TIMEOUT")
      return "The phone verification service did not respond. Try again.";
    return error instanceof Error
      ? error.message
      : "Authentication failed. Please try again.";
  };

  const closeSignup = () => {
    setShowSignup(false);
    setOtpSent(false);
    setOtpSession(null);
    setOtp("");
    setAuthError("");
    setResendSeconds(0);
  };

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setAuthError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const session = await sendPhoneOtp(`+91${digits}`, "recaptcha-container");
      setOtpSession(session);
      setOtpSent(true);
      setResendSeconds(30);
    } catch (error) {
      setAuthError(authMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpSession || otp.trim().length !== 6) {
      setAuthError("Enter the 6-digit OTP sent to your phone.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await verifyPhoneOtp(otpSession, otp.trim());
      setDashboardRole(role);
      setActiveTab(role === "government" ? "Overview" : "Citizen home");
      closeSignup();
    } catch (error) {
      setAuthError(authMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!auth || !email.includes("@") || password.length < 6) {
      setAuthError(
        "Enter a valid email and a password of at least 6 characters.",
      );
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      if (emailMode === "signup") {

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        await sendEmailVerification(userCredential.user);

      } else {

        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      }
      if (emailMode === "signup") {
        await signOut(auth);
        closeSignup();
        setAuthScreen("login");
        setEntryEmail(email);
        setEntryPassword(password);
        setEntryNotice("Account created. You can now log in.");
        setIsAuthenticated(false);
        return;
      }
      setDashboardRole(role);
      setActiveTab(role === "government" ? "Overview" : "Citizen home");
      closeSignup();
    } catch (error) {
      setAuthError(authMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };
  const handleHealthReportSubmit = async (report: Omit<HeatCaseReport, "timestamp">) => {
    await submitHeatCaseReport(report);
    await refreshHealthReports();
  };
  const handleEmergency = async (resource: Resource | null, location: { latitude: number; longitude: number }, contact: string) => {
    try {
      const risk = selectedRisk?.riskLevel
      const severity: ReportSeverity = risk === "Extreme" || risk === "High" ? "severe" : risk === "Moderate" ? "moderate" : "mild"
      const resourceName = resource?.name ?? "No nearby resource was found"
      await submitHeatCaseReport({ ward: activeWard.code, severity, source: "citizen_self_report", notes: `Citizen SOS near ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}. Nearest resource: ${resourceName}.` })
      if (resource) await logEmergencyEvent(location, activeWard, resource)
      if (contact) await sendEmergencySms(contact, `Thermal Kavach emergency: help is needed near ${activeWard.name}. Nearest resource: ${resourceName}.`)
      setLocationMessage("Your SOS report was sent to the ward health dashboard.")
    } catch (error) { setLocationMessage(healthCaseError(error)); }
  };
  const runRiskActions = async () => { const created = await triggerWardActions(liveWards, healthReports, actionEvents); setActionEvents(current => [...created, ...current]); };
  const testAlertChannel = async (channel: "sms" | "whatsapp") => { const event = await recordActionEvent({ type: channel, ward: activeWard.code, status: "pending", message: `${channel.toUpperCase()} regional alert queued for ${activeWard.name}.` }); setActionEvents(current => [event, ...current]); };
  const navItems = dashboardRole === "citizen" ? [
    { label: "Citizen home", icon: Activity },
    { label: "Nearby resources", icon: MapPinned },
  ] : [
    { label: "Overview", icon: Activity },
    { label: "Ward map", icon: MapPinned },
    { label: "Health reports", icon: Hospital },
    { label: "Action centre", icon: Siren },
  ];
  const advisory =
    selectedRisk?.riskLevel === "Extreme"
      ? "Suspend outdoor work from 11:00 to 16:00. Activate cooling centres and ORS points immediately."
      : "Avoid strenuous outdoor activity between 12:00 and 16:00. Keep water and ORS accessible.";

  return (
    <div className="app-shell">
      <aside className={mobileNav ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <ShieldCheck size={25} />
          </div>
          <div>
            <strong>Thermal Kavach</strong>
            <span>Heat health intelligence</span>
          </div>
          <button
            className="icon-button close-nav"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="authority">
          <span className="india-dot" /> Government operations console
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Command centre</p>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={activeTab === label ? "nav-item active" : "nav-item"}
              onClick={() => {
                setActiveTab(label);
                setMobileNav(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Action centre" && <b className="nav-count">{actionEvents.filter(event => event.status === "triggered").length}</b>}
            </button>
          ))}
          {dashboardRole === "government" && <p className="nav-label secondary-label">System</p>}
          {dashboardRole === "government" && <>
          <button className={activeTab === "Alert channels" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("Alert channels"); setMobileNav(false); }}>
            <MessageSquareText size={19} />
            <span>Alert channels</span>
          </button>
          <button className={activeTab === "Population layers" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("Population layers"); setMobileNav(false); }}>
            <Users size={19} />
            <span>Population layers</span>
          </button>
          </>}
        </nav>
        <div className="sidebar-footer">
          <div className="status-dot" />
          <div>
            <strong>Data systems online</strong>
            <span>Last sync 08:42 IST</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>
              {dashboardRole === "citizen" ? "Citizen safety" : "Operations"}
            </span>
            <ChevronRight size={14} />
            <strong>{activeTab}</strong>
          </div>
          <div className="top-actions">
            <span className="live-pill">
              <span /> Live monitoring
            </span>
            <button className="notification-button" aria-label="Notifications">
              <BellRing size={19} />
              <i>3</i>
            </button>
            <button
              className="profile-chip"
              onClick={() => setShowSignup(true)}
            >
              <span>AK</span>
              <b>
                {dashboardRole === "citizen" ? "Citizen account" : "Admin desk"}
              </b>
              <ChevronRight size={15} />
            </button>
            <button className="logout-button" onClick={() => void handleLogout()}>
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </header>
        <div className={`page-content ${activeTab !== "Overview" && activeTab !== "Citizen home" ? "tab-view" : ""} ${dashboardRole === "citizen" ? "citizen-view" : ""}`}>
          {weatherLoading && !weatherSnapshot && (
            <div className="weather-status loading" role="status">
              <CloudSun size={16} /> Loading live Open-Meteo forecasts for Dehgam wards...
            </div>
          )}
          {weatherError && (
            <div className="weather-status error" role="status">
              <CircleAlert size={16} /> {weatherError}
            </div>
          )}
          {healthReportsLoading && <div className="weather-status loading" role="status"><Hospital size={16} /> Loading health reports...</div>}
          {healthReportError && <div className="weather-status error" role="alert"><Hospital size={16} /> {healthReportError}</div>}
          {dashboardRole === "citizen" && activeTab === "Citizen home" && <CitizenHomeScreen ward={activeWard} risk={selectedRisk} forecast={currentForecast} location={selectedLocation} onLocationSelect={handleLocationSelect} onAlerts={() => setShowSignup(true)} locationPromptVisible={locationPromptVisible} locationMessage={locationMessage} onAllowLocation={requestCitizenLocation} onUseWard={() => setLocationPromptVisible(false)} onNearby={() => setActiveTab("Nearby resources")} />}
          {dashboardRole === "citizen" && activeTab === "Nearby resources" && <CitizenResourcesScreen ward={activeWard} location={userLocation} onEmergency={handleEmergency} />}
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-line" /> WARD-LEVEL HEAT HEALTH MONITOR
              </p>
              <h1>Good {timeOfDay}, {displayName}.</h1>
              <p className="heading-copy">
                A clear view of what today&apos;s heat will do across Dehgam, Gandhinagar.
              </p>
            </div>
          </section>
          {activeTab === "Health reports" && <HealthReportsScreen wards={liveWards} reports={healthReports} onSubmit={handleHealthReportSubmit} />}
          {activeTab === "Action centre" && <ActionCentreScreen events={actionEvents} wards={liveWards} onRun={runRiskActions} />}
          {activeTab === "Alert channels" && <AlertChannelsScreen onTest={testAlertChannel} />}
          {activeTab === "Ward map" && <LocationPicker location={selectedLocation} onSelect={handleLocationSelect} />}
          {activeTab === "Ward map" && <WardRiskMap wards={liveWards} selectedWard={activeWard} onSelect={setActiveWard} />}
          {activeTab === "Ward map" && <p className="gis-source-note">Ward boundary source: {boundary?.source === "overpass" ? "OpenStreetMap Overpass live boundary" : boundary ? "Generated centroid fallback" : "Loading boundary source"}.</p>}
          {dashboardRole === "government" && activeTab !== "Overview" && activeTab !== "Citizen home" && activeTab !== "Health reports" && activeTab !== "Action centre" && activeTab !== "Alert channels" && activeTab !== "Ward map" && <TabScreen tab={activeTab} wards={liveWards} />}
          <section className="alert-banner">
            <div className="alert-symbol">
              <CircleAlert size={21} />
            </div>
            <div>
              <strong>High heat stress expected today</strong>
              <p>
                {highRiskCount || "No"} wards require targeted intervention. Peak impact window is
                12:00–16:00 IST.
              </p>
            </div>
            <button>
              View response plan <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="metric-grid">
            <div className="metric-card featured">
              <div className="metric-head">
                <span>City WBGT index</span>
                <ThermometerSun size={18} />
              </div>
              <div className="metric-value">
                {cityWbgt === null ? "--" : cityWbgt.toFixed(1)}<span>°C</span>
              </div>
              <div className="metric-foot">
                <span className={`risk-tag ${cityRiskLevel.includes("EXTREME") || cityRiskLevel.includes("HIGH") ? "high" : cityRiskLevel.includes("MODERATE") ? "moderate" : "low"}`}>{cityRiskLevel}</span>
                <span>Live ward average</span>
              </div>
              <div className="sparkline">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-head">
                <span>Mortality risk index</span>
                <Activity size={18} />
              </div>
              <div className="metric-value orange">
                {cityRisk === null ? "--" : cityRisk}<span>/100</span>
              </div>
              <span className="demo-label">Synthetic - for demonstration</span>
              <div className="metric-foot">
                <span className={`risk-tag ${cityRiskLevel.includes("EXTREME") || cityRiskLevel.includes("HIGH") ? "high" : cityRiskLevel.includes("MODERATE") ? "moderate" : "low"}`}>{cityRiskLevel}</span>
                <span>Live vulnerability-weighted score</span>
              </div>
              <div className="progress-bar">
                <i style={{ width: `${cityRisk ?? 0}%` }} />
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-head">
                <span>Wards at high risk</span>
                <MapPinned size={18} />
              </div>
              <div className="metric-value">
                {weatherSnapshot ? highRiskCount : "--"}<span>/{liveWards.length}</span>
              </div>
              <div className="metric-foot">
                <span className="risk-tag moderate">MONITORING</span>
                <span>{highRiskCount} need action now</span>
              </div>
              <div className="ward-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-head">
                <span>Reported heat cases</span>
                <Hospital size={18} />
              </div>
              <div className="metric-value">{recentReportCount}</div>
              <div className="metric-foot">
                <span className="risk-tag neutral">HEALTH FEED</span>
              </div>
              <div className="case-line">
                <span>Last 24 hours</span>
                <b>{healthReports.length ? "Live" : "0"}</b>
                <i><em style={{ width: `${Math.min(100, recentReportCount * 10)}%` }} /></i>
              </div>
            </div>
          </section>
          <section className="dashboard-grid">
            <div className="panel ward-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow compact">SPATIAL RISK VIEW</p>
                  <h2>Ward risk map</h2>
                </div>
                <div className="map-controls">
                  <button className="control-active">Risk</button>
                  <button>Vulnerability</button>
                </div>
              </div>
              <div className="map-stage">
                <div className="map-grid-lines" />
                <div className="map-road road-one" />
                <div className="map-road road-two" />
                <div className="map-road road-three" />
                {liveWards.map((ward, index) => {
                  const risk = ward.weather
                    ? calculateRisk(ward, ward.weather.current)
                    : null;
                  return (
                    <button
                      key={ward.code}
                      className={`map-ward ward-${(index % 6) + 1} ${risk?.riskLevel.toLowerCase() ?? "loading"}`}
                      onClick={() => setActiveWard(ward)}
                    >
                      <span>{ward.code}</span>
                      <strong>{risk?.riskScore ?? "--"}</strong>
                    </button>
                  );
                })}
                <div className="map-label label-river">Nag River</div>
                <div className="map-legend">
                  <span>
                    <i className="low-dot" /> Low
                  </span>
                  <span>
                    <i className="moderate-dot" /> Moderate
                  </span>
                  <span>
                    <i className="high-dot" /> High
                  </span>
                  <span>
                    <i className="extreme-dot" /> Extreme
                  </span>
                </div>
              </div>
              <div className="map-footer">
                <span>
                  <MapPinned size={16} /> 24 wards monitored
                </span>
                <button onClick={() => setActiveTab("Ward map")}>
                  Open full map <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
            <div className="panel insight-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow compact">SELECTED WARD</p>
                  <h2>{activeWard.name}</h2>
                </div>
                <span
                  className={`risk-tag ${selectedRisk?.riskLevel.toLowerCase() ?? "neutral"}`}
                >
                  {selectedRisk?.riskLevel.toUpperCase() ?? "LOADING"}
                </span>
              </div>
              <div className="insight-score">
                <div
                  className="score-ring"
                  style={
                    {
                      "--score": `${(selectedRisk?.riskScore ?? 0) * 3.6}deg`,
                    } as React.CSSProperties
                  }
                >
                  <strong>{selectedRisk?.riskScore ?? "--"}</strong>
                  <span>risk score</span>
                </div>
                <div>
                  <p>WBGT stress index</p>
                  <b>{selectedRisk ? `${selectedRisk.wbgt}°C` : "--"}</b>
                  <small>Feels like {selectedRisk?.riskLevel.toLowerCase() ?? "unknown"} heat stress</small>
                  {hoursUntilNextRisk !== null && nextRiskTier && <span className="source-label">~{hoursUntilNextRisk} hours until {nextRiskTier} risk threshold</span>}
                </div>
              </div>
              <div className="weather-facts">
                <div>
                  <ThermometerSun size={16} />
                  <span>
                    Temperature<b>{activeWard.weather ? `${activeWard.weather.current.temperature}°C` : "--"}</b>
                  </span>
                </div>
                <div>
                  <Droplets size={16} />
                  <span>
                    Humidity<b>{activeWard.weather ? `${activeWard.weather.current.humidity}%` : "--"}</b>
                  </span>
                </div>
                <div>
                  <Wind size={16} />
                  <span>
                    Wind speed<b>{activeWard.weather ? `${activeWard.weather.current.wind} km/h` : "--"}</b>
                  </span>
                </div>
                <div>
                  <SunMedium size={16} />
                  <span>
                    Solar radiation<b>{activeWard.weather ? `${activeWard.weather.current.solar} W/m²` : "--"}</b>
                  </span>
                </div>
              </div>
              <div className="vulnerability">
                <div>
                  <span>Vulnerability profile</span>
                  <strong>
                    {selectedRisk?.riskLevel ?? "Loading"} risk category
                  </strong>
                </div>
                <div className="vulnerability-bar">
                  <i
                    style={{
                      width: `${selectedRisk?.riskScore ?? 0}%`,
                    }}
                  />
                </div>
                <p>
                  <Users size={14} /> {activeWard.elderly}% elderly
                  &nbsp;·&nbsp; {activeWard.outdoorWorkers}% outdoor workers
                </p>
                <span className="demo-label">Synthetic - for demonstration</span>
              </div>
              <div className="risk-explanation">
                <p className="eyebrow compact">WHY THIS WARD IS AT RISK</p>
                <h3>Why is this ward at risk?</h3>
                <p>
                  The current WBGT is {selectedRisk ? `${selectedRisk.wbgt}°C` : "not available yet"}.
                </p>
                {vulnerabilityDrivers.slice(0, 2).map((driver, index) => (
                  <p key={driver.label}>
                    <strong>{index === 0 ? "Primary driver" : "Secondary driver"}:</strong>{" "}
                    {driver.label} is {driver.value}% in this ward and is included in the risk score.
                  </p>
                ))}
              </div>
            </div>
          </section>
          <section className="bottom-grid">
            <div className="panel forecast-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow compact">FORECAST WINDOW</p>
                  <h2>Next 5 days</h2>
                  <span className="source-label">Approximate temperature uncertainty: ±2°C</span>
                </div>
                <span className="source-label">
                  <CloudSun size={15} /> Open-Meteo forecast
                </span>
              </div>
              <div className="forecast-list">
                {currentForecast.map(
                  ({ date, temperature, humidity, wind, riskLevel }, index) => (
                    <div
                      className={
                        index === 0 ? "forecast-day today" : "forecast-day"
                      }
                      key={date}
                    >
                      <span className="forecast-day-name">
                        {index === 0 ? "Today" : new Date(date).toLocaleDateString("en-IN", { weekday: "short" })}
                        <small>{date}</small>
                      </span>
                      <SunMedium size={21} className="forecast-icon" />
                      <strong>{temperature}°</strong>
                      <span className="forecast-detail">
                        <Droplets size={13} />
                        {humidity}%
                      </span>
                      <span className="forecast-detail">
                        <Wind size={13} />
                        {wind} km/h
                      </span>
                      <span
                        className={`forecast-risk ${riskLevel === "High" || riskLevel === "Extreme" ? "high-text" : "moderate-text"}`}
                      >
                        {riskLevel}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="panel advisory-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow compact">AUTOMATED ADVISORY</p>
                  <h2>Recommended action</h2>
                </div>
                <Zap size={19} className="zap-icon" />
              </div>
              <div className="advisory-content">
                <div className="advisory-icon">
                  <ShieldCheck size={21} />
                </div>
                <p>{advisory}</p>
              </div>
              <div className="action-row">
                <button>
                  <BellRing size={15} /> Notify ward officers
                </button>
                <button>
                  <MessageSquareText size={15} /> Send public alert
                </button>
              </div>
            </div>
          </section>
          <footer className="dashboard-footer">
            <span>
              <LockKeyhole size={14} /> Secure government operations environment
            </span>
            <span>
              Data refreshes every 3 hours <i />
            </span>
          </footer>
        </div>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[...navItems, ...(dashboardRole === "government" ? [{ label: "Alert channels", icon: MessageSquareText }, { label: "Population layers", icon: Users }] : [])].map(({ label, icon: Icon }) => <button key={label} className={activeTab === label ? "active" : ""} onClick={() => { setActiveTab(label); setMobileNav(false); }}><Icon size={16} /><span>{label}</span></button>)}
      </nav>
      {showSignup && (
        <div className="modal-backdrop" onClick={closeSignup}>
          <div
            className="signup-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={closeSignup}
              aria-label="Close signup"
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <Smartphone size={23} />
            </div>
            <p className="eyebrow compact">SECURE ACCESS</p>
            <h2>Get heat alerts</h2>
            <p className="modal-copy">
              Sign up with your phone number to receive ward-level warnings and
              public health advisories.
            </p>
            {!otpSent ? (
              <>
                <label htmlFor="role">Account type</label>
                <select
                  className="role-select"
                  id="role"
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as "citizen" | "government")
                  }
                >
                  <option value="citizen">Citizen / resident</option>
                  <option value="government">Government operations</option>
                </select>
                <div className="auth-methods"><button className={authMethod === "phone" ? "auth-method active" : "auth-method"} onClick={() => setAuthMethod("phone")}><Smartphone size={14} /> Phone OTP</button><button className={authMethod === "email" ? "auth-method active" : "auth-method"} onClick={() => setAuthMethod("email")}><MessageSquareText size={14} /> Email &amp; password</button></div>
                {authMethod === "phone" ? <><label htmlFor="phone">Mobile number</label><div className="phone-field"><span>+91</span><input id="phone" value={phone} onChange={(event) => { setPhone(event.target.value); setAuthError(""); }} placeholder="Enter 10-digit number" inputMode="numeric" /></div><button className="modal-primary" disabled={authBusy} onClick={handleSendOtp}>{authBusy ? "Sending..." : "Send OTP"} <ArrowUpRight size={16} /></button></> : <><div className="email-mode"><button className={emailMode === "signup" ? "selected" : ""} onClick={() => setEmailMode("signup")}>Create account</button><button className={emailMode === "signin" ? "selected" : ""} onClick={() => setEmailMode("signin")}>Sign in</button></div><label htmlFor="email">Email address</label><input className="otp-field" id="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setAuthError(""); }} placeholder="name@example.com" /><label htmlFor="password">Password</label><input className="otp-field" id="password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setAuthError(""); }} placeholder="At least 6 characters" /><button className="modal-primary" disabled={authBusy} onClick={handleEmailAuth}>{authBusy ? "Please wait..." : emailMode === "signup" ? "Create account" : "Sign in"} <ArrowUpRight size={16} /></button></>}
              </>
            ) : (
              <>
                <label htmlFor="otp">Enter verification code</label>
                <input
                  className="otp-field"
                  id="otp"
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value);
                    setAuthError("");
                  }}
                  placeholder="6-digit OTP"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  className="modal-primary"
                  disabled={authBusy}
                  onClick={handleVerifyOtp}
                >
                  {authBusy ? "Verifying..." : "Verify & continue"}{" "}
                  <CheckCircle2 size={16} />
                </button>
                <button
                  className="resend-button"
                  disabled={authBusy || resendSeconds > 0}
                  onClick={handleSendOtp}
                >
                  {resendSeconds
                    ? `Resend code in ${resendSeconds}s`
                    : "Resend code"}
                </button>
                <button
                  className="resend-button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpSession(null);
                    setAuthError("");
                  }}
                >
                  Change number
                </button>
              </>
            )}
            <div id="recaptcha-container" />
            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}
            {!isFirebaseConfigured && (
              <p className="config-warning">
                Add Firebase credentials to `.env.local` before requesting an
                OTP.
              </p>
            )}
            <p className="modal-foot">
              <LockKeyhole size={13} /> Firebase Phone Authentication will
              verify your number securely.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
