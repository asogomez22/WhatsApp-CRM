# WhatsApp CRM

MVP full-stack alineado con el PDF `Plan_SaaS_TarracoWebs_v3.pdf`.

Incluye:

- Backend `Node.js + Express` multi-tenant.
- Frontend `React + Vite`.
- Agenda diaria con creación y cambio de estado de citas.
- Automatizaciones de reseñas y recordatorios anti no-show.
- Flujo guiado de captación de citas por WhatsApp.
- Webhook común de WhatsApp con enrutado por `phone_number_id`.

## Arquitectura

- `server/`: API REST, motor de flujos, automatizaciones y webhook.
- `client/`: panel operativo para agenda, mensajes y configuración.
- `server/data/app-db.json`: persistencia local para el MVP.

El PDF propone `Supabase/PostgreSQL`; aquí la estructura de datos replica ese modelo pero usando almacenamiento JSON local para que el sistema funcione de inmediato sin infraestructura extra. La separación por `businessId` y `phone_number_id` ya está implementada para migrar después a PostgreSQL sin rehacer la lógica.

## Módulos funcionales

- `Plan 1 · Reseñas`: cuando una cita queda `completed`, a las 2 horas sale la solicitud de reseña.
- `Plan 2 · Anti No-Show`: 24 horas antes de la cita se envía un recordatorio y el paciente puede responder `CONFIRMAR` o `CANCELAR`.
- `Plan 3 · Citas Automáticas`: si entra un mensaje tipo “quiero cita”, el flujo pide servicio, ofrece huecos y crea la cita automáticamente.

## Arranque

```bash
npm install
npm run dev --workspace server
npm run dev --workspace client
```

Backend:

- API en `http://localhost:3001`

Frontend:

- Panel en `http://localhost:5173`

## Deploy con Dokploy

La app ya queda preparada para Dokploy como contenedor único:

- [Dockerfile](/root/WhatsApp-CRM/Dockerfile): build multi-stage para backend + frontend
- [docker-compose.yml](/root/WhatsApp-CRM/docker-compose.yml): servicio único con volumen persistente
- [.env.example](/root/WhatsApp-CRM/.env.example): variables base

### Opción recomendada en Dokploy

Usa `docker-compose.yml` y define estas variables en Dokploy:

```bash
NODE_ENV=production
PORT=3001
DATA_DIR=/app/data
WHATSAPP_API_VERSION=v22.0
WHATSAPP_ACCESS_TOKEN=
```

### Persistencia

El MVP sigue usando JSON local, así que en producción necesita volumen.

- El contenedor guarda datos en `/app/data/app-db.json`
- `docker-compose.yml` ya monta el volumen `whatsapp_crm_data`

### Webhooks

Si publicas el dominio en Dokploy, estos endpoints quedan listos:

- `https://tu-dominio/api/health`
- `https://tu-dominio/api/whatsapp/webhook`

Para la verificación de Meta, el `verify_token` sigue siendo por canal y se guarda en la configuración del negocio.

## Datos demo

Se crea automáticamente un negocio piloto:

- `Clínica Sonrisa Reus`
- plan `full_pack`
- canal demo de WhatsApp
- servicios, disponibilidad y citas iniciales

## Integración con WhatsApp Cloud API

El servicio funciona en modo demo por defecto. Para envío real, configura:

```bash
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_API_VERSION=v22.0
```

Cada negocio mantiene su propio canal en la configuración del backend, como exige el PDF.

## Endpoints principales

- `GET /api/health`
- `GET /api/businesses`
- `GET /api/businesses/:businessId/dashboard`
- `GET /api/businesses/:businessId/appointments`
- `POST /api/businesses/:businessId/appointments`
- `PATCH /api/businesses/:businessId/appointments/:appointmentId`
- `GET /api/businesses/:businessId/slots?serviceId=...`
- `POST /api/businesses/:businessId/automation/process-due`
- `POST /api/businesses/:businessId/simulate-incoming-message`
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`

## Validación realizada

- `npm run build --workspace server`
- `npm run build --workspace client`
- `docker build -t whatsapp-crm .`
- Smoke test interno del motor de flujos: alta de conversación, selección de servicio, selección de hueco y creación automática de cita

No pude abrir puertos HTTP dentro de este sandbox, así que la validación en esta sesión fue por build y ejecución interna del backend sin `listen()`.
