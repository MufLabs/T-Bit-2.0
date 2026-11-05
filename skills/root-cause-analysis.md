---
name: Root Cause Analysis
id: root-cause-analysis
description: Metodo declarativo de analisis de causa raiz (5 porques + evidencia) para diagnosticar fallos sin parches superficiales.
tags: [diagnostico, debugging, causa-raiz, ingenieria]
source: local
version: 1
---

# Skill: Root Cause Analysis

Material de referencia declarativo para agentes T-BIT. No ejecuta codigo.

## Procedimiento

1. Define el sintoma observable con datos (que paso, cuando, donde, con que evidencia).
2. Pregunta "por que" cinco veces, avanzando del sintoma a la causa sistematica.
3. Distingue causa raiz de condiciones contribuyentes.
4. Propón la correccion minima que elimina la causa raiz, no el sintoma.
5. Define como verificaras que la correccion funciona y como detectar una regresion.

## Reglas

- Nunca propongas un parche que solo oculte el sintoma.
- Cada afirmacion debe apoyarse en evidencia (logs, tests, lectura de codigo).
- Si falta evidencia, marcala explicitamente como hipotesis no verificada.
