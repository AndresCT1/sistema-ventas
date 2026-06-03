import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // Evita llamadas duplicadas: getSession + onAuthStateChange disparan al mismo tiempo
  const loadingRef = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        loadProfile(currentUser.id)
      } else {
        setProfile(null)
        setLoading(false)
        loadingRef.current = false
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    if (loadingRef.current) return
    loadingRef.current = true

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      // El perfil no existe todavía (trigger no corrió) — intenta crearlo
      if (error.code === 'PGRST116') {
        const { data: userData } = await supabase.auth.getUser()
        if (userData.user) {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              email: userData.user.email ?? '',
              full_name: userData.user.user_metadata?.full_name ?? userData.user.email?.split('@')[0] ?? 'Usuario',
              role: 'vendedor',
            })
            .select()
            .single()
          setProfile(newProfile)
        }
      } else {
        console.error('Error cargando perfil:', error.message)
      }
    } else {
      setProfile(data)
    }

    setLoading(false)
    loadingRef.current = false
  }

  async function refreshProfile() {
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
  }

  return { user, profile, loading, refreshProfile }
}
