# Firebase Legacy Audit

Fecha de revisión: 2026-04-01

## Resumen

El frontend activo ya no depende de Firebase como backend principal. El legado visible quedó concentrado en tooling, despliegue histórico y una carpeta `functions/` separada del flujo actual de Supabase + Edge Functions.

## Clasificación

### Retirar

- `.firebase/`
  - Cache local de hosting/emulación.
  - No aporta a la arquitectura objetivo y solo mete ruido operativo.

### Aislar

- `functions/`
  - Contiene Cloud Functions y dependencias `firebase-admin` / `firebase-functions`.
  - Mantener fuera del flujo principal hasta decidir si se migra a Supabase Edge Functions o se elimina.
- `tests/firestore.rules.accept-invitation.test.ts`
  - Sigue documentando reglas de Firestore, pero ya no representa el backend actual.
  - No debe formar parte del pipeline por defecto.

### Mantener temporalmente

- `firebase.json`
- `.firebaserc`
- `firebase-tools` en `package.json`
  - Todavía pueden ser necesarios para despliegues o rollback histórico mientras exista la carpeta `functions/`.
  - Conviene removerlos solo cuando `functions/` quede oficialmente deprecada o migrada.

## Señales positivas

- No se encontró un cliente Firebase activo en `src/`.
- La documentación principal del proyecto ya apunta a Supabase/Cloudflare.
- El backend de IA y datos críticos ya está orientado a Supabase.

## Siguiente corte recomendado

1. Decidir si `functions/` sigue teniendo responsabilidades en producción.
2. Si no las tiene, eliminar `functions/`, `firebase.json`, `.firebaserc` y `firebase-tools`.
3. Si sí las tiene, documentar explícitamente qué endpoint o proceso depende todavía de Firebase para evitar ambigüedad operativa.
