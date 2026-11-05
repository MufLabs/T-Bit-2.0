# T-BIT / Q-Vault - Resumen de Fases

Fecha de actualizacion: 2026-08-11  
Fuente canonica: `docs/T-BIT_BOOK.md`  
Estado documentado: Fase 95 + actualizaciones posteriores

---

## Estado General

[x] T-BIT evoluciono desde un motor experimental de almacenamiento fisico 1:1 hacia Q-Vault OS, una boveda local cifrada, verificable y orientada a memoria persistente para humanos e IA.

[x] El motor conserva la tesis central: cada dato se escribe como Vit y Anti-Vit, con integridad, cifrado, metadata, WAL, indices y representacion visual.

[x] Q-Vault separa la experiencia de usuario normal del Modo Desarrollador. El usuario ve documentos, memorias, agentes, búsqueda y mapa limpio; la maquinaria tecnica queda en modo avanzado.

[x] La documentacion canonica vive en `docs/T-BIT_BOOK.md`. Este archivo resume las fases, pero no reemplaza el libro técnico.

---

## Fases 1-20 - Fundacion del Motor y Visualizacion

[x] Fase 1 - Motor fisico: implementa escritura y lectura fisica en `.tbit`, offsets deterministas y el concepto Vit/Anti-Vit.
[x] Fase 2 - UI 3D: agrega la visualizacion inicial con Three.js/React Three Fiber para representar datos como objetos espaciales.
[x] Fase 3 - Full-stack: integra frontend, backend Express y API local para operar el motor desde la interfaz.
[x] Fase 4 - Recuperacion: implementa lectura del dato, validacion de integridad y recuperacion desde el vacio.
[x] Fase 5 - Colapso: agrega destruccion logica/fisica mediante sobrescritura y representacion visual del colapso.
[x] Fase 6 - T-DB: introduce estructura de datos tipo dominio, coleccion e identificador.
[x] Fase 6.1 - Grafos fractales: agrega ramificaciones conceptuales para representar relaciones jerarquicas.
[x] Fase 7 - Asistente no-code: permite construir entradas estructuradas sin escribir JSON manualmente.
[x] Fase 8 - Consulta selectiva: permite consultar atributos concretos dentro de registros estructurados.
[x] Fase 9 - Hardening post-auditoria: responde a riesgos criticos con controles de colision, WAL, HMAC, limites, validaciones y mejoras de resiliencia.
[x] Fase 10 - IA Bridge: crea `ai_memoria.tbit` y endpoints para que la IA pueda guardar y consultar memoria.
[x] Fase 11 - Tiempo: incorpora contexto temporal para resolver fechas relativas y registrar timestamp.
[x] Fase 12 - Memoria computable: permite guardar ecuaciones y payloads estructurados que la IA puede reutilizar.
[x] Fase 13 - Simbolico: agrega capa de computo simbolico para formulas y expresiones.
[x] Fase 14 - Chat orquestador: implementa conversacion con IA, herramientas y memoria persistente.
[x] Fase 15 - Telemetria IA: conecta eventos del chat con rayos/lineas visuales en el canvas.
[x] Fase 16 - Fractal local: permite que un nodo actue como punto cero local para ramificaciones.
[x] Fase 17 - Compresion semantica: agrega compresion/archivado verificable y liberacion logica de regiones.
[x] Fase 18 - Sincronizacion de red: introduce endpoints anti-entropia para comparar estados entre nodos.
[x] Fase 19 - UI de red: visualiza nodos remotos, checksums y estado de sincronizacion.
[x] Fase 20 - Consenso criptografico: endurece importaciones de red con validacion HMAC y rechazo de payloads no confiables.

---

## Fases 21-35 - Memory Core, Archivos e IA

