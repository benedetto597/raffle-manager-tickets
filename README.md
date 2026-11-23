# 🎗️ Rifa Solidaria

**🔗 Sitio en vivo: https://raffle-manager-tickets.vercel.app**

[![License: MIT](https://img.shields.io/badge/License-MIT-pink.svg)](LICENSE)
![Vanilla JS](https://img.shields.io/badge/JS-vanilla%20ES%20modules-f7df1e)
![Supabase](https://img.shields.io/badge/DB-Supabase-3ecf8e)
![Vercel](https://img.shields.io/badge/deploy-Vercel-black)

Web para vender boletos de una rifa a beneficio de un tratamiento médico contra el cáncer.
Cada persona obtiene **un número al azar entre los disponibles**, registra sus datos y confirma por **WhatsApp** con la encargada.
La encargada verifica los pagos y hace el sorteo desde un **panel protegido con PIN**.

- Meta inicial **L 20,000** ÷ L 100 = 200 boletos (la meta se cambia desde el panel)
- Premio: Televisor Hisense Smart TV 32" HD · Sorteo: 22/12/2026
- 📘 [Manual de usuario (PDF)](docs/manual/Manual-de-usuario.pdf)

## Contenido

- [Funcionalidades](#funcionalidades)
- [Arquitectura](#arquitectura)
- [Seguridad](#seguridad)
- [Estructura](#estructura)
- [Desarrollo local](#desarrollo-local)
- [Despliegue](#despliegue)
- [Configuración](#configuración)
- [Operación](#operación)
- [Licencia](#licencia)

## Funcionalidades

**Vista pública**
- Animación de números al azar (solo disponibles) que se detiene en el número asignado.
- El número queda apartado 10 minutos mientras la persona ingresa su nombre y teléfono.
- Al confirmar se abre `wa.me` con un mensaje prellenado para la encargada (número, nombre, teléfono y monto, más la solicitud de comprobante).
- Botón para comprar otro boleto y barra de boletos disponibles.

**Panel administrativo** (botón *Admin* y PIN de 6 dígitos)
- **Boletos:** lista completa con filtros por estado (*Disponible*, *Por verificar*, *Vendido*) y búsqueda por número, nombre, teléfono o cuenta. Acciones: verificar pago, liberar, revertir y vender. Incluye enlace a WhatsApp de cada comprador.
- **Verificar pago:** abre una ventana que exige el **número de cuenta de origen** del pago; sin ese dato el boleto no pasa a *Vendido*. La cuenta queda visible en la lista.
- **Dashboard:** KPIs, avance de la meta, boletos por día (resalta el mejor día) y últimos movimientos.
- **Sorteo:** ruleta con los boletos vendidos. El ganador lo elige el servidor y queda registrado; la imagen del ganador se descarga en **PNG o JPEG**.
- **Venta manual:** registra boletos pagados fuera de la página (número elegido o al azar) directamente como vendidos, con cuenta de origen obligatoria (o "Efectivo"); también desde el botón *Vender* de cada boleto disponible.
- **Meta** configurable: recalcula la cantidad de boletos (meta ÷ precio) y actualiza todos los textos.
- Cambiar PIN, configurar el WhatsApp destino y salir del panel.

## Arquitectura

```
Navegador (HTML/CSS/JS vanilla, sin build)
   │  fetch POST /rest/v1/rpc/<función>   (publishable key)
   ▼
Supabase Postgres
   ├─ tickets, draws, admin_cfg   ← RLS activo, sin políticas (inaccesibles directo)
   └─ funciones SECURITY DEFINER  ← única superficie expuesta
```

| RPC | Acceso | Descripción |
|---|---|---|
| `available_numbers()` | público | Números disponibles (sin datos personales) |
| `hold_ticket()` | público | Aparta un número aleatorio 10 min (`FOR UPDATE SKIP LOCKED`) |
| `confirm_ticket(token, nombre, tel)` | público | Pasa el boleto apartado a *por verificar* |
| `admin_list(pin)` | PIN | Lista completa (incluye cuenta de pago) + último ganador |
| `admin_set_status(pin, n, status, cuenta)` | PIN | Transiciones válidas de estado; pasar a *vendido* exige `cuenta` |
| `admin_draw(pin)` | PIN | Sorteo aleatorio entre vendidos, registrado en `draws` |
| `admin_change_pin(pin, nuevo)` | PIN | Cambia el PIN |
| `public_config()` | público | WhatsApp destino, meta, precio y total de boletos |
| `admin_add_sale(pin, n, nombre, tel, cuenta)` | PIN | Registra una venta manual como *vendido* (`n` nulo = al azar; `cuenta` obligatoria) |
| `admin_set_goal(pin, meta)` | PIN | Cambia la meta; agrega o quita boletos libres del final |
| `admin_set_whatsapp(pin, num)` | PIN | Cambia el WhatsApp destino |

## Seguridad

- **Sin acceso directo a tablas:** la anon/publishable key solo puede ejecutar las 11 funciones listadas; `_auth` es interna.
- **PIN** guardado como hash **bcrypt** (`pgcrypto`). Tras **5 intentos fallidos** el acceso se bloquea **10 minutos**. El PIN nunca se versiona.
- **Asignación atómica:** no puede haber números duplicados aunque compren varias personas a la vez.
- **Anti-acaparamiento:** máximo 40 apartados activos simultáneos; los apartados vencidos vuelven al pool.
- **Validación en servidor** de nombre (2–80 caracteres), teléfono (8–15 dígitos) y cuenta de pago (4–40 caracteres: letras, números, espacio, `-` `.` `#` `/`).
- **Frontend:** sin `innerHTML` con datos de usuario (solo `textContent`), CSP estricta sin `unsafe-inline`, HSTS, `nosniff` y `frame-ancestors 'none'` (ver [`vercel.json`](vercel.json)).

> La publishable key de Supabase en `js/config.js` es pública por diseño; la protección real está en RLS y en las funciones.

## Estructura

```
├── index.html               # Vista pública + panel
├── css/styles.css
├── js/
│   ├── config.js            # Parámetros de la rifa y WhatsApp destino
│   ├── api.js               # Cliente RPC + mensajes de error
│   ├── buy.js               # Flujo de compra
│   ├── admin.js             # Panel: boletos, dashboard, sorteo
│   ├── wheel.js             # Ruleta (canvas) e imagen del ganador
│   └── util.js
├── supabase/migrations/001_init.sql
├── docs/manual/             # Manual de usuario (HTML fuente + PDF)
└── vercel.json              # Cabeceras de seguridad
```

## Desarrollo local

No requiere instalar dependencias:

```bash
python -m http.server 5173
# abrir http://localhost:5173
```

## Despliegue

1. **Base de datos:** en un proyecto de Supabase, ejecuta las migraciones de `supabase/migrations/` en orden y define el PIN inicial (el WhatsApp se configura luego desde el panel):
   ```sql
   update public.admin_cfg
      set pin_hash = extensions.crypt('<PIN de 6 dígitos>', extensions.gen_salt('bf', 10))
    where id = 1;
   ```
2. **Frontend:** importa el repo en Vercel (framework *Other*, sin comando de build). Cada push a `main` se despliega solo.
3. Ajusta `connect-src` en `vercel.json` si cambias de proyecto Supabase.
4. Al cambiar CSS o JS, sube el número de versión `?v=N` en `index.html` y en los `import` de `js/*.js`; así ningún navegador usa archivos viejos de su caché:
   ```bash
   V=7; sed -i -E "s#(\.js|\.css)\?v=[0-9]+#\1?v=$V#g" index.html js/*.js
   ```

## Configuración

`js/config.js`:

| Clave | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Proyecto Supabase (URL + publishable key) |
| — | El WhatsApp de la encargada **no** está aquí: se configura en el panel (📱 WhatsApp) y se guarda en `admin_cfg` |
| `PRICE` | Valor inicial mientras carga; la meta, el precio y el total reales viven en `admin_cfg` (se cambian desde el panel: 🎯 Meta) |
| `PRIZE`, `DRAW_DATE`, `TZ` | Textos y zona horaria |

## Operación

- **Restablecer el PIN olvidado:** ejecuta el `update` de la sección *Despliegue* en el SQL Editor de Supabase.
- **Desbloquear el panel:** `update public.admin_cfg set fails = 0, locked_until = null where id = 1;`
- **Reiniciar la rifa** (borra todo): `delete from draws; update tickets set status='disponible', nombre=null, telefono=null, hold_token=null, held_until=null, cuenta_pago=null, reservado_at=null, vendido_at=null;`

## Licencia

[MIT](LICENSE) © 2026 benedetto597
