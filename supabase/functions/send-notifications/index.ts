// Supabase Edge Function — send-notifications
// Ejecutar cada minuto via pg_cron
// Zona horaria: Perú UTC-5

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const PERU_OFFSET_MS = -5 * 60 * 60 * 1000

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Hora actual en Perú
    const utcNow  = new Date()
    const peruNow = new Date(utcNow.getTime() + PERU_OFFSET_MS)
    const peruDateStr      = peruNow.toISOString().split('T')[0]  // "2026-06-03"
    const peruHours        = peruNow.getUTCHours()
    const peruMinutes      = peruNow.getUTCMinutes()
    const currentTotalMin  = peruHours * 60 + peruMinutes

    // ── NOTIFICACIÓN 1: referidos a llamar ───────────────────────────────────

    const { data: referidos } = await supabase
      .from('referidos')
      .select('id, nombre, telefono, hora_llamada, vendedor_id')
      .eq('fecha_llamada', peruDateStr)
      .not('hora_llamada', 'is', null)
      .in('estado', ['pendiente'])

    for (const ref of referidos ?? []) {
      const [hh, mm] = (ref.hora_llamada as string).split(':').map(Number)
      const horaMin  = hh * 60 + mm

      // Obtener anticipación del vendedor
      const { data: profileData } = await supabase
        .from('profiles')
        .select('anticipacion_notif')
        .eq('id', ref.vendedor_id)
        .single()

      const anticipacion   = (profileData?.anticipacion_notif as number) ?? 60
      let notifTotalMin    = horaMin - anticipacion
      if (notifTotalMin < 0) notifTotalMin += 24 * 60 // wrap midnight

      if (notifTotalMin !== currentTotalMin) continue

      // Obtener subscription del vendedor
      const { data: subData } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('vendedor_id', ref.vendedor_id)
        .single()

      if (!subData?.subscription) continue

      await webpush.sendNotification(
        subData.subscription,
        JSON.stringify({
          title: 'WOW TEL — Recordatorio',
          body:  `📞 Llamar a ${ref.nombre} — ${ref.telefono}`,
          url:   '/referidos',
        }),
      )
    }

    // ── NOTIFICACIÓN 2: contratos por vencer (solo a las 8 AM Perú) ─────────

    if (peruHours === 8 && peruMinutes === 0) {
      const targetDate = new Date(peruNow.getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      const { data: ventas } = await supabase
        .from('ventas')
        .select('id, cliente_nombre, vendedor_id')
        .eq('fecha_renovacion', targetDate)

      for (const venta of ventas ?? []) {
        const { data: subData } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('vendedor_id', venta.vendedor_id)
          .single()

        if (!subData?.subscription) continue

        await webpush.sendNotification(
          subData.subscription,
          JSON.stringify({
            title: 'WOW TEL — Contrato por vencer',
            body:  `⚠️ Contrato de ${venta.cliente_nombre} vence en 30 días`,
            url:   '/ventas',
          }),
        )
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-notifications error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