[x] Fase 21 - Memory Core: crea registros de memoria con texto, payload, tags, links, backlinks, checksum y usuario.
[x] Fase 22 - Markdown Bridge: permite importar `.md`, extraer frontmatter, wikilinks y convertir notas en memoria consultable.
[x] Fase 23 - Enlaces cruzados: agrega relaciones transversales tipo wikilink/backlink para construir grafo semantico.
[x] Fase 24 - Asset Manager: crea manejo de archivos genericos como assets vinculados a usuario y boveda.
[x] Fase 25 - Binary Asset Bridge: permite importar binarios, reconstruirlos y descargarlos de forma verificable.
[x] Fase 26 - Salud del contenedor: agrega panel de health con uso, metadata, WAL, indices, chunks, colisiones y assets.
[x] Fase 27 - Permisos IA: introduce politicas para leer, buscar, escribir, computar, borrar y confirmar borrados.
[x] Fase 28 - Cifrado en reposo: agrega AES-256-GCM obligatorio para payloads, manteniendo HMAC para integridad.
[x] Fase 29 - Query Index incremental: permite buscar por usuario, tags, tipo, texto, fecha, documento y relaciones sin escanear todo el disco.
[x] Fase 30 - Reconciliacion fisico/logica: compara metadata fisica e indice logico para detectar desalineaciones.
[x] Fase 31 - Conectores IA universales: agrega proveedores OpenAI-compatible, Gemini, Claude, Ollama, LM Studio y otros configurables.
[x] Fase 32 - Modo Zen: crea interfaz limpia para conversar con IA y memoria sin paneles técnicos.
[x] Fase 33 - Gestion de llaves AES-GCM: agrega identificador de llave activa, llaves previas y migracion de memoria IA.
[x] Fase 34 - Clean Workspace y Document Q&A: mejora experiencia limpia y consultas documentales sin exponer chunks técnicos.
[x] Fase 35 - Second Brain Workspace: introduce la pantalla orientada a usuario para memoria, documentos y mapa.

---

## Fases 36-50 - Q-Vault, Usuarios, Mapas y Robustez

[x] Fase 36 - AI Switchboard: permite seleccionar proveedor/agente y centralizar configuracion de IA.
[x] Fase 37 - T-Bit OS User Layout: reorganiza la experiencia en estilo sistema operativo local.
[x] Fase 38 - Settings Modal: crea modal de configuracion con secciones de usuario, proveedores, storage, seguridad y opciones futuras.
[x] Fase 39 - Map Preview: agrega vista previa del mapa en la interfaz limpia.
[x] Fase 40 - First Run, Perfil Local y Chat Limpio: solicita identidad inicial, usuario logico y preferencias basicas.
[x] Fase 41 - Vista Limpia de Documentos y Busqueda sin Chunks: oculta fragmentos internos para usuarios normales y muestra documentos principales.
[x] Fase 42 - Space Manager y Second Brain Map: agrega administracion de espacios T-BIT y mapa visual limpio.
[x] Fase 43 - Multi-IA Consensus, Debate y Bitacoras por Notebook: agrega modos rapido, deliberativo y critico, con bitacoras por notebook/proyecto.
[x] Fase 44 - Instancias de Agente IA: permite crear varios agentes sobre un mismo proveedor/modelo.
[x] Fase 45 - Catalogo Extensible de Proveedores IA: permite agregar proveedores nuevos sin limitarse a los visibles por defecto.
[x] Fase 46 - Correccion de Espacios, Indices y Navegacion Second Brain: corrige mezcla de usuarios/espacios y navegacion entre vistas.
[x] Fase 47 - Busqueda Semantica-Espacial: agrega embeddings y búsqueda por significado para acercar la visualizacion a clusters relevantes.
[x] Fase 48 - Guardian Observer: crea agente observador que detecta huerfanos, posibles relaciones y oportunidades de organizacion sin escribir cambios destructivos.
[x] Fase 49 - Optimizacion de Espacios Grandes y Markdown por Lotes: mejora importacion de documentos grandes, chunks y procesamiento por lotes.
[x] Fase 50 - Primer Arranque Robusto y Recreacion Segura del Vacio: endurece onboarding, recreacion y manejo de contenedores existentes.

---

## Fases 51-70 - Producto Local, UX y Herramientas

