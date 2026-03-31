<div align="center">

# FrameFlow

**Tablero Kanban con IA para creadores de YouTube y sus equipos**

[Ver App](https://jesus-frameflow.web.app) · [Documentacion Tecnica](DOCS.md)

</div>

---

## Que es FrameFlow?

FrameFlow es una herramienta de gestion de proyectos tipo Kanban para creadores de contenido en YouTube. Combina tablero colaborativo, asistentes con Gemini, dashboard de produccion y ahora un backend seguro para integraciones sensibles.

## Caracteristicas principales

- Tablero Kanban de 7 fases para produccion de videos
- Chatbot IA con function calling sobre el tablero
- Dashboard con metricas, cuellos de botella e interlinking
- Grabacion y transcripcion de audio en tarjetas
- Colaboracion en tiempo real via Firebase Auth + Firestore
- Backend seguro con Firebase Functions para YouTube y gestion de miembros

## Stack

| Categoria | Tecnologia | Version |
|-----------|------------|---------|
| Frontend | React + TypeScript + Vite | 19 / 5.8 / 6.2 |
| Backend | Firebase Auth + Firestore + Functions | 12.11 / 2nd gen |
| IA | Google Gemini (`@google/genai`) | 1.29.0 |
| UI | Tailwind CSS + lucide-react | 4.1 / 0.546 |

## Inicio rapido

### Prerrequisitos

- Node.js 20+
- Cuenta de Google para autenticacion Firebase
- API key de Gemini en `.env`

### Instalacion

```bash
# 1. Clonar el proyecto
git clone <repo-url>
cd frameflow

# 2. Instalar frontend
npm install

# 3. Configurar entorno local
cp .env.example .env
# Editar .env y anadir GEMINI_API_KEY

# 4. Instalar Firebase Functions
cd functions
npm install
cd ..

# 5. Levantar frontend
npm run dev
```

## Despliegue y secretos

### Flujo normal de despliegue

```bash
# 1. Login local contra Firebase
firebase login

# 2. Asegurar dependencias de functions
cd functions
npm install
cd ..

# 3. Configurar secreto backend para YouTube
firebase functions:secrets:set YOUTUBE_API_KEY

# 4. Publicar
npm run build
firebase deploy
```

### Credenciales administrativas locales

- La service account no debe vivir dentro del repo.
- Para migraciones o utilidades admin usa una credencial local fuera del workspace.
- Exporta `GOOGLE_APPLICATION_CREDENTIALS` solo cuando la necesites.
- Script de migracion incluido:

```bash
cd functions
node scripts/migrate-hardening.mjs
```

## Scripts utiles

### Root

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test:rules`

### Reglas Firestore

- El test `npm run test:rules` usa el emulador de Firestore.
- Firebase Emulator ahora requiere Java 21 o superior.
- Si tu maquina no tiene Java 21+, el test no podra arrancar aunque el codigo este bien.

### Functions

- `cd functions && npm run serve`
- `cd functions && npm run deploy`
- `cd functions && npm run migrate:hardening`

## Produccion

- App: https://jesus-frameflow.web.app
