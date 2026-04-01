<div align="center">

# FrameFlow

**Tablero Kanban con IA para creadores de YouTube y sus equipos**

[Ver App](https://frameflow1.frameflow.workers.dev/) · [Documentacion Tecnica](DOCS.md) · [Guia de Equipo](GUIA_EQUIPO.md)

</div>

---

## Que es FrameFlow?

FrameFlow es una herramienta de gestion de proyectos tipo Kanban para creadores de contenido en YouTube. Combina tablero colaborativo en tiempo real, asistentes con Gemini AI, dashboard de produccion y un backend seguro con Supabase.

## Caracteristicas principales

- Tablero Kanban con pipeline de 12 fases para produccion de videos
- Chatbot IA (Gemini) con function calling sobre el tablero
- Wizard "Idea first + IA asistida" para crear videos desde cero
- Dashboard con metricas, cuellos de botella e interlinking
- Grabacion y transcripcion de audio en tarjetas
- Colaboracion en tiempo real con roles (Creador / Editor / Viewer) y presencia
- Sistema de invitaciones por email (acepta usuarios sin cuenta)
- SEO automatizado: keywords, descripcion, hashtags con IA

## Stack

| Categoria | Tecnologia | Version |
|-----------|------------|---------|
| Frontend | React + TypeScript + Vite | 19 / 5.8 / 6.2 |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) | — |
| IA | Google Gemini (2.5-flash, 2.0-flash-lite, 2.5-pro) | REST API |
| UI | Tailwind CSS + lucide-react | 4.1 / 0.546 |
| Hosting | Cloudflare Workers (via GitHub) | — |

## Inicio rapido

### Prerrequisitos

- Node.js 20+
- Cuenta de Google para autenticacion
- Proyecto Supabase configurado
- API key de Gemini

### Instalacion

```bash
# 1. Clonar el proyecto
git clone https://github.com/Pcxddg/frameflow.git
cd frameflow

# 2. Instalar dependencias
npm install

# 3. Configurar entorno local
cp .env.example .env
# Editar .env con tus credenciales de Supabase y Gemini

# 4. Levantar frontend
npm run dev
# → http://localhost:3000
```

## Variables de entorno

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `VITE_SUPABASE_URL` | Si | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Si | Anon/publishable key de Supabase |
| `VITE_SUPABASE_GOOGLE_ENABLED` | No | Habilitar Google OAuth (`true`/`false`) |
| `VITE_SUPABASE_AUTH_REDIRECT_PATH` | No | Path de callback OAuth (default: `/auth/callback`) |
| `VITE_GEMINI_API_KEY` | No | API key de Gemini para fallback directo (dev) |
| `GEMINI_API_KEY` | Si* | API key para la edge function `ai-assist` (se configura como secreto en Supabase) |

## Despliegue

### Frontend (Cloudflare Workers)

El frontend se despliega automaticamente al hacer push a `main` en GitHub:

```bash
git push origin main
# Cloudflare detecta el push y reconstruye automaticamente
```

Las variables `VITE_*` se configuran en **Cloudflare Dashboard > Settings > Build settings > Environment variables**.

### Edge Functions (Supabase)

```bash
# Configurar secretos
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set \
  GEMINI_API_KEY=<key> \
  --project-ref <ref>

# Desplegar funciones
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy ai-assist \
  --project-ref <ref> --no-verify-jwt
```

### SQL remoto (Supabase Management API)

Para ejecutar migraciones en la base de datos remota:

```bash
curl -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1;"}'
```

## Scripts

| Script | Comando | Descripcion |
|--------|---------|-------------|
| `dev` | `vite --port=3000 --host=0.0.0.0` | Servidor de desarrollo con HMR |
| `build` | `vite build` | Build de produccion (output en `dist/`) |
| `preview` | `vite preview` | Previsualizar build local |
| `clean` | `rm -rf dist` | Limpiar directorio de build |
| `lint` | `tsc --noEmit` | Verificacion de tipos TypeScript |

## Produccion

- **App**: https://frameflow1.frameflow.workers.dev/
- **Repo**: https://github.com/Pcxddg/frameflow
- **Supabase**: proyecto `alcgeficxobsegeycrtu`