[x] Fase 51 - Espacios T-BIT por Usuario y Administrador de Espacios: cada usuario puede tener espacios propios y elegir cual usar.
[x] Fase 52 - Auditoria de Indices y Recuperacion Vectorial: revisa precision de recuperacion, indices y consistencia logica.
[x] Fase 53 - OmniWorkspace Paso 1: separa usuario normal de modo técnico y reduce carga visual.
[x] Fase 54 - Universal Dropzone: permite arrastrar archivos a la interfaz para importarlos sin paneles técnicos.
[x] Fase 55 - Modo Desarrollador: mueve paneles técnicos a una zona avanzada.
[x] Fase 56 - Vista Limpia Visible: restaura y estabiliza la vista limpia cuando la separacion de modos ocultaba informacion.
[x] Fase 57 - Sidebar Colapsable, Historial y Carga Visible: agrega historial, carga de archivos y agentes en sidebar.
[x] Fase 58 - Extractor Universal v1 y Documento Visible: importa documentos usando extractores y crea representacion visible.
[x] Fase 59 - Indice Consultable Enriquecido y Resolver Documental Selectivo: permite localizar fragmentos documentales relevantes y responder sin exponer chunks.
[x] Fase 60 - Extractores Reales PDF, DOCX y XLSX: extrae texto consultable desde formatos comunes y conserva el asset original.
[x] Fase 61 - Carpeta de Boveda Configurable y Espacios Persistentes: permite elegir carpeta de boveda y recordar ubicacion.
[x] Fase 62 - Render 3D Limpio de Second Brain: agrega mapa visual orientado a usuario sin toda la maquinaria tecnica.
[x] Fase 63 - Second Brain Full-Viewport: elimina confinamiento innecesario y aprovecha mejor la pantalla.
[x] Fase 64 - Modo Desarrollador Real: consolida Quantum Engine, health, AES, permisos, chunks, WAL e indices técnicos en modo avanzado.
[x] Fase 65 - Gestion de Usuario y Boveda: mejora usuario local, seleccion de boveda, carpeta y espacios.
[x] Fase 66 - Gestion de Memoria Visible: agrega opciones para borrar documentos/dependencias, conversaciones, notebooks y nodos seleccionados.
[x] Fase 67 - Auto Scroll del Chat: asegura que el chat baje automaticamente al recibir respuesta.
[x] Fase 68 - Renombramiento a Q-Vault: actualiza marca visible a Q-Vault y Q-Vault OS.
[x] Fase 69 - Registro Local de Usuario y Vinculo Usuario/Boveda: crea cuenta local con nombre, usuario, email opcional y vinculo a espacios T-BIT.
[x] Fase 70 - T-BIT Web Research Tool: agrega herramienta de investigacion web controlada, evitando descargar ruido excesivo de paginas.

---

## Fases 71-95 - Estabilizacion, Escala y Code Intelligence

[x] Fase 71 - Q-Vault Map Render Estable, Anti-V Visible y Borrado de Memorias IA: estabiliza mapa, anti-vits y borrado de memorias.
[x] Fase 72 - Render Seguro de Codigo en Respuestas IA: corrige ocultamiento indebido de código seguro y evita mostrar marcadores confusos.
[x] Fase 73 - Correccion Visual Q-Vault Map y Seleccion de Memorias: mejora seleccion de nodos y visualizacion en Q-Vault.
[x] Fase 74 - Limpieza de Superposicion en Quantum Engine: corrige columnas/paneles montados uno sobre otro.
[x] Fase 75 - Limpieza de Marcadores Heredados de Codigo: elimina residuos visuales de respuestas tecnicas omitidas.
[x] Fase 76 - Control Claro de Agentes Multi-IA: mejora activacion, estado y seleccion de agentes.
[x] Fase 77 - Prueba Robusta de Proveedores Locales OpenAI-Compatible: agrega timeouts y diagnosticos para Ollama/LM Studio.
[x] Fase 78 - Estabilizacion Q-Vault / Quantum Engine: corrige pantallas negras, render y rutas entre modos.
[x] Fase 79 - Optimizacion Visual Q-Vault: simplifica interfaz, reduce ruido y mejora jerarquia visual.
[x] Fase 80 - Configuracion Consolidada Q-Vault: agrupa usuario, bovedas, proveedores, permisos, notebooks, seguridad y apariencia.
[x] Fase 81 - Rendimiento Visual y Capas Q-Vault: no renderiza chunks por defecto, agrega filtros de capas y prepara LOD/instancing.
[x] Fase 82 - Reparacion del Pantallazo Negro en Q-Vault: corrige error de render que dejaba la pantalla vacia.
[x] Fase 83 - Mapa Q-Vault Interactivo: agrega seleccion por click, enfoque y acciones sobre nodos.
[x] Fase 84 - Q-Vault 3D Limpio: agrega orbit/zoom/pan y visualizacion 3D limpia para documentos/memorias sin copiar Quantum Engine completo.
[x] Fase 85 - Limpieza Transaccional de Imports Fallidos: evita que importaciones fallidas dejen chunks huerfanos permanentes.
[x] Fase 86 - Importacion Grande en Background y Chunks Adaptativos: agrega progreso, procesamiento en background, chunks adaptativos y rollback.
[x] Fase 87 - Cuotas Dinamicas por Tamano de Boveda: reemplaza limites MVP rigidos por cuotas proporcionales al espacio configurado.
[x] Fase 88 - Manifiestos Binarios Compactos: evita guardar manifiestos enormes como un solo payload que exceda limite.
[x] Fase 89 - Manifiestos Markdown Compactos y Chunking Seguro: reduce inflacion de payloads Markdown y mejora reconstruccion.
[x] Fase 90 - Clasificacion Segura de Archivos y Etiquetas Legibles: evita mostrar bytes cifrados o nombres ilegibles al usuario.
[x] Fase 91 - Ocultamiento Visual de Chunks Internos: oculta chunks por defecto para evitar colapso visual del mapa.
[x] Fase 92 - Memoria Conversacional Visible y Herramientas Invisibles: guarda conversaciones como memoria visible y oculta tool-calls tecnicas.
[x] Fase 93 - Conversaciones No Destructivas, Errores IA Legibles y Chats en Q-Vault: permite borrar de la vista sin perder necesariamente memoria, mejora errores y muestra chats en Q-Vault.
[x] Fase 94 - Q-Vault Code Graph Extractor v1: analiza archivos de código, imports, exports, funciones, clases y rutas simples sin tocar el motor fisico.
[x] Fase 95 - Controles de Code Graph e importacion transparente: agrega controles de analisis de código, configuracion ON/OFF y resumen transparente al usuario.

