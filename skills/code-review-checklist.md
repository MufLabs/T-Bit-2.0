---
name: Code Review Checklist
id: code-review-checklist
description: Checklist declarativo para revisiones de codigo sistematicas: correctitud, seguridad, rendimiento, legibilidad y pruebas.
tags: [code-review, calidad, seguridad, testing]
source: local
version: 1
---

# Skill: Code Review Checklist

Material de referencia declarativo para agentes T-BIT. No ejecuta codigo.

## Procedimiento

1. **Correctitud**: verifica que la logica cumple el requisito; busca casos borde y estados nulos.
2. **Seguridad**: entradas no confiables, secretos en codigo, permisos, inyeccion, manejo de errores que filtre informacion.
3. **Rendimiento**: I/O en bucles, N+1, memoria retenida, complejidad algoritmica.
4. **Legibilidad**: nombres, tamano de funciones, duplicacion, coherencia con el estilo del proyecto.
5. **Pruebas**: cobertura de casos borde, tests que fallen antes del arreglo y pasen despues.

## Formato de salida

- Lista de hallazgos ordenada por severidad (bloqueante / mayor / menor / nota).
- Para cada hallazgo: archivo, linea aproximada, problema, sugerencia concreta.
- Veredicto final: aprobado / aprobado con observaciones / cambios requeridos.
