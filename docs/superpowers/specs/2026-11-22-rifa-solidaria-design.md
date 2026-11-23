# Rifa Solidaria — diseño

## Intención
Página para vender boletos de la rifa de una amiga con cáncer (TV Hisense 32", sorteo 22/12/2026). Meta: L 20,000, a L 100 cada uno, son **200 boletos**. Ella comparte el link; la encargada controla todo desde un panel con PIN.

## Objetivos / no-objetivos
- Sí: asignar un número disponible al azar sin repetir, enviar la compra por WhatsApp, verificar los pagos y hacer el sorteo final con una imagen descargable del ganador.
- No: pagos en línea, cuentas de usuario, backend propio.
- Anti-objetivo: dos personas con el mismo número, o datos personales de los compradores visibles al público.

## Enfoques
1. **Elegido: estático en Vercel + Supabase gratis ($0, verificado).** La asignación es atómica en Postgres y el PIN se valida en la base.
2. Solo localStorage: descartado. Sin estado compartido, los números se repiten y el panel queda vacío.
3. Sin registro, todo a mano: descartado porque no hay panel.

## Diseño
- **Frontend:** HTML, CSS y JS vanilla sin build ni dependencias. Habla con Supabase por `fetch` a `/rest/v1/rpc/*` usando la anon key, que es pública por diseño. Paleta rosa/morado como el afiche.
- **Flujo del comprador:**
  1. Toca "Obtener mi número".
  2. Pasan números al azar (solo los disponibles) y se detienen en el que le tocó. El servidor lo aparta por 10 min.
  3. Ingresa nombre y teléfono.
  4. Se marca "Por verificar" y se abre `wa.me` con el mensaje a la encargada: número, nombre, teléfono y la indicación de pedir el comprobante.
  5. Aparece el botón "Comprar otro boleto". Si el apartado vence sin confirmar, el número vuelve a estar disponible.
- **Panel (botón "Admin" arriba a la derecha):**
  - PIN de 6 dígitos guardado como hash bcrypt (pgcrypto) y bloqueo de 10 min tras 5 intentos fallidos.
  - Pestañas:
    - **Boletos:** lista 1–200 con filtro por estado y búsqueda; acciones Verificar, Regresar a disponible y Volver a por verificar.
    - **Dashboard:** conteos, monto recaudado frente a la meta y ventas por día.
    - **Sorteo:** ruleta solo con los boletos vendidos. El ganador lo elige el servidor y queda registrado; luego se descarga la imagen PNG/JPEG generada con canvas.
  - Cambiar PIN.
  - Salir.
- **Datos:**
  - Tabla `tickets(n, status disponible|por_verificar|vendido, nombre, telefono, hold_token, held_until, reservado_at, vendido_at)`.
  - Las tablas tienen RLS activo sin políticas, así que la anon key no puede leerlas directamente. Todo pasa por funciones `SECURITY DEFINER` con validación de entrada.
  - La única función pública que devuelve datos es la lista de números disponibles, sin datos personales.
- **Seguridad del front:**
  - Solo `textContent`, nunca `innerHTML` con datos del usuario.
  - CSP estricta y cabeceras de seguridad en `vercel.json`.
- **WhatsApp destino:** se guarda en la base y se cambia desde el panel (botón 📱 WhatsApp); no se versiona.

## Queda al constructor
Textos exactos, animaciones y el layout del panel en móvil.
