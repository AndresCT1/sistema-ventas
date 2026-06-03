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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token || !chatId) return
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const json = await res.json()
    if (!json.ok) console.error('Telegram error:', JSON.stringify(json))
    else console.log(`  → Telegram enviado a chat_id ${chatId}`)
  } catch (err) {
    console.error('  → Error enviando Telegram:', err)
  }
}

async function sendPush(subscription: unknown, payload: object): Promise<void> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
    console.log('  → Push enviado OK')
  } catch (err) {
    console.error('  → Error enviando push:', err)
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async () => {
  console.log('Función iniciada', new Date().toISOString())

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Hora actual en Perú (UTC-5)
    const utcNow          = new Date()
    const peruNow         = new Date(utcNow.getTime() + PERU_OFFSET_MS)
    const peruDateStr     = peruNow.toISOString().split('T')[0]
    const peruHours       = peruNow.getUTCHours()
    const peruMinutes     = peruNow.getUTCMinutes()
    const currentTotalMin = peruHours * 60 + peruMinutes

    console.log(`UTC: ${utcNow.toISOString()}`)
    console.log(`Perú: ${peruDateStr} ${String(peruHours).padStart(2,'0')}:${String(peruMinutes).padStart(2,'0')} (min: ${currentTotalMin})`)

    // Verificar subscriptions en BD
    const { count: subCount } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
    console.log('Total push_subscriptions:', subCount ?? 0)

    // ── NOTIFICACIÓN 1: referidos a llamar ───────────────────────────────────

    const { data: referidos, error: refError } = await supabase
      .from('referidos')
      .select('id, nombre, telefono, hora_llamada, vendedor_id')
      .eq('fecha_llamada', peruDateStr)
      .not('hora_llamada', 'is', null)
      .in('estado', ['pendiente'])

    if (refError) console.error('Error query referidos:', refError.message)
    console.log('Referidos con hora_llamada para hoy:', referidos?.length ?? 0)

    for (const ref of referidos ?? []) {
      const rawHora = ref.hora_llamada as string
      const [hh, mm] = rawHora.split(':').map(Number)
      const horaMin  = hh * 60 + mm

      // Perfil del vendedor (anticipación + telegram_chat_id)
      const { data: profileData, error: profError } = await supabase
        .from('profiles')
        .select('anticipacion_notif, telegram_chat_id')
        .eq('id', ref.vendedor_id)
        .single()

      if (profError) console.error('Error query profile:', profError.message)

      const anticipacion = (profileData?.anticipacion_notif as number) ?? 60
      let notifTotalMin  = horaMin - anticipacion
      if (notifTotalMin < 0) notifTotalMin += 24 * 60

      console.log(`Referido "${ref.nombre}": hora=${rawHora}, anticipacion=${anticipacion}min, notif en min ${notifTotalMin}, ahora min ${currentTotalMin}, match=${notifTotalMin === currentTotalMin}`)

      if (notifTotalMin !== currentTotalMin) continue

      const horaFormateada = rawHora.substring(0, 5) // "HH:MM"

      // Enviar Push
      const { data: subData, error: subError } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('vendedor_id', ref.vendedor_id)
        .single()

      if (subError) console.error('Error query subscription:', subError.message)
      if (subData?.subscription) {
        await sendPush(subData.subscription, {
          title: 'WOW TEL — Recordatorio',
          body:  `📞 Llamar a ${ref.nombre} — ${ref.telefono}`,
          url:   '/referidos',
        })
      } else {
        console.log('  → Sin push subscription')
      }

      // Enviar Telegram
      const telegramChatId = profileData?.telegram_chat_id as string | null
      if (telegramChatId) {
        await sendTelegram(
          telegramChatId,
          `📞 <b>Recordatorio de llamada</b>\n\nCliente: ${ref.nombre}\nTeléfono: ${ref.telefono}\nHora: ${horaFormateada}`,
        )
      } else {
        console.log('  → Sin telegram_chat_id')
      }
    }

    // ── NOTIFICACIÓN 2: contratos por vencer (solo a las 8 AM Perú) ─────────

    console.log(`Check contratos: ${peruHours}:${String(peruMinutes).padStart(2,'0')} — ejecutar: ${peruHours === 8 && peruMinutes === 0}`)

    if (peruHours === 8 && peruMinutes === 0) {
      const targetDate = new Date(peruNow.getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      console.log('Buscando contratos que vencen el:', targetDate)

      const { data: ventas, error: ventasError } = await supabase
        .from('ventas')
        .select('id, cliente_nombre, fecha_renovacion, vendedor_id')
        .eq('fecha_renovacion', targetDate)

      if (ventasError) console.error('Error query ventas:', ventasError.message)
      console.log('Contratos por vencer encontrados:', ventas?.length ?? 0)

      for (const venta of ventas ?? []) {
        // Perfil del vendedor
        const { data: profileData } = await supabase
          .from('profiles')
          .select('telegram_chat_id')
          .eq('id', venta.vendedor_id)
          .single()

        // Formatear fecha de renovación
        const [vy, vm, vd] = (venta.fecha_renovacion as string).split('-')
        const fechaFmt = `${vd}/${vm}/${vy}`

        // Enviar Push
        const { data: subData } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('vendedor_id', venta.vendedor_id)
          .single()

        if (subData?.subscription) {
          await sendPush(subData.subscription, {
            title: 'WOW TEL — Contrato por vencer',
            body:  `⚠️ Contrato de ${venta.cliente_nombre} vence en 30 días`,
            url:   '/ventas',
          })
        }

        // Enviar Telegram
        const telegramChatId = profileData?.telegram_chat_id as string | null
        if (telegramChatId) {
          await sendTelegram(
            telegramChatId,
            `⚠️ <b>Contrato por vencer</b>\n\nCliente: ${venta.cliente_nombre}\nVence en 30 días: ${fechaFmt}`,
          )
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
