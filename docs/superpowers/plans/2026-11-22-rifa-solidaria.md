# Rifa Solidaria Implementation Plan

> Ejecución: nativa en esta sesión, por pedido de optimizar tokens.

**Goal:** Sitio estático en Vercel con una rifa de 200 boletos respaldada por Supabase (RPCs).
**Architecture:** HTML/CSS/JS vanilla (módulos ES) que llama a `POST {SUPABASE_URL}/rest/v1/rpc/<fn>`. Toda la lógica y la autorización por PIN viven en funciones Postgres `SECURITY DEFINER`, con RLS activo en las tablas y sin políticas.
**Spec:** `docs/superpowers/specs/2026-11-22-rifa-solidaria-design.md`

## Global Constraints
- 200 boletos, L 100 cada uno, meta L 20,000; sorteo el 22/12/2026.
- WhatsApp destino: configurable desde el panel (tabla `admin_cfg`), no se versiona.
- PIN inicial definido fuera del repo, guardado como hash bcrypt; bloqueo de 10 min tras 5 fallos.
- El apartado de un boleto dura 10 min.
- Sin dependencias npm ni build; ningún dato del usuario pasa por `innerHTML`.

## Review Focus
- Dos compradores simultáneos: deben recibir números distintos (`FOR UPDATE SKIP LOCKED`).
- Apartado vencido: el número vuelve al pool y la confirmación tardía falla con un mensaje claro.
- Sin boletos disponibles: mensaje de agotado, sin animación infinita.
- PIN erróneo repetido: bloqueo; el PIN correcto también se rechaza mientras dure el bloqueo.
- Sorteo sin vendidos: error claro; volver a sortear reemplaza al ganador solo si se pide explícitamente.

### Task 1: Base de datos (`supabase/migrations/001_init.sql`)
- Tablas:
  - `tickets(n smallint pk 1..200, status text check in ('disponible','por_verificar','vendido'), nombre, telefono, hold_token uuid, held_until timestamptz, reservado_at, vendido_at)`
  - `admin_cfg(id=1, pin_hash, fails int, locked_until)`
  - `draws(id, n, nombre, telefono, drawn_at)`
- RPCs:
  - `available_numbers() -> smallint[]`
  - `hold_ticket() -> json{n, token}`
  - `confirm_ticket(p_token uuid, p_nombre text, p_tel text) -> smallint`
  - `admin_list(p_pin) -> json`
  - `admin_set_status(p_pin, p_n, p_status) -> void`
  - `admin_draw(p_pin) -> json`
  - `admin_change_pin(p_pin, p_new) -> void`
- Permisos: revocar a `public` y otorgar `execute` a `anon` solo en esas funciones.
- Verificar con SQL: una reserva, una confirmación, un PIN erróneo y el bloqueo.

### Task 2: Frontend
- Archivos:
  - `index.html`
  - `css/styles.css`
  - `js/config.js`
  - `js/api.js` (`rpc(fn, args)`)
  - `js/buy.js` (flujo del comprador)
  - `js/admin.js` (panel: lista, dashboard, sorteo)
  - `js/winner-image.js` (canvas, descarga PNG/JPEG)
  - `vercel.json` (CSP y cabeceras)
- Verificar en local con el navegador: compra completa, link de wa.me, panel, filtros y descarga.

### Task 3: Publicar
- Ejecutar `git init` y crear el repo público `raffle-manager-tickets` con `gh repo create --public --push`.
- Crear el proyecto Vercel desde el repo y verificar la URL de producción.