---

## Actualizaciones Posteriores a Fase 95

[x] Diagnostico y compatibilidad Gemini / Ollama Local: documenta causas y mitigaciones para errores de Gemini, modelos inexistentes, base URLs incorrectas y proveedores locales.
[x] Timeout local para Ollama / LM Studio: agrega timeout controlado para evitar que proveedores locales congelen la experiencia.
[x] Timeout del boton Probar IA para proveedores locales: valida que `Probar IA` no quede indefinidamente bloqueado.
[x] Eliminacion de usuario local y onboarding de cuenta: agrega flujo para eliminar usuario local y documenta la diferencia entre usuario, boveda y API key local.

---

## Estado Actual de Capacidades

[x] Almacenamiento: Vit/Anti-Vit, frame, metadata, HMAC, AES-256-GCM, WAL, allocation map y borrado controlado.
[x] Documentos: Markdown, PDF, DOCX, XLSX y assets binarios con extraccion, chunking, indices y reconstruccion.
[x] IA: proveedores universales, agentes multiples, modos multi-IA, memoria conversacional, permisos y conectores locales/remotos.
[x] Busqueda: Query Index incremental, búsqueda documental selectiva, búsqueda semantica-espacial y relaciones.
[x] Visualizacion: Quantum Engine técnico y Q-Vault limpio con mapa 3D de documentos, memorias, anti-vits y enlaces.
[x] Seguridad: API key local, HMAC, cifrado en reposo, llaves AES, permisos IA, validaciones y controles de red.
[x] Usuario: onboarding local, bovedas por usuario, carpeta configurable, gestion de espacios y eliminacion de usuario local.
[x] Producto: separacion usuario normal / modo desarrollador, dropzone universal, interfaz Q-Vault OS y documentacion consolidada.

---

## Pendientes Relevantes

[ ] Empaquetado desktop final para Windows/macOS con instalador, firma y servicio local robusto.
[ ] Gestion profesional completa de secretos para multiples usuarios reales, recuperacion de cuenta y rotacion avanzada.
[ ] Servicio en segundo plano para Guardianes del Vacio fuera del modo dev.
[ ] Optimizacion 3D avanzada con instanced meshes, LOD y particiones espaciales para miles de nodos.
[ ] Extractores semanticos mas profundos para repositorios completos, llamadas entre funciones y dependencias circulares.
[ ] Flujo movil posterior, una vez consolidado desktop.

---

## Nota de Mantenimiento

Este resumen sustituye los archivos de resumen anteriores incompletos dentro de `docs`.
Para detalles técnicos, decisiones, endpoints, verificaciones y advertencias, consultar siempre `docs/T-BIT_BOOK.md`.

## Actualizacion - Correccion de idioma y codificación de interfaz

[x] Se corrigieron cadenas mojibake en `src/App.tsx` que mostraban caracteres rotos en español.
[x] Se normalizaron etiquetas visibles de Q-Vault para reducir mezcla innecesaria ingles/español.
[x] Se conservaron identificadores técnicos que no deben traducirse, como `America/Bogota`.
[x] Verificación ejecutada: búsqueda de mojibake, `npm run build` y `npm run logic:build`.

## Actualización 2026-08-11 - Corrección de idioma en Ajustes

- [x] Normalizadas cadenas visibles del modal de configuración que mezclaban inglés y español.
- [x] Conectado el selector de idioma al estado persistente local.
- [x] English queda deshabilitado como pendiente hasta implementar i18n completo.
- [x] Build frontend y build lógico verificados correctamente.

---

## Nota de vigencia (2026-10-07)

Este resumen refleja el estado del proyecto a la fecha de su ultima actualizacion
(2026-08-11, Fase 95). Los cambios posteriores no se registran aqui: el registro
unico de cambios vigente es ``docs/CHANGELOG.md`` y la referencia tecnica
actualizada es ``docs/T-BIT_BOOK.md`` (seccion "Actualizacion 2026-10-07").
