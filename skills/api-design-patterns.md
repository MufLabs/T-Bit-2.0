---
name: API Design Patterns
id: api-design-patterns
description: Patrones declarativos de diseno de APIs REST coherentes: recursos, versionado, errores, paginacion e idempotencia.
tags: [api, diseno, rest, arquitectura, backend]
source: local
version: 1
---

# Skill: API Design Patterns

Material de referencia declarativo para agentes T-BIT. No ejecuta codigo.

## Patrones

1. **Recursos y nombres**: sustantivos plurales en rutas, jerarquia maxima de dos niveles, acciones no CRUD como subrecursos.
2. **Versionado**: version en la ruta (`/v1/`) o cabecera; nunca romper contratos publicos.
3. **Errores**: cuerpo de error estable con codigo legible por maquina, mensaje humano y detalles; usar HTTP status correctos.
4. **Paginacion**: cursor o pagina/limite; siempre limitar por defecto.
5. **Idempotencia**: PUT/DELETE idempotentes; claves de idempotencia para POST de pago/creacion critica.
6. **Validacion**: rechazar temprano con 400 y detalle de campo; nunca confiar en el cliente.

## Formato de salida

- Tabla de endpoints propuestos: metodo, ruta, entrada, salida, errores.
- Decisiones registradas con alternativas consideradas.
