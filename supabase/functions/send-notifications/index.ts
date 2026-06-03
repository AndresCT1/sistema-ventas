// Supabase Edge Function — send-notifications
// Ejecutar cada minuto via pg_cron
// Zona horaria: Perú UTC-5

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const PERU_OFFSET_MS = -5 * 60 * 60 * 1000

console.log('Módulo cargado — configurando VAPID')

try {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  console.log('VAPID configurado OK')
} catch (err) {
  console.error('Error configurando VAPID:', err)
}

Deno.serve(async () => {
  console.log('Función iniciada', new Date().toISOString())

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Hora actual UTC y conversión a Perú (UTC-5)
    const utcNow          = new Date()
    const peruNow         = new Date(utcNow.getTime() + PERU_OFFSET_MS)
    const peruDateStr     = peruNow.toISOString().split('T')[0]
    const peruHours       = peruNow.getUTCHours()
    const peruMinutes     = peruNow.getUTCMinutes()
    const currentTotalMin = peruHours * 60 + peruMinutes

    console.log(`UTC: ${utcNow.toISOString()}`)
    console.log(`Perú: ${peruDateStr} ${String(peruHours).padStart(2,'0')}:${String(peruMinutes).padStart(2,'0')} (min total: ${currentTotalMin})`)

    // ── Verificar que hay subscriptions en BD ────────────────────────────────
    const { count: subCount, error: subCountError } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })

    if (subCountError) console.error('Error contando subscriptions:', subCountError.message)
    console.log('Total push_subscriptions en BD:', subCount ?? 0)

    // ── NOTIFICACIÓN 1: referidos a llamar ───────────────────────────────────
    // hora_llamada se guarda en hora local Perú (el vendedor la ingresa desde Perú)
    // La comparación es directa: hora_llamada (Perú) vs currentTotalMin (Perú)

    const { data: referidos, error: refError } = await supabase
      .from('referidos')
      .select('id, nombre, telefono, hora_llamada, vendedor_id')
      .eq('fecha_llamada', peruDateStr)
      .not('hora_llamada', 'is', null)
      .in('estado', ['pendiente'])

    if (refError) console.error('Error query referidos:', refError.message)
    console.log('Referidos con hora_llamada para hoy:', referidos?.length ?? 0)

    for (const ref of referidos ?? []) {
      const rawHora = ref.hora_llamada as string  // "HH:MM:SS" o "HH:MM"
      const [hh, mm] = rawHora.split(':').map(Number)
      const horaMin  = hh * 60 + mm

      const { data: profileData, error: profError } = await supabase
        .from('profiles')
        .select('anticipacion_notif')
        .eq('id', ref.vendedor_id)
        .single()

      if (profError) console.error('Error query profile:', profError.message)

      const anticipacion = (profileData?.anticipacion_notif as number) ?? 60
      let notifTotalMin  = horaMin - anticipacion
      if (notifTotalMin < 0) notifTotalMin += 24 * 60

      console.log(`Referido "${ref.nombre}": hora_llamada=${rawHora} (min ${horaMin}), anticipacion=${anticipacion}, notif en min ${notifTotalMin}, ahora min ${currentTotalMin}, match=${notifTotalMin === currentTotalMin}`)

      if (notifTotalMin !== currentTotalMin) continue

      const { data: subData, error: subError } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('vendedor_id', ref.vendedor_id)
        .single()

      if (subError) console.error('Error query subscription:', subError.message)
      if (!subData?.subscription) {
        console.log(`  → Vendedor sin subscription registrada`)
        continue
      }

      try {
        await webpush.sendNotification(
          subData.subscription,
          JSON.stringify({
            title: 'WOW TEL — Recordatorio',
            body:  `📞 Llamar a ${ref.nombre} — ${ref.telefono}`,
            url:   '/referidos',
          }),
        )
        console.log(`  → Push enviado OK a vendedor ${ref.vendedor_id}`)
      } catch (pushErr) {
        console.error('  → Error enviando push:', pushErr)
      }
    }

    // ── NOTIFICACIÓN 2: contratos por vencer (solo a las 8 AM Perú) ─────────

    console.log(`Check contratos: ${peruHours}:${String(peruMinutes).padStart(2,'0')} Perú — ejecutar: ${peruHours === 8 && peruMinutes === 0}`)

    if (peruHours === 8 && peruMinutes === 0) {
      const targetDate = new Date(peruNow.getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      console.log('Buscando contratos que vencen el:', targetDate)

      const { data: ventas, error: ventasError } = await supabase
        .from('ventas')
        .select('id, cliente_nombre, vendedor_id')
        .eq('fecha_renovacion', targetDate)

      if (ventasError) console.error('Error query ventas:', ventasError.message)
      console.log('Contratos por vencer encontrados:', ventas?.length ?? 0)

      for (const venta of ventas ?? []) {
        const { data: subData, error: subError } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('vendedor_id', venta.vendedor_id)
          .single()

        if (subError) console.error('Error query subscription contrato:', subError.message)
        if (!subData?.subscription) continue

        try {
          await webpush.sendNotification(
            subData.subscription,
            JSON.stringify({
              title: 'WOW TEL — Contrato por vencer',
              body:  `⚠️ Contrato de ${venta.cliente_nombre} vence en 30 días`,
              url:   '/ventas',
            }),
          )
          console.log(`  → Push contrato enviado OK: ${venta.cliente_nombre}`)
        } catch (pushErr) {
          console.error('  → Error enviando push contrato:', pushErr)
        }
      }
    }

    console.log('Función completada OK')
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('ERROR no capturado:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
