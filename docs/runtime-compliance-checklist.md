# Runtime Compliance Checklist

Fecha de revisión: 2026-04-01

## Estado general

| Subsistema | Estado | Evidencia / nota |
| --- | --- | --- |
| Auth con Google vía Supabase | `cumple` | El runtime usa Supabase Auth y callback dedicado. |
| Perfiles automáticos | `cumple` | Las migraciones siguen creando y sincronizando `profiles` desde auth. |
| Invitaciones pendientes | `cumple parcialmente` | El flujo existe y se endureció el lookup por email al board owner, pero falta validación E2E completa del circuito aceptar / rechazar. |
| Realtime snapshot | `cumple parcialmente` | El board sigue persistiendo vía snapshot; ahora se serializan escrituras y se corrige el cleanup al borrar la última lista/tarjeta. Sigue pendiente una suite de integración para concurrencia. |
| Presencia con heartbeat | `cumple parcialmente` | El runtime ya deduplica por usuario y ahora filtra usando la membresía viva del board. Falta prueba automatizada de tabs múltiples. |
| `ai-assist` como proxy principal | `cumple` | El cliente dejó de permitir Gemini directo en producción; la ruta principal queda server-side. |
| RBAC vía RLS | `cumple parcialmente` | El cliente ya deriva rol efectivo desde `memberRoles`; además se limitó `lookup_profile_by_email` al `owner` del board. Queda pendiente ampliar cobertura de pruebas para permisos por acción. |
| Legado Firebase | `mantener temporalmente` | Quedan referencias históricas y tests viejos, pero ya no forman parte del backend principal documentado. |

## Cambios aplicados en esta revisión

- Se alineó el rol efectivo del frontend con `memberRoles` para evitar desvíos respecto a RLS.
- Se serializó `saveBoardSnapshot()` en el cliente para reducir race conditions por closures viejos.
- Se corrigió la limpieza en Supabase para borrar listas y tarjetas aun cuando el conjunto final queda vacío.
- Se sanitizó `dueAt` en `productionFlow` para no propagar strings vacíos o fechas inválidas.
- Se bloqueó el fallback directo a Gemini fuera de desarrollo.
- Se endureció el lookup de perfiles por email en SQL para que solo el `owner` del board pueda resolverlo.
- Se agregaron pruebas unitarias para membresía, flujo optimizado e IA runtime.

## Siguientes cierres recomendados

1. Agregar pruebas de integración para invitaciones y RBAC.
2. Cubrir presencia multi-tab y aceptación de invitaciones con E2E o smoke tests.
3. Revisar y retirar tests/config residual de Firebase que ya no aporten a la arquitectura actual.
