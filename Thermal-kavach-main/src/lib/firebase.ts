import { getApps, initializeApp } from 'firebase/app'
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  sendEmailVerification,
  signOut,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  updateProfile,
  type User,
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { apiRequest } from './api'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
)

const app = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null

export const auth = app ? getAuth(app) : null

type WebOtpSession = { platform: 'web'; confirmationResult: Awaited<ReturnType<typeof signInWithPhoneNumber>> }
type NativeOtpSession = { platform: 'native'; verificationId: string }
export type PhoneOtpSession = WebOtpSession | NativeOtpSession

let recaptchaVerifier: RecaptchaVerifier | null = null

export function createPhoneOtpVerifier(containerId: string) {
  if (!auth) {
    throw new Error('Firebase is not configured. Copy .env.example to .env.local and add your credentials.')
  }

  recaptchaVerifier?.clear()
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
  return recaptchaVerifier
}

export async function sendPhoneOtp(phoneNumber: string, containerId: string): Promise<PhoneOtpSession> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured. Add the values from .env.example to .env.local.')
  }

  if (Capacitor.isNativePlatform()) {
    let verificationId = ''
    const listener = await FirebaseAuthentication.addListener('phoneCodeSent', event => {
      verificationId = event.verificationId
    })
    try {
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber })
      const startedAt = Date.now()
      while (!verificationId && Date.now() - startedAt < 10000) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (!verificationId) throw new Error('OTP_SENT_TIMEOUT')
      return { platform: 'native', verificationId }
    } finally {
      await listener.remove()
    }
  }

  if (!auth) throw new Error('Firebase Authentication is unavailable.')
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, createPhoneOtpVerifier(containerId))
  return { platform: 'web', confirmationResult }
}

export async function verifyPhoneOtp(session: PhoneOtpSession, verificationCode: string) {
  if (session.platform === 'native') {
    return FirebaseAuthentication.confirmVerificationCode({ verificationId: session.verificationId, verificationCode })
  }
  return session.confirmationResult.confirm(verificationCode)
}

export async function saveUserProfile(user: User, profile: { name: string; role: 'citizen' | 'government'; ward?: string; phone?: string; email?: string }) {
  if (!app) throw new Error('Firebase is not configured.')
  const profilePath = `users/${user.uid}`
  const profileData = {
    name: profile.name,
    role: profile.role,
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.ward ? { ward: profile.ward } : {}),
    updatedAt: new Date().toISOString(),
  }
  try {
    console.info('[Thermal Kavach auth] Firestore profile write started', { path: profilePath, uid: user.uid })
    await setDoc(doc(getFirestore(app), 'users', user.uid), profileData, { merge: true })
    console.info('[Thermal Kavach auth] Firestore profile write succeeded', { path: profilePath })
  } catch (error) {
    console.error('[Thermal Kavach auth] Firestore profile write failed', { path: profilePath, code: 'code' in (error as object) ? String((error as { code?: unknown }).code) : undefined, message: error instanceof Error ? error.message : String(error) })
    throw error
  }
  await apiRequest(`/users/${encodeURIComponent(user.uid)}`, { method: 'PUT', body: JSON.stringify({ name: profile.name, role: profile.role, ...(profile.email ? { email: profile.email } : {}), ...(profile.phone ? { phone: profile.phone } : {}), ...(profile.ward ? { ward_id: profile.ward } : {}) }) })
}

export async function getUserRole(userId: string): Promise<'citizen' | 'government'> {
  if (!app) throw new Error('Firebase is not configured.')
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Authentication is not ready for this profile lookup.')
  }
  const profilePath = `users/${userId}`
  let snapshot
  try {
    console.info('[Thermal Kavach auth] Firestore profile read started', { path: profilePath, uid: userId, authenticatedUid: auth?.currentUser?.uid ?? null })
    snapshot = await getDoc(doc(getFirestore(app), 'users', userId))
    console.info('[Thermal Kavach auth] Firestore profile read succeeded', { path: profilePath, exists: snapshot.exists() })
  } catch (error) {
    console.error('[Thermal Kavach auth] Firestore profile read failed', { path: profilePath, code: 'code' in (error as object) ? String((error as { code?: unknown }).code) : undefined, message: error instanceof Error ? error.message : String(error) })
    throw error
  }
  const role = snapshot.data()?.role
  if (role !== 'citizen' && role !== 'government') throw new Error('Your account role is missing. Contact an administrator.')
  return role
}

export {
  createUserWithEmailAndPassword,
  isFirebaseConfigured,
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  updateProfile,
}