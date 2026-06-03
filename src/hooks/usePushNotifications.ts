import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function usePushNotifications() {
  const { profile } = useAuth()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permission, setPermission]     = useState<NotificationPermission>('default')

  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  useEffect(() => {
    if (!isSupported) return
    setPermission(Notification.permission)
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setIsSubscribed(!!sub))
    )
  }, [isSupported])

  async function subscribe(): Promise<boolean> {
    if (!isSupported || !profile) {
      console.log('Push no soportado o usuario no autenticado')
      return false
    }
    try {
      console.log('Solicitando permiso...')
      const perm = await Notification.requestPermission()
      setPermission(perm)
      console.log('Resultado permiso:', perm)

      if (perm !== 'granted') {
        console.log('Permiso denegado, abortando')
        return false
      }
      console.log('Permiso concedido')

      const reg = await navigator.serviceWorker.ready
      console.log('Service worker listo:', reg.scope)

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string
      console.log('VAPID key disponible:', !!vapidKey)

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
      })
      console.log('Subscription obtenida:', JSON.stringify(sub.toJSON()))

      // Reemplazar suscripción anterior
      console.log('Guardando en Supabase...')
      const { error: delError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('vendedor_id', profile.id)

      if (delError) console.error('Error al borrar subscription anterior:', delError.message)

      const { error: insError } = await supabase
        .from('push_subscriptions')
        .insert({
          vendedor_id:  profile.id,
          subscription: sub.toJSON(),
        })

      if (insError) {
        console.error('Error guardando subscription:', insError.message, insError.code, insError.details)
        return false
      }

      console.log('Guardado exitoso')
      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('Error en subscribe():', err)
      return false
    }
  }

  async function unsubscribe(): Promise<void> {
    if (!isSupported || !profile) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()

      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('vendedor_id', profile.id)

      if (error) console.error('Error al desuscribir:', error.message)
      else setIsSubscribed(false)
    } catch (err) {
      console.error('Error en unsubscribe():', err)
    }
  }

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe }
}
