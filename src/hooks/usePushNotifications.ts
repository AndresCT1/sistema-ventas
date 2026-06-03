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
  const [permission, setPermission] = useState<NotificationPermission>('default')

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
    if (!isSupported || !profile) return false
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY as string
        ) as unknown as ArrayBuffer,
      })

      // Reemplazar suscripción anterior
      await supabase.from('push_subscriptions').delete().eq('vendedor_id', profile.id)
      await supabase.from('push_subscriptions').insert({
        vendedor_id: profile.id,
        subscription: sub.toJSON(),
      })

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('Push subscription error:', err)
      return false
    }
  }

  async function unsubscribe(): Promise<void> {
    if (!isSupported || !profile) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('vendedor_id', profile.id)
    setIsSubscribed(false)
  }

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe }
}
