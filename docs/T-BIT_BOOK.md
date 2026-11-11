# T-BIT CORE v1.1

## Libro Tecnico Maestro del Sistema T-BIT 3D

**Version del documento:** 2026-05-26  
**Version del package:** 1.1.0  
**Estado:** MVP avanzado de escritorio, endurecido post-auditoria  
**Stack:** TypeScript, Node.js, Express, React, Vite, TailwindCSS, Three.js, React Three Fiber  
**Contenedores principales:** `data/spaces/<usuario>/universo.tbit` y `data/spaces/<usuario>/ai_memoria.tbit`

---

# 1. Resumen Ejecutivo

T-BIT CORE es un sistema experimental de almacenamiento, memoria verificable y visualizacion 3D para datos humanos e IA. Su objetivo no es reemplazar SQL, PostgreSQL, MongoDB o un filesystem industrial. Su objetivo es ofrecer una alternativa verificable y visual para guardar contexto, documentos, assets y memoria de IA en un contenedor fisico determinista.

La tesis del proyecto es:

```text
Hacer visible, verificable y gobernable la informacion que una IA y un usuario acumulan con el tiempo.
```

El sistema escribe bytes reales en disco, calcula posiciones deterministas, genera dato y anti-dato, valida integridad, muestra los nodos en un espacio 3D y permite que una IA use ese espacio como memoria persistente.

## Posicionamiento

El posicionamiento correcto del proyecto es:

```text
Spatial Data Integrity Engine
AI Memory Core
Observable Storage Architecture
3D Deterministic Data Visualization System
```

T-BIT es especialmente fuerte para:

- memoria persistente de IA,
- bodega verificable de contexto,
- visualizacion espacial de conocimiento,
- importacion de Markdown y assets,
- educacion en hashing, offsets, integridad y almacenamiento,
- auditoria local de datos y relaciones.

---

# 2. Conceptos Principales

## Vit

Un **Vit** es un **Vectorial Bit**. Representa una unidad de informacion compuesta por:

- dato original `V`,
- anti-dato `Anti-V`,
- offset fisico del dato,
- offset fisico del anti-dato,
- coordenada visual 3D,
- coordenada visual opuesta.

El Vit no es solo un valor. Es una relacion fisica y visual.

## Anti-Dato

El anti-dato se genera invirtiendo cada byte del payload fisico almacenado. En la arquitectura limpia actual, el anti-dato se calcula sobre el ciphertext AES-GCM, no sobre texto plano:

```text
antiByte = ~byte & 0xff
```

Al leer, el motor valida:

```text
(V + Anti-V + 1) & 0xff = 0
```

Esto detecta corrupcion accidental entre dato y anti-dato. La integridad criptografica adicional se refuerza con SHA-256, HMAC en metadata y autenticacion AES-256-GCM.

## Vacio Digital

El vacio digital es el archivo `.tbit`. Se inicializa con bytes `0x00` y luego recibe frames fisicos auto-descriptivos:

```text
[TBIT][length][payload]
```

Cada dato tiene su frame y cada anti-dato tambien. El `payload` debe ser un bloque cifrado:

```text
[TBENC1][version][nonce AES-GCM][authTag AES-GCM][ciphertext]
```

## Singularidad

La singularidad visual `[0,0,0]` representa el origen del algoritmo maestro. Los Vits orbitan alrededor de ella segun coordenadas derivadas del offset fisico.

---

# 3. Arquitectura General

## Capas

```text
Frontend React/Three.js
        |
        v
API Express local
        |
        v
TBitStorageService
        |
        v
TBitContainer / .tbit fisico
```

## Frontend

Archivo principal:

```text
src/App.tsx
```

Responsabilidades:

- renderizar el vacio 3D,
- mostrar singularidad, Vits y Anti-Vits,
- operar modo raw, T-DB y asistente no-code,
- recuperar y colapsar datos,
- mostrar logs,
- operar consola IA,
- alternar universo usuario / universo IA,
- cargar grafo de memoria,
- importar Markdown,
- importar assets binarios,
- mostrar salud del contenedor,
- gestionar permisos IA,
- consultar Query Index,
- administrar assets completos.

Componentes principales:

```text
src/components/ContainerHealthPanel.tsx
src/components/AiPermissionsPanel.tsx
src/components/TBitNetworkPanel.tsx
src/components/QueryIndexPanel.tsx
src/components/AssetManagerPanel.tsx
src/components/BinaryAssetPanel.tsx
src/components/MemoryGraphPanel.tsx
src/components/MarkdownImportPanel.tsx
src/components/WikiLinksMesh.tsx
src/components/NetworkTopologyView.tsx
```

## Backend

Archivo principal:

```text
server.ts
```

Responsabilidades:

- API REST local,
- autenticacion con `x-tbit-api-key`,
- rate limiting,
- body JSON hasta 25 MB,
- operaciones raw sobre `universo.tbit`,
- memoria IA sobre `data/ai_memoria.tbit`,
- Memory Core,
- Markdown Bridge,
- Binary Asset Bridge,
- Asset Manager,
- Query Index,
- permisos IA,
- salud del contenedor,
- sincronizacion de red,
- compresion semantica,
- simbolico/computable.

## Motor fisico

Archivos:

```text
TBitFileSystem.ts
TBitStorageService.ts
AllocationMap.ts
```

Responsabilidades:

- crear contenedor,
- escribir frames,
- calcular offsets,
- generar dato/anti-dato,
- leer y validar suma cero,
- destruir con zero-fill,
- evitar colisiones,
- resolver colisiones con probing,
- firmar metadata con HMAC,
- WAL, locks, snapshots, rollback y replica.

---

# 4. Motor Fisico Endurecido

## Header fisico del contenedor

Cada contenedor incluye:

```text
[magic: TBITFS1][salt: 32 bytes]
```

El salt evita que el espacio de direcciones sea trivialmente precomputable desde fuera.

## Frame inline

Cada registro fisico se guarda como:

```text
[magic: TBIT][length uint32 LE][payload]
```

Esto hace al bloque auto-descriptivo.

## Cifrado AES-256-GCM en reposo

Los payloads se cifran antes de entrar al frame fisico. El flujo actual es:

```text
texto normalizado UTF-8
        |
        v
AES-256-GCM con nonce aleatorio de 12 bytes
        |
        v
[TBENC1][version][nonce][authTag][ciphertext]
        |
        v
frame V y frame Anti-V
```

Propiedades:

- el texto plano no queda escrito directamente en el `.tbit`;
- el anti-dato se calcula sobre el payload cifrado;
- AES-GCM valida autenticidad del ciphertext al descifrar;
- SHA-256 sigue validando el dato recuperado contra metadata;
- HMAC firma la metadata;
- si un payload fisico no contiene marcador `TBENC1`, el motor lo rechaza como formato no valido para la arquitectura actual.

La clave se toma de:

```text
TBIT_ENCRYPTION_SECRET
```

Si esa variable no existe o tiene menos de 32 caracteres, el motor rechaza la operacion. `npm run setup:secret` crea esta variable en instalaciones nuevas y la agrega a `.env` existente sin alterar las llaves previas.

Metadata nueva:

```text
physicalLength
authVersion: 2
encryption: AES-256-GCM
```

`physicalLength` evita que el Allocation Map subestime el espacio fisico cuando el cifrado agrega nonce, auth tag y cabecera interna.

## Hashing y PI

El offset nace de:

```text
SHA256(salt + clave)
BigInt(hash) * PI
mod usableContainerBytes
```

El sistema usa una aproximacion de PI de alta precision escalada con BigInt.

## Coordenadas 3D

Los offsets se proyectan a coordenadas `[x,y,z]`. El anti-dato se representa en la coordenada opuesta:

```text
antiCoordinates = -coordinates
```

## Lectura circular

Si un frame cae cerca del final del archivo, el motor continua desde el inicio util del contenedor. Esto convierte el contenedor en un espacio cerrado.

## Allocation Map

`AllocationMap.ts` reconstruye regiones ocupadas desde metadata y evita overlap entre:

- V de la misma clave,
- Anti-V de la misma clave,
- V/Anti-V de otras claves.

## Probing determinista

Si el offset primario colisiona, el sistema busca una region alternativa de forma determinista. La metadata guarda:

```text
offsetV
offsetAntiV
probingAttempts
```

## WAL

El WAL registra:

```text
PENDING
COMMITTED
ABORTED
```

Archivos:

```text
universo.tbit.wal.jsonl
data/ai_memoria.tbit.wal.jsonl
```

Al iniciar, el sistema hace recovery de operaciones pendientes.

## HMAC

Cada metadata entry incluye:

```text
dataHash
authTag
authKeyId
```

La firma HMAC protege metadata contra cambios accidentales o manipulacion simple.

## Locks multi-proceso

Se usan locks atomicos:

```text
universo.tbit.lock
data/ai_memoria.tbit.lock
```

Esto reduce corrupcion por varios procesos escribiendo al mismo tiempo.

---

# 5. Seguridad y Configuracion

## .env

`npm run setup:secret` crea `.env` si no existe.

Variables relevantes:

```text
TBIT_HMAC_SECRET
TBIT_HMAC_KEY_ID
TBIT_HMAC_PREVIOUS_SECRETS
TBIT_ENCRYPTION_SECRET
TBIT_API_KEY
VITE_TBIT_API_KEY
TBIT_REMOTE_REPLICA_DIR
TBIT_LLM_API_KEY
TBIT_LLM_MODEL
TBIT_LLM_BASE_URL
```

## API Key

Toda ruta `/api` requiere:

```text
x-tbit-api-key
```

El frontend usa:

```text
VITE_TBIT_API_KEY
```

o `localStorage.tbit_api_key`.

## Cifrado de payload

`TBIT_ENCRYPTION_SECRET` controla el cifrado AES-256-GCM en reposo. Debe tener al menos 32 caracteres aleatorios. No es un identificador de usuario: es una llave local del contenedor.

Reglas:

- no se debe compartir publicamente;
- no debe guardarse en notas o payloads;
- si se pierde, los payloads cifrados no podran descifrarse;
- si se rota sin migracion, los registros cifrados con la llave anterior no podran leerse;
- snapshots y replicas necesitan conservar la misma llave para reconstruir datos.

## Rate limit

El servidor limita solicitudes por IP:

```text
120 requests / 60 segundos
```

## Limite de payload

La API acepta JSON de hasta:

```text
25 MB
```

El limite por Vit sigue siendo:

```text
65536 bytes
```

Los documentos grandes y binarios se dividen en chunks.

---

# 6. API REST

## Raw T-BIT

```text
POST   /api/inyectar
POST   /api/recuperar
DELETE /api/colapsar
POST   /api/snapshot
POST   /api/rollback
GET    /api/auditoria/checksum
POST   /api/exportar
POST   /api/importar
```

## IA

```text
POST   /api/ai/inject
POST   /api/ai/oracle
POST   /api/ai/symbolic
POST   /api/ai/chat
DELETE /api/ai/chat/:sessionId
POST   /api/ai/compress
GET    /api/ai/permissions
POST   /api/ai/permissions
```

## Red / anti-entropia

```text
GET  /api/network/state
POST /api/network/export-record
POST /api/network/import-record
POST /api/network/compare
```

## Memory Core

```text
POST /api/memory/remember
POST /api/memory/recall
POST /api/memory/context
POST /api/memory/links
GET  /api/memory/graph
```

## Query Index

```text
GET  /api/query/stats
POST /api/query/rebuild
POST /api/query/search
```

## Salud

```text
GET /api/health/container
```

## Asset Manager

```text
GET    /api/assets/list
GET    /api/assets/stats
POST   /api/assets/delete
DELETE /api/assets/delete
```

## Binary Asset Bridge

```text
POST /api/assets/import-binary
POST /api/assets/reconstruct-binary
POST /api/assets/delete-binary
```

## Markdown Bridge

```text
POST   /api/markdown/preview
POST   /api/markdown/import
POST   /api/markdown/reconstruct
GET    /api/markdown/list
DELETE /api/markdown/delete
POST   /api/markdown/purge-orphans
DELETE /api/markdown/purge-orphans
```

---

# 7. Frontend y Experiencia 3D

## Modos de entrada

### Raw

Campos:

```text
Dato Clave
Carga de Datos
```

Uso:

- pruebas directas,
- mensajes simples,
- demo de inyeccion, recuperacion y colapso.

### T-DB

Campos:

```text
Dominio / Nodo Raiz
Coleccion / Tabla
Identificador / ID
Documento JSON
```

Genera:

```text
Dominio::Coleccion::Identificador
```

### Asistente No-Code

Permite construir JSON con filas dinamicas:

```text
atributo -> valor
```

Luego ensambla e inyecta sin que el usuario escriba JSON.

## Recuperacion

El boton `RECUPERAR DEL VACIO` llama `/api/recuperar`, valida suma cero y muestra el contenido.

## Colapso

El boton `COLAPSAR DATO` llama `/api/colapsar` y elimina visualmente Vit y Anti-Vit.

## Consulta de atributos

Permite recuperar un JSON por clave y extraer una propiedad especifica.

## Visual

La escena usa:

- fondo oscuro,
- grid visible amarillo/cian,
- origen luminoso,
- Vits con colores vivos,
- Anti-Vits rojos,
- lineas dato/anti-dato,
- grafo fractal,
- enlaces cruzados,
- anti-archivo,
- seleccion por mouse.

Colores actuales destacados:

```text
Dato manual: #7e1bfd
Anti-dato manual: #ff0000
Markdown/documento: azul/cian
Chunks: ambar
Enlaces semanticos: purpura
```

---

# 8. Memoria IA y Oraculo Cognitivo

## Contenedor IA

La memoria IA vive en:

```text
data/ai_memoria.tbit
```

Tiene su propia metadata, WAL, lock, snapshots, exports y replica.

## Chat IA

El panel `T-BIT AI Cognitive Bridge` permite escribir instrucciones naturales:

```text
recuerda que manana es mi cumpleanos
consulta cuando es mi cumpleanos
```

Si no hay proveedor LLM configurado, usa `DeterministicTBitProvider`. Si hay configuracion OpenAI-compatible, usa:

```text
TBIT_LLM_API_KEY
TBIT_LLM_MODEL
TBIT_LLM_BASE_URL
```

## Herramientas IA

Herramientas principales:

```text
memorizar_en_vacio
consultar_oraculo
buscar_indice_tbit
resolver_ecuacion
operar_simbolicamente
eliminar_memoria
```

## Prompt temporal

El sistema inyecta contexto temporal en America/Bogota para resolver expresiones como:

```text
hoy
manana
ayer
proximo lunes
en 3 dias
```

## Permisos IA

Archivo:

```text
data/ai-permissions.json
```

Panel:

```text
T-BIT AI PERMISSIONS
```

Controla:

- puede leer,
- puede buscar,
- puede escribir,
- puede computar,
- puede borrar,
- requiere confirmacion para borrar,
- maximo de bytes por escritura IA,
- prefijos permitidos,
- prefijos bloqueados.

Estado seguro por defecto:

```text
Leer: ON
Buscar: ON
Escribir: ON
Computar: ON
Borrar: OFF
Confirmar borrado: ON
```

Prefijos bloqueados por defecto:

```text
Sistema::Secretos
Security::Secrets
TBIT::Secrets
```

---

# 9. Memory Core

Archivo:

```text
memoryCore.ts
```

Indice:

```text
data/memory-core-index.json
```

Responsabilidades:

- registrar memorias por usuario,
- guardar texto y payload,
- calcular checksum,
- extraer links,
- mantener backlinks,
- construir contexto,
- alimentar grafo visual.

Formato conceptual:

```json
{
  "key": "Usuario::Perfil::Andres",
  "userId": "andres",
  "text": "Andres trabaja en [[Proyecto::TBit::Core]]",
  "payload": {},
  "tags": ["perfil"],
  "links": ["Proyecto::TBit::Core"],
  "backlinks": [],
  "source": "demo"
}
```

## Wikilinks

T-BIT soporta enlaces tipo Obsidian:

```text
[[Proyecto::TBit::Core]]
```

El grafo visual dibuja enlaces cruzados entre nodos.

---

# 10. Markdown Bridge

Archivo:

```text
markdownBridge.ts
```

Panel:

```text
T-BIT MARKDOWN BRIDGE
```

Soporta:

- importacion de `.md`,
- frontmatter simple,
- tags,
- wikilinks,
- chunking automatico,
- reconstruccion,
- listado,
- borrado completo,
- limpieza de chunks huerfanos.

## Markdown grande

Si el Markdown excede el limite por Vit, se divide en:

```text
Markdown::Usuario::Documento
Markdown::Usuario::Documento::chunk_0001
Markdown::Usuario::Documento::chunk_0002
...
```

El nodo raiz es el manifiesto. Los chunks son dependencias.

## Borrado correcto

Al borrar un Markdown se elimina:

- manifiesto,
- chunks,
- links logicos,
- registros del indice,
- asset registrado.

También existe limpieza de chunks huerfanos.

---

# 11. Asset Manager

Archivo:

```text
assetManager.ts
```

Indice:

```text
data/asset-index.json
```

Panel:

```text
T-BIT ASSET MANAGER
```

Concepto:

```text
Un asset es una unidad completa: documento, archivo, dataset o binario con dependencias.
```

Cada asset registra:

- `assetKey`,
- `rootKey`,
- `userId`,
- `type`,
- `title`,
- `filename`,
- `dependencies`,
- `bytes`,
- `status`.

El Asset Manager permite borrar una unidad completa sin obligar al usuario a conocer claves internas.

---

# 12. Binary Asset Bridge

Archivo:

```text
binaryAssetBridge.ts
```

Panel:

```text
T-BIT BINARY ASSET BRIDGE
```

Permite cargar:

- imagenes,
- audio,
- video,
- PDF,
- ZIP,
- ejecutables pasivos,
- cualquier archivo generico.

## Modelo

```text
Asset::Usuario::Archivo
Asset::Usuario::Archivo::chunk_0001
Asset::Usuario::Archivo::chunk_0002
...
```

El archivo se guarda como:

- manifiesto,
- chunks Base64,
- SHA-256 del archivo original,
- metadata de tipo y MIME.

## Reconstruccion

La reconstruccion:

1. recupera manifiesto,
2. lee chunks,
3. concatena bytes,
4. recalcula SHA-256,
5. descarga el archivo original.

## Ejecutables

Los ejecutables se almacenan como archivos pasivos. T-BIT no ejecuta `.exe`, `.bat`, `.cmd`, `.msi` ni scripts.

---

# 13. Query Index

Archivo:

```text
queryIndex.ts
```

Indice:

```text
data/query-index.json
```

Panel:

```text
T-BIT QUERY INDEX
```

Permite buscar por:

- texto,
- usuario,
- source,
- tags,
- documento,
- atributo,
- valor,
- fecha.

Esto complementa el acceso O(1) por clave. La clave sigue siendo el acceso directo; Query Index permite descubrimiento cuando no se conoce la clave exacta.

Estado actual:

- existe reconstruccion manual,
- existe búsqueda eficiente sobre indice,
- pendiente: actualizacion incremental automatica en cada write/delete.

---

# 14. Memoria Computable y Simbolica

Archivos:

```text
computableMemory.ts
symbolicEngine.ts
TBitSymbolicBridge.ts
```

Soporta:

- guardar ecuaciones como JSON computable,
- expresiones LaTeX,
- variables,
- evaluacion numerica,
- operaciones simbolicas basicas,
- demo `npm run computable:demo`,
- demo `npm run symbolic:demo`.

Ejemplo:

```json
{
  "nombre": "Ecuacion de Einstein",
  "expresion_latex": "E = mc^2",
  "operacion": {
    "formula": "m * c^2"
  }
}
```

---

# 15. Compresion Semantica

Archivo:

```text
semanticCompression.ts
```

Endpoint:

```text
POST /api/ai/compress
```

Demo:

```text
npm run compression:demo
```

La compresion semantica:

- toma claves candidatas,
- crea un archivo condensado verificable,
- libera logicamente regiones originales,
- registra checksum,
- evita fingir reduccion fisica inmediata del `.tbit`.

Nota importante:

```text
El archivo .tbit puede no reducir su tamano fisico hasta una reconstruccion/export-import.
```

---

# 16. Red y Anti-Entropia

Archivo:

```text
networkSync.ts
```

Panel:

```text
T-BIT ANTI-ENTROPY MESH
```

Soporta:

- estado de nodo local,
- peers remotos,
- compare,
- export record,
- import record,
- firmas de red,
- visualizacion de nodos remotos,
- lineas de sincronizacion.

Endpoints:

```text
GET  /api/network/state
POST /api/network/compare
POST /api/network/export-record
POST /api/network/import-record
```

Uso local:

- nodo 3000,
- nodo 3001,
- frontends 5173/5174,
- peers via `localStorage.tbit_remote_peers`.

---

# 17. Panel de Salud del Contenedor

Archivo:

```text
containerHealth.ts
```

Panel:

```text
T-BIT CONTAINER HEALTH
```

Endpoint:

```text
GET /api/health/container
```

Mide:

- contenedores online/offline,
- bytes totales,
- bytes usados estimados,
- metadata records,
- chunks,
- colisiones evitadas,
- probing attempts,
- WAL pending/errors,
- indice fisico/logico,
- assets activos.

Estados:

```text
HEALTHY
WARN
CRITICAL
```

La lectura del WAL agrupa por operacion y usa el ultimo estado, para no contar `PENDING` historicos ya cerrados como error actual.

---

# 18. Permisos IA

Archivo:

```text
aiPermissions.ts
```

Panel:

```text
T-BIT AI PERMISSIONS
```

Endpoints:

```text
GET  /api/ai/permissions
POST /api/ai/permissions
```

La politica se aplica en:

```text
TBitLocalToolExecutor.ts
```

Antes de ejecutar herramientas IA, valida:

- permiso de lectura,
- permiso de búsqueda,
- permiso de escritura,
- permiso de computo,
- permiso de borrado,
- confirmacion humana para borrado,
- limite de bytes,
- prefijos permitidos,
- prefijos bloqueados.

Esto evita que el modelo tenga acceso destructivo por defecto.

---

# 19. Visualizacion Avanzada

## Vits y Anti-Vits

Cada inyeccion manual renderiza:

- esfera del dato,
- esfera del anti-dato,
- linea hacia origen o padre,
- linea dato/anti-dato.

## Grafo fractal

Claves con `::` generan jerarquia. Ejemplo:

```text
PetiusDB
PetiusDB::Usuarios
PetiusDB::Usuarios::Erika
```

El hijo se conecta al padre si existe.

## WikiLinksMesh

Los links extraidos de Markdown y Memory Core generan conexiones transversales entre nodos no necesariamente jerarquicos.

## Anti-Archivo

Para documentos Markdown y assets con chunks, el sistema puede mostrar el cluster opuesto:

- archivo,
- chunks,
- anti-archivo,
- anti-chunks,
- conexion visible entre archivo y anti-archivo.

## Seleccion por mouse

El usuario puede seleccionar nodos del grafo visual para inspeccionar o eliminar desde paneles de control.

---

# 20. Comandos de Operacion

Instalar dependencias:

```powershell
npm install
```

Crear secretos locales:

```powershell
npm run setup:secret
```

Levantar API y frontend:

```powershell
npm run dev:all
```

Build frontend:

```powershell
npm run build
```

Build logico TypeScript backend:

```powershell
npm run logic:build
```

Type-check estricto del frontend:

```powershell
npx tsc --noEmit
```

Tests (suite completa vitest, 26 tests):

```powershell
npm test
npm run test:watch
```

Inventario de agentes (regenera engineering/reports/phase-0-agent-inventory.json):

```powershell
npm run agents:inventory
```

Demos:

```powershell
npm run ai:demo
npm run computable:demo
npm run symbolic:demo
npm run memory:demo
npm run markdown:demo
npm run compression:demo
npm run network:demo
```

---

# 21. Estado de Seguridad Actual

## Ya implementado

- API key local,
- cifrado AES-256-GCM obligatorio para payloads en reposo,
- HMAC en metadata,
- salt por contenedor,
- SHA-256 por dato,
- dato/anti-dato,
- WAL,
- recovery,
- locks multi-proceso,
- rate limit,
- cuotas basicas,
- snapshots,
- rollback,
- export/import verificable,
- permisos IA,
- prefijos bloqueados,
- ejecutables pasivos.

## Pendiente para produccion real

- gestion profesional de llaves,
- rotacion/migracion de llaves de cifrado,
- auth multiusuario,
- perfiles de usuario,
- streaming binario para archivos muy grandes,
- compaction fisica real,
- Query Index incremental,
- pruebas automatizadas amplias,
- instalador desktop,
- empaquetado cross-platform,
- modo movil posterior.

---

# 22. Comparacion con SQL

T-BIT no reemplaza SQL. Cumple otro rol.

SQL es mejor para:

- transacciones ACID maduras,
- joins,
- consultas relacionales complejas,
- multiusuario,
- reportes,
- integridad referencial industrial.

T-BIT es mejor para:

- memoria persistente de IA,
- contexto verificable,
- objetos/documentos/assets,
- visualizacion espacial,
- borrado por asset,
- trazabilidad conceptual,
- integridad fisica demostrable,
- links y backlinks estilo segundo cerebro.

La ruta de producto recomendada es:

```text
No competir como SQL.
Ser una bodega verificable de memoria y contexto para usuarios e IA.
```

---

# 23. Registro de Fases Implementadas

## Fase 1 - Motor fisico

- `TBitContainer`,
- archivo `.tbit`,
- zero-fill,
- dato/anti-dato,
- suma cero.

## Fase 2 - UI 3D

- React/Vite,
- Three.js,
- singularidad,
- OrbitControls,
- Vits.

## Fase 3 - Full-stack

- Express,
- `/api/inyectar`,
- `/api/recuperar`,
- `dev:all`.

## Fase 4 - Recuperacion

- boton recuperar,
- validacion,
- datos recuperados,
- zoom visual.

## Fase 5 - Colapso

- `destroy`,
- `/api/colapsar`,
- zero-fill,
- eliminacion visual.

## Fase 6 - T-DB

- claves `Dominio::Coleccion::ID`,
- formulario jerarquico,
- JSON payload.

## Fase 6.1 - Grafos fractales

- padre/hijo,
- lineas V,
- lineas Anti-V.

## Fase 7 - Asistente no-code

- atributos dinamicos,
- JSON invisible,
- carga repetitiva.

## Fase 8 - Consulta selectiva

- atributo especifico,
- parseo JSON,
- resultado destacado.

## Fase 9 - Hardening post-auditoria

- frames inline,
- salt,
- allocation map,
- probing,
- WAL,
- HMAC,
- locks,
- snapshots,
- rollback,
- export/import,
- replica.

## Fase 10 - IA Bridge

- `TBitAiBridge`,
- `ai_memoria.tbit`,
- `/api/ai/inject`,
- `/api/ai/oracle`.

## Fase 11 - Tiempo

- resolucion temporal,
- America/Bogota,
- fechas absolutas.

## Fase 12 - Memoria computable

- ecuaciones JSON,
- LaTeX,
- formulas evaluables.

## Fase 13 - Simbolico

- operaciones simbolicas basicas,
- `/api/ai/symbolic`.

## Fase 14 - Chat orquestador

- `TBitChatEngine`,
- proveedor deterministic/OpenAI-compatible,
- tool calling.

## Fase 15 - Telemetria IA

- rayos cognitivos,
- eventos visuales,
- estado de pensamiento.

## Fase 16 - Fractal local

- nodos raiz,
- ramificaciones,
- memoria topologica.

## Fase 17 - Compresion semantica

- condensacion verificable,
- liberacion logica,
- demo.

## Fase 18 - Sincronizacion de red

- state,
- compare,
- export/import record,
- firmas.

## Fase 19 - UI de red

- mesh anti-entropia,
- peers,
- compare/import/export desde panel.

## Fase 20 - Consenso criptografico

- validacion de firma de red,
- rechazo de payload alterado.

## Fase 21 - Memory Core

- memoria persistente,
- links/backlinks,
- contexto por usuario.

## Fase 22 - Markdown Bridge

- importacion Markdown,
- frontmatter,
- chunks,
- borrado completo.

## Fase 23 - Enlaces cruzados

- WikiLinksMesh,
- relaciones transversales,
- grafo semantico.

## Fase 24 - Asset Manager

- unidad logica completa,
- dependencias,
- borrado de assets.

## Fase 25 - Binary Asset Bridge

- imagenes,
- audio,
- video,
- PDF,
- ZIP,
- ejecutables pasivos,
- reconstruccion y descarga.

## Fase 26 - Salud del contenedor

- panel health,
- WAL real,
- espacio usado,
- indice fisico/logico.

## Fase 27 - Permisos IA

- politica local,
- panel,
- enforcement en tool executor.

## Fase 28 - Cifrado en reposo

- AES-256-GCM obligatorio para payloads nuevos,
- nonce aleatorio por escritura,
- auth tag por payload,
- anti-dato calculado sobre ciphertext,
- rechazo de payloads fisicos no cifrados,
- `physicalLength` para allocation correcto,
- `authVersion: 2` para firmar metadata extendida,
- `setup-secret` agrega `TBIT_ENCRYPTION_SECRET` sin reemplazar secretos existentes.

## Fase 29 - Query Index incremental

- `queryIndex.ts` mantiene un indice ligero derivado de `data/memory-core-index.json`,
- las escrituras y borrados de `Memory Core` sincronizan automaticamente `data/query-index.json`,
- las importaciones Markdown, chunks, assets y binarios quedan consultables sin reconstruccion manual,
- las herramientas directas de IA (`memorizar_en_vacio` y `eliminar_memoria`) ahora actualizan o limpian el indice logico,
- las búsquedas pueden filtrar por usuario, fuente, tags, documento, atributo, valor y tokens de texto,
- `getQueryIndex()` detecta cambios por fingerprint y aplica sincronizacion incremental en vez de reconstruccion ciega,
- el Query Index no reemplaza el salto determinista por clave; lo complementa para consultas semanticas y exploracion de contexto.

## Fase 30 - Reconciliacion fisico/logica

- `healthReconciliation.ts` compara metadata fisica de `ai_memoria.tbit`, `memory-core-index.json` y `query-index.json`,
- endpoint `POST /api/health/reconcile` ejecuta una reparacion conservadora,
- el panel `T-BIT CONTAINER HEALTH` incluye accion de reconciliacion desde UI,
- elimina del indice logico registros de memoria que ya no existen fisicamente,
- reconstruye backlinks de Memory Core,
- resincroniza Query Index despues de la reparacion,
- reporta registros fisicos sin indice logico sin inventar payloads ni borrar bytes fisicos,
- evita falsos positivos visuales y búsquedas fantasma cuando se borran documentos, chunks, assets o memoria IA.

## Fase 31 - Conectores IA universales

- `AiProviderFactory.ts` selecciona proveedor cognitivo desde variables de entorno,
- `UniversalAiProviders.ts` agrega conectores nativos para Gemini y Claude,
- `OpenAICompatibleProvider.ts` se mantiene para OpenAI, Grok/xAI, Qwen, Hermes, Ollama, LM Studio y servidores compatibles con `/chat/completions`,
- `TBIT_AI_PROVIDER` permite elegir `deterministic`, `openai`, `openai-compatible`, `gemini`, `claude`, `grok`, `xai`, `qwen`, `hermes`, `nous`, `ollama` o `lmstudio`,
- si no hay credenciales, T-BIT conserva el proveedor determinista local y no rompe la app,
- `GET /api/ai/provider` expone proveedor, modelo, modo local/remoto y base URL no secreta,
- `POST /api/ai/chat` usa el proveedor activo y mantiene el mismo `Memory Core`, permisos IA, tool calling y almacenamiento `.tbit`,
- la UI muestra el proveedor activo en el panel `T-BIT AI Cognitive Bridge`,
- cuando el proveedor es externo/local real, el chat usa el orquestador backend Multi-IA; cuando es determinista, conserva el flujo local existente.

Conectores ampliados:

```text
Grok/xAI:
TBIT_AI_PROVIDER=grok
XAI_API_KEY=...
XAI_BASE_URL=...
XAI_MODEL=...

Qwen:
TBIT_AI_PROVIDER=qwen
QWEN_API_KEY=...
QWEN_BASE_URL=...
QWEN_MODEL=...

Hermes:
TBIT_AI_PROVIDER=hermes
HERMES_BASE_URL=http://localhost:11434/v1
HERMES_MODEL=nous-hermes
```

La regla de diseno es no excluir ningun modelo importante: cualquier proveedor que exponga una API compatible con `/chat/completions` puede entrar por `openai-compatible` o por un alias dedicado.

### Correccion Gemini 400 / thought_signature

Gemini nativo tiene una regla adicional cuando usa herramientas:

```text
No se deben reconstruir y reenviar functionCall antiguos si no se conserva thought_signature.
```

Para evitar el error:

```text
Function call is missing a thought_signature
```

`UniversalAiProviders.ts` convierte los tool calls antiguos del historial en texto auditado antes de reenviarlos a Gemini. Asi Gemini recibe el contexto de lo que ocurrio, pero no recibe una `functionCall` reconstruida sin firma interna.

Esto no cambia:

- escritura fisica `.tbit`,
- Memory Core,
- `memorizar_en_vacio`,
- tool calling nuevo de la solicitud actual.

También se endurecio `AiProviderFactory.ts`:

- Gemini usa por defecto `https://generativelanguage.googleapis.com/v1beta`,
- si el usuario deja `Base URL` vacio, se usa el endpoint oficial,
- si se configura una URL incompleta como `https://generativelanguage.googleapis.co`, la API devuelve un error claro en lugar de un `fetch failed` opaco.

## Fase 32 - Modo Zen

- `src/App.tsx` agrega una vista limpia para usuario normal sin paneles técnicos visibles,
- conserva el mismo canvas 3D como fondo contextual,
- usa el mismo input, historial, proveedor IA activo y Memory Core del panel principal,
- permite entrar desde `T-BIT AI Cognitive Bridge` con `Entrar a Modo Zen`,
- incluye un selector flotante permanente `Vista Quantum / Modo Zen` en la parte superior para que el usuario no tenga que encontrar primero el panel técnico,
- permite volver a la vista completa con `Vista Quantum`,
- no duplica backend, no crea otro chat y no altera los flujos Raw, T-DB, Markdown, Assets, Health o Query Index,
- muestra proveedor activo, estado de procesamiento, universo visible y numero de memorias IA,
- en proveedor determinista/local, una entrada libre como `book` ejecuta búsqueda en Query Index en vez de crear una memoria accidental,
- solo guarda cuando la intencion es explicita: `recuerda`, `guarda` o `memoriza`,
- su objetivo es que usuarios no técnicos puedan conversar con la IA y usar T-BIT como cerebro persistente sin enfrentarse primero a la consola completa.

## Fase 33 - Gestion profesional de llaves AES-GCM

- `EncryptionKeyManager.ts` centraliza keyring, llave activa y llaves previas,
- `TBIT_ENCRYPTION_KEY_ID` identifica la llave activa usada para nuevas escrituras,
- `TBIT_ENCRYPTION_PREVIOUS_SECRETS` permite conservar llaves antiguas para lectura/migracion,
- los payloads nuevos usan encabezado cifrado version 2 con `keyId` embebido,
- AES-GCM autentica el encabezado del payload cifrado mediante AAD,
- los payloads version 1 siguen siendo legibles si la llave correspondiente existe en el keyring,
- `GET /api/security/encryption/status` expone estado de cifrado sin revelar secretos,
- `POST /api/security/encryption/migrate` reescribe lotes de `ai_memoria` con la llave activa,
- `scripts/setup-secret.cjs` agrega `TBIT_ENCRYPTION_KEY_ID=primary` cuando falta sin reemplazar secretos existentes,
- `.env.example` documenta rotacion y llaves previas,
- `EncryptionKeyPanel` muestra llave activa, keyring y boton de migracion por lotes desde la UI.

Proceso de rotacion recomendado:

```text
1. Guardar el secreto actual como TBIT_ENCRYPTION_PREVIOUS_SECRETS=old-id:old-secret.
2. Crear un nuevo TBIT_ENCRYPTION_SECRET.
3. Cambiar TBIT_ENCRYPTION_KEY_ID a un nuevo id, por ejemplo primary-2026-05.
4. Reiniciar la API.
5. Usar el panel T-BIT AES-GCM KEYS para migrar lotes de memoria IA.
6. Mantener la llave previa hasta confirmar que todo fue migrado y recuperable.
```

## Fase 34 - Clean Workspace y Document Q&A

Esta fase convierte el Modo Zen en el primer paso real hacia una interfaz limpia para usuario normal, sin eliminar ni romper la Vista Quantum.

Cambios implementados:

- `documentQa.ts` agrega una capa de lectura documental sobre Memory Core y Query Index,
- `POST /api/document/ask` permite preguntar sobre documentos Markdown ya importados,
- el lector documental usa Query Index para localizar el documento candidato,
- si el Markdown fue dividido en chunks, reconstruye el contenido desde el manifiesto y sus `chunk_0001`, `chunk_0002`, etc.,
- soporta preguntas estructuradas como `cual es el item 6 del book.md`,
- para items numerados busca primero el numero real del Markdown (`6.` o `6)`),
- si no existe numero directo, usa el sexto item de lista como fallback ordinal,
- si la pregunta no pide un item especifico, busca el bloque mas relevante por terminos dentro del documento,
- `src/documentQaClient.ts` conecta el frontend con `/api/document/ask`,
- Modo Zen ahora intenta responder preguntas documentales antes de caer al Query Index general o a la consulta clasica,
- preguntas como `consulta cual es el item 6 del book.md` tambien entran por Document Q&A,
- texto libre en Modo Zen sigue sin crear memorias accidentales; solo escribe si la intencion es explicita (`recuerda`, `guarda`, `memoriza`),
- el overlay Zen se reorganizo como workspace limpio con sidebar:
  - Cerebro,
  - Documentos,
  - Archivos,
  - Mapa 3D,
  - IA conectadas,
  - Seguridad,
  - Salud,
  - Ajustes,
- la sidebar muestra proveedor IA activo y modelo conectado,
- el boton `Mapa 3D` devuelve a Vista Quantum sin alterar la escena existente.

Uso esperado:

```text
Usuario: cual es el item 6 del book.md
T-BIT:
1. Busca el documento Markdown en Query Index.
2. Reconstruye el documento completo desde chunks si aplica.
3. Extrae el item numerado 6.
4. Devuelve respuesta, referencia y numero de chunks leidos.
```

Esto mejora la app porque T-BIT deja de ser solo almacenamiento/visualizacion y empieza a comportarse como cerebro documental consultable. La búsqueda del documento sigue siendo indexada; la lectura interna del documento se limita al documento seleccionado y sus chunks, evitando recorrer todo el vacio.

## Fase 35 - Second Brain Workspace

Esta fase toma como referencia visual los sistemas modernos de "second brain": una interfaz viva, limpia y centrada en memoria/IA, dejando el motor técnico T-BIT en segundo plano.

Cambios implementados:

- el modo limpio ahora inicia por defecto al abrir la aplicación,
- el switch superior se renombro a:
  - `Second Brain`,
  - `Quantum Engine`,
- `Second Brain` es la entrada principal para usuarios normales,
- `Quantum Engine` conserva la vista tecnica completa existente:
  - panel Raw,
  - T-DB,
  - Markdown,
  - Assets,
  - Health,
  - AES-GCM,
  - Query Index,
  - red,
  - grafo 3D completo,
- la vista limpia ahora usa tres zonas:
  - sidebar izquierda con navegacion y agentes IA,
  - zona central de conversacion/memoria,
  - sidebar derecha con resumen vivo del grafo,
- la sidebar izquierda muestra secciones de producto:
  - Cerebro,
  - Documentos,
  - Archivos,
  - Mapa 3D,
  - IA conectadas,
  - Seguridad,
  - Salud,
  - Ajustes,
- se muestra una lista de agentes/conectores IA:
  - T-BIT Local,
  - OpenAI,
  - Gemini,
  - Claude,
  - Grok / xAI,
  - Qwen,
  - Hermes,
  - Ollama / LM Studio,
- el proveedor IA activo se resalta visualmente,
- el area central usa lenguaje de usuario:
  - "Tu memoria viva para IA",
  - "Conversa, busca documentos y guarda contexto...",
- el input inferior se mantiene como punto de control principal,
- la columna derecha `Live Memory Graph` muestra:
  - Vits visibles,
  - universo activo,
  - nodos recientes,
  - coordenadas resumidas,
  - acceso directo al mapa completo,
- al seleccionar un nodo reciente se enfoca visualmente en la escena 3D,
- no se eliminaron ni reemplazaron flujos técnicos previos; solo se reorganizo la entrada de usuario.

Objetivo de producto:

```text
T-BIT debe sentirse primero como un cerebro de usuario conectado a IA,
no como una consola de ingenieria.
```

La arquitectura queda dividida asi:

```text
Second Brain = experiencia diaria, documentos, IA, memoria, búsqueda.
Quantum Engine = auditoria, fisica del dato, seguridad, integridad y herramientas avanzadas.
```

---

# 24. Limitaciones Reconocidas

T-BIT v1.1 todavia es MVP avanzado, no producto final industrial.

Limitaciones:

- los payloads se cifran en reposo, pero la gestion de llaves todavia es local/simple,
- HMAC protege integridad de metadata; AES-GCM protege confidencialidad/autenticidad del payload cifrado,
- Query Index incremental ya existe, pero todavia no es un motor analitico distribuido ni reemplaza SQL,
- Document Q&A responde items y bloques Markdown, pero todavia no es un parser semantico completo de tablas, anexos o diagramas,
- la reconciliacion Health corrige indices logicos, pero no compacta fisicamente el archivo `.tbit`,
- archivos muy grandes requieren streaming futuro,
- `.tbit` no compacta fisicamente tras borrar,
- los conectores IA dependen de APIs o servidores locales configurados por el usuario; T-BIT no guarda llaves de proveedor desde UI todavia,
- Modo Zen es una primera capa UX; falta convertirlo en editor/consola de produccion con gestion de documentos, adjuntos y configuracion IA desde UI,
- el workspace limpio ya existe dentro de Modo Zen, pero las secciones laterales avanzadas todavia enlazan conceptualmente con paneles Quantum existentes,
- Second Brain ya es la entrada principal, pero todavia falta convertir cada seccion lateral en pantallas completas de usuario final,
- la migracion AES-GCM actual opera por lotes sobre `ai_memoria`; migracion completa de `universo.tbit` queda como tarea posterior,
- no hay instalador desktop todavia,
- ya existen espacios locales separados por usuario, pero no hay multiusuario concurrente con cuentas, roles y sesiones remotas,
- no hay permisos por cuenta mas alla de permisos IA locales,
- no hay suite amplia de tests automatizados,
- el modo movil esta pendiente.

---

# 25. Roadmap Inmediato

Prioridad recomendada:

1. Editor/document viewer nativo dentro del Second Brain Workspace.
2. Importador binario por streaming.
3. Perfiles de usuario y permisos por usuario.
4. Instalador desktop.
5. Empaquetado y primera UX no tecnica.
6. Port movil posterior.

---

# 25.1 Fase 36 - AI Switchboard

Esta fase convierte la lista de IAs del `Second Brain Workspace` en un selector real de proveedores cognitivos.

Cambios implementados:

- `AiProviderFactory.ts` ahora expone un catalogo formal de proveedores:
  - T-BIT Local,
  - OpenAI,
  - Gemini,
  - Claude,
  - Grok / xAI,
  - Qwen,
  - Hermes,
  - Ollama,
  - LM Studio,
  - OpenAI-Compatible generico.
- `GET /api/ai/providers` devuelve el catalogo completo y el proveedor activo por defecto del servidor.
- `POST /api/ai/provider/test` permite probar una IA seleccionada desde la interfaz limpia.
- `POST /api/ai/chat` acepta ahora un `provider` por request, por lo que el usuario puede cambiar de IA sin reiniciar Express ni editar `.env`.
- `src/tbitChatClient.ts` soporta catalogo, prueba de conexion y envio de mensajes con proveedor seleccionado.
- `src/App.tsx` convierte la lista `IA conectadas` en tarjetas clicables.
- La seccion `IA conectadas` muestra modelo, base URL, API key, estado de configuracion y boton `Probar IA`.
- La configuracion se guarda localmente en el navegador mediante `localStorage`, adecuada para el MVP desktop local.
- Si un proveedor no esta configurado o falla, T-BIT muestra error sin romper el Memory Core ni el modo local.

Uso esperado:

1. Abrir `Second Brain`.
2. Hacer click en `IA conectadas`.
3. Seleccionar OpenAI, Gemini, Claude, Grok, Qwen, Hermes, Ollama, LM Studio u otro compatible.
4. Pegar API key, modelo y base URL si aplica.
5. Probar conexion.
6. Usar el chat central: la IA seleccionada opera sobre el mismo Memory Core verificable de T-BIT.

Esta fase acerca T-BIT al comportamiento visto en interfaces modernas de "second brain": el usuario ve sus agentes IA conectados, cambia entre ellos con un click y conserva una memoria persistente comun.

---

# 25.2 Fase 37 - T-Bit OS User Layout

Esta fase rediseña el layout de usuario normal para acercarlo al estilo visual mostrado en las referencias de dashboards modernos de second brain, usando identidad propia bajo el nombre `T-Bit OS`.

Objetivo:

```text
El usuario normal debe sentir que entra a un Mission Control limpio, vivo y amigable, no a una consola tecnica.
```

Cambios implementados:

- `Second Brain` conserva toda la funcionalidad existente, pero cambia su piel visual hacia:
  - azul/violeta dominante,
  - paneles tipo vidrio,
  - bordes suaves,
  - tarjetas redondeadas,
  - barra lateral mas clara y usable.
- La barra lateral se reorganiza en secciones:
  - `Workspace`,
  - `Agents`,
  - `Self`.
- Los agentes IA conectados aparecen como lista clicable con iconos circulares y estado visual:
  - activo,
  - configurado,
  - pendiente de configuracion.
- El panel central se presenta como canal de streaming del agente activo:
  - titulo grande del agente,
  - pills de contexto,
  - chat principal,
  - input inferior tipo dashboard.
- El panel derecho pasa a verse como `Memory -> Obsidian Vault`, manteniendo la idea de grafo vivo, nodos recientes y acceso al mapa completo.
- `Quantum Engine` no se elimina ni se degrada; queda como vista avanzada para usuarios técnicos.

No se modifico:

- motor `.tbit`,
- cifrado AES-GCM,
- integridad dato/anti-dato,
- endpoints de almacenamiento,
- Memory Core,
- Markdown Bridge,
- Asset Manager,
- Query Index,
- AI Switchboard.

Esta fase es una mejora de usabilidad y posicionamiento: T-BIT deja de verse como laboratorio técnico en la entrada principal y empieza a sentirse como una aplicación de usuario final.

---

# 25.3 Fase 38 - Settings Modal

Esta fase agrega un modal de configuracion inspirado en interfaces tipo Obsidian, pero adaptado a T-BIT.

Objetivo:

```text
El usuario normal debe poder configurar la app desde una ventana clara, sin buscar opciones dispersas en paneles técnicos.
```

Cambios implementados:

- se agrega un modal de ajustes al hacer click en `Settings` dentro del `Second Brain Workspace`,
- el modal usa layout oscuro con:
  - barra lateral de categorias,
  - panel central de opciones,
  - boton de cierre,
  - tarjetas redondeadas,
  - toggles tipo desktop app,
  - color de acento purpura,
  - separadores limpios.
- categorias iniciales:
  - `General`,
  - `Editor`,
  - `Files and links`,
  - `Appearance`,
  - `AI providers`,
  - `Storage`,
  - `Security`,
  - `Advanced`.
- `General` incluye auto-save, idioma y estado del vault local.
- `Editor` incluye toggles de enfoque, live preview, hints del grafo, spellcheck y Markdown.
- `AI providers` muestra los proveedores conectables del AI Switchboard.
- `Storage` muestra resumen de contenedor/nodos/memorias.
- `Security` muestra confirmacion de acciones destructivas y resumen de cifrado/integridad.
- las opciones viven en estado React local para el MVP y no alteran el motor fisico.

No se modifico:

- escritura/lectura `.tbit`,
- cifrado,
- HMAC,
- Query Index,
- Memory Core,
- Markdown Bridge,
- Asset Manager,
- endpoints existentes.

Esta fase mejora la percepcion de producto y prepara la app para una configuracion completa de escritorio.

---

# 25.4 Fase 39 - Map Preview en T-Bit OS

Esta fase aclara como el usuario normal ve el mapa de archivos sin entrar inmediatamente al panel técnico.

Cambios implementados:

- el nombre visible de la app en el sidebar cambia de `Agentic OS` a `T-Bit OS`,
- el panel derecho del `Second Brain` pasa a llamarse `T-Bit Map Preview`,
- se agrega una vista previa de documentos dentro del panel derecho,
- la vista normal evita exponer detalles técnicos de bajo nivel,
- si no hay documentos, muestra una instruccion clara para importar o guardar memoria,
- debajo se mantiene la lista `Files / documents`,
- el boton ahora dice `Abrir mapa 3D completo` y lleva al `Quantum Engine`.

Interpretacion de producto:

```text
T-Bit OS muestra una vista previa simple del mapa para usuarios normales.
Quantum Engine conserva el mapa completo, técnico e interactivo.
```

Esto evita que el usuario normal pierda contexto: ve que existe un mapa de archivos desde la pantalla principal, y solo entra al motor 3D completo cuando necesita explorarlo a profundidad.

---

# 25.5 Fase 40 - First Run, Perfil Local y Chat Limpio

Esta fase convierte el primer uso de la aplicación en un flujo entendible para usuarios normales.

Problemas corregidos:

- el sistema no solicitaba identidad local al primer arranque,
- las memorias se guardaban bajo claves genericas como `Usuario::...`,
- el chat mostraba datos técnicos que no ayudan al usuario final,
- el cuadro de entrada podia quedar empujado hacia abajo en pantallas con mucho contenido,
- las IAs podian seleccionarse, pero no habia una forma clara de limpiar/cambiar su configuracion.

Cambios implementados:

- se agrega perfil local persistente en `localStorage` bajo `tbit_user_profile`,
- el primer arranque abre un modal de configuracion con:
  - nombre visible,
  - ID local T-BIT,
  - tamano preferido del vacio cuantico: 1 GB, 2 GB, 5 GB o 10 GB.
- el ID local se usa como raiz logica para memorias de usuario:

```text
Antes: Usuario::Memoria::Tema
Ahora: <usuario_activo>::Memoria::Tema
```

- el perfil puede editarse desde `Settings -> General -> Perfil local`,
- el panel `Storage` muestra el tamano preferido del contenedor,
- el sidebar muestra el usuario activo,
- el encabezado central muestra `Local · Bogotá · <usuario_activo>`.
- el panel `T-Bit Map Preview` muestra el nombre real del vault:
  - `<Nombre> Vault` para el universo de usuario,
  - `<Nombre> AI Mem` para la memoria IA.
- el preview normal ahora reutiliza el `Memory Graph` cargado desde Quantum Engine cuando no hay Vits vivos de la sesion,
- `T-Bit Map Preview` deja de aparecer vacio si ya se cargo un grafo Markdown/memoria,
- `Markdown Bridge` y `Memory Graph` toman por defecto el usuario activo del perfil local para evitar mezclar `usuario_local` con el usuario real.

Mejoras de chat:

- las respuestas de búsqueda ya no muestran claves internas, chunks ni offsets,
- las respuestas de documentos muestran la respuesta y una fuente legible, no metadata tecnica,
- `Hola Gemini` o mensajes conversacionales se envian al proveedor IA seleccionado cuando no es `T-BIT Local`,
- `T-BIT Local` sigue actuando como modo deterministico: buscar, consultar, guardar y recuperar desde el Memory Core,
- el input queda fijo como zona inferior del panel central y el historial ocupa el espacio desplazable.

Gestion de IA:

- el AI Switchboard mantiene seleccion de proveedor,
- cada proveedor conserva modelo, base URL y API key local,
- se agrega `Limpiar configuracion` para borrar la configuracion local del proveedor seleccionado,
- el chat envia el `userId` activo al backend cuando se usa una IA remota/local,
- si una IA usa herramientas y genera una clave `Usuario::...`, el backend la reescribe a `<usuario_activo>::...`,
- para agregar una IA no listada se usa el proveedor `OpenAI-Compatible` con:
  - modelo,
  - base URL,
  - API key.

Politica de memoria conversacional:

```text
Las respuestas normales de una IA ahora pueden guardarse automaticamente en el vacio.
El interruptor "Auto-save memory" guarda cada turno exitoso como un registro Memory Core.
```

Cuando esta opcion esta activa, T-BIT persiste:

- input del usuario,
- respuesta final de la IA,
- proveedor seleccionado,
- intencion del flujo,
- timestamp,
- clave conversacional `Usuario::Conversacion::<timestamp>::<hash>`.

El auto-guardado no bloquea la respuesta visible: si falla la persistencia, el chat sigue funcionando y se registra una advertencia interna.

Nota sobre tamano del vacio:

```text
El tamano elegido en el modal se valida contra el backend.
Si el contenedor fisico no existe, T-BIT lo crea con el tamano solicitado.
Si ya existe uno con otro tamano, T-BIT no lo sobrescribe automaticamente y devuelve advertencia explicita.
```

---

# 25.6 Fase 41 - Vista Limpia de Documentos y Busqueda sin Chunks

Esta fase corrige una fuga de abstraccion importante en el `Second Brain Workspace`.

Problema observado:

- la vista normal mostraba `chunk_0001`, `chunk_0002`, etc.,
- esos chunks son detalles fisicos internos del almacenamiento, no documentos del usuario,
- la búsqueda por archivos podia devolver fragmentos sueltos en vez de una lista clara de documentos,
- la mini vista del mapa mostraba puntos estaticos que no aportaban una accion clara al usuario normal.

Cambios implementados:

- `Second Brain` agrupa automaticamente los chunks bajo su documento raiz:

```text
Markdown::Mauricio::Pet_Matching_System::chunk_0001
Markdown::Mauricio::Pet_Matching_System::chunk_0002

se muestra como:

Pet Matching System
```

- el panel derecho cambia de una mini nube de puntos a un resumen funcional del vault,
- la lista visible ahora se llama `Files / documents`,
- los chunks solo se mencionan como `fragmentos internos agrupados`,
- la búsqueda en modo usuario agrupa resultados del `Query Index` por documento raiz,
- consultas como `Encontrar archivos de petius` devuelven documentos relacionados, no fragmentos internos,
- el `Document Q&A` sigue usando chunks cuando necesita reconstruir un archivo, pero esa complejidad queda oculta al usuario.
- la agrupacion visual queda protegida con guardas defensivas: si un nodo del grafo llega incompleto o irregular, se omite/normaliza en vez de romper la pantalla completa.

Regla de producto:

```text
Second Brain = documentos, memorias, archivos y respuestas humanas.
Quantum Engine = nodos fisicos, chunks, anti-vits y geometria tecnica.
```

Esto preserva la arquitectura fisica del motor T-BIT sin contaminar la experiencia del usuario final con detalles de bajo nivel.

---

# 25.7 Fase 42 - Space Manager y Second Brain Map

### Correccion de visualizacion Second Brain

Se corrigio el flujo de carga del mapa limpio de `Second Brain` para que no dependa de una unica forma historica del identificador de usuario.

Antes, la vista `Second Brain` intentaba cargar `/api/memory/graph` usando solo el `userId` activo. Si un documento habia sido importado anteriormente con el nombre visible del usuario, con un identificador legado o si el panel técnico `Quantum Engine` habia cargado el grafo sin filtro, el lienzo limpio podia quedar vacio aunque el sistema si tuviera nodos.

Ahora la carga del mapa usa una estrategia de resolucion acotada al usuario activo:

1. intenta cargar el grafo con `activeUserId()`;
2. si no hay nodos, intenta con `activeDisplayName()`.

La consulta global sin filtro fue retirada de `Second Brain` porque podia mostrar nodos de otro usuario o de un espacio anterior. Esto preserva la privacidad de contexto del usuario activo y mantiene intacto el renderizado completo del `Quantum Engine`.

El cambio es solo de sincronizacion visual y no altera:

- el formato fisico `.tbit`,
- el cifrado AES-256-GCM,
- el HMAC,
- el Memory Core,
- el Query Index,
- los endpoints existentes,
- ni la visualizacion tecnica 3D.

### Sincronizacion visual Second Brain / Quantum Engine

Se corrigio una segunda causa de desalineacion visual: el `Second Brain Map` generaba posiciones propias de vista previa, independientes de la proyeccion determinista que usa el mapa técnico.

Ahora la vista limpia:

- agrupa documentos, memorias y archivos por clave raiz;
- oculta chunks fisicos al usuario normal;
- conserva los Vits activos cuando existen;
- calcula la mini-posicion visual desde la misma clave T-BIT;
- dibuja enlaces resumidos entre documentos usando los links/backlinks del `Memory Core`;
- mantiene el `Quantum Engine` como mapa 3D completo y técnico.

Resultado: `Second Brain` muestra una version limpia y resumida del mismo universo logico que se ve en `Quantum Engine`, en lugar de una nube estatica desconectada.

### Primer arranque y decision sobre espacio existente

Se ajusto el flujo de creacion del espacio inicial T-BIT.

Antes, si ya existia un contenedor `.tbit`, el perfil local podia guardarse pero el tamano elegido por el usuario no se aplicaba claramente. Esto era correcto desde el punto de vista de seguridad, porque evitaba sobrescribir datos, pero era confuso para el usuario.

Ahora el modal de primer arranque expone una decision explicita:

- `Conservar existente`: modo seguro por defecto. Mantiene el contenedor actual aunque tenga otro tamano.
- `Sobrescribir y recrear`: requiere confirmacion final y recrea los contenedores seleccionados con el tamano solicitado.

El backend `POST /api/container/space/prepare` acepta ahora `mode`:

```json
{
  "target": "both",
  "sizeMb": 1024,
  "mode": "keep"
}
```

Valores admitidos:

- `keep`: conserva contenedores existentes con metadata;
- `overwrite`: recrea el contenedor, limpia metadata y WAL, y crea un espacio fisico limpio.

Este cambio no introduce todavia un sistema de multiples espacios activos con rutas seleccionables. El backend actual sigue usando las rutas canonicas:

- `universo.tbit`
- `data/ai_memoria.tbit`

La seleccion entre multiples vaults fisicos queda reservada para una fase posterior de instalador/selector de espacios, porque requiere cambiar el contrato de rutas activas del servidor.

Esta fase corrige el flujo de primer arranque y aclara el contrato real entre perfil de usuario, tamano del vacio y contenedores fisicos.

Problema observado:

- el modal inicial permitia elegir 1 GB, 2 GB, 5 GB o 10 GB,
- pero esa eleccion solo quedaba en `localStorage`,
- el backend seguia creando `universo.tbit` y `ai_memoria.tbit` con 10 MB,
- la interfaz no avisaba si ya existia un contenedor previo,
- el usuario podia creer que habia creado un nuevo vacio fisico cuando no era cierto.

Cambios implementados:

- nuevo endpoint `GET /api/container/space` para auditar espacios fisicos,
- nuevo endpoint `POST /api/container/space/prepare` para preparar el espacio solicitado,
- si el archivo `.tbit` no existe, se crea con el tamano indicado,
- si Express creo un contenedor vacio de bootstrap al arrancar, el modal puede recrearlo con el tamano elegido porque no contiene metadata,
- si el archivo ya existe y su tamano no coincide, no se sobrescribe automaticamente,
- la respuesta devuelve `SPACE_EXISTS_REQUIRES_DECISION` y una advertencia legible,
- `TBitStorageService` ahora calcula el tamano real desde el archivo fisico cuando existe, no solo desde la configuracion inicial,
- el modal de primer arranque llama al backend antes de cerrar el flujo de configuracion.

Regla de seguridad:

```text
Crear si falta: permitido.
Recrear contenedor vacio de bootstrap: permitido.
Sobrescribir contenedor con metadata: bloqueado por defecto.
Migrar o recrear contenedor: debe hacerse con flujo explicito de vault/instalador y confirmacion fuerte.
```

También se ajusto el `Second Brain Workspace`:

- el Oraculo ya no ocupa todo el espacio central,
- la conversacion queda limitada a una zona aproximada del 30%,
- el resto del panel central muestra un mapa limpio de documentos y memorias,
- el mapa limpio carga automaticamente `/api/memory/graph` en modo `Second Brain`; ya no depende de que el usuario haya cargado manualmente el panel técnico de `Quantum Engine`,
- los chunks siguen ocultos en vista usuario,
- el boton `Abrir mapa 3D` conserva la ruta hacia `Quantum Engine` para inspeccion tecnica.

Nota sobre IA conectada:

```text
Estado actual:
- se usa la IA seleccionada en la barra lateral,
- las preguntas normales y sus respuestas se guardan automaticamente cuando `Auto-save memory` esta activo,
- se siguen guardando datos explicitos cuando el usuario pide recordar/guardar/memorizar o cuando una herramienta ejecuta una inyeccion,
- si `Multi-IA consensus` esta activo, T-BIT opera en modo `Rapido`, `Deliberativo` o `Critico`, y guarda la respuesta final en la bitacora activa.

Pendiente de producto:
- notebooks con historial navegable por conversacion,
- comparacion ponderada de respuestas por confianza/proveedor,
- historial visible de rondas internas cuando el usuario quiera auditar una decision Multi-IA.
```

---

# 25.9 Fase 43 - Multi-IA Consensus, Debate y Bitacoras por Notebook

### Objetivo

Esta fase convierte el chat del `Second Brain` en un orquestador multi-proveedor sin romper el flujo actual de IA seleccionada. El modo por defecto sigue siendo rapido para conservar velocidad y costo bajo, pero el usuario puede activar modos de revision mas profundos.

Antes:

```text
El usuario elegia una IA y T-BIT enviaba el mensaje solo a ese proveedor.
El auto-save guardaba el turno, pero no habia agrupacion por proyecto/notebook.
```

Ahora:

```text
El usuario puede activar Multi-IA consensus.
Si hay dos o mas proveedores configurados, T-BIT consulta hasta cinco IAs.
El resultado final se guarda en una bitacora por notebook/proyecto.
```

### Cambios en `src/App.tsx`

Se agregaron:

- `activeNotebook`, persistido en `localStorage` como `tbit_active_notebook`;
- `multiAiMode`, persistido en `localStorage` como `tbit_multi_ai_mode`;
- switch visible `Multi-IA`;
- switch formal en Settings llamado `Multi-IA consensus`;
- selector de modo Multi-IA en el chat y en Settings;
- funcion `getConsensusProviders()` para seleccionar solo proveedores configurados;
- funcion `runMultiAiConsensus()` con `Promise.allSettled()` para que una IA fallida no tumbe toda la consulta;
- funciones `askConsensusProvider()`, `settledConsensusResults()`, `formatConsensusTranscript()` y `selectConsensusJudge()` para manejar rondas sin duplicar logica;
- funcion `buildConsensusResponse()` para agrupar respuestas por proveedor;
- guardado de bitacora con clave:

```text
<usuario>::Bitacora::<notebook>::<timestamp>::<hash>
```

### Comportamiento

Si `Multi-IA consensus` esta apagado:

```text
La app conserva el comportamiento anterior: usa la IA seleccionada.
```

Si `Multi-IA consensus` esta encendido y hay al menos dos proveedores configurados:

```text
Modo Rapido:
1. T-BIT envia el prompt a cada proveedor configurado en paralelo.
2. Agrupa respuestas validas.
3. Reporta proveedores que fallaron.
4. Guarda la respuesta consolidada en Memory Core.
5. Refresca el mapa Second Brain.

Modo Deliberativo:
1. Cada IA responde de forma independiente.
2. Las respuestas se comparten en una segunda ronda de revision cruzada.
3. Una IA juez sintetiza una respuesta final unica.
4. Si el juez falla, T-BIT conserva una consolidacion de respaldo.
5. Guarda el resultado final con modo `multi_ai_deliberative`.

Modo Critico:
1. Cada IA responde de forma independiente.
2. Las IAs ejecutan una ronda critica buscando contradicciones, riesgos y supuestos debiles.
3. Una IA juez produce la respuesta final usando respuestas y criticas.
4. Si el juez falla, T-BIT vuelve al resumen seguro de la ronda inicial.
5. Guarda el resultado final con modo `multi_ai_critical`.
```

### Seguridad funcional

La consulta paralela no modifica el motor fisico ni el backend. Usa el endpoint existente `/api/ai/chat` y conserva:

- API key local,
- cifrado AES-256-GCM de payloads,
- HMAC de integridad,
- Memory Core,
- auto-save existente.

### Limitacion consciente

Los modos `Deliberativo` y `Critico` mejoran la calidad de decision, pero consumen mas llamadas API y tardan mas que el modo `Rapido`.

La app todavia no asigna puntajes cuantitativos de confianza por proveedor ni muestra un historial visual completo de cada ronda interna; eso queda como auditoria avanzada.

---

# 25.10 Fase 44 - Instancias de Agente IA

### Objetivo

Esta fase permite que una misma IA funcione como multiples agentes dentro de T-BIT.

Ejemplo:

```text
OpenAI Investigador
OpenAI Critico
OpenAI Sintetizador
Claude Arquitecto
Gemini Auditor
```

Todos pueden compartir el mismo proveedor base y las mismas credenciales, pero cada instancia tiene:

- nombre visible,
- proveedor base,
- rol operativo,
- notebook asignado,
- estado ON/OFF.

### Cambios en `src/App.tsx`

Se agregaron:

- tipo `AiAgentInstance`,
- tipo `AiAgentRuntime`,
- persistencia local `tbit_ai_agent_instances`,
- lector `readStoredAiAgentInstances()`,
- estado `aiAgentInstances`,
- formulario de creacion de instancias en Settings > AI providers,
- acciones `createAgentInstance()`, `deleteAgentInstance()` y `toggleAgentInstance()`,
- resolucion de proveedor base desde una instancia,
- soporte para que el chat seleccionado use `buildAgentMessage()`.

### Como actua una instancia

Cuando el usuario selecciona una instancia, el mensaje normal del usuario se envuelve internamente con contexto de rol:

```text
[T-BIT AGENT INSTANCE]
Nombre: OpenAI Critico
Proveedor base: OpenAI
Notebook asignado: Proyecto X
Rol operativo: Evalua respuestas, detecta contradicciones y entrega observaciones verificables.

Instruccion del usuario:
...
```

El usuario no tiene que escribir este bloque. T-BIT lo genera de forma transparente.

### Integracion con Multi-IA

`Multi-IA consensus` ahora puede usar instancias como participantes, no solo proveedores únicos.

Esto permite debates reales como:

```text
1. OpenAI Investigador responde.
2. OpenAI Critico revisa.
3. Claude Arquitecto aporta perspectiva tecnica.
4. Gemini Auditor valida riesgos.
5. Una instancia juez sintetiza la respuesta final.
```

Si no existen instancias, T-BIT conserva el comportamiento anterior y usa los proveedores configurados.

### Seguridad y no regresion

Esta fase no cambia:

- el motor `.tbit`,
- cifrado AES-256-GCM,
- HMAC,
- API backend,
- almacenamiento fisico,
- conectores existentes.

Las instancias viven en `localStorage` del frontend MVP y reutilizan la configuracion del proveedor base.

---

# 25.11 Fase 45 - Catalogo Extensible de Proveedores IA

### Objetivo

Esta fase elimina una limitacion de usabilidad: el usuario ya no queda restringido a las IAs predefinidas en la barra lateral.

Antes:

```text
La app mostraba T-BIT Local, OpenAI, Gemini, Claude, Grok/xAI, Qwen, Hermes, Ollama y LM Studio.
Si surgia un proveedor nuevo, habia que modificar código o reutilizar manualmente OpenAI-Compatible.
```

Ahora:

```text
Settings > AI providers permite crear proveedores personalizados desde la interfaz.
```

### Como funciona

Los proveedores personalizados se guardan en:

```text
localStorage.tbit_ai_custom_providers
```

Cada proveedor personalizado registra:

- nombre visible,
- modelo,
- Base URL,
- si requiere API key,
- protocolo `openai-compatible`,
- `runtimeId: openai-compatible`.

La UI conserva el nombre propio del proveedor, pero al enviar la solicitud al backend usa el runtime `openai-compatible`. Esto evita cambiar el backend y mantiene compatibilidad con:

- Ollama local,
- LM Studio local,
- OpenRouter,
- servidores privados compatibles con `/chat/completions`,
- proveedores nuevos que implementen el contrato OpenAI-compatible.

Ejemplo Ollama:

```text
Nombre visible: Ollama Local
Modelo: llama3.1
Base URL: http://localhost:11434/v1
Requiere API key: OFF
```

Para proveedores locales sin API key, T-BIT envia una llave tecnica no sensible `local-provider` porque algunos clientes OpenAI-compatible requieren un campo `apiKey` aunque el servidor local no lo valide.

### Cambios en `src/App.tsx`

Se agregaron:

- `AI_CUSTOM_PROVIDERS_STORAGE_KEY`,
- tipo `CustomAiProviderDraft`,
- lector `readStoredCustomAiProviders()`,
- fusion `mergeAiProviderCatalog()`,
- estado `baseAiProviderCatalog`,
- estado `customAiProviders`,
- estado `customProviderDraft`,
- accion `createCustomAiProvider()`,
- accion `deleteCustomAiProvider()`,
- tarjeta `Proveedor IA personalizado` en Settings > AI providers.

El catalogo final se calcula con:

```text
custom providers + backend providers
```

Esto preserva los conectores existentes y permite que los nuevos aparezcan en:

- barra lateral de agentes,
- selector de proveedor base para instancias,
- Multi-IA consensus,
- pruebas de conexion.

### Seguridad y no regresion

Esta fase no modifica:

- `TBitFileSystem.ts`,
- cifrado AES-256-GCM,
- HMAC,
- endpoints de almacenamiento,
- Memory Core,
- Query Index,
- Markdown Bridge,
- Asset Manager.

Solo agrega una capa de configuracion frontend para que el usuario pueda conectar IAs nuevas sin editar código.

---

# 25.12 Fase 46 - Correccion de Espacios, Indices y Navegacion Second Brain

### Problema corregido

Durante las pruebas de primer arranque y creacion de nuevos espacios se detectaron tres fallos de coherencia:

- el usuario podia crear un perfil nuevo, pero la interfaz podia seguir mostrando nodos cargados en memoria desde una sesion anterior;
- al sobrescribir `ai_memoria.tbit`, el contenedor fisico se recreaba, pero los indices logicos externos podian conservar registros anteriores;
- el item `Memory` del sidebar limpio todavia forzaba el retorno a `Quantum Engine`.

### Cambios implementados

- `TBitContainer.reloadFromDisk()` permite recargar tamano y salt del contenedor despues de recrearlo fisicamente.
- `POST /api/container/space/prepare` recarga los contenedores activos despues de `initContainer()`.
- Cuando se sobrescribe `ai_memoria`, tambien se reinician:
  - `data/memory-core-index.json`,
  - `data/query-index.json`,
  - `data/asset-index.json`.
- El perfil local solo se guarda en `localStorage` despues de que el backend confirma la preparacion del espacio.
- Al guardar perfil, conservar espacio o sobrescribir espacio, el frontend limpia:
  - Vits visibles,
  - Vits IA,
  - grafo de memoria,
  - foco de camara,
  - lineas activas,
  - datos recuperados.
- `Second Brain` ya no consulta el grafo global sin filtro; solo usa el usuario activo (`userId`) y su nombre visible como compatibilidad.
- El item `Memory` del sidebar ahora abre la seccion de mapa limpio dentro de `Second Brain`, sin cambiar a `Quantum Engine`.
- El boton superior duplicado `Quantum Engine` se oculta en `Second Brain`; queda el boton contextual derecho para ir al mapa técnico completo.
- Las secciones de Settings que todavia son roadmap (`Files and links`, `Appearance`, `Advanced` y plugins core) se marcan como planificadas para evitar que parezcan controles activos.

### Resultado

Un nuevo espacio ya no debe mostrar datos de otro usuario por estado visual retenido o por indices logicos antiguos. `Quantum Engine` sigue siendo el mapa técnico completo; `Second Brain` queda reservado para la vista limpia del usuario activo.

---

# 25.13 Fase 47 - Busqueda Semantica-Espacial

### Objetivo

Esta fase agrega una capa de búsqueda por significado para que el usuario y la IA no dependan solo de palabras exactas. La intencion es que consultas como `estrategias de marketing`, `planes de ventas` o `ideas de adopcion` encuentren documentos relacionados aunque el texto no contenga exactamente la misma frase.

### Principio de arquitectura

La búsqueda semantica NO reemplaza:

- el salto determinista por clave,
- el hash fisico con PI,
- el Dato/Anti-Dato,
- AES-256-GCM,
- HMAC,
- Query Index.

Funciona como una capa secundaria, reconstruible y verificable, basada en el `Query Index`. El archivo `.tbit` sigue siendo la fuente fisica; el indice semantico es un acelerador de descubrimiento.

### Backend implementado

Se creo `semanticIndex.ts` con:

- `TBitSemanticIndex`;
- `SemanticIndexEntry`;
- `SemanticSearchRequest`;
- `SemanticSearchResult`;
- `rebuildSemanticIndex()`;
- `searchSemanticIndex()`;
- `getSemanticIndexStats()`.

El indice se guarda como sidecar en:

```text
data/semantic-index.json
```

Este sidecar se puede regenerar desde `Query Index`, por lo que no es un punto único irreversible de verdad.

### Embeddings

La fase soporta dos caminos:

1. **Fallback local deterministico**
   - No requiere internet.
   - No requiere Ollama.
   - Usa hashing de tokens, n-gramas y grupos semanticos basicos.
   - Permite que la app funcione inmediatamente en desktop.

2. **Ollama opcional**
   - Si el usuario configura:

```text
TBIT_EMBEDDING_PROVIDER=ollama
TBIT_EMBEDDING_BASE_URL=http://localhost:11434
TBIT_EMBEDDING_MODEL=nomic-embed-text
```

- El backend intenta generar embeddings reales mediante `/api/embeddings`.
- Si falla, el sistema vuelve al fallback local para evitar romper la app.

### Endpoints REST

Se agregaron tres endpoints protegidos con la API key local:

```text
GET  /api/semantic/stats
POST /api/semantic/rebuild
POST /api/semantic/search
```

`POST /api/semantic/search` recibe:

```json
{
  "query": "estrategias de marketing",
  "userId": "Mauricio",
  "limit": 8
}
```

Y devuelve resultados agrupados por documento raiz. Esto evita mostrar al usuario normal los chunks internos.

### Frontend implementado

Se creo `src/semanticIndexClient.ts` y se conecto en `App.tsx`.

En `Second Brain` se agrego:

- panel `Busqueda semantica`;
- campo para consultar por significado;
- boton `Reindexar`;
- lista de resultados con porcentaje de similitud;
- foco visual del resultado principal;
- resaltado amarillo de los nodos relacionados en el mapa limpio.

### Resultado de producto

T-BIT ahora puede operar en tres niveles de descubrimiento:

1. **Clave exacta**
   - Acceso directo deterministico.

2. **Query Index**
   - Busqueda por texto, tags, usuario, tipo, documento y metadata.

3. **Semantic Spatial Search**
   - Busqueda por significado y cercania conceptual.

Esto mejora la utilidad para usuarios normales y para IAs conectadas, porque permite recuperar contexto aunque el usuario no recuerde la clave, el nombre exacto del documento o la palabra precisa.

### No regresion

Esta fase no altera el almacenamiento fisico ni la escritura Dato/Anti-Dato. Tampoco cambia la vista tecnica del `Quantum Engine`. La búsqueda semantica se integra en `Second Brain` como capa de exploracion y puede reconstruirse sin perdida de datos.

---

# 25.14 Fase 48 - Guardian Observer

### Objetivo

Esta fase inicia el modulo de `Guardianes del Vacio` en su version mas segura: **Observer**.

El Guardian Observer no escribe, no borra, no modifica payloads, no crea wikilinks reales y no toca sectores fisicos. Su unica funcion es analizar el mapa logico verificable y producir un reporte de curaduria.

### Capas que analiza

El Guardian no recorre el archivo `.tbit` byte por byte. Usa las capas logicas ya existentes:

- `Query Index`;
- `Semantic Index`;
- Memory Core;
- document roots;
- chunks agrupados;
- tags;
- links;
- backlinks;
- metadata temporal.

Esto respeta la arquitectura actual: el archivo fisico sigue cifrado, frameado y direccionado por claves; el Guardian trabaja sobre indices reconstruibles.

### Backend implementado

Se creo:

```text
guardianObserver.ts
```

Este modulo exporta:

```text
observeGuardian()
```

El reporte incluye:

- documentos visibles;
- documentos huerfanos;
- conexiones candidatas;
- duplicados/redundancias potenciales;
- clusters por tag;
- notas de seguridad del modo Observer.

### Endpoint REST

Se agrego:

```text
POST /api/guardian/observe
```

Request:

```json
{
  "userId": "Mauricio",
  "maxDocuments": 40,
  "minConfidence": 0.58
}
```

Response:

```json
{
  "ok": true,
  "report": {
    "mode": "observer",
    "totals": {
      "documents": 12,
      "chunks": 46,
      "orphanDocuments": 3,
      "suggestedLinks": 5
    }
  }
}
```

### Frontend implementado

Se agregaron:

```text
src/guardianObserverClient.ts
src/components/GuardianObserverPanel.tsx
```

El panel aparece en la zona tecnica del `Quantum Engine`, junto a Health, Query Index, Assets y Memory Graph.

Permite:

- elegir usuario;
- definir confianza minima;
- limitar cantidad de documentos analizados;
- ejecutar el observador;
- revisar huerfanos;
- revisar conexiones sugeridas;
- ver clusters por tag.

### Seguridad

El modo Observer es deliberadamente no destructivo:

- no llama a `remember`;
- no llama a `delete`;
- no llama a `destroy`;
- no modifica `memory-core-index.json`;
- no modifica `query-index.json`;
- no escribe relaciones nuevas.

Las conexiones se reportan como:

```json
{
  "status": "suggested",
  "createdBy": "guardian:observer"
}
```

La fase siguiente natural seria `Guardian Curator`, donde el usuario podria aprobar o rechazar esas conexiones sugeridas.

### Resultado

T-BIT ahora puede auditar su propio mapa cognitivo y decirle al usuario:

- que documentos estan aislados;
- que notas parecen relacionadas;
- que documentos podrian estar duplicados;
- que temas ya forman clusters.

Esta fase convierte el sistema de una memoria pasiva a una memoria que empieza a observar su propia organizacion, sin perder control humano ni seguridad.

---

# 25.15 Fase 49 - Optimizacion de Espacios Grandes y Markdown por Lotes

### Problema detectado

Al crear un usuario nuevo con un espacio grande, por ejemplo 1 GB o 2 GB, e importar un documento Markdown cercano a 900 KB, la app podia tardar varios minutos. El borrado del mismo documento tambien podia sentirse bloqueado.

La causa raiz no era el tamano del Markdown en si. El problema era la multiplicacion de operaciones internas:

- el Markdown grande se fragmenta en chunks;
- cada chunk se escribia como una operacion independiente;
- cada operacion leia metadata, recalculaba el mapa de asignacion, escribia Dato y Anti-Dato, ejecutaba `fsync`, escribia metadata, actualizaba WAL e indices;
- ademas, cada escritura normal ejecutaba una replica local copiando el contenedor `.tbit` completo;
- con un contenedor de 2 GB, copiar el archivo completo por cada chunk podia equivaler a decenas de GB de I/O para un documento de menos de 1 MB.

### Cambios implementados

#### 1. Escritura y borrado fisico por lote

En `TBitFileSystem.ts` se agregaron:

```text
writeManyAtOffsets()
destroyManyAtOffsets()
```

Estas funciones mantienen la misma regla Dato/Anti-Dato, pero abren el archivo una vez, escriben o limpian todos los frames necesarios y ejecutan un solo `fsync` al final del lote.

Las funciones individuales `writeAtOffsets()` y `destroyAtOffsets()` siguen intactas para flujos pequenos y compatibilidad.

#### 2. Servicio de storage por lote

En `TBitStorageService.ts` se agregaron:

```text
injectMany()
collapseMany()
```

Estas funciones:

- leen metadata una sola vez;
- construyen un solo `AllocationMap`;
- calculan offsets y probing para todos los registros del lote;
- escriben fisicamente todos los registros juntos;
- actualizan metadata una sola vez;
- conservan WAL por operacion para trazabilidad y recovery;
- mantienen HMAC, AES-GCM, collision guard y simetria 1:1.

#### 3. Memory Core por lote

En `memoryCore.ts` se agregaron:

```text
rememberMemoryBatch()
deleteMemoryRecordsBatch()
```

Ahora los chunks de documentos grandes actualizan `memory-core-index.json` y `Query Index` una sola vez por documento, no una vez por fragmento.

#### 4. Markdown Bridge y Asset Manager

`markdownBridge.ts` y `assetManager.ts` ahora usan los metodos por lote para:

- importar documentos grandes;
- borrar manifiesto y chunks asociados;
- purgar chunks huerfanos;
- eliminar dependencias de assets sin dejar fragmentos visuales residuales.

Esto refuerza la regla de producto: al borrar un documento, se borran tambien sus dependencias fisicas y logicas.

#### 5. Replica local liviana

La replica automatica local dejo de copiar el `.tbit` completo en cada escritura normal.

Ahora `updateReplica()` escribe metadata y un manifiesto liviano:

```text
LIGHTWEIGHT_LOCAL_REPLICA
```

Las copias fisicas completas siguen disponibles mediante:

- snapshots;
- export/import verificable;
- replica remota explicita cuando el usuario la configure.

Esto evita que un contenedor de 2 GB sea duplicado por cada chunk.

#### 6. Creacion rapida de espacios grandes

`initContainer()` ahora usa asignacion rapida para contenedores mayores de 128 MB.

El archivo mantiene su tamano logico completo y las zonas no escritas se leen como ceros, pero no se escriben fisicamente gigabytes de ceros durante la creacion inicial. El header T-BIT, el salt y la matematica de offsets siguen igual.

### Impacto funcional

Esta fase transforma la importacion y eliminacion de documentos grandes de una secuencia costosa de operaciones repetidas a una operacion agrupada y verificable.

Resultado esperado:

- crear espacios de 1 GB o 2 GB deja de sentirse bloqueante;
- importar Markdown grande ya no dispara copias completas repetidas del contenedor;
- borrar un documento grande borra sus chunks en lote;
- el mapa visual queda menos propenso a mostrar chunks residuales;
- se preservan cifrado AES-GCM, HMAC, WAL, suma cero y Dato/Anti-Dato.

### No regresion

Los flujos existentes siguen activos:

- Raw Mode usa escritura individual;
- documentos pequenos pueden seguir usando `rememberMemory`;
- snapshot/export siguen copiando el contenedor completo cuando el usuario necesita una copia verificable;
- la replica remota explicita sigue disponible para escenarios avanzados.

---

# 25.16 Fase 50 - Primer Arranque Robusto y Recreacion Segura del Vacio

Esta fase corrige un fallo observado en el modal inicial `Configura tu T-Bit OS` al elegir `Sobrescribir y recrear` para un espacio grande.

## Problema detectado

En Windows, la recreacion de `universo.tbit` podia fallar con un error de bajo nivel:

```text
UNKNOWN: unknown error, open '...\\universo.tbit'
```

La causa raiz no era el tamano seleccionado por el usuario, sino el flujo de concurrencia: el endpoint de preparacion del espacio podia llamar `initContainer()` directamente mientras otros paneles del sistema, como Health o Quantum Engine, estaban leyendo el contenedor.

## Cambios aplicados

### 1. Preparacion serializada del espacio

`POST /api/container/space/prepare` ahora ejecuta la preparacion dentro de la cola global protegida por lock:

```text
enqueueOperation()
```

Esto alinea el primer arranque con las reglas que ya protegen:

- inyeccion,
- recuperacion,
- colapso,
- snapshots,
- export/import,
- operaciones criticas del contenedor principal.

### 2. Recreacion segura de `ai_memoria`

`TBitStorageService` agrega:

```text
reinitializeContainer(sizeInMB)
```

Esto permite recrear `ai_memoria.tbit` usando su propia cola interna y su propio lock, evitando que una importacion, borrado o lectura de memoria IA se cruce con la recreacion fisica.

### 3. Retry y mensaje legible al abrir contenedores grandes

`TBitContainer.initContainer()` ahora reintenta la apertura del archivo cuando Windows devuelve errores transitorios como:

```text
UNKNOWN
EBUSY
EPERM
EACCES
```

Si despues de varios intentos el archivo sigue bloqueado, el usuario ya no recibe un mensaje crudo del sistema operativo. El motor devuelve:

```text
CONTENEDOR_BLOQUEADO
```

con una indicacion clara: cerrar otros servidores T-BIT, esperar operaciones activas y volver a intentar.

## Impacto funcional

El primer arranque queda mas estable cuando el usuario:

- crea un nuevo perfil;
- elige 1 GB, 2 GB, 5 GB o 10 GB;
- conserva un espacio existente;
- recrea el vacio fisico desde cero;
- trabaja en Windows con paneles de Health/Quantum activos.

## No regresion

La correccion no cambia la matematica de offsets, cifrado, Dato/Anti-Dato, HMAC, WAL, importacion Markdown, Asset Manager ni Query Index. Solo asegura que la recreacion inicial use los mismos mecanismos de exclusividad que el resto del sistema.

---

# 25.17 Fase 51 - Espacios T-BIT Por Usuario y Administrador de Espacios

Esta fase convierte el perfil local del usuario en selector automatico del espacio fisico T-BIT.

## Problema detectado

En un mismo equipo podia existir mas de un usuario o mas de un intento de crear espacios T-BIT, pero el backend historico usaba rutas canonicas compartidas:

```text
universo.tbit
data/ai_memoria.tbit
data/memory-core-index.json
data/query-index.json
data/asset-index.json
data/semantic-index.json
```

Eso podia producir confusion visual y operativa:

- un usuario nuevo podia ver nodos o indices de un espacio previo;
- crear un espacio grande no dejaba claro que ruta estaba activa;
- no existia una lista de espacios locales para auditar o borrar espacios de prueba.

## Cambios aplicados

### 1. Rutas activas por usuario

Se agrego `tbitRuntimePaths.ts` como resolver único de rutas por espacio:

```text
data/spaces/<usuario>/universo.tbit
data/spaces/<usuario>/universo.tbit.meta.json
data/spaces/<usuario>/ai_memoria.tbit
data/spaces/<usuario>/ai_memoria.tbit.meta.json
data/spaces/<usuario>/memory-core-index.json
data/spaces/<usuario>/query-index.json
data/spaces/<usuario>/asset-index.json
data/spaces/<usuario>/semantic-index.json
data/spaces/<usuario>/space.json
```

El `userId` del perfil local se normaliza y se usa como `spaceId`.

### 2. Seleccion automatica del usuario activo

El frontend envia el usuario activo en cada llamada protegida mediante:

```text
x-tbit-user-id: <usuario_activo>
```

El backend intercepta las llamadas `/api/*`, activa el espacio correspondiente y reconfigura en memoria:

- `TBitContainer` principal;
- `TBitStorageService` de `ai_memoria`;
- Memory Core;
- Query Index;
- Asset Index;
- Semantic Index;
- WAL, locks, snapshots, replicas y metadata del espacio activo.

Esto significa que el usuario no debe escoger manualmente rutas tecnicas. Al iniciar sesion local, T-BIT usa automaticamente su espacio.

### 3. Manifiesto de espacio

Cada espacio tiene un manifiesto:

```text
space.json
```

con:

- `spaceId`;
- `ownerUserId`;
- `displayName`;
- `label`;
- `sizeMB`;
- `createdAt`;
- `updatedAt`.

El panel derecho puede mostrar el nombre real del vault, por ejemplo:

```text
Mauricio Vault
```

### 4. Inventario y borrado seguro de espacios

Se agregaron endpoints:

```text
GET    /api/container/spaces
DELETE /api/container/spaces
```

`GET` lista los espacios detectados en `data/spaces`.

`DELETE` elimina uno o varios espacios seleccionados, pero exige:

1. API key local valida;
2. que el espacio no sea el espacio activo;
3. lista explicita de `spaceIds`;
4. confirmacion textual exacta:

```text
ELIMINAR
```

### 5. UI en Settings -> Storage

El modal de configuracion ahora incluye `Espacios T-BIT del equipo`.

La interfaz muestra:

- lista de espacios;
- nombre visible;
- `spaceId`;
- usuario propietario;
- tamano fisico aproximado;
- etiqueta `Activo`;
- checkbox por espacio no activo;
- campo de confirmacion `ELIMINAR`;
- boton `Eliminar seleccionados`.

El espacio activo queda bloqueado para evitar borrar el vault que el usuario esta usando.

## Impacto funcional

Ahora, en un mismo equipo:

- cada usuario local puede tener su propio espacio T-BIT;
- el sistema selecciona automaticamente el espacio correcto a partir del perfil activo;
- se reducen fugas visuales entre usuarios;
- se pueden eliminar espacios antiguos o de prueba con doble confirmacion;
- los indices logicos quedan dentro del mismo directorio fisico del usuario.

## No regresion

Esta fase no cambia:

- la matematica de offsets;
- Dato/Anti-Dato;
- AES-256-GCM;
- HMAC;
- WAL;
- Query Index;
- Markdown Bridge;
- Asset Manager;
- Guardian Observer;
- Multi-IA.

Solo cambia el resolver de rutas activas y agrega una capa de administracion de espacios locales.

Nota importante: T-BIT ahora soporta espacios locales separados por usuario, pero no implementa todavia cuentas multiusuario concurrentes con roles, sesiones remotas o permisos por cuenta. Sigue siendo un producto desktop/local.

---

# 25.18 Fase 52 - Auditoria de Indices y Recuperacion Vectorial

## Objetivo

Esta fase corrige dos puntos internos de precision y rendimiento detectados durante auditoria:

- búsquedas textuales con trabajo repetido por resultado;
- resultados semanticos que podian agrupar por documento, pero conservar la coordenada del chunk ganador.

## Cambios aplicados

### Query Index

`queryIndex.ts` ahora precalcula los tokens de la consulta una sola vez y conserva un mapa de hits por clave.

Impacto:

- reduce retokenizacion repetida;
- evita recorrer postings de `byToken` para cada resultado;
- mantiene el mismo contrato de `POST /api/query/search`;
- conserva filtros por usuario, source, tags, documento, atributo, valor y fecha.

### Semantic Index

`semanticIndex.ts` ahora selecciona una entrada canonica por `rootKey`.

Cuando una coincidencia semantica ocurre dentro de un chunk:

- el score puede venir del chunk;
- `matchedKeys` conserva el chunk especifico;
- `point` se toma del documento raiz canonico;
- el titulo, filename, source y userId se toman del nodo principal cuando existe.

Esto mejora la precision visual de `Second Brain`: la camara y el resaltado apuntan al documento logico, no a un fragmento interno.

### Ollama embeddings

Las llamadas opcionales a Ollama ahora tienen timeout configurable:

```text
TBIT_EMBEDDING_TIMEOUT_MS=8000
```

Si Ollama no responde a tiempo, T-BIT vuelve al embedding local deterministico sin romper la app.

## No regresion

No se altero:

- formato fisico `.tbit`;
- AES-256-GCM;
- HMAC;
- Dato/Anti-Dato;
- WAL;
- Memory Core;
- Markdown Bridge;
- Asset Manager;
- endpoints publicos existentes.

La fase solo optimiza indices reconstruibles y precision de recuperacion vectorial.

---

# 25.19 Fase 53 - OmniWorkspace Paso 1: Separacion Usuario / Modo Tecnico

## Objetivo

Esta fase inicia la simplificacion radical de la experiencia principal sin romper el `Quantum Engine`.

La meta es que el usuario normal trabaje desde `Second Brain` como pantalla limpia:

- conversar con la IA;
- ver documentos y memorias;
- consultar el mapa resumido;
- cambiar de agente;
- entrar a ajustes basicos.

La maquinaria tecnica permanece disponible, pero fuera del flujo diario.

## Cambio aplicado

En `src/App.tsx` se separo la navegacion visible del `Second Brain Workspace`.

Antes, el menu normal mostraba tambien:

- `Security`;
- `Health`.

Estos modulos son importantes, pero pertenecen al flujo avanzado. Mostrar HMAC, AES, WAL, indices, health y seguridad operacional en la pantalla diaria aumentaba friccion para usuarios no técnicos.

Ahora `Second Brain` usa una navegacion limpia:

- `Mission Control`;
- `Notebook`;
- `Files`;
- `Memory`;
- `Agents`;
- `Settings`.

`Security` y `Health` no se eliminaron. Siguen disponibles como capacidades tecnicas dentro del `Quantum Engine` y de los paneles avanzados existentes.

## Impacto UX

- reduce ruido visual;
- conserva la identidad tecnica de T-BIT en modo avanzado;
- deja `Second Brain` como punto de entrada diario;
- evita que usuarios normales confundan controles internos con acciones de uso cotidiano.

## No regresion

No se modificaron:

- endpoints;
- almacenamiento fisico;
- cifrado;
- escritura Dato/Anti-Dato;
- carga de documentos;
- búsqueda semantica;
- paneles técnicos de `Quantum Engine`.

Este paso solo cambia la navegacion visible del workspace limpio.

---

# 25.20 Fase 54 - OmniWorkspace Paso 2: Universal Dropzone

## Objetivo

Esta fase agrega una entrada universal de archivos al `Second Brain Workspace`.

El usuario normal ya no necesita distinguir entre:

- Markdown Bridge;
- Binary Asset Bridge;
- gestor de archivos;
- chunks internos.

En la vista limpia puede arrastrar archivos sobre la pantalla y T-BIT decide la ruta correcta.

## Comportamiento

Cuando `Second Brain` esta activo:

1. El usuario arrastra un archivo sobre la ventana.
2. Aparece un overlay visual:

```text
Suelta para añadir a tu memoria
```

1. Al soltar:

- `.md`, `.markdown`, `.txt` y `.json` se importan como documentos de memoria mediante `markdownBridgeClient`;
- otros archivos se importan como assets binarios verificables mediante `binaryAssetClient`;
- el mapa limpio intenta refrescarse automaticamente;
- el chat informa al usuario con un mensaje humano.

## Limites intencionales

Esta fase no promete extraer texto desde PDF, Word, audio o video.

Esos formatos se guardan como assets binarios cifrados/verificables. La extraccion semantica de PDF/DOCX/audio/video pertenece a una fase posterior.

## No regresion

No se modificaron:

- endpoints existentes;
- `MarkdownImportPanel`;
- `BinaryAssetPanel`;
- `AssetManagerPanel`;
- `Quantum Engine`;
- cifrado AES-256-GCM;
- HMAC;
- WAL;
- formato fisico `.tbit`.

La fase reutiliza clientes existentes y solo agrega una entrada de usuario mas simple.

---

# 25.21 Fase 55 - OmniWorkspace Paso 3: Modo Desarrollador

## Objetivo

Esta fase consolida la separacion entre:

- experiencia diaria de usuario (`Second Brain`);
- herramientas tecnicas de bajo nivel (`Modo Desarrollador`).

El sistema conserva toda la funcionalidad avanzada, pero deja de presentarla como parte del flujo normal.

## Cambio aplicado

En `src/App.tsx`:

- el acceso técnico deja de mostrarse como `Quantum Engine` en la experiencia limpia;
- los botones de salida desde `Second Brain` ahora dicen `Modo Desarrollador`;
- los textos de ayuda indican que detalles fisicos, chunks, Health, AES, permisos e indices viven en el area avanzada;
- el panel técnico derecho se agrupa con una cabecera explicita:

```text
Modo Desarrollador
```

## Area avanzada incluida

El `Modo Desarrollador` conserva:

- `ContainerHealthPanel`;
- `EncryptionKeyPanel`;
- `AiPermissionsPanel`;
- `TBitNetworkPanel`;
- `QueryIndexPanel`;
- `GuardianObserverPanel`;
- `AssetManagerPanel`;
- `BinaryAssetPanel`;
- `MemoryGraphPanel`;
- `MarkdownImportPanel`;
- mapa 3D técnico completo.

## Impacto UX

Para usuarios normales:

- menos ruido técnico;
- menos confusion entre documentos y chunks;
- acceso diario centrado en chat, documentos, memoria y agentes.

Para usuarios técnicos:

- no se pierde ningun panel;
- el modo avanzado sigue disponible;
- la inspeccion fisica del vacio se mantiene intacta.

## No regresion

No se modificaron:

- endpoints;
- almacenamiento;
- cifrado;
- permisos reales;
- Health;
- Memory Graph;
- Asset Manager;
- Markdown Bridge;
- Binary Asset Bridge.

El cambio es de acceso, rotulado y agrupacion visual.

---

# 25.22 Fase 56 - OmniWorkspace Paso 4: Vista Limpia Visible

## Objetivo

Esta fase hace visible el cambio de producto para el usuario normal.

Las fases anteriores habian separado funciones tecnicas y agregado `Universal Dropzone`, pero el `Second Brain` seguia pareciendose demasiado al layout anterior. Esta fase cambia la composicion visual sin alterar la logica.

## Cambio aplicado

En `src/App.tsx`:

- `Second Brain` pasa de tres columnas a dos columnas visibles:
  - sidebar de agentes y secciones;
  - workspace central;
- el panel derecho pesado del usuario normal queda oculto;
- el mapa limpio gana mas espacio;
- el chat ocupa menos altura inicial;
- el encabezado central pasa a comunicar la experiencia:

```text
Second Brain
Pregunta, guarda y explora tu memoria persistente Q-Vault desde una sola pantalla.
```

## Que se conserva

El panel derecho técnico no fue eliminado como funcionalidad del sistema. Sus capacidades viven en `Modo Desarrollador` y en los paneles avanzados existentes.

## Impacto UX

- la vista normal se siente menos como consola tecnica;
- el mapa visual deja de estar encerrado por demasiados paneles;
- el usuario ve una diferencia clara entre `Second Brain` y `Modo Desarrollador`;
- se mantiene el acceso al mapa 3D completo desde el boton avanzado.

## No regresion

No se modificaron:

- backend;
- endpoints;
- importacion universal;
- chat;
- Memory Graph;
- Query Index;
- Semantic Search;
- Asset Manager;
- Markdown Bridge.

El cambio es de layout visual.

---

# 25.23 Fase 57 - Sidebar Colapsable, Historial y Carga Visible

## Objetivo

La interfaz normal del `Second Brain` necesitaba acercarse mas a una experiencia de usuario final: menos controles técnicos visibles y mas acciones obvias en la pantalla principal.

Esta fase agrega tres mejoras directas:

- barra lateral colapsable;
- historial de solicitudes recientes;
- seccion visible para agregar archivos sin entrar al modo desarrollador.

## Cambios en la interfaz

En `src/App.tsx` se agrego estado local para controlar si el sidebar esta expandido o reducido:

```ts
const [isSecondBrainSidebarCollapsed, setIsSecondBrainSidebarCollapsed] = useState(false);
```

Cuando esta expandido, el usuario ve:

- identidad local;
- `Mission Control`;
- historial de preguntas recientes;
- bloque `Agregar archivos`;
- lista de IAs conectadas;
- secciones de usuario.

Cuando esta colapsado, el usuario ve solo iconos compactos para:

- expandir la barra;
- agregar archivos;
- navegar secciones principales.

## Historial de solicitudes

El historial se deriva de los mensajes enviados por el usuario:

```ts
const requestHistory = useMemo(() => (
  aiMessages
    .filter((message) => message.sender === "T-User")
    .slice(-6)
    .reverse()
), [aiMessages]);
```

Cada solicitud puede reutilizarse con un click. Esto reduce friccion para prompts repetidos sin exponer metadatos internos.

## Carga visible de archivos

La nueva seccion `Agregar archivos` reutiliza el flujo de importacion universal ya existente:

- Markdown, texto y JSON se importan como memoria consultable;
- otros archivos se almacenan como assets binarios verificables;
- el usuario puede seleccionar archivos desde el boton visible;
- el drag and drop global del `Second Brain` se mantiene intacto.

No se duplico logica de backend. La UI llama al mismo flujo:

```ts
importFilesToOmniWorkspace(files);
```

## No regresion

No se modificaron:

- endpoints;
- cifrado AES-GCM;
- HMAC;
- Query Index;
- Markdown Bridge;
- Asset Manager;
- Binary Asset Bridge;
- Health;
- permisos IA;
- Modo Desarrollador.

El cambio es de ergonomia visual y acceso rapido.

---

# 25.24 Fase 58 - Extractor Universal v1 y Documento Visible

## Objetivo

Se implementaron los pasos 1 y 2 del flujo de documentos:

1. un punto único de entrada para archivos;
2. un modelo de documento visible con chunks internos ocultos.

La meta es que el usuario no tenga que saber si un archivo entra por `Markdown Bridge` o por `Binary Asset Bridge`. La app decide automaticamente.

## Nuevo puente universal

Se agrego `universalDocumentBridge.ts`.

Este modulo recibe:

```ts
{
  userId,
  filename,
  mimeType,
  contentBase64,
  key?
}
```

Y clasifica el archivo en dos rutas:

- `document`: archivos textuales consultables;
- `asset`: archivos binarios verificables.

## Archivos textuales consultables

Los siguientes tipos entran como documento textual:

- Markdown;
- texto plano;
- JSON;
- CSV;
- XML;
- YAML;
- LOG;
- MIME `text/*`;
- MIME `application/json`.

Estos archivos se convierten a UTF-8, se normalizan en NFC y se envian al `Markdown Bridge`.

Si el documento es grande, el `Markdown Bridge` conserva el comportamiento existente:

```text
Documento visible
  chunk_0001
  chunk_0002
  chunk_0003
```

El usuario ve el documento principal. Los chunks quedan como dependencias internas.

## Archivos binarios verificables

Los tipos que todavia no tienen extractor semantico especializado se guardan como assets:

- PDF;
- DOCX;
- XLSX;
- imagenes;
- audio;
- video;
- ZIP;
- ejecutables pasivos;
- binarios genericos.

El sistema no promete leer semanticamente estos formatos todavia. Los guarda de forma verificable, cifrada, chunked y reconstruible.

Esto evita alucinaciones de producto: el archivo existe en el vacio, pero su contenido interno no se consulta hasta implementar extractores especificos.

## Nuevo endpoint

Se agrego:

```http
POST /api/documents/import
```

Este endpoint usa `importUniversalDocument()`.

Respuesta principal:

```ts
{
  visibleKind: "document" | "asset",
  extractionMode: "text" | "binary",
  searchable: boolean,
  chunked: boolean,
  chunkCount: number,
  internalKeys: string[]
}
```

## Frontend

La funcion `importFilesToOmniWorkspace()` en `src/App.tsx` ahora llama a:

```ts
universalDocumentClient.importDocument(...)
```

El frontend ya no decide por extension si usar Markdown o Asset. Solo envia el archivo y muestra un resultado amigable:

- `(consultable)` si el contenido se indexo como texto;
- `(asset verificable)` si quedo guardado como binario.

## No regresion

No se eliminaron los endpoints antiguos:

- `/api/markdown/import`;
- `/api/assets/import-binary`;
- `/api/markdown/reconstruct`;
- `/api/assets/reconstruct-binary`;
- flujos de borrado existentes.

El nuevo endpoint es una capa superior. Los paneles técnicos siguen pudiendo usar los puentes especializados.

## Estado actual

Esta fase resuelve:

- punto único de importacion;
- documento visible;
- chunks internos ocultos;
- clasificacion honesta entre consultable y verificable.

Pendiente para fases posteriores:

- extractor PDF real;
- extractor DOCX real;
- extractor XLSX real;
- OCR para imagenes;
- transcripcion para audio/video.

---

# 25.25 Fase 59 - Indice Consultable Enriquecido y Resolver Documental Selectivo

## Objetivo

Se implemento el siguiente bloque logico:

- actualizar automaticamente el indice consultable con metadata documental rica;
- permitir que las consultas naturales lean solo los fragmentos necesarios cuando sea posible;
- mantener ocultos los chunks técnicos para el usuario normal.

## Indice consultable enriquecido

En `queryIndex.ts`, cada entrada del indice ahora conserva mas informacion util para IA y búsqueda:

- `title`;
- `userId`;
- `source`;
- `filename`;
- `documentRoot`;
- `fileType`;
- `checksum`;
- `summary`;
- `chunkCount`;
- `originalBytes`;
- `searchable`;
- `internalKeys`;
- `tags`;
- `links`;
- `backlinks`;
- `attributes`;
- fechas de creacion y actualizacion.

Esto permite que una IA o el backend determinen rapidamente:

- si un archivo es consultable;
- cuantos fragmentos internos tiene;
- cual es su documento padre;
- que checksum lo representa;
- que resumen usar sin reconstruir todo.

## Actualizacion incremental

El proyecto ya tenia `syncQueryIndexIncremental()` conectado a `memoryCore`.

Esta fase lo fortalece:

- cada memoria nueva o documento importado propaga campos documentales al indice;
- cada chunk queda asociado a su `documentRoot`;
- los assets binarios quedan marcados como no consultables semanticamente por ahora;
- los Markdown/textos quedan marcados como consultables.

## Resolver documental selectivo

En `documentQa.ts`, el flujo ahora diferencia dos casos:

### Consultas exactas por item o punto

Ejemplo:

```text
¿Cuál es el punto 6 del documento Pet Matching?
```

Para preservar exactitud ordinal, el resolver reconstruye el documento textual completo y busca:

- item numerado exacto;
- item ordinal;
- bloque relevante.

### Consultas semanticas o generales

Ejemplo:

```text
Busca estrategias de adopcion en Pet Matching.
```

El resolver consulta el indice, localiza chunks candidatos del mismo documento y lee solo unos pocos fragmentos relevantes.

Esto reduce I/O y evita pasar todo el documento a la IA cuando no es necesario.

## Contrato de usuario

El usuario normal debe ver:

```text
Documento principal
Respuesta limpia
Resumen o fragmento relevante
```

No debe ver:

```text
chunk_0001
chunk_0002
offsets
hashes
claves internas
```

Esos detalles quedan disponibles solo para Modo Desarrollador.

## No regresion

No se eliminaron:

- búsqueda por Query Index;
- Guardian Observer;
- Markdown Bridge;
- Asset Manager;
- Binary Asset Bridge;
- Document Q&A existente.

El cambio es una extension del contrato del indice y una optimizacion del resolver documental.

---

# 25.26 Fase 60 - Extractores Reales PDF, DOCX y XLSX

## Objetivo

Hasta esta fase, los archivos PDF, DOCX y XLSX se guardaban como assets verificables cuando no eran texto directo. Eso preservaba el archivo, pero no permitia consulta semantica real.

La Fase 60 agrega extractores especificos para que estos formatos puedan entrar al Memory Core como documentos consultables sin perder el archivo original.

## Dependencias agregadas

Se agregaron tres librerias de extraccion:

```text
mammoth
pdf-parse
read-excel-file
```

Uso:

- `mammoth`: extrae texto bruto de documentos DOCX.
- `pdf-parse`: extrae texto de PDFs y paginas detectadas cuando el documento lo permite.
- `read-excel-file`: convierte hojas XLSX modernas en tablas Markdown consultables.

Nota operativa: se retiro `xlsx` porque `npm audit` reportaba una vulnerabilidad alta sin fix disponible. También se descarto `exceljs` en esta fase porque introducia vulnerabilidades moderadas transitivas. El arbol final queda con `read-excel-file` y `npm audit` sin vulnerabilidades conocidas.

## Nuevo archivo core

Se creo:

```text
documentExtractors.ts
```

Este modulo detecta por extension y MIME:

- PDF;
- DOCX;
- XLSX.

Si logra extraer texto util, devuelve una representacion documental:

- tipo del documento;
- titulo;
- texto consultable;
- tags técnicos;
- paginas u hojas detectadas cuando aplica.

## Flujo de importacion

`universalDocumentBridge.ts` ahora sigue este orden:

1. Recibe el archivo universal desde `/api/documents/import`.
2. Si es PDF/DOCX/XLSX, intenta extraer texto.
3. Si la extraccion funciona:
   - guarda el archivo original como asset binario verificable;
   - crea un documento textual consultable en Memory Core;
   - enlaza el documento extraido con el asset original;
   - actualiza el Query Index incremental.
4. Si la extraccion falla o no produce texto:
   - conserva el archivo como asset binario;
   - lo marca como no consultable semanticamente por ahora.

## Resultado para el usuario

El usuario puede arrastrar o importar un PDF, DOCX o XLSX y el sistema intenta convertirlo automaticamente en conocimiento consultable.

Ejemplo:

```text
Usuario sube: Reporte Comercial Q3.pdf
T-BIT guarda:
1. Asset binario original cifrado y verificable.
2. Documento textual consultable.
3. Relacion entre documento y asset.
4. Entrada enriquecida en Query Index.
```

## Resultado para la IA

La IA ya no necesita leer todo el archivo crudo ni conocer chunks internos.

Puede preguntar:

```text
Resume el reporte comercial Q3.
Busca los puntos sobre ventas en el Excel de Petius.
Que dice el contrato DOCX sobre renovacion?
```

El sistema:

- busca en el indice;
- ubica el documento;
- lee solo fragmentos relevantes cuando aplica;
- devuelve contexto limpio a la IA.

## Limites actuales

Esta fase no implementa todavia:

- OCR para PDFs escaneados o imagenes;
- interpretacion visual de tablas complejas;
- extraccion de imagenes dentro de documentos;
- lectura semantica de XLS antiguo;
- formulas avanzadas de Excel;
- transcripcion de audio/video;
- lectura semantica perfecta de documentos protegidos o corruptos.

Los archivos siguen quedando protegidos como assets verificables aunque no sean semanticamente extraibles.

## No regresion

No se reemplazo:

- Markdown Bridge;
- Binary Asset Bridge;
- Asset Manager;
- Query Index;
- Document Q&A;
- Universal Dropzone.

La fase solo agrega una ruta de extraccion previa para formatos de oficina comunes.

---

# 25.27 Fase 61 - Carpeta de Boveda Configurable y Espacios Persistentes

## Objetivo

El primer arranque ya permitia crear un perfil local y elegir un tamano de contenedor, pero la ubicacion fisica de los espacios seguia fija en:

```text
data/spaces
```

La Fase 61 agrega una carpeta de bovedas configurable por usuario, recordada en el perfil local y enviada al backend en cada request relevante.

## Cambios implementados

- `tbitRuntimePaths.ts` agrega:
  - `normalizeTBitVaultRoot()`,
  - `setActiveTBitSpacesRoot()`,
  - `getTBitSpacesRoot()` dinamico.
- `server.ts` acepta `x-tbit-vault-root` y `vaultRoot` en body/query.
- el middleware `/api` activa primero la carpeta de boveda y despues el espacio del usuario.
- el manifiesto `space.json` guarda `vaultRoot`.
- `POST /api/container/space/prepare` respeta la carpeta seleccionada.
- `GET /api/container/spaces` y `DELETE /api/container/spaces` listan/borran dentro de la carpeta activa.
- el primer arranque agrega:
  - campo `Carpeta local de bovedas T-BIT`,
  - tamano personalizado en MB dentro del rango permitido,
  - boton `Buscar espacios`,
  - lista visual de espacios existentes,
  - seleccion con checkbox,
  - borrado con doble confirmacion `ELIMINAR`.
- `Settings -> Storage` permite editar la carpeta de bovedas del perfil activo.
- se centralizan headers frontend en `src/tbitApiHeaders.ts`.
- los clientes principales envian usuario y carpeta de boveda:
  - chat IA,
  - importacion universal,
  - Markdown Bridge,
  - Memory Core,
  - Query Index,
  - Semantic Index,
  - Document Q&A,
  - Asset Manager,
  - Binary Asset Bridge,
  - Guardian Observer,
  - permisos IA,
  - llaves AES-GCM,
  - compresion semantica,
  - sync de red local.

## Limites de tamano

La UI y el backend aplican limites defensivos:

```text
minimo: 256 MB
maximo: 50 GB
```

Esto evita crear accidentalmente un archivo fisico enorme. El rango puede ampliarse en una version desktop si se agrega verificacion de espacio libre y selector nativo de disco.

## Nota sobre selector visual de carpeta

En Vite/browser puro no existe un selector nativo confiable que entregue una ruta absoluta de Windows al backend Express. Por eso esta fase usa:

```text
ruta escrita + inventario visual de espacios .tbit
```

El selector nativo tipo Explorador de Windows queda reservado para el empaquetado desktop Electron/Tauri.

## Impacto

Ahora el usuario puede:

- definir donde vive su boveda,
- conservar esa ruta entre sesiones,
- ver espacios existentes antes de crear,
- borrar espacios antiguos con confirmacion,
- evitar que importaciones, búsquedas o chats IA terminen en la carpeta por defecto por accidente.

Regla clave:

```text
Perfil activo = usuario + carpeta de boveda + tamano preferido.
```

---

# 25.28 Fase 62 - Render 3D Limpio de Second Brain

## Objetivo

Corregir la desconexion visual donde `Second Brain` podia mostrar estados como `Mapa listo`, pero el area del mapa quedaba vacia o sin nodos visibles para el usuario normal.

## Problema detectado

La vista limpia usaba una proyeccion 2D HTML separada del render 3D que ya funciona en `Quantum Engine`.

Eso provocaba tres problemas:

- el texto de estado podia quedar desincronizado respecto a los nodos realmente renderizables;
- los puntos dependian de una proyeccion plana y podian sentirse estaticos o desconectados;
- `Second Brain` no reutilizaba una escena tridimensional propia, aunque el motor visual ya estaba disponible.

## Cambios implementados

En `src/App.tsx` se agrego:

- tipo `SecondBrainPreviewNode`;
- tipo `SecondBrainPreviewLink`;
- componente `SecondBrainPreviewScene`.

El nuevo componente:

- usa React Three Fiber dentro del area `Second Brain Map`;
- renderiza nodos de documentos y memorias como esferas 3D;
- dibuja enlaces/backlinks entre nodos con lineas violetas;
- mantiene chunks internos agrupados bajo su documento raiz;
- permite click sobre un nodo para enfocar el objetivo;
- conserva `Quantum Engine` intacto como mapa técnico completo.

## Regla de visualizacion

```text
Second Brain = mapa limpio de documentos/memorias.
Quantum Engine = mapa técnico completo con chunks, Vits y Anti-Vits.
```

## No regresion

No se modificaron:

- `TBitFileSystem.ts`;
- escritura fisica `.tbit`;
- Dato/Anti-Dato;
- AES-256-GCM;
- HMAC;
- WAL;
- endpoints backend;
- `WikiLinksMesh` técnico usado por `Quantum Engine`.

La fase solo cambia el render visual limpio de `Second Brain` y elimina la proyeccion plana obsoleta.

---

# 25.29 Fase 63 - Second Brain Full-Viewport

## Objetivo

Eliminar la sensacion de que `Second Brain` vive dentro de una caja flotante y aprovechar todo el espacio disponible del navegador.

## Problema detectado

Aunque la vista normal ya estaba separada del `Quantum Engine`, el layout principal seguia usando:

- `max-w-[1480px]`;
- padding exterior;
- borde redondeado grande;
- borde exterior;
- sombra de tarjeta.

En pantallas grandes esto generaba areas inutiles alrededor del producto y reducia el espacio real disponible para el mapa limpio.

## Cambios implementados

En `src/App.tsx`:

- la seccion `Second Brain` ahora ocupa el viewport completo;
- se retiro el `max-width` del contenedor principal;
- se retiraron el borde, la sombra y el radio exterior del marco principal;
- se conserva la barra lateral colapsable;
- se conserva el workspace central;
- se conserva el render 3D limpio agregado en la fase anterior;
- `Modo Desarrollador` y `Quantum Engine` siguen intactos.

## Resultado UX

`Second Brain` se siente mas como una aplicación principal y menos como un panel técnico incrustado.

El usuario obtiene:

- mas area para mapa;
- menos bordes visuales innecesarios;
- continuidad con la idea de un espacio cognitivo vivo;
- acceso a la misma funcionalidad existente sin cambio de comportamiento.

## No regresion

No se alteraron:

- importacion de documentos;
- chat IA;
- autosave de memoria;
- AI Switchboard;
- selector de proveedor;
- primer arranque;
- `Quantum Engine`;
- paneles técnicos;
- backend Express;
- motor `.tbit`.

La fase solo modifica composicion visual de la vista normal.

---

# 25.30 Fase 64 - Modo Desarrollador Real

## Objetivo

Separar de forma explicita la experiencia normal del usuario y la maquinaria tecnica del sistema.

El `Second Brain` queda como workspace limpio para preguntar, importar y explorar memoria sin exponer detalles fisicos. El `Modo Desarrollador` concentra los paneles avanzados:

- `Quantum Engine` completo;
- `Health` del contenedor;
- WAL;
- llaves AES-GCM;
- permisos IA;
- `Query Index`;
- `Memory Graph`;
- `Guardian Observer`;
- assets binarios;
- Markdown Bridge técnico;
- chunks;
- Vits y AntiVits;
- offsets y vectores fisicos.

## Cambio de interfaz

En `src/App.tsx` se agrego un manifiesto visual de subsistemas en el panel técnico de Modo Desarrollador. Esta tarjeta explica que los controles fisicos, criptograficos y de auditoria viven fuera del `Second Brain`.

También se agrego un boton `Usuario` dentro del manifiesto para volver al workspace limpio sin tocar el estado del motor.

## Impacto

Esto reduce la friccion del usuario normal:

- no ve chunks internos;
- no ve WAL;
- no ve llaves AES;
- no ve permisos IA;
- no ve paneles de bajo nivel;
- no necesita entender Vits/AntiVits para usar la app.

Y conserva el poder técnico para auditoria:

- el arquitecto puede inspeccionar contenedores;
- revisar indices;
- migrar llaves;
- auditar relaciones;
- operar herramientas de storage;
- observar el mapa fisico completo.

## No regresion

No se alteraron endpoints, motor `.tbit`, cifrado, imports, chat, borrado, reconstruccion de assets ni render 3D. La fase solo consolida y rotula el area avanzada.

---

# 25.31 Fase 65 - Gestion de Usuario y Boveda

## Objetivo

Garantizar que cada usuario trabaje contra su propia boveda T-BIT y que la app no mezcle datos entre usuarios, carpetas o espacios anteriores.

La fase cubre:

- usuario activo;
- carpeta local de bovedas;
- creacion de espacios;
- seleccion de espacios existentes;
- eliminacion de espacios inactivos;
- activacion segura del espacio seleccionado;
- limpieza visual al cambiar de boveda.

## Cambio de backend

En `server.ts` se corrigio `activateUserSpace()` para que la activacion no dependa solo del `spaceId`.

Antes, si el mismo usuario elegia otra carpeta raiz, el servidor podia conservar las rutas anteriores porque comparaba solo:

```ts
requested === activeSpaceId
```

Ahora compara tambien la ruta fisica activa:

```ts
requested === activeSpaceId && activeSpacePaths?.rootDir === paths.rootDir
```

Esto evita que dos bovedas con el mismo usuario, pero ubicadas en carpetas diferentes, queden mezcladas en memoria del servidor.

También se agrego el endpoint:

```http
POST /api/container/space/activate
```

Este endpoint activa una boveda existente sin recrearla, sin redimensionarla y sin tocar su contenido.

## Cambio de frontend

En `src/containerHealthClient.ts` se agrego:

```ts
activateUserSpace(spaceId, displayName, vaultRoot)
```

En `src/App.tsx` se agrego `activateInventorySpace()`, que:

- activa el espacio elegido en backend;
- actualiza `localStorage`;
- actualiza el perfil activo;
- limpia nodos visuales previos;
- cierra el modal de primer arranque si corresponde;
- recarga el inventario.

La lista de espacios ahora incluye un boton `Usar` en espacios inactivos. La casilla sigue reservada solo para borrado con doble confirmacion.

## Eliminacion segura

La eliminacion de espacios mantiene las protecciones:

- no permite borrar el espacio activo;
- exige seleccionar explicitamente espacios;
- exige escribir `ELIMINAR`;
- exige confirmacion final del navegador;
- borra el directorio completo del espacio seleccionado solo despues de esas validaciones.

## Tamano de boveda

El inventario ahora prioriza el `sizeMB` del manifiesto del espacio cuando existe. Esto evita mostrar tamanos confusos por sumar `universo.tbit` y `ai_memoria.tbit`.

El rango permitido sigue siendo:

```text
256 MB a 51200 MB
```

## No regresion

No se modifico:

- formato `.tbit`;
- cifrado AES-GCM;
- HMAC;
- WAL;
- imports de documentos;
- Memory Core;
- Query Index;
- Asset Manager;
- chat IA;
- render 3D.

La fase solo fortalece el enrutamiento de usuario/carpeta/espacio y agrega seleccion segura de bovedas existentes.

---

# 25.32 Fase 66 - Gestion de Memoria Visible

## Objetivo

Convertir acciones tecnicas de memoria en controles claros dentro de `Second Brain`, sin obligar al usuario normal a conocer claves internas, chunks ni nombres fisicos del contenedor.

## Cambios implementados

1. **Seleccion visible de nodos**

El mapa de `Second Brain` ahora conserva el nodo seleccionado por el usuario. Al hacer click sobre un nodo, la interfaz muestra:

- nombre legible del documento o memoria;
- cantidad de fragmentos agrupados cuando aplica;
- estado de accion visible;
- acciones disponibles.

1. **Borrado de documento y dependencias**

Desde la vista normal se agrego la accion `Eliminar documento`.

Si el nodo seleccionado corresponde a un documento Markdown (`Markdown::...`) o a un asset gestionado (`Asset::...`), la app usa los clientes ya existentes:

- `markdownBridgeClient.delete(rootKey)`;
- `assetManagerClient.delete(rootKey)`.

El borrado mantiene doble confirmacion y remueve del mapa visible la raiz y sus dependencias, sin exponer chunks al usuario.

1. **Borrado de conversacion visible**

Se agrego la accion `Borrar conversacion`, que limpia el historial visible de la sesion y deja un mensaje de arranque limpio. Esta accion no borra memoria persistente ni registros ya guardados en el vacio.

1. **Edicion de notebook activo**

Se agrego una accion de `Renombrar notebook` para cambiar el notebook usado por nuevas memorias y conversaciones. El cambio actualiza el estado local y la configuracion persistida del workspace.

1. **Preservacion de Modo Desarrollador**

Las herramientas avanzadas siguen disponibles en `Modo Desarrollador`:

- inspeccion de chunks;
- Memory Graph técnico;
- Markdown Bridge completo;
- Asset Manager;
- Health;
- AES keys;
- permisos IA;
- WAL e indices técnicos.

## Limites intencionales

La vista normal no borra memorias sueltas sin raiz documental hasta que exista un endpoint dedicado de borrado de memoria individual. Esto evita inventar comportamiento destructivo y mantiene el principio de no regresion.

## Resultado

El usuario puede gestionar documentos desde el mapa con acciones humanas:

- seleccionar;
- enfocar;
- eliminar documento completo;
- limpiar conversacion visible;
- renombrar notebook activo.

Los detalles fisicos siguen ocultos en `Second Brain` y auditables en `Modo Desarrollador`.

---

# 25.33 Fase 67 - Auto Scroll del Chat

## Objetivo

Evitar que el usuario tenga que bajar manualmente para ver la respuesta generada por la IA o por el Oraculo.

## Cambio implementado

En `src/App.tsx` se agrego una referencia visual al final del historial de chat (`aiChatEndRef`) y un efecto React que ejecuta `scrollIntoView` cada vez que cambia:

- el historial `aiMessages`;
- el estado de procesamiento `aiIsThinking`;
- el modo visible (`Second Brain` o consola tecnica).

## Resultado

Cuando el usuario envia una solicitud, la ventana de chat baja automaticamente al ultimo mensaje disponible. La mejora aplica tanto al `Second Brain` como a la consola tecnica del `Quantum Engine`.

---

# 25.34 Fase 68 - Renombramiento a Q-Vault

## Objetivo

Actualizar la identidad visible del workspace de usuario normal.

## Cambio implementado

La experiencia que antes aparecia como `Second Brain` ahora se presenta al usuario como:

- `Q-Vault`: espacio visible de memoria, documentos, mapa limpio y conversacion;
- `Q-Vault OS`: identidad del sistema operativo local de memoria persistente.

También se actualizaron etiquetas visibles relacionadas:

- `Second Brain Map` -> `Q-Vault Map`;
- `T-Bit Map Preview` -> `Q-Vault Map Preview`;
- `Configura tu T-Bit OS` -> `Configura tu Q-Vault OS`;
- `Crear T-Bit OS` -> `Crear Q-Vault OS`.
- `memoria persistente T-BIT` -> `memoria persistente Q-Vault`.

## Alcance

El cambio es de identidad visual y UX. No altera:

- motor `.tbit`;
- cifrado AES-GCM;
- HMAC;
- WAL;
- Query Index;
- Memory Core;
- Asset Manager;
- Modo Desarrollador;
- tipos internos como `SecondBrainPreviewNode`, que se conservan para evitar regresiones tecnicas innecesarias.

Las menciones historicas de `Second Brain` en fases anteriores permanecen como registro cronologico del desarrollo.

---

# Fase 69 - Registro Local de Usuario y Vinculo Usuario/Boveda

## Objetivo

Convertir la identidad inicial de Q-Vault OS en un registro de usuario real para producto desktop/local:

- nombre visible;
- ID logico T-BIT;
- email de registro;
- contrasena local;
- carpeta de bovedas;
- tamano preferido del espacio.

## Implementacion

- `src/App.tsx`
  - `TBitUserProfile` ahora incluye `email`, `passwordHash`, `passwordSalt`, `authVersion` y `updatedAt`.
  - El modal de primer arranque/edicion solicita email, contrasena y confirmacion.
  - Si existe un perfil antiguo sin email o sin contrasena local, Q-Vault OS abre el modal para completar el registro sin borrar datos existentes.
  - La contrasena no se guarda en texto plano: se deriva con PBKDF2-SHA256 y salt local usando WebCrypto.
  - Ajustes > General muestra email y estado de credencial local.
  - Al activar una boveda existente, el perfil conserva email y credencial local.

- `src/containerHealthClient.ts`
  - El cliente de espacios envia `email` en `prepareSpace()` y `activateUserSpace()`.
  - El inventario de espacios puede recibir `email` desde el backend.

- `server.ts`
  - `TBitSpaceManifest` ahora incluye `email`.
  - `writeActiveSpaceManifest()` persiste el email del duenio del espacio.
  - `/api/container/space/prepare` y `/api/container/space/activate` reciben y conservan `email`.
  - `listUserSpaces()` devuelve el email cuando existe en el manifiesto.

## Alcance de Seguridad

Este registro es local. No implementa todavia autenticacion cloud ni recuperacion remota de cuenta.

La contrasena se usa como credencial local registrada y no se almacena en claro. En una fase posterior puede evolucionar a:

- pantalla de desbloqueo local;
- rotacion de credenciales;
- derivacion directa de llaves de usuario;
- login multiusuario completo para empaquetado desktop.

---

# Fase 70 - T-BIT Web Research Tool

## Objetivo

Permitir que cualquier IA conectada a Q-Vault OS pueda investigar URLs o informacion web actual sin quedar confinada al equipo local.

La regla principal es:

```text
Nunca enviar HTML crudo completo a la IA salvo solicitud explicita del usuario.
```

## Implementacion

- `webResearch.ts`
  - valida URLs `http/https`;
  - descarga con limite de bytes;
  - rechaza tipos de contenido no semanticos;
  - elimina scripts, CSS, SVG, iframes, formularios, nav, header y footer;
  - extrae titulo, meta description, headings, texto util y links relevantes;
  - calcula checksum SHA-256 del paquete compacto;
  - devuelve banderas de seguridad indicando que no se envio HTML crudo.

- `server.ts`
  - nuevo endpoint `POST /api/web/research`;
  - preprocesamiento automatico en `/api/ai/chat` cuando el usuario pide analizar/revisar/investigar una URL;
  - el proveedor IA recibe un contexto web filtrado, no la pagina completa.

- `TBitToolSchemas.ts`
  - nueva herramienta `investigar_web` para function calling.

- `TBitLocalToolExecutor.ts`
  - ejecuta `investigar_web` usando la politica de permiso `search`;
  - la herramienta no escribe, no borra y no modifica memoria por si sola.

- `TBitPrompts.ts`
  - el orquestador sabe que debe usar `investigar_web` para URLs o informacion web actual.

- `src/webResearchClient.ts`
  - cliente frontend reutilizable para futuras pantallas o controles.

## Limites Actuales

- No implementa búsqueda web general tipo motor de búsqueda todavia.
- Investiga URLs directas y entrega contexto limpio a la IA.
- No ejecuta JavaScript de paginas web.
- No descarga assets pesados.
- La persistencia de fuentes depende de las politicas de autoguardado y memoria existentes.

## Valor

Esta fase convierte a Q-Vault OS en una memoria IA capaz de usar contexto web actual con control de tokens, costo y seguridad.

---

# Fase 71 - Q-Vault Map Render Estable, Anti-V Visible y Borrado de Memorias IA

## Objetivo

Corregir la visualizacion normal de Q-Vault cuando el `Quantum Engine` técnico si mostraba nodos, pero la pantalla de usuario podia quedarse en un fondo azul sin puntos visibles.

También se cerraron dos puntos de producto:

- cada nodo visible del Q-Vault muestra su Anti-V en espejo;
- el usuario puede borrar memorias/bitacoras creadas por interacciones con IA, no solo limpiar el chat visible.

## Implementacion

- `src/App.tsx`
  - `SecondBrainPreviewNode` ahora incluye `antiPosition`.
  - Los nodos vivos reutilizan la posicion V/Anti-V real del motor.
  - Los documentos y memorias agrupadas usan una posicion limpia deterministica y su anti-posicion como espejo exacto.
  - `SecondBrainPreviewScene` dejo de depender de una segunda escena WebGL/camara Three.js para la vista normal.
  - Q-Vault ahora renderiza el mapa limpio con SVG interactivo:
    - nodos V visibles;
    - anti-nodos rojos;
    - linea clara V <-> Anti-V;
    - links semanticos entre documentos;
    - seleccion por click/teclado.
  - El boton de accion ahora dice `Eliminar seleccion`.
  - El borrado desde Q-Vault soporta:
    - documentos Markdown y sus dependencias;
    - assets;
    - registros Memory Core del usuario activo, incluyendo `chat-autosave`.

- `src/memoryCoreClient.ts`
  - agrega `memoryCoreClient.delete(key)`.

- `server.ts`
  - expone `POST /api/memory/delete`;
  - usa `deleteMemoryRecord(aiStorage, key)`, que colapsa fisicamente el registro y limpia el indice logico.

## Diagnostico

El fallo no estaba en el almacenamiento fisico ni en la creacion de Anti-V. El `Quantum Engine` usaba su propia escena tecnica y por eso mostraba los datos. Q-Vault tenia una escena secundaria independiente con camara y escala propias; podia tener nodos en estado pero no encuadrarlos/renderizarlos de forma fiable en la vista limpia.

La solucion separa responsabilidades:

- `Quantum Engine`: visualizacion tecnica 3D completa;
- `Q-Vault`: mapa de usuario robusto, limpio y siempre encuadrado.

## Verificación


## Fase 74 (Tanda 3, punto 1) — Auditoría de portabilidad y guard de instancia única

Fecha: 2026-11-07. Rama: `feature/evolucion-tbit`.

### Auditoría de portabilidad (resultados verificados)

Búsqueda sistemática en todo el código y scripts de `package.json`:

| Punto auditado | Resultado | Evidencia |
|---|---|---|
| Rutas absolutas / separadores Windows | Limpio | Cero backslashes en literales de ruta; todo el código usa `path.join`/`path.resolve`/`path.dirname` (`tbitRuntimePaths.ts`, `TBitStorageService.ts`, `server.ts`) |
| Comandos de shell específicos en scripts npm | Limpio | Todos los scripts usan `node`/`tsx`/`tsc`/`vite`; `scripts/dev-vite.cjs` usa `spawn(process.execPath, ..., { shell: false })` |
| `child_process` en código de aplicación | Limpio | Solo en `scripts/*.cjs` (dev tooling), nunca en el runtime |
| Mayúsculas/minúsculas en imports | Limpio | `forceConsistentCasingInFileNames: true` en ambos tsconfig; `tsc --noEmit` en 0 errores |
| Finales de línea | Limpio | `.gitattributes` con `* text=auto`; los parsers de agentes ya aceptan `\r?\n` |
| APIs de archivo | Limpio | Motor `.tbit` usa solo APIs POSIX-compatibles de Node (`openSync`, `ftruncateSync`, `fsyncSync`); sin `process.platform` ni rutas condicionales por SO |
| Locks de contenedor | Limpio | `fs.open(lockPath, "wx")` (creación exclusiva O_EXCL, válida en Windows y POSIX) + detección de lock huérfano por mtime + `fs.rm(force)` |
| Escritura atómica de metadata | Limpio | Patrón temp + `fs.rename` (atómico en POSIX; en Windows Node usa `MoveFileEx` con reemplazo) |

### Gap encontrado y corregido: exclusión mutua del índice solo intraproceso

`withIndexWriteLock` (memoryCore, Fase 70) es un mutex **intraproceso**. Si dos procesos de
servidor apuntaran al mismo almacenamiento, las escrituras de los índices JSON
(`memory-core-index.json`, `query-index.json`, `semantic-index.json`) podrían interleavarse.

**Corrección (causa raíz, no documentación pasiva):** se añadió en `server.ts` un
**guard de instancia única** (`acquireServerInstanceLock`) que impide activar dos procesos
T-BIT API sobre el mismo directorio de trabajo/almacenamiento:

- Lock en `data/server-instance.lock` con creación exclusiva (`wx`), multiplataforma por construcción.
- **Vitalidad del titular por PID (señal 0)**, no por antigüedad: este lock se retiene durante
  toda la vida del servidor, por lo que el mtime no indica huerfandad (un servidor sano puede
  llevar horas activo). Si el proceso titular está muerto, el lock huérfano se reclama en el
  siguiente arranque.
- Liberación en `exit`/`SIGINT`/`SIGTERM`; ante muerte forzada, el reclamo por PID muerto
  cubre el reinicio.
- Si existe otro servidor vivo: el arranque falla con error explícito
  `SERVER_ALREADY_RUNNING` en lugar de corromper índices silenciosamente.

### Verificación en runtime (Windows, 2026-11-07)

```text
1. Servidor arranca            -> lock creado y presente mientras vive
2. Segunda instancia           -> rechazada: SERVER_ALREADY_RUNNING (no llega a listen)
3. Lock no es robado           -> sigue presente tras el rechazo
4. taskkill /F (muerte forzada)-> lock huérfano queda en disco
5. Reinicio tras muerte forzada-> reclama el lock por PID muerto y arranca correctamente
6. Guard sigue operativo       -> segunda instancia vuelve a ser rechazada
npm test -> 89/89 PASS; logic:build PASS; tsc --noEmit 0 errores
```

Nota: la exclusión mutua del índice sigue siendo intraproceso por diseño; el guard garantiza
que nunca haya más de un proceso de servidor sobre el mismo vault, que es la condición bajo
la cual eso es seguro. El empaquetado de escritorio (punto 5 de esta tanda) no debe lanzar
procesos paralelos sobre el mismo almacenamiento.


## Fase 75 (Tanda 3, punto 2) — CI multiplataforma (Windows / macOS / Linux)

Fecha: 2026-11-07. Rama: `feature/evolucion-tbit`.

Se creó `.github/workflows/ci.yml` con matriz de `ubuntu-latest`, `macos-latest` y
`windows-latest`. En cada sistema ejecuta, en orden: `npm ci`, `npm run logic:build`,
`npx tsc --noEmit`, `npm test` y `npm run build`. Se activa en push a
`feature/evolucion-tbit`, pull requests y ejecución manual (`workflow_dispatch`).

**Cómo validar macOS y Linux:** subir la rama a GitHub y ejecutar el flujo en la pestaña
Actions. Los resultados locales en Windows NO sustituyen esta verificación.

**Estado de veracidad:** el flujo está creado pero NO ejecutado (no se hace push en esta
sesión). La paridad real en macOS y Linux queda **NO VERIFICADA** hasta que el flujo corra
en verde en los tres sistemas.

## Verificación ejecutada

```text
npm test            -> 89/89 PASS (13 archivos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
```


## Fase 76 (Tanda 3, puntos 3 y 4) — Sistema de diseño, estados de UI y experiencia asistente

Fecha: 2026-11-07. Rama: `feature/evolucion-tbit`.

### Sistema de diseño (capa aditiva sobre la identidad existente)

`src/index.css` incorpora la capa "T-BIT Design System": tokens CSS (color, superficies,
tipografía, espaciado, elevación, movimiento) derivados de la identidad vigente
(void `#030712`, cyan `#00ffcc`, magenta `#ff2d75`), más primitivas reutilizables:
`.tbit-panel`, `.tbit-btn`/`.tbit-btn-ghost`, `.tbit-input`, `.tbit-badge(-ok/-warn/-error)`,
`.tbit-skeleton`, `.tbit-animate-in`. No reemplaza ninguna clase Tailwind existente.

Accesibilidad básica incluida: anillo de foco visible con `:focus-visible`, respeto de
`prefers-reduced-motion`, scrollbars coherentes, `::selection` con contraste.

### Estados de carga, vacío y error

Nuevo módulo `src/components/ui/StateViews.tsx`: `LoadingState` (role=status, aria-live),
`SkeletonLines` (shimmer), `EmptyState` y `ErrorState` (role=alert, con botón Reintentar).
Integrados en `AgentRuntimePanel`: skeleton durante la carga inicial, error con reintento,
estados vacíos para cadena IA, journal y catálogo; botones/inputs migrados a las primitivas
del sistema; iconos decorativos marcados `aria-hidden`; sección con `aria-label`.

### Experiencia tipo asistente (Q-Vault OS)

- El aviso del **eslabón determinista** ya no se muestra como una burbuja de chat normal:
  `AiMessage` incorpora `kind?: "deterministic-notice"` y se renderiza como banner ámbar
  distintivo ("Sin IA · Eslabon determinista"), imposible de confundir con una respuesta de IA.
- Chip persistente **"Motor de respuesta"** sobre el chat de Q-Vault OS: muestra el proveedor
  activo y su modelo; cuando el modo es determinista, el chip cambia a estado de advertencia
  con explicación en el tooltip.
- Quantum Engine permanece intacto como consola técnica (los cambios en su chat son solo el

## Fase 77 (Tanda 3, punto 5) — Empaquetado de escritorio multiplataforma

Fecha: 2026-11-07. Rama: `feature/evolucion-tbit`. Decisión registrada: `DECISIONES_EVOLUCION.md` D-005.

El libro declaraba "no hay instalador desktop todavía" y ninguna tecnología de empaquetado
estaba definida en el código. Se eligió la opción más ligera compatible con el stack
(cero dependencias nuevas; Electron/Tauri rechazados y justificados en D-005):

- **`scripts/launch-desktop.cjs`** (script npm `start:desktop`): construye los artefactos si
  faltan (vite build / tsc con el toolchain ya instalado), arranca UN único proceso
  `node dist/server.js` y abre el navegador del sistema (`start`/`open`/`xdg-open` según
  `process.platform`, solo en el lanzador).
- **`server.ts`**: cuando existe `dist/index.html`, sirve el frontend construido desde el
  mismo proceso (middleware estático aditivo + fallback SPA con regex que excluye `/api`).
  No se altera ninguna ruta existente y no se lanza ningún segundo proceso sobre el vault,
  en coherencia con el guard de instancia única (Fase 74).

### Procedimiento de instalación y arranque (las tres plataformas)

```text
Requisito comun: Node.js 20+ instalado.
1. npm install
2. npm run setup:secret        (configura la API key local; ver seccion de secretos)
3. npm run start:desktop       (construye si falta y abre Q-Vault OS en el navegador)

Alternativa desarrollo: npm run dev:all  (API en 3000 + Vite dev en 5173)
```

### Verificación en runtime (Windows, 2026-11-07)

```text
node scripts/launch-desktop.cjs ->
  [desktop] Arrancando T-BIT API (proceso unico)
  T-BIT API activa en http://localhost:3000

## Fase 78 (Tanda 3, puntos 6 y 7) — Conectores locales y rendimiento de carga

Fecha: 2026-11-07. Rama: `feature/evolucion-tbit`.

### Punto 6 — Ollama / LM Studio en runtime

Sondeo real de servidores locales (2026-11-07, timeout 2,5 s):

```text
ollama  http://127.0.0.1:11434/api/tags -> NO ACCESIBLE (ECONNREFUSED)
lmstudio http://127.0.0.1:1234/v1/models -> NO ACCESIBLE (ECONNREFUSED)
```

No hay servidores locales activos en este entorno: la verificación en runtime de los
conectores `ollama` y `lmstudio` (presentes en `AiProviderFactory.ts`, configurables por
`OLLAMA_*` / `LMSTUDIO_*` y endpoints OpenAI-compatibles) queda **NO VERIFICADO**. No se
inventan resultados.

### Punto 7 — Rendimiento de carga (división del bundle)

`vite.config.ts` incorpora `manualChunks` por paquete (sin cambiar de tecnología). Medición
real con `npm run build`:

```text
ANTES  : 1 chunk JS de 1.403,10 kB (gzip 390,91 kB) + aviso >500 kB
DESPUES: 7 fragmentos paralelizables y cacheables:
  index (codigo de la app)      261,57 kB | gzip  64,77 kB
  vendor-react                  260,27 kB | gzip  80,92 kB
  vendor-three-core (three.js)  810,57 kB | gzip 217,63 kB
  vendor-fiber                   29,65 kB | gzip  11,40 kB
  vendor-drei                     6,52 kB | gzip   2,75 kB
  vendor-misc                    31,17 kB | gzip  13,52 kB
  CSS                            53,04 kB | gzip  10,47 kB
```

El código propio de la aplicación pasó de 1.403 kB a 261 kB. `three.js` (810 kB) queda
aislado en su propio fragmento: es el peso de la librería 3D y no es reducible sin cambiar
de tecnología (guardarraíl). Verificado en runtime: el frontend servido por el proceso del
API responde 200 y el fragmento de la app carga correctamente (261.437 bytes).

**Limitación documentada:** la carga bajo demanda total de Quantum Engine exigiría extraer
la escena 3D desde `App.tsx` (5.5k líneas) a componentes con `React.lazy`; se difiere por
alto riesgo de regresión, registrando la decisión aquí.

## Verificación ejecutada

```text
npm test            -> 89/89 PASS (13 archivos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
npm run build       -> PASS (7 fragmentos)
```

  Q-Vault OS (frontend construido) disponible en http://localhost:3000
  [desktop] Abriendo Q-Vault OS en http://localhost:3000
GET /                -> 200 (index.html servido por el proceso del API)
GET /api/ai/provider -> 401 sin API key (autenticacion intacta)
Un solo proceso node sobre el almacenamiento del vault.
```

**NO VERIFICADO:** arranque del lanzador en macOS y Linux (se validará con el flujo CI de la
Fase 75). No hay instalador nativo (.msi/.dmg/.AppImage); se requiere Node instalado.

## Verificación ejecutada

```text
npm test            -> 89/89 PASS (13 archivos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
npm run build       -> PASS
```

  campo opcional `kind`, sin alterar su renderizado).

### Veracidad visual

No hay herramienta de navegador disponible en esta sesión: el resultado visual queda
**NO VERIFICADO** por captura. Verificado por compilación y suite: `tsc --noEmit` 0 errores,
`npm run build` PASS, `npm test` 89/89 PASS.

## Verificación ejecutada

```text
npm test            -> 89/89 PASS (13 archivos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
npm run build       -> PASS
```

## Verificación ejecutada

```text
npm test            -> 89/89 PASS (13 archivos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
```

- `npm run logic:build`
- `npm run build`

Ambos comandos compilan correctamente.

---

# 26. Politica de Documentacion Permanente

A partir de esta version, cada cambio funcional debe actualizar este documento.

Regla operativa:

```text
Toda mejora, endpoint, panel, archivo nuevo, cambio de seguridad o cambio de flujo debe quedar documentado en T-BIT_BOOK.md en el mismo ciclo de trabajo.
```

Esto incluye:

- nuevas fases,
- cambios de API,
- cambios de UI,
- cambios de seguridad,
- nuevos comandos,
- nuevas limitaciones,
- nuevos riesgos,
- cambios de arquitectura.

---

# 27. Fase 72 - Render Seguro de Codigo en Respuestas IA

## Problema

El chat del Oraculo reemplazaba cualquier bloque Markdown de código con:

```text
[bloque técnico omitido]
```

Esto protegía contra fugas accidentales de prompts internos, pero era demasiado agresivo: tambien ocultaba código inocuo solicitado por el usuario, por ejemplo un script Python simple.

## Solucion

Se ajusto `TBitChatEngine.ts` para diferenciar entre:

- código normal solicitado por el usuario;
- bloques técnicos protegidos que contienen prompts internos, tool calls, firmas internas o secretos T-BIT.

Ahora los bloques de código normales se preservan y solo se redacted si contienen patrones sensibles como:

- `thought_signature`;
- `tool_call`;
- `functionCall`;
- `functionResponse`;
- `x-tbit-api-key`;
- `process.env.*`;
- `TBIT_*`;
- identidad interna del sistema T-BIT.

## Impacto

- El usuario puede pedir scripts, snippets y ejemplos de código sin que la UI los oculte.
- Se mantiene la proteccion contra filtracion de configuracion interna, secretos y rastros de herramientas.
- No cambia el almacenamiento `.tbit`, el Memory Core, los proveedores IA ni el flujo de tools.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 28. Fase 73 - Correccion Visual Q-Vault Map y Seleccion de Memorias

## Problema

Q-Vault podia indicar que el mapa estaba listo, pero el area visual no mostraba nodos de forma fiable. La causa estaba en el layout: el mapa limpio dependia de un alto calculado dentro de un panel que no siempre tenia altura computable suficiente despues del chat.

Adicionalmente, la seleccion desde el mapa estaba redactada como si solo pudiera eliminar documentos, aunque tambien existen memorias de conversacion guardadas en Memory Core.

## Solucion

Se ajusto `src/App.tsx`:

- el contenedor `Q-Vault Map` ahora usa `flex` vertical con altura minima;
- el canvas SVG interno crece con `flex-1`;
- la grilla de fondo queda con `pointer-events: none`;
- el SVG queda sobre la grilla con `z-index`;
- los textos de accion ahora hablan de documentos, assets o memorias;
- al seleccionar un nodo se informa que puede eliminarse si pertenece al Q-Vault del usuario.

También se ajusto `src/components/WikiLinksMesh.tsx`:

- el halo del nodo seleccionado en Quantum Engine deja de ser blanco/gris ambiguo;
- ahora usa violeta T-BIT y anillo amarillo para comunicar que es seleccion/foco visual, no un dato fantasma.

## Impacto

- Q-Vault tiene una zona de visualizacion estable para nodos visibles.
- La seleccion en el mapa es mas clara.
- Las memorias de conversacion guardadas pueden eliminarse desde la accion de seleccion cuando pertenecen al usuario activo.
- No se modifico el modelo de almacenamiento, cifrado, Vit/Anti-Vit ni los endpoints fisicos.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 29. Fase 74 - Limpieza de Superposicion en Quantum Engine

## Problema

En Modo Desarrollador aparecia una columna de informacion detras de los paneles técnicos del lado derecho.

Esa columna era el panel heredado `T-BIT AI Cognitive Bridge`, que seguia renderizandose aunque el flujo de usuario ya fue trasladado a Q-Vault. Al quedar por debajo de `Health`, `AES`, `Permisos IA` y demas paneles técnicos, generaba una lectura confusa: parecia una columna fantasma o informacion oculta del Quantum Engine.

## Solucion

Se oculto el panel heredado dentro de `src/App.tsx` para que el lado derecho de Quantum Engine muestre solo controles técnicos reales del Modo Desarrollador.

## Impacto

- El Quantum Engine queda visualmente mas limpio.
- No se duplica el chat antiguo contra Q-Vault.
- No cambia el almacenamiento, los Vits, Anti-Vits, Memory Core, API ni proveedores IA.
- La conversacion principal sigue viviendo en Q-Vault/Mission Control.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 30. Fase 75 - Limpieza de Marcadores Heredados de Codigo

## Problema

Aunque el sanitizador nuevo ya preserva bloques de código normales, una sesion activa podia seguir arrastrando respuestas antiguas con:

```text
[bloque técnico omitido]
```

Ese marcador podia quedar dentro del historial enviado al proveedor IA y hacer que el modelo lo repitiera como patron, especialmente en solicitudes posteriores de código.

## Solucion

Se actualizo `TBitChatEngine.ts` para:

- limpiar marcadores heredados antes de enviar historial al proveedor IA;
- limpiar el marcador tambien en la salida final;
- agregar una politica explicita al system prompt: si el usuario pide código benigno, scripts o snippets, el modelo debe mostrar el código completo en Markdown normal;
- prohibir el uso del marcador heredado `[bloque técnico omitido]`.

## Nota operativa

Si el servidor ya estaba corriendo antes del cambio, debe reiniciarse para cargar esta version del motor de chat.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 31. Fase 76 - Control Claro de Agentes Multi-IA

## Problema

La pantalla de `AI providers` mostraba agentes como `Active` o `Ready`, pero para el usuario no era evidente que:

- `Active` es el agente principal que responde en modo normal;
- `Ready` solo significa que la instancia/proveedor esta configurado;
- las instancias con `enabled` son las que participan en Multi-IA.

Esto hacia parecer que todos los agentes `Ready` estaban activos al mismo tiempo, aunque el flujo real solo usa varios agentes cuando `Multi-IA consensus` esta encendido.

## Solucion

Se actualizo `src/App.tsx` para:

- mostrar una tarjeta explicativa dentro de `AI providers`;
- separar visualmente los estados `Active`, `Participa`, `Ready` y `Setup`;
- mostrar cuantos agentes entraran en consenso cuando Multi-IA esta encendido;
- agregar controles explicitos por instancia:
  - `Activar principal`,
  - `Participa` / `No participa`,
  - `Borrar`;
- emitir mensajes de estado al activar o pausar la participacion de un agente.

## Impacto

- El usuario puede crear varios agentes Gemini, OpenAI, Claude, Ollama u otros y decidir cuales participan en Multi-IA.
- El modo normal sigue usando solo el agente `Active`.
- El modo Multi-IA usa solo instancias configuradas y marcadas como participantes.
- No se cambia el backend ni el formato de almacenamiento.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 32. Fase 77 - Prueba Robusta de Proveedores Locales OpenAI-Compatible

## Problema

Al probar un proveedor local como Ollama, la interfaz podia quedarse esperando indefinidamente si el endpoint `/v1/chat/completions` tardaba demasiado, si el modelo estaba cargando, o si el runtime local no respondia con el formato esperado.

También se enviaba `tool_choice` incluso en pruebas sin herramientas, lo que no era necesario para servidores OpenAI-compatible locales.

## Solucion

Se actualizo `OpenAICompatibleProvider.ts` para:

- agregar timeout de proveedor (`TBIT_AI_PROVIDER_TIMEOUT_MS`, 60s por defecto);
- enviar `stream: false`;
- omitir `tools` y `tool_choice` cuando la prueba no usa herramientas;
- devolver un error claro cuando el proveedor no responde.

Se actualizo `src/tbitChatClient.ts` para:

- agregar timeout de cliente en `Probar IA`;
- impedir que la UI quede bloqueada si el backend o el proveedor local tardan demasiado.

Se actualizo `server.ts` para:

- mejorar los mensajes de error de `/api/ai/provider/test`;
- orientar al usuario cuando Ollama no responde, el modelo no coincide exactamente o la Base URL no esta activa.

## Impacto

- `Probar IA` ya no queda colgado indefinidamente.
- Ollama, LM Studio y proveedores OpenAI-compatible locales reciben un payload mas simple y compatible.
- No se cambia el almacenamiento, Multi-IA, Memory Core ni el flujo de chat existente.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 33. Fase 78 - Estabilizacion Q-Vault / Quantum Engine

## Problema

Durante la depuracion visual se detectaron cuatro riesgos practicos:

- Q-Vault podia reportar nodos disponibles pero no dibujarlos si alguna coordenada llegaba invalida o si faltaba `antiPosition`.
- Algunos flujos recargaban el mapa por `userId` y otros por nombre visible, lo que podia hacer que Q-Vault pareciera vacio aunque Quantum Engine si mostrara datos.
- Quantum Engine tenia riesgo de artefactos visuales por telemetria cognitiva montada de forma redundante.
- `Borrar conversacion` limpiaba la vista, pero no daba una ruta clara para borrar la bitacora persistente del notebook actual.

## Solucion

Se actualizo `src/App.tsx` para:

- validar coordenadas con `isFiniteVector3` antes de proyectarlas en el mapa 2D de Q-Vault;
- calcular `antiPosition` como vector inverso cuando el nodo visible no lo trae de forma explicita;
- filtrar nodos inseguros antes de calcular la proyeccion SVG del Second Brain/Q-Vault;
- unificar la carga del grafo con `loadBestSecondBrainGraph`, probando tanto `activeUserId()` como el nombre visible del usuario;
- reutilizar esa carga unificada despues de importar documentos y despues de guardar memoria;
- dejar una sola instancia de la telemetria `CognitiveQuantumRay` dentro del canvas de Quantum Engine;
- convertir `Borrar conversacion` en flujo seguro: primero limpia la conversacion visible y, si existen entradas persistentes del notebook, pregunta si tambien debe borrar la bitacora guardada.

## Impacto

- Q-Vault ya no queda visualmente vacio por un nodo con coordenadas incompletas.
- La vista limpia y Quantum Engine comparten una fuente de grafo mas consistente.
- El usuario puede borrar conversaciones irrelevantes con opcion de limpiar tambien la memoria persistente asociada al notebook.
- No se modifica el formato `.tbit`, ni la API de escritura, ni el cifrado, ni el motor fisico.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 34. Fase 79 - Optimizacion Visual Q-Vault

## Problema

La vista Q-Vault estaba funcionando como interfaz de usuario normal, pero aun se sentia demasiado confinada:

- el chat ocupaba demasiado espacio vertical;
- el mapa visible quedaba reducido frente al area de conversacion;
- el input podia sentirse empujado por el historial;
- la visualizacion no aprovechaba suficientemente el area principal de pantalla.

## Solucion

Se ajusto `src/App.tsx` de forma quirurgica para:

- reducir la altura maxima del historial de chat en Q-Vault;
- mantener el input como barra estable inferior;
- aumentar la prioridad visual del mapa Q-Vault;
- ampliar la altura minima del canvas SVG de memoria visible;
- conservar el sidebar, la carga universal de archivos, el selector de agentes, el flujo de chat, el modo desarrollador y el Quantum Engine sin cambios funcionales.

## Impacto

- Q-Vault se acerca mas al modelo de interfaz normal: chat como capa de dialogo y mapa como espacio principal.
- El usuario ve mas area disponible para la memoria visual sin entrar al modo desarrollador.
- No se alteran APIs, almacenamiento, cifrado, Memory Core, Query Index, Asset Manager ni el formato `.tbit`.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 35. Fase 80 - Configuracion Consolidada Q-Vault

## Problema

El menu de configuracion tenia secciones visibles que todavia no ejecutaban acciones claras para el usuario normal. Eso generaba friccion en puntos clave:

- usuario / cuenta local,
- bovedas y espacios T-BIT,
- carpeta de almacenamiento,
- tamano de boveda,
- proveedores IA,
- permisos IA,
- notebooks,
- seguridad / llaves,
- apariencia.

## Solucion

Se consolido `src/App.tsx` para que el modal de ajustes tenga pestañas funcionales:

- General: perfil local, accesos reales a bovedas y proveedores IA.
- Archivos y enlaces: carga universal y accesos a documentos/assets.
- Apariencia: controles de sidebar, pistas de mapa y vista limpia.
- Bovedas: estado de contenedor, carpeta, inventario de espacios y acceso al flujo seguro de cambio de usuario/tamano.
- Notebooks: notebook activo, renombrado, vuelta a General y borrado de conversacion.
- Permisos IA: autosalvado, consenso Multi-IA y confirmacion de borrados.
- Seguridad: confirmacion de acciones destructivas y resumen de AES-GCM/HMAC/V+Anti-V.
- Llaves: vista limpia del estado criptografico y acceso a gestion avanzada.
- Avanzado: listado de subsistemas técnicos y acceso a Modo Desarrollador.

También se agrego persistencia local para preferencias de usuario (`tbit_user_settings`) para que los toggles no se pierdan al recargar la app.

## Impacto

- El usuario normal encuentra las opciones principales sin entrar al Quantum Engine.
- Las opciones que antes parecian decorativas ahora ejecutan navegacion o acciones reales.
- Los paneles técnicos profundos siguen protegidos en Modo Desarrollador.
- No se modifica el formato `.tbit`, el cifrado, las APIs, el motor fisico ni el flujo de datos/anti-datos.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 36. Fase 81 - Rendimiento Visual y Capas Q-Vault

## Problema

Al crecer el numero de documentos, memorias, assets y conversaciones, la visualizacion podia saturarse:

- demasiados nodos visibles a la vez,
- chunks técnicos mezclados con documentos principales,
- labels costosos cuando hay muchos nodos,
- Anti-Vits y enlaces siempre visibles,
- Quantum Engine podia renderizar cada Vit como geometria individual aunque hubiera cientos de nodos.

## Solucion

Se optimizo `src/App.tsx` en dos niveles:

### Q-Vault

- Los chunks internos siguen agrupados bajo su documento principal.
- Se agregaron filtros de capas:
  - Documentos,
  - Memorias,
  - Vits,
  - Enlaces,
  - Anti-Vits,
  - Etiquetas.
- Se agrego LOD visual basico:
  - Q-Vault renderiza hasta 420 nodos visibles en la vista limpia.
  - Las etiquetas se ocultan automaticamente cuando hay mas de 90 nodos, salvo nodos activos/enfocados.
  - El contador muestra `visibles / totales`.

### Quantum Engine

- Para pocos nodos se conserva la visualizacion detallada `VitPair`.
- Cuando hay mas de 180 Vits, se activa un modo denso con `Instances` de React Three Fiber / Drei:
  - instancias para Vits,
  - instancias para Anti-Vits,
  - limite visual de 1200 instancias.
- El nodo resaltado mantiene render detallado para no perder foco visual.

## Impacto

- Q-Vault se mantiene legible para usuario normal.
- Los chunks no se renderizan como entidades independientes por defecto.
- El usuario puede activar/desactivar capas sin borrar informacion.
- Quantum Engine conserva detalle en universos pequenos y gana rendimiento en universos grandes.
- No cambia el almacenamiento, los indices, el cifrado, las APIs ni el formato `.tbit`.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 37. Fase 82 - Reparacion del Pantallazo Negro en Q-Vault

## Problema

Despues de los ajustes de Q-Vault, la app podia quedar completamente negra al iniciar. La consola del navegador mostraba:

```text
TypeError: Map is not a constructor
```

La causa raiz no estaba en el render del mapa, ni en `.tbit`, ni en el Memory Core. El problema era un sombreado de nombre en `src/App.tsx`: el icono `Map` importado desde `lucide-react` reemplazaba el constructor global `Map` de JavaScript dentro del modulo. Como la app usa `new Map(...)` para estructuras internas, React fallaba durante el render inicial.

## Solucion

Se renombro el icono importado:

```ts
Map as MapIcon
```

Y se actualizaron sus usos visuales para no interferir con el constructor nativo `Map`.

## Impacto

- La aplicación vuelve a montar correctamente.
- Q-Vault puede mostrar los nodos Markdown/memoria que ya existian.
- Quantum Engine no fue modificado.
- No cambia el formato `.tbit`, cifrado, WAL, HMAC, APIs, indices ni almacenamiento.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 38. Fase 83 - Mapa Q-Vault Interactivo

## Problema

Q-Vault ya mostraba documentos y memorias, pero el mapa limpio era una imagen SVG estatica:

- no tenia zoom,
- no permitia mover el plano,
- no comunicaba actividad visual,
- se sentia inferior al Quantum Engine aunque usara los mismos datos logicos.

## Solucion

Se actualizo `SecondBrainPreviewScene` en `src/App.tsx` para convertir la vista limpia en un mapa interactivo ligero:

- zoom con rueda del mouse;
- pan/arrastre sobre el fondo del mapa;
- controles visibles `+`, `-` y `Reset`;
- animacion sutil de flujo en enlaces y lineas hacia Anti-Vits;
- pulso visual en halos de nodos y anti-nodos;
- preservacion de seleccion por click/teclado sobre nodos.

La solucion mantiene Q-Vault como SVG 2D liviano para usuario normal. No duplica la escena Three.js del Quantum Engine, que sigue siendo la vista tecnica completa.

## Impacto

- Q-Vault deja de sentirse como imagen fija.
- El usuario puede explorar documentos, memorias, enlaces y Anti-Vits sin entrar al Modo Desarrollador.
- La seleccion/eliminacion de nodos existentes se conserva.
- No cambia el almacenamiento, los Vits, Anti-Vits, Memory Core, Query Index, cifrado ni APIs.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 39. Fase 84 - Q-Vault 3D Limpio

## Objetivo

Dar a Q-Vault una visualizacion 3D propia, navegable y entendible para usuario normal, sin mover ni duplicar el Quantum Engine técnico.

## Principio

Q-Vault no muestra la maquinaria interna completa. Usa los mismos nodos agregados que ya consume la vista limpia:

- documentos principales;
- memorias;
- Vits visibles cuando la capa esta activa;
- Anti-documentos como espejo conceptual;
- enlaces semanticos entre documentos.

Los chunks internos siguen agrupados por documento y permanecen ocultos por defecto.

## Implementacion

Se agregaron en `src/App.tsx`:

- `QVaultMapMode`, con modos `scene3d` y `map2d`;
- `QVaultScene3D`, escena React Three Fiber limpia para usuario;
- `QVaultNode3D`, renderer de nodo, halo, anillo, Anti-V y etiqueta;
- selector visual `3D vivo` / `Mapa 2D`;
- orbit, zoom, pan, damping y rotacion lenta elegante;
- seleccion por click conectada al mismo flujo existente de Q-Vault;
- foco de camara mediante `CameraFocus`;
- lineas limpias de documento a anti-documento;
- enlaces semanticos purpura entre documentos.

## Limites Conservados

- No se movio Quantum Engine a Q-Vault.
- No se exponen WAL, offsets, HMAC, AES, chunks crudos ni metadata tecnica en la vista normal.
- No se cambio el formato `.tbit`.
- No se cambio Memory Core, Query Index, Markdown Bridge, Asset Manager ni APIs.
- El mapa 2D queda como fallback disponible.

## Impacto

- Q-Vault pasa de mapa plano a second brain 3D navegable.
- El usuario puede ver documentos, anti-documentos y relaciones como una memoria viva.
- Se refuerza la identidad central: hacer visible lo invisible.
- Se mantiene la separacion de responsabilidades: Q-Vault para usuario; Quantum Engine para inspeccion tecnica.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# 40. Fase 85 - Limpieza Transaccional de Imports Fallidos

## Problema Detectado

Al intentar importar documentos grandes como DOCX, el flujo universal podia fallar despues de escribir fragmentos fisicos en `.tbit`.

El caso critico era:

1. `importUniversalDocument()` detectaba un documento extraible.
2. `importBinaryAsset()` escribia chunks binarios.
3. La conversion a documento consultable fallaba antes de completar el manifiesto semantico.
4. Quedaban `binary-chunk` o assets binarios parciales visibles en Quantum Engine.
5. El boton `Limpiar chunks huerfanos` no los eliminaba porque solo buscaba `markdown-chunk`.

## Cambios Implementados

- `binaryAssetBridge.ts` ahora hace rollback si una importacion binaria falla a mitad del proceso.
- `universalDocumentBridge.ts` ahora elimina el asset binario si la conversion semantica posterior falla.
- `markdownBridge.ts` amplio la limpieza de huerfanos para cubrir:
  - `markdown-chunk` sin padre;
  - `binary-chunk` sin padre;
  - `binary-chunk` cuyo padre no figure como asset activo;
  - roots binarios no registrados como assets activos.

## Garantia Nueva

Una importacion fallida no debe dejar fragmentos visibles o indexados sin manifiesto valido.

El limpiador manual sigue siendo conservador:

- no elimina assets binarios activos;
- no borra documentos validos;
- no modifica archivos que esten correctamente registrados en `asset-index.json`.

## Verificación

- `npm run logic:build`

---

# 41. Fase 86 - Importacion Grande en Background y Chunks Adaptativos

## Objetivo

Evitar que archivos grandes, especialmente DOCX/PDF/XLSX/binarios, congelen la app o dejen cientos de chunks huerfanos si una etapa posterior falla.

## Cambios implementados

- El Binary Asset Bridge ahora escribe chunks y manifiesto con `rememberMemoryBatch`, reduciendo escrituras repetidas de indice y latencia por archivo.
- El tamano de chunk binario sube de 16 KB a 32 KB seguros. La arquitectura incluye tiers objetivo de 64/128/256 KB, pero se capan a 32 KB mientras el contrato fisico por registro siga limitado a 64 KB.
- `importBinaryAsset()` mantiene rollback transaccional: si falla cualquier parte del guardado, colapsa raiz y chunks creados en esa transaccion.
- `importUniversalDocument()` separa preservacion fisica y extraccion semantica:
  - textos/Markdown siguen siendo consultables;
  - documentos pequenos pueden extraerse inline;
  - documentos grandes se guardan primero como asset verificable y dejan la extraccion semantica diferida.
- Se agrega limite claro de importacion JSON local de 16 MB para evitar errores ambiguos de Express/body-parser.
- El endpoint `/api/documents/import` acepta `semanticMode`: `auto`, `inline`, `deferred` o `skip`.
- Q-Vault/Omni Dropzone muestra progreso de lectura local y subida HTTP mediante `FileReader.onprogress` y `XMLHttpRequest.upload.onprogress`.
- La UI advierte automaticamente cuando un archivo grande se guardara primero como binario verificable para no bloquear la importacion.

## Resultado

Los imports grandes dejan de intentar convertir todo semanticamente en la misma operacion. El sistema prioriza: preservar, verificar, registrar y despues extraer significado en una capa separada. Esto reduce residuos, bloqueos y confusion del usuario.

# 42. Fase 87 - Cuotas Dinamicas por Tamano de Boveda

## Problema Detectado

La importacion de documentos binarios grandes podia fallar con:

```text
CUOTA_EXCEDIDA: limite de 500 registros activos alcanzado.
```

Ese limite pertenecia al MVP original y era independiente del tamano real del espacio T-BIT. En una boveda de 1 GB o 2 GB, un documento grande dividido en chunks podia superar 500 registros aunque todavia existiera espacio fisico disponible.

## Correccion

- Se reemplazo el limite fijo de 500 registros por una cuota dinamica basada en el tamano real del contenedor.
- Se conserva un piso minimo de 500 registros para espacios pequenos.
- Se aplica una relacion proporcional de registros por MB de contenedor.
- Se mantiene un limite absoluto superior para evitar crecimiento no controlado.
- El servicio moderno `TBitStorageService` y el endpoint raw antiguo `/api/inyectar` usan la misma politica conceptual.

## Resultado

Las bovedas grandes ahora pueden almacenar documentos divididos en muchos chunks sin chocar contra una restriccion artificial del MVP. La proteccion de cuota sigue existiendo, pero escala con el espacio configurado por el usuario.

## Seguridad Operativa

El flujo batch de escritura prepara y valida registros antes de escribir WAL y bytes fisicos. Si la cuota se supera, el lote se rechaza antes de materializar nuevos chunks desde esa ruta.

# 43. Fase 88 - Manifiestos Binarios Compactos

## Problema Detectado

Tras resolver la cuota de registros, la importacion de un DOCX grande podia fallar con:

```text
El dato excede el limite del MVP (65536 bytes).
```

El problema no era el chunk binario individual. El manifiesto raiz del asset guardaba la lista completa de chunks dentro del payload y tambien como links. En archivos grandes, esa lista podia superar el limite fisico de un registro T-BIT.

## Correccion

- Los chunks binarios siguen guardandose como registros independientes.
- El manifiesto raiz ya no duplica todos los chunk keys dentro del registro fisico.
- El manifiesto guarda `chunkCount`, `chunkBytes` y un patron derivable de claves.
- La reconstruccion del archivo deriva las claves de chunks desde `rootKey + chunkCount`.
- El Asset Index mantiene las dependencias completas para borrado seguro, reconstruccion administrativa y limpieza.

## Resultado

El nodo principal del archivo queda pequeno, estable y visible para Q-Vault, mientras los chunks internos siguen ocultos y administrados por el sistema. Esto evita que un documento grande rompa el limite de 64 KB por registro sin cambiar el contrato fisico del contenedor.

# 44. Fase 89 - Manifiestos Markdown Compactos y Chunking Seguro

## Problema detectado

Despues de compactar los manifiestos binarios, los documentos Markdown y los textos extraidos desde documentos Office todavia podian fallar con:

```text
El dato excede el limite del MVP (65536 bytes)
```

La causa no era el archivo binario principal, sino el manifiesto logico del documento: guardaba todas las claves `chunk_0001`, `chunk_0002`, etc. dentro del payload y tambien como links. En documentos con muchos fragmentos, el manifiesto raiz podia superar el limite por registro.

## Implementacion

- Los documentos Markdown grandes ya no guardan la lista completa de chunks en el manifiesto raiz.
- El manifiesto guarda `chunkCount` y un `chunkKeyPattern` compacto.
- Las claves fisicas se derivan de forma determinista con:

```text
<documentKey>::chunk_0001..N
```

- Los links del documento raiz vuelven a contener solo relaciones semanticas reales, no chunks internos.
- La reconstruccion del documento soporta ambos formatos:
  - formato anterior con `chunks: string[]`;
  - formato nuevo con `chunkCount`.
- El tamano efectivo de chunk textual bajo a 12 KB para dejar margen al wrapper JSON, metadatos, cifrado y duplicacion controlada entre `text` y `payload.content`.

## Resultado

Los documentos grandes importados como Markdown, TXT, DOCX/PDF/XLSX con texto extraido o contenido semantico ya no inflan el manifiesto raiz ni exponen chunks internos como relaciones de usuario. El sistema conserva la reconstruccion completa del documento sin superar el limite de registro individual.

# 45. Fase 90 - Clasificacion Segura de Archivos y Etiquetas Legibles

## Problema detectado

Al importar algunos documentos Office, la respuesta de Q-Vault podia mostrar caracteres binarios corruptos como nombre del documento:

```text
Documento añadido a tu fuente de conocimiento: [bytes binarios omitidos]
```

Esto ocurria cuando el navegador o el sistema reportaba un MIME ambiguo, por ejemplo `text/plain`, para un archivo que realmente no debia ser tratado como texto crudo. En ese caso, la capa universal podia intentar decodificar bytes binarios como UTF-8.

## Implementacion

- La clasificacion textual ahora prioriza la extension del archivo.
- Si el archivo tiene extension conocida no textual, como `.docx`, `.pdf` o `.xlsx`, no se trata como texto crudo aunque el MIME sea ambiguo.
- La UI valida que el titulo mostrado sea legible.
- Si el backend devuelve un titulo con caracteres de reemplazo o controles no imprimibles, la UI usa el nombre real del archivo como fallback.

## Resultado

Los documentos binarios ya no deben aparecer con basura binaria en el mensaje de importacion. Q-Vault muestra nombres legibles y mantiene el flujo correcto:

- DOCX/PDF/XLSX: extraccion semantica cuando aplique, o asset verificable con semantica diferida.
- Markdown/TXT/JSON/CSV/XML/YAML: importacion textual consultable.

# 46. Fase 91 - Ocultamiento Visual de Chunks Internos

## Problema detectado

Al importar documentos grandes, especialmente DOCX/PDF/XLSX o Markdown extensos, el motor podia crear cientos o miles de chunks internos. Esos chunks eran correctos para almacenamiento, reconstruccion e integridad, pero el Quantum Engine los estaba mostrando como nodos de usuario.

Resultado:

- el mapa se saturaba,
- la visualizacion parecia colapsar,
- el usuario veia fragmentos técnicos que no le aportan contexto,
- Q-Vault perdia su objetivo de vista limpia.

## Implementacion

- Se separo la lista fisica/logica completa de Vits de la lista renderizable.
- Los nodos con clave `::chunk_####` ya no se pasan al canvas principal por defecto.
- Los previews de Q-Vault usan solo Vits renderizables y documentos agrupados desde `memoryGraph`.
- El mesh de enlaces de memoria ya no renderiza nodos `markdown-chunk` ni `binary-chunk` como entidades principales.
- El modo de anti-documento muestra el espejo conceptual del documento raiz y sus relaciones semanticas, no una nube de anti-chunks internos.
- Los chunks siguen existiendo en storage, indices y dependencias para reconstruccion, borrado integral y verificacion.
- El panel técnico puede seguir reportando cuantos chunks internos existen, pero no se muestran como nodos normales.

## Resultado

Los documentos grandes pueden existir como muchas unidades fisicas internas sin colapsar el mapa visual. La vista normal vuelve a representar documentos, memorias, assets y enlaces semanticos; los chunks quedan ocultos como infraestructura.

# 47. Fase 92 - Memoria Conversacional Visible y Herramientas Invisibles

## Problema detectado

Las conversaciones con IA ya se guardaban automaticamente en la boveda como registros `CHAT_TURN`, pero visualmente no tenian una identidad propia. Ademas, Gemini podia mostrar al usuario trazas internas como:

```text
Solicitud de herramienta T-BIT: consultar_oraculo
Argumentos: { ... }
```

Eso ocurria porque el adaptador Gemini convertia tool-calls antiguas en texto plano para reenviarlas al modelo. En algunos casos Gemini interpretaba ese texto como respuesta visible y lo devolvia al usuario.

## Implementacion

- Los nodos de conversacion `chat-autosave` ahora tienen color propio en el grafo:
  - nucleo violeta `#7e1bfd`;
  - halo amarillo `#ffd84d` para representar la consulta del usuario;
  - anillo verde `#00ff88` para representar la respuesta de la IA.
- El adaptador Gemini ya no reenvia tool-calls antiguas como texto visible.
- Los resultados de herramientas siguen entrando como contexto para que Gemini pueda redactar una respuesta final natural.
- El prompt del orquestador ahora declara que las herramientas son invisibles para el usuario.
- El motor de chat incluye una proteccion adicional: si una traza de herramienta llega a colarse desde cualquier proveedor, se reemplaza por una explicacion legible y no tecnica.

## Verificación funcional

Las consultas y respuestas normales se siguen guardando automaticamente mediante:

```text
<usuario>::Bitacora::<notebook>::<turnId>
```

Cada registro conserva:

- pregunta del usuario,
- respuesta de la IA,
- proveedor/agente,
- notebook,
- modo de respuesta,
- tags de chat,
- cifrado e integridad del contenedor.

Como cualquier memoria escrita con `memoryCoreClient.remember`, queda almacenada en el espacio T-BIT y participa del modelo Vit/AntiVit del motor fisico.

# 48. Fase 93 - Conversaciones No Destructivas, Errores IA Legibles y Chats en Q-Vault

## Problema detectado

Tres comportamientos generaban confusion o riesgo de perdida:

- Gemini podia devolver errores crudos del proveedor, incluyendo JSON técnico y códigos como `503 UNAVAILABLE`.
- El boton `Borrar conversacion` podia terminar borrando tambien bitacoras persistentes si el usuario aceptaba la segunda confirmacion.
- Las conversaciones guardadas como `chat-autosave` existian en la boveda, pero Q-Vault no tenia una capa explicita para activarlas/desactivarlas ni mostrarlas como nodos de chat con Anti-V visible.

## Implementacion

- El frontend ahora traduce errores de proveedores IA a mensajes humanos:
  - saturacion temporal,
  - cuota/rate limit,
  - llave API invalida,
  - fallo de conexion,
  - error generico de modelo.
- `Borrar conversacion` ahora es no destructivo:
  - limpia solamente el chat visible de la sesion;
  - no llama a `memoryCoreClient.delete`;
  - informa que la memoria persistente se conserva.
- Q-Vault agrega la capa `Chats IA`:
  - encendida por defecto;
  - permite ocultar o mostrar conversaciones y respuestas guardadas;
  - clasifica claves `::Bitacora::`, source `chat-autosave` o tag `chat` como nodos de conversacion.
- Los nodos de chat en Q-Vault usan violeta como color principal.
- Los chats tambien participan en la visualizacion de Anti-V:
  - Q-Vault muestra la linea dato/anti-dato cuando `Anti-Vits` esta activo;
  - el mesh técnico de memoria tambien considera chats como nodos espejables.

## Resultado

La experiencia normal queda mas segura para el usuario:

- un error temporal de Gemini no expone JSON ni código interno;
- limpiar la pantalla no destruye la boveda;
- los chats guardados se pueden ver u ocultar en Q-Vault;
- las conversaciones conservan su representacion dato/anti-dato como el resto de memorias persistentes.

# 49. Fase 94 - Q-Vault Code Graph Extractor v1

## Objetivo

Permitir que Q-Vault no solo guarde archivos de código fuente como texto o assets, sino que extraiga una primera capa estructural util para búsqueda, contexto IA y futuras visualizaciones de arquitectura.

Esta fase no reemplaza el motor fisico `.tbit` ni introduce un analizador AST completo. Es una capa semantica superior, conectada al importador universal, que traduce código fuente a un documento Markdown enriquecido antes de guardarlo en Memory Core.

## Implementacion

- Nuevo modulo `codeGraphExtractor.ts`.
- Deteccion de archivos de código por extension o MIME:
  - TypeScript / TSX,
  - JavaScript / JSX,
  - Python,
  - Java,
  - C#,
  - Go,
  - Rust,
  - PHP,
  - Ruby,
  - C/C++,
  - HTML/CSS/SCSS.
- Extraccion ligera, sin dependencias nuevas:
  - imports,
  - exports,
  - funciones,
  - clases/interfaces/enums/structs,
  - rutas API simples.
- El resultado se guarda como Markdown consultable con frontmatter:
  - `source_kind: code`,
  - `language`,
  - `code_file`,
  - conteos de imports/exports/funciones/clases,
  - tags como `code`, `language-typescript`, `functions`, `imports`.
- El código original queda preservado dentro del documento importado.
- Si el archivo supera el limite de registro Markdown, sigue usando el chunking existente del Markdown Bridge.

## Alcance deliberado

Esta fase evita generar nodos por cada funcion o clase para no colapsar Q-Vault ni Quantum Engine. El mapa sigue mostrando el archivo/documento principal; la estructura interna queda disponible para búsqueda e IA.

## Uso esperado

Cuando el usuario o una IA importa un archivo `.ts`, `.tsx`, `.js`, `.jsx`, `.py` u otro archivo soportado:

1. Q-Vault detecta que es código fuente.
2. Extrae estructura basica.
3. Lo transforma en un documento consultable.
4. Lo almacena con el flujo normal T-BIT:
   - cifrado,
   - integridad,
   - Vit/Anti-Vit,
   - indice,
   - chunking si aplica.

## Proxima evolucion posible

La siguiente fase natural seria un extractor AST real con Tree-sitter u otra libreria especializada para:

- llamadas entre funciones,
- dependencias circulares,
- arbol de componentes React,
- rutas backend/frontend,
- mapa de arquitectura por proyecto.

Eso debe seguir viviendo como extractor semantico, no dentro del motor fisico `.tbit`.

# 50. Fase 95 - Controles de Code Graph e importacion transparente

## Objetivo

Cerrar la primera experiencia de producto del extractor de código sin convertir Q-Vault en un clon de Graphify. El usuario puede importar código con cero friccion, recibir un resumen entendible y controlar si desea relaciones tecnicas visibles en el mapa.

## Implementacion

- El importador universal acepta dos controles:
  - `analyzeCode`,
  - `showCodeGraphRelations`.
- Ajustes > Archivos y enlaces agrega:
  - `Analizar código automaticamente`: encendido por defecto;
  - `Mostrar relaciones tecnicas en el mapa`: apagado por defecto.
- El backend conserva el comportamiento actual si el frontend no envia estos campos.
- La respuesta de importacion puede incluir `codeGraph`:
  - lenguaje,
  - conteo de imports,
  - conteo de exports,
  - conteo de funciones,
  - conteo de clases,
  - conteo de rutas API,
  - muestras principales.
- Q-Vault muestra feedback humano al importar código:
  - `código typescript: 12 funciones, 3 clases, 8 imports`.
- Cuando las relaciones tecnicas estan activas, el documento enriquecido agrega wikilinks limitados a dependencias detectadas.

## Decisiones de producto

- Las relaciones tecnicas quedan apagadas por defecto para no saturar el mapa.
- No se generan nodos por funcion, clase o import individual en esta fase.
- No se agrego Tree-sitter ni parser AST pesado; esta fase mantiene la extraccion ligera existente.

# 51. Cierre

T-BIT CORE v1.1 ya no es solo una demo de escritura dual. Es un ecosistema local compuesto por:

- motor fisico `.tbit`,
- integridad dato/anti-dato,
- cifrado AES-256-GCM obligatorio en reposo,
- API segura,
- memoria IA,
- Memory Core,
- Markdown Bridge,
- Asset Manager,
- Binary Asset Bridge,
- extractores PDF/DOCX/XLSX,
- Code Graph Extractor v1,
- controles de Code Graph e importacion transparente,
- Query Index incremental,
- Document Q&A sobre Markdown reconstruido desde chunks,
- reconciliacion fisico/logica desde Health,
- conectores IA universales,
- AI Switchboard clicable,
- Second Brain Workspace,
- Quantum Engine avanzado,
- gestion profesional de llaves AES-GCM,
- permisos IA,
- salud del contenedor,
- visualizacion 3D,
- espacios locales por usuario.

La tesis actual del sistema es:

```text
Un usuario o una IA puede guardar contexto, documentos y archivos en un vacio verificable, recuperarlos por clave o por indice, verlos como estructura espacial, y gobernar que operaciones son permitidas.
```

Ese es el nucleo de producto que debe guiar las siguientes fases.

---

# Actualizacion - Diagnostico y compatibilidad Gemini / Ollama Local

## Problema detectado

La configuracion de proveedores IA podia fallar de forma confusa por tres causas:

- Gemini seguia usando `gemini-1.5-flash` como modelo por defecto en partes del frontend/backend.
- Si el usuario pegaba `models/gemini-2.5-flash`, el runtime podia construir una ruta invalida con `models/models/...`.
- Ollama/LM Studio/Hermes locales recibian una cabecera `Authorization` con una llave ficticia aunque no requieren API key local.

## Cambios aplicados

- Gemini queda normalizado a `gemini-2.5-flash` como modelo por defecto.
- El runtime Gemini acepta tanto `gemini-2.5-flash` como `models/gemini-2.5-flash`.
- La Base URL de Gemini se normaliza para evitar rutas duplicadas como `/models/...`.
- Los proveedores OpenAI-compatible normalizan Base URL si el usuario pega `/chat/completions` al final.
- Ollama, LM Studio y Hermes locales ya no envian `Authorization: Bearer ...` si la API key esta vacia.
- Los errores visibles al usuario ahora incluyen detalle sanitizado, sin exponer llaves API.

## Configuracion recomendada

### Gemini

```text
Modelo: gemini-2.5-flash
Base URL: https://generativelanguage.googleapis.com/v1beta
API key: llave de Google AI Studio
```

También se acepta el formato de modelo `models/gemini-2.5-flash`.

### Ollama local

```text
Proveedor: Ollama
Modelo: nombre exacto mostrado por `ollama list`
Base URL: http://localhost:11434/v1
API key: vacio
```

Ejemplo valido si `ollama list` muestra ese nombre exacto:

```text
qwen3.5:4b
```

No es valido escribir el modelo duplicado, por ejemplo:

```text
qwen3.5:4bqwen3.5:4b
```

A menos que Ollama lo muestre literalmente con ese nombre.

## Verificación

- `npm run logic:build` completado correctamente.
- `npm run build` completado correctamente.
- Persiste solo el warning normal de Vite por bundle grande.

---

# Actualizacion - Timeout local para Ollama / LM Studio

## Diagnostico

La configuracion de Ollama era correcta cuando:

```text
Modelo: qwen3.5:4b
Base URL: http://localhost:11434/v1
API key: vacia
```

La verificacion directa contra Ollama confirmo:

- `GET /api/tags` encontro el modelo `qwen3.5:4b`.
- `POST /v1/chat/completions` respondio correctamente.
- La respuesta simple tardo mas de 30 segundos, incluso con un prompt minimo.

Por eso Q-Vault podia mostrar timeout de 60 segundos cuando el prompt real incluia instrucciones del sistema, memoria, herramientas y contexto.

## Cambio aplicado

`OpenAICompatibleProvider.ts` ahora usa dos timeouts:

- Proveedores remotos: `TBIT_AI_PROVIDER_TIMEOUT_MS`, por defecto 60 segundos.
- Proveedores locales (`localhost`, `127.0.0.1`, `::1`): `TBIT_LOCAL_AI_PROVIDER_TIMEOUT_MS`, por defecto 180 segundos.

Esto evita falsos timeouts con modelos locales que tardan en cargar o razonar, sin hacer mas lentos los proveedores remotos.

## Recomendacion de uso

Para Ollama local:

```text
Base URL: http://localhost:11434/v1
Modelo: nombre exacto de `ollama list`
API key: vacia
```

Si un modelo local tarda demasiado, usar uno mas pequeno o aumentar:

```text
TBIT_LOCAL_AI_PROVIDER_TIMEOUT_MS=240000
```

## Verificación

- `npm run logic:build` completado correctamente.
- `npm run build` completado correctamente.

---

# Actualizacion - Timeout del boton Probar IA para proveedores locales

## Diagnostico

El backend ya permitia mas tiempo para Ollama, LM Studio y otros proveedores locales, pero el cliente web mantenia un limite fijo de 75 segundos en el boton `Probar IA`.

Esto podia producir el mensaje:

```text
La prueba del proveedor IA excedio 75s.
```

Aunque la configuracion de Ollama fuera correcta y el servidor local estuviera activo.

## Cambio aplicado

`src/tbitChatClient.ts` ahora diferencia el timeout de prueba segun el proveedor:

- Proveedores remotos: 75 segundos.
- Proveedores locales u OpenAI-compatible en `localhost`, `127.0.0.1` o `::1`: 190 segundos.

Esto mantiene rapidas las pruebas remotas y evita falsos fallos en modelos locales que tardan en cargar o razonar.

## T-BIT Local / local-rules

`T-BIT Local` no es Ollama ni un LLM externo. Es el modo deterministico interno de Q-Vault.

Sirve para:

- usar la app sin API keys;
- validar flujos de memoria, búsqueda y guardado;
- mantener un fallback privado/offline;
- ejecutar reglas simples como `recuerda`, `consulta` y recuperacion desde el Memory Core.

No tiene Base URL porque no llama a ningun servidor IA. Tampoco razona como Gemini, Claude u Ollama; responde usando reglas locales y el indice de Q-Vault.

## Verificación

- `npm run logic:build` completado correctamente despues de integrar el timeout del boton `Probar IA`.
- `npm run build` completado correctamente despues de integrar el timeout del boton `Probar IA`.

---

# Actualizacion - Eliminacion de usuario local y onboarding de cuenta

## Cambio aplicado

La pantalla `Ajustes > General > Perfil local` ahora incluye la accion `Eliminar usuario`.

Esta accion:

- elimina solo el perfil local guardado en el navegador (`tbit_user_profile`);
- no elimina contenedores fisicos `.tbit`;
- no elimina metadata, WAL, indices ni assets de las bovedas;
- reinicia el estado visual de la sesion;
- vuelve a abrir el modal de primer arranque para seleccionar o crear una boveda;
- exige doble confirmacion: primero `confirm`, despues escribir exactamente `ELIMINAR USUARIO`.

Las bovedas fisicas se siguen eliminando desde `Ajustes > Storage/Bovedas`, donde existe seleccion explicita de espacios y confirmacion separada. Esto evita que un usuario borre accidentalmente datos fisicos al querer cerrar o limpiar su identidad local.

## Onboarding real de usuario

El flujo de primer arranque funciona asi:

1. Al abrir Q-Vault, el frontend busca `tbit_user_profile` en `localStorage`.
2. Si el perfil falta o esta incompleto, se abre el modal de primer arranque.
3. El usuario define:
   - nombre visible;
   - ID T-BIT local;
   - email;
   - contrasena local;
   - carpeta de bovedas;
   - tamano preferido del espacio;
   - politica si ya existe un espacio: conservar o sobrescribir/recrear.
4. La contrasena local no se guarda en texto plano. Se guarda como hash PBKDF2-SHA256 con salt aleatorio.
5. El frontend llama al backend para preparar o activar los contenedores del usuario.
6. El backend crea o reutiliza los archivos `.tbit` correspondientes segun la opcion elegida.
7. Cuando el backend confirma la preparacion, el perfil se guarda en `localStorage` y la app entra al espacio activo.

## Diferencia entre usuario, boveda y API key

El usuario local identifica el namespace logico de memorias, documentos, notebooks, consultas y bovedas. No es una cuenta cloud ni un login remoto.

La boveda es el contenedor fisico `.tbit` donde se guardan datos cifrados, Vits, Anti-Vits, metadata, WAL e indices.

La API key local no se crea por usuario. Se crea por instalacion local para proteger la comunicacion entre el frontend y el servidor Express.

## Como se crea la API key local

`npm run setup:secret` ejecuta `scripts/setup-secret.cjs`.

Si `.env` no existe, el script genera:

- `TBIT_HMAC_SECRET`;
- `TBIT_HMAC_KEY_ID`;
- `TBIT_ENCRYPTION_SECRET`;
- `TBIT_ENCRYPTION_KEY_ID`;
- `TBIT_API_KEY`;
- `VITE_TBIT_API_KEY`.

`TBIT_API_KEY` y `VITE_TBIT_API_KEY` reciben la misma llave aleatoria. El frontend la envia al backend mediante `x-tbit-api-key`. El backend la valida antes de aceptar operaciones protegidas.

Si `.env` ya existe, el script conserva la llave actual y no la regenera automaticamente. Esto evita invalidar una instalacion funcionando.

## Importante

Las API keys de proveedores como Gemini, OpenAI, Claude, Grok, Ollama-compatible o LM Studio son distintas. Esas llaves se configuran en `Ajustes > AI providers` y sirven para hablar con cada modelo. No reemplazan la API key local de T-BIT.

## Verificación

- `npm run logic:build`
- `npm run build`

---

# Actualizacion - Correccion de idioma y codificación de interfaz

## Objetivo

Corregir inconsistencias visibles de idioma y codificación en Q-Vault OS para mejorar la experiencia de usuario normal.

## Problema detectado

La aplicación tenia textos visibles con mojibake y mezcla innecesaria de ingles/español. Ejemplos corregidos: `muéstrame`, `añadido`, `CUÁNTICA`, `ANIQUILACIÓN`, `·` y `→`.

El transporte HTTP y HTML ya usaban UTF-8; el problema estaba en cadenas fuente previamente danadas dentro del frontend.

## Cambio aplicado

- Se corrigieron cadenas mojibake en `src/App.tsx`.
- Se normalizaron labels visibles de Q-Vault: `Memory`, `Nodes`, `Status`, `Streaming`, `Ready`, `Files / documents`.
- Se corrigieron textos de onboarding y configuracion: contrasena, confirmacion, tamano, vacio, fisico, código y conversacion.
- Se mantuvo `America/Bogota` sin tilde porque es identificador técnico IANA y no debe traducirse.

## Alcance

No se modifico logica de almacenamiento, renderizado 3D, APIs, cifrado, WAL, HMAC, V/Anti-V ni flujos de importacion.

## Verificación

- Búsqueda de mojibake ejecutada sobre `src\App.tsx`, `src\components` y `server.ts` sin cadenas rotas relevantes. `America/Bogota` se conserva como timezone técnico.
- `npm run build` completado correctamente.
- `npm run logic:build` completado correctamente.

## Actualización 2026-08-11 - Configuración en español consistente

- Se corrigieron etiquetas del modal de configuración que seguían en inglés: Opciones, Plugins principales, Proveedores IA, Bóvedas, Autoguardar memoria, Consenso Multi-IA e Idioma.
- El selector de idioma ahora persiste la preferencia local en localStorage. Español queda como idioma activo; English queda marcado como pendiente para no prometer una traducción completa que aún no existe.
- Se mantuvieron sin traducir nombres técnicos o de producto cuando funcionan como identificadores: T-BIT, Q-Vault, Memory Core, AES-GCM, HMAC y nombres de modelos/proveedores.
- Verificación ejecutada: npm run build y npm run logic:build.

---

# Actualización 2026-10-07 - Cierre de completación: tests, type-check, hardening y documentación sincronizada

**Rama:** `feature/completar-app`. **Registro completo:** `docs/CHANGELOG.md`.
**Evidencia y detalle:** `PLAN.md`, `DECISIONES.md`, `INFORME_FINAL.md` (raíz del repo).

## Qué se hizo (todo verificado ejecutando)

1. **Contrato de agentes actualizado al baseline real (18 especificaciones).**
   El test `tests/agentSpecs.inventory.test.ts` congelaba un baseline de 17
   agentes y exigía que NO existiera un Graph Engineering Agent; el commit
   `c434507` ya había añadido `GraphEngineeringAgent.agent.md` como definición
   autoritativa (roadmap de ingeniería §6), dejando 2 tests en rojo sin causa
   real. El test ahora exige 18 specs y valida el contrato del Graph
   Engineering Agent. Inventario JSON regenerado con `npm run agents:inventory`.
   Resultado: `npm test` 26/26 PASS.

2. **Type-check estricto del frontend en verde.** `npx tsc --noEmit` fallaba
   con 33 errores en `src/`. Corregidos sin cambiar comportamiento: tipos
   `vite/client` en `tsconfig.json`; en `src/App.tsx` se usan los campos reales
   del contrato semántico (`response.index.model`, `response.index.totalRecords`,
   `result.textPreview`), lo que además elimina `undefined` visibles en los
   mensajes de estado de búsqueda semántica; predicado de tipo explícito en los
   nodos de preview; null-safety en `isProviderConfigured`. Resultado: 0 errores.

3. **Rayo de telemetría cuántica corregido.** `QuantumTelemetryRay.tsx` usaba
   JSX `<line>`/`<lineDashedMaterial>`, que colisiona con el elemento SVG
   `line` en los tipos de R3F. Ahora construye objetos `THREE.Line` con
   `LineDashedMaterial` de forma imperativa y los monta con `<primitive>`,
   preservando colores, opacidades y animación de `dashOffset`. Además se
   agrega `computeLineDistances()`, requerido por three.js para que el material
   discontinuo renderice guiones (antes las líneas se veían sólidas).

4. **API key local con comparación timing-safe.** Los middlewares de API
   (`app.use("/api", ...)` y `requireSymbolicApiKey`) comparaban la llave con
   `!==`. Ahora usan SHA-256 + `crypto.timingSafeEqual`, el mismo patrón
   exigido para el HMAC de metadata. Mensajes, códigos y comportamiento
   externo sin cambios. Verificado en runtime: sin llave → 401; llave
   incorrecta → 401; llave válida → 200.

5. **Documentación sincronizada con el código.** `docs/ProjectSnapshot.txt`
   regenerado contra el árbol real (antes listaba archivos inexistentes);
   `PROJECT_STATE.MD` actualizado (18 agentes, GraphEngineeringAgent existe,
   tests en verde); `docs/README.md` aclara que `engineering_tree.txt` queda
   como artefacto histórico; creado `docs/CHANGELOG.md` como registro de
   cambios; el baseline `engineering/reports/AI-EVOLUTION-BASELINE.md` quedó
   commiteado con un addendum que refuta sus hallazgos P3/P4 con evidencia
   (todos los endpoints `/api` están protegidos por el middleware global de
   API key; `operar_simbolicamente` sí está declarada en `TBitToolSchemas.ts`).

## Verificación ejecutada (línea de cierre)

```text
npm test                 -> 26/26 PASS (4 archivos)
npx tsc --noEmit         -> 0 errores
npm run build            -> PASS (vite; warning conocido: chunk 1.39 MB)
npm run logic:build      -> PASS (0 errores)
npx tsx server.ts        -> API activa en :3000, recovery WAL completado
GET  /api/health/container        -> HEALTHY
POST /api/inyectar               -> ESCRITURA_FISICA_CONFIRMADA
POST /api/recuperar              -> INTEGRIDAD_CONFIRMADA
POST /api/ai/chat (determinista) -> respuesta con tool memorizar_en_vacio persistido
Sin API key en cualquier /api    -> 401
```

## Qué NO cambió

- Motor `.tbit`, Vit/Anti-Vit, AES-256-GCM, HMAC, WAL, snapshots, probing,
  cuotas, endpoints, API REST, frontend Q-Vault/Quantum Engine, conectores IA,
  permisos IA, memoria persistente. No se eliminó ni reemplazó tecnología,
  archivos funcionales ni dependencias. No se añadieron dependencias nuevas.

## Deuda técnica conocida que queda registrada (no bloqueante)

- Bundle frontend de 1.39 MB en un solo chunk (`App.tsx` monolítico).
- Historial de sesiones de chat en memoria (se pierde al reiniciar el proceso).
- Duplicación legacy `TBitAiBridge` vs `TBitPrompts`/`TBitToolSchemas`.
- Empaquetado desktop (instalador/firma/servicio en segundo plano).
- Agent runtime multi-agente (fases 1-11 del roadmap de evolución IA):
  parcialmente cubierto por la Fase 64 (ver sección siguiente).

---

# 25.30 Fase 64 - Runtime Multi-Agente Paralelo (AgentOrchestrator)

## Objetivo

Ejecutar las 18 especificaciones de agentes de `.github/agents/*.agent.md` de forma individual y en enjambre paralelo, con malla de comunicación inter-agente auditable, validación cruzada (consenso multi-IA) y respuesta consolidada, sin bloquear la API Express ni introducir dependencias nuevas.

## Archivos nuevos

```text
src/agents/AgentSpecLoader.ts    carga y parseo de los 18 .agent.md (contrato del test de inventario)
src/agents/AgentEventBus.ts      bus de eventos tipado + journal auditable en memoria (tope 2000 eventos)
src/agents/AgentOrchestrator.ts  orquestador: pool de concurrencia, ejecución individual/enjambre, consenso
tests/AgentRuntime.phase64.test.ts  7 tests del runtime
```

## Cómo funciona

### Carga de especificaciones

`AgentSpecLoader` lee los 18 `.agent.md` con la misma semántica de frontmatter congelada por `tests/agentSpecs.inventory.test.ts` (`name`, `description`, `capabilities`, `tools`, `argument-hint`). Los gaps documentados (`permissions`, `modelRequirements` ausentes) se cubren con un **PolicyOverlay derivado en runtime** desde el vocabulario de tools declarado: ningún agente obtiene permiso de borrado y el borrado siempre exige confirmación humana.

### Ejecución individual

```text
POST /api/agents/run   { "agent": "Code Reviewer", "task": "...", "userId": "...", "context": "..." }
```

Cada agente se ejecuta con **aislamiento de contexto**: historial de mensajes propio, system prompt construido desde su especificación (rol, capacidades, reglas del runtime y cuerpo del `.agent.md`), y su propio runtime de proveedor IA (por defecto el runtime global de `AiProviderFactory`, con fallback determinista local).

### Enjambre paralelo

```text
POST /api/agents/swarm  { "task": "...", "agents": ["..."], "validators": ["..."], "userId": "..." }
```

1. Todos los agentes seleccionados (por defecto los 18) trabajan la tarea **en paralelo** mediante un pool de concurrencia propio (semáforo asíncrono, límite configurable, sin dependencias nuevas).
2. Los validadores cruzados (por defecto `Consensus Agent` y `Validation Agent`) revisan cada salida y emiten veredictos (`aprobado` / `observaciones` / `rechazado`).
3. Un agente de consenso consolida la respuesta final, incluyendo las observaciones de la validación cruzada y marcando afirmaciones sin respaldo.

### Malla de comunicación auditable

Todo el flujo pasa por `AgentEventBus`: `task.started`, `task.completed`, `task.failed`, `message.sent` (incluye llamadas a herramientas), `validation.requested`, `validation.completed`, `consensus.requested`, `consensus.completed`. El journal se consulta con:

```text
GET /api/agents/events?limit=100
```

El catálogo de agentes con su política derivada se consulta con:

```text
GET /api/agents
```

## Variables de entorno

Ninguna nueva obligatoria. El proveedor IA de los agentes es el mismo runtime global (`TBIT_AI_PROVIDER` y claves por proveedor ya documentadas). Sin proveedores remotos configurados, los agentes operan con el proveedor determinista local.

## Seguridad y no regresión

- No se modificó el motor `.tbit`, cifrado AES-256-GCM, HMAC, WAL, locks, snapshots ni ningún endpoint existente.
- No se añadieron dependencias nuevas.
- Los agentes heredan el ejecutor de herramientas con `aiPermissions.ts` cuando se integra al chat; el borrado por IA sigue requiriendo confirmación humana.
- El journal de eventos vive en memoria y está acotado (2000 eventos) para no crecer sin límite.

## Verificación ejecutada

```text
npm test                                  -> 33/33 PASS (5 archivos, 7 tests nuevos)
npm run logic:build                       -> PASS
npx tsc --noEmit                          -> 0 errores
Smoke runtime (servidor real en :3000):
  GET  /api/agents          -> total: 18 agentes con política derivada
  POST /api/agents/run      -> Code Reviewer completado (proveedor determinista)
  POST /api/agents/swarm    -> 2 agentes en paralelo + Consensus Agent:
                               2 resultados, 2 veredictos, 9 eventos auditables,
                               respuesta consolidada
  GET  /api/agents/events   -> journal con eventos del enjambre
```


---

# 25.31 Fase 65 - Motor de Conectores IA con Failover Continuo

## Objetivo

Ninguna solicitud de chat debe fallar por cuota agotada, caida de un proveedor, timeout o clave invalida. La cadena de proveedores conmuta en caliente, monitorea latencia/disponibilidad y recupera automaticamente los conectores caidos tras un enfriamiento (cooldown).

## Archivos nuevos y modificados

```text
FallbackProviderChain.ts            nuevo: decorador AiProvider con failover, cooldown y monitoreo
AiProviderFactory.ts                modificado: conector OpenRouter + createFallbackProviderChain()
server.ts                           modificado: /api/ai/chat usa la cadena; nuevo endpoint de salud
tests/FallbackProviderChain.phase65.test.ts  12 tests nuevos
```

## Como funciona

### Cadena de failover

`FallbackProviderChain` implementa la interfaz `AiProvider`, por lo que es transparente para `TBitChatEngine` y para el runtime de agentes. Ante cada solicitud recorre la cadena en orden de prioridad, omitiendo proveedores en enfriamiento:

1. Proveedor solicitado explicitamente por el usuario (si es resoluble).
2. Proveedores declarados en `TBIT_AI_FALLBACK_CHAIN` (ids separados por coma).
3. Proveedor determinista local T-BIT como ultimo eslabon: el chat nunca falla por cuotas remotas.

### Clasificacion de fallos y enfriamiento

| Fallo | Deteccion | Cooldown |
|---|---|---|
| Cuota / rate limit | HTTP 429, `resource_exhausted`, `quota`, `rate limit` | 5 minutos |
| Clave invalida | HTTP 401/403, `unauthorized`, `invalid api key` | 5 minutos |
| Servidor | HTTP 500/502/503/504, `overloaded`, `bad gateway` | 30 segundos |
| Timeout | exceso de `requestTimeoutMs` (default 60 s) | 30 segundos |
| Red | `fetch failed`, `econnrefused`, `enotfound`, `econnreset` | 60 segundos |

Al expirar el enfriamiento el proveedor se reintenta automaticamente (recuperacion en caliente verificada por test).

### Monitoreo

`GET /api/ai/providers/health` reporta por proveedor: disponibilidad, enfriamiento restante, ultimo error, contadores de peticiones/fallos y latencia (ultima y promedio de las ultimas 50 muestras).

## Conector OpenRouter nuevo

Se añadio `openrouter` al catalogo (`OpenAI-Compatible`, base `https://openrouter.ai/api/v1`, modelo por defecto `openrouter/auto`). Variables: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`. Los endpoints gratuitos de OpenRouter se usan mediante este conector o mediante proveedores personalizados de `Ajustes > AI providers` (Fase 45).

## Variables de entorno

```text
TBIT_AI_FALLBACK_CHAIN   cadena de failover, ej: gemini,openrouter,grok,qwen,ollama,lmstudio
OPENROUTER_API_KEY       clave de OpenRouter (opcional)
OPENROUTER_MODEL         modelo OpenRouter (opcional, default openrouter/auto)
OPENROUTER_BASE_URL      base URL alternativa (opcional)
```

Los proveedores sin clave/base URL configurada se omiten de la cadena sin generar error. La lista es totalmente configurable y no depende de ningun proveedor en particular.

## No regresion

- `createAiProviderRuntime()` y `createAiProviderRuntimeFromConfig()` conservan su comportamiento y API publica.
- Sin claves remotas configuradas, el chat sigue funcionando con el proveedor determinista (verificado en runtime).
- No se añadieron dependencias nuevas; no se modifico el motor `.tbit`.

## Verificacion ejecutada

```text
npm test                                  -> 45/45 PASS (6 archivos, 12 tests nuevos)
npm run logic:build                       -> PASS
npx tsc --noEmit                          -> 0 errores
Smoke runtime (servidor real en :3000):
  GET  /api/ai/providers/health -> cadena con eslabon determinista disponible
  POST /api/ai/chat con provider "openai" sin clave -> 200 OK, respuesta del
       eslabon determinista (failover transparente, sin error HTTP)
```


---

# 25.32 Fase 66 - Aprendizaje Continuo y Memoria Permanente en Q-Vault

## Objetivo

Que toda la actividad del runtime multi-agente (ejecuciones, bitacoras de consenso, verificaciones) se escriba automaticamente en el contenedor fisico de Q-Vault, que los agentes consulten ese conocimiento acumulado antes de ejecutarse, y que las respuestas consolidadas se verifiquen contra el vault antes de entregarse (autocorreccion sin alucinacion).

## Archivos nuevos y modificados

```text
src/agents/AgentMemoryBridge.ts   nuevo: puente runtime-agentes <-> memoryCore/queryIndex
server.ts                         modificado: /api/agents/run y /api/agents/swarm integrados
tests/AgentMemoryBridge.phase66.test.ts  5 tests nuevos
```

## Como funciona

### Escritura automatica en Q-Vault

Cada ejecucion de agente se persiste via `indexExternalMemoryRecord()` (el mismo pipeline determinista de Memory Core: checksum SHA-256, wikilinks, sincronizacion automatica de `memory-core-index.json` y `query-index.json`):

```text
AI::AgentRuntime::<Agente>::<taskId>   source=agent-runtime
AI::AgentConsensus::<taskId>           source=agent-consensus
```

La bitacora de consenso enlaza mediante wikilinks (`[[AI::AgentRuntime::...]]`) a cada ejecucion del enjambre, y cada ejecucion enlaza a su bitacora. Todo queda visible en el grafo de memoria y en los paneles existentes de Q-Vault.

### Lectura evolutiva (contexto antes de ejecutar)

Antes de ejecutar un agente o un enjambre, `buildVaultContext()` recupera del Query Index los registros mas relevantes para la tarea y los inyecta como contexto (`=== CONTEXTO RECUPERADO DE Q-VAULT ===`). Q-Vact actua asi como fuente unica de verdad de la memoria de la IA: las experiencias pasadas alimentan las decisiones nuevas.

### Verificacion cruzada (anti-alucinacion)

Antes de entregar la respuesta, `verifyAgainstVault()` extrae los terminos significativos del texto, los contrasta contra el Query Index y devuelve:

```json
{
  "checkedTerms": ["cache", "fingerprint", "cuantica"],
  "verifiedTerms": ["cache", "fingerprint"],
  "unverifiedTerms": ["cuantica"],
  "citations": [{ "key": "...", "title": "...", "score": 12.5, "preview": "..." }]
}
```

Los terminos sin respaldo almacenado quedan marcados como no verificados y las afirmaciones respaldadas citan su fuente en Q-Vault. La verificacion es informativa y no bloqueante: nunca rompe la respuesta, pero siempre expone que esta verificado y que no.

## Respuestas de API ampliadas

```text
POST /api/agents/run    -> { ok, result, vaultCitations, verification }
POST /api/agents/swarm  -> { ok, swarm, consensusMemory, vaultCitations, verification }
```

## Variables de entorno

Ninguna nueva. La concurrencia del pool de agentes es configurable con `TBIT_AGENT_MAX_CONCURRENCY` (default 4).

## No regresion

- Reutiliza `memoryCore.ts` y `queryIndex.ts` sin modificarlos.
- La persistencia y la verificacion son best-effort: un fallo de memoria nunca rompe la ejecucion de un agente ni la respuesta HTTP.
- No se añadieron dependencias nuevas; el motor `.tbit` permanece intacto.

## Verificacion ejecutada

```text
npm test                                  -> 50/50 PASS (7 archivos, 5 tests nuevos)
npm run logic:build                       -> PASS
npx tsc --noEmit                          -> 0 errores
Smoke runtime (servidor real en :3000):
  POST /api/agents/run (Code Reviewer, tarea "indice semantico")
    -> ejecucion persistida como AI::AgentRuntime::Code_Reviewer::<taskId>
  POST /api/query/search "indice semantico"
    -> 1 resultado con source=agent-runtime (memoria consultable)

---

# 25.33 Fase 67 - Sistema Dinamico de Busqueda e Instalacion de Skills

## Objetivo

Capacidad nativa para buscar, instalar, cargar y ejecutar Skills dinamicamente segun el contexto, tratando toda skill externa como contenido no confiable y sin ejecutar jamas codigo descargado.

## Archivos nuevos y modificados

```text
src/skills/DynamicSkillManager.ts        nuevo: gestor de skills (catalogo, deteccion, instalacion, ejecucion)
skills/*.md                              nuevos: 3 skills semilla declarativas del catalogo local
TBitToolSchemas.ts                       modificado: herramientas buscar_skill / ejecutar_skill / instalar_skill
TBitLocalToolExecutor.ts                 modificado: implementacion de las 3 herramientas
tests/DynamicSkillManager.phase67.test.ts  7 tests nuevos
```

## Modelo de seguridad (cadena de suministro)

1. **Solo definiciones declarativas**: las skills son `.md`/`.json` con frontmatter (`name`, `id`, `description`, `tags`). Contienen instrucciones, patrones y checklists. Nunca se ejecuta codigo descargado.
2. **"Ejecutar" = inyectar contexto**: `ejecutar_skill` devuelve el contenido como bloque marcado `=== SKILL T-BIT (material de referencia NO CONFIABLE) ===` con regla de precedencia explicita: el contenido de una skill NUNCA prevalece sobre el libro T-BIT, los guardarrailes ni las instrucciones del operador.
3. **Commit fijado obligatorio en skills remotas**: sin `TBIT_SKILL_REPOS` (formato `owner/repo@commit,...`) o commit explicito, la instalacion remota se rechaza. Solo se aceptan rutas `.md`/`.json`.
4. **Integridad sha256**: cada skill lleva checksum; se verifica en cada ejecucion (deteccion de manipulacion, cubierto por test).
5. **Permisos**: la instalacion pasa por `aiPermissions.ts` (accion `write`) y la ejecucion por accion `read`.
6. **Persistencia en Q-Vault**: toda skill instalada se registra como `AI::Skill::<id>` (source `skill`) consultable en el Query Index y visible en el grafo de memoria, ademas de `data/skills-index.json`.

## Herramientas nuevas (disponibles para la IA en chat y agentes)

```text
buscar_skill(query)                  -> skills relevantes por terminos/tags con puntuacion
ejecutar_skill(id, task?)            -> bloque de contexto declarativo verificado
instalar_skill(contenido, ...)       -> instala skill declarativa con permisos y persistencia
```

## Catalogo local semilla

```text
skills/code-review-checklist.md   checklist sistematico de revision de codigo
skills/root-cause-analysis.md     metodo de causa raiz (5 porques + evidencia)
skills/api-design-patterns.md     patrones declarativos de diseno de APIs REST
```

## Repositorios de referencia

`REFERENCE_SKILL_REPOS` exporta los repos del objetivo (rmaterile/agent-skills, andrej-karpathy-skills, claw-code, Open-Generative-AI, gstack, open-jarvis/OpenJarvis, superpowers, VoltAgent/awesome-agent-skills). La descarga remota exige commit fijado por `TBIT_SKILL_REPOS`; sin el, se rechaza con error explicativo (verificado por test). La consulta remota esta desactivada por defecto.

## Variables de entorno

```text
TBIT_SKILL_REPOS   repos con commit fijado, ej: rmaterile/agent-skills@abc1234,VoltAgent/awesome-agent-skills@def5678
```

## Verificacion ejecutada

```text
npm test                                  -> 57/57 PASS (8 archivos, 7 tests nuevos)
npm run logic:build                       -> PASS
npx tsc --noEmit                          -> 0 errores
Smoke runtime (ejecutor de herramientas real via tsx):
  buscar_skill "revision de codigo"  -> top=code-review-checklist
  ejecutar_skill code-review-checklist -> bloque NO CONFIABLE de 1568 caracteres
  instalar_skill (runtime)           -> persistida con checksum sha256
```

```



---

# 25.34 Fase 68 - UX del Runtime Multi-Agente en Q-Vault OS

## Objetivo

Exponer el runtime multi-agente, el failover de IA y la memoria evolutiva en la interfaz con un lenguaje claro, indicadores de razonamiento legibles y estados de carga/error, sin degradar Quantum Engine ni la experiencia existente.

## Archivos nuevos y modificados

```text
src/agentRuntimeClient.ts            nuevo: cliente API del runtime (agentes, eventos, salud, enjambre)
src/components/AgentRuntimePanel.tsx nuevo: panel del modo desarrollador
src/App.tsx                          modificado: montaje del panel (1 import + 1 linea)
```

## Que muestra el panel

1. **Metricas**: agentes del catalogo, eslabones de la cadena IA y proveedores en enfriamiento.
2. **Salud de proveedores**: estado por eslabon (DISPONIBLE / ENFRIAMIENTO / CAIDO) con latencia de la ultima peticion; el failover continuo de la Fase 65 se vuelve visible.
3. **Ejecutor de enjambre**: campo de tarea + boton Ejecutar, con indicador de razonamiento por fases ("agentes en paralelo -> validacion cruzada -> consenso"), estado de exito y error.
4. **Consenso**: respuesta consolidada, veredictos de validacion cruzada con color semantico (aprobado/observaciones/rechazado) y terminos sin respaldo en Q-Vault marcados explicitamente como no verificados (anti-alucinacion visible).
5. **Journal auditable**: ultimos 40 eventos del bus inter-agente con marca de tiempo.
6. **Catalogo**: los 18 agentes con su politica derivada (lectura/escritura/borrado) y numero de herramientas.

## Decisiones de UX

- El panel vive en el **modo desarrollador** existente (junto a Container Health, Query Index, Memory Graph), conservando la identidad visual (dark, mono, bordes finos, acentos cyan/lime) y sin tocar el flujo de usuario final del chat.
- El lenguaje oculta la complejidad tecnica: no se exponen chunks, WAL ni llaves; se habla de "agentes", "consenso" y "respaldo en Q-Vault".
- Estados de carga con spinner (`animate-spin`), errores en bloque rojo legible, botones deshabilitados durante operaciones.

## Paridad multiplataforma

La interfaz es React 18 + Vite + Tailwind servida por Express: se comporta identica en Windows, macOS y Linux (mismo bundle, sin APIs nativas de plataforma). **No verificado en macOS/Linux** (entorno de desarrollo Windows); no hay dependencias de plataforma conocidas en el stack de UI. El empaquetado de escritorio sigue siendo deuda tecnica registrada (ver seccion de limitaciones del libro).

## Verificacion ejecutada

```text
npx tsc --noEmit   -> 0 errores (frontend + backend)
npm run build      -> PASS (vite 6.4.2, 2365 modulos; warning preexistente de chunk 1.4 MB)
npm run logic:build -> PASS
npm test           -> 57/57 PASS
```

---

# 25.35 Fase 69 - Tanda 2: Agentes reales contra la cadena de failover

## Objetivo

Garantizar que cada agente ejecuta su especificacion contra el proveedor activo de la cadena de IA (con failover 429/5xx/timeout), usando el eslabon determinista unicamente como ultimo recurso, y que la respuesta queda atribuida al proveedor real que la sirvio.

## Gap encontrado y corregido (causa raiz)

`/api/agents/run` y `/api/agents/swarm` creaban `AgentOrchestrator` sin `providerFactory`; el metodo `resolveRuntime` caia a `createAiProviderRuntime()` (UN runtime unico, sin cadena). Con un proveedor remoto configurado, un 429/503/timeout fallaba la ejecucion del agente sin conmutar y sin recurrir al determinista.

Correccion:

- `AgentOrchestrator.resolveRuntime` (default) construye ahora una `FallbackProviderChain` por ejecucion (env `TBIT_AI_PROVIDER` + `TBIT_AI_FALLBACK_CHAIN`), con el determinista como ultimo eslabon. Import dinamico (`await import`) compatible ESM/vitest/tsx.
- `FallbackProviderChain` expone `getLastServed(): ServedProviderInfo | null` (id/label/model/mode del proveedor que completo con exito la ultima generacion).
- `AgentRunResult` registra `providerId`, `providerMode` y `deterministicFallback` (true cuando respondio el eslabon determinista final), para que API e interfaz puedan marcar la respuesta como "sin IA".

## Verificacion con servidor simulado OpenAI-compatible (429/503/timeout)

Suite nueva `tests/AgentRealProviders.phase69.test.ts` (5 tests) contra un servidor HTTP local que responde por modelo:

```text
openai (gpt-4o-mini) -> 429 Rate limit exceeded
grok                 -> 503 Service unavailable
qwen                 -> 200 MOCK-OK
slow-model           -> 400 ms de delay (escenario timeout)
```

Resultados registrados:

```text
1. Cadena openai,grok,qwen: 429 -> 503 -> exito en qwen; resultado providerId=qwen, deterministicFallback=false.
2. Cadena openai (solo 429): el eslabon determinista final responde; providerId=deterministic, deterministicFallback=true.
3. Timeout (80 ms) sobre proveedor lento: conmutacion al siguiente eslabon sin colgar la ejecucion.
4. Los 18 agentes ejecutan su especificacion completa contra el proveedor simulado: 18/18 completed con salida real.
5. Los 18 agentes con solo el eslabon determinista: 18/18 completed, deterministicFallback=true (degradacion visible, no silenciosa).
```

## Verificacion ejecutada

```text
npm test            -> 62/62 PASS (9 archivos, 5 tests nuevos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
```

---

# 25.36 Fase 70 - Tanda 2: Concurrencia (journal + Q-Vault + motor .tbit)

## Objetivo

Demostrar con pruebas de estres que 18 agentes en paralelo escribiendo a la vez en el journal y en Q-Vault no producen condiciones de carrera, corrupcion de WAL ni bloqueos, con el motor `.tbit` intacto.

## Gap encontrado y corregido (causa raiz)

`memoryCore` ejecutaba `loadIndex -> mutar -> saveIndexAndSyncQuery` (read-modify-write de `memory-core-index.json`) sin serializacion. Con escrituras concurrentes (18 agentes persistiendo via `onRunComplete`), dos secciones criticas se intercalaban y la ultima escritura pisaba a la anterior: **se perdian registros**.

Correccion: mutex async en proceso (`withIndexWriteLock`, cola de promesas) envolviendo las seis rutas que mutan el indice: `rememberMemory`, `rememberMemoryBatch`, `indexExternalMemoryRecord`, `removeMemoryIndexRecord`, `deleteMemoryRecord`, `deleteMemoryRecordsBatch`. El storage fisico conserva su propia serializacion (`TBitStorageService.withOperation` + lock de archivo), que no se toco.

## Pruebas de estres (suite nueva `tests/AgentConcurrencyStress.phase70.test.ts`)

```text
1. Enjambre de 18 agentes en paralelo (maxConcurrency 18) con persistencia automatica:
   18/18 completados, 18 task.started con el taskId del enjambre, ids de evento unicos,
   y las 18 ejecuciones presentes en Q-Vault (AI::AgentRuntime::*::taskId).
2. 60 escrituras paralelas de registros externos: 60/60 presentes en el indice (cero perdidas).
3. 18 escritores paralelos sobre la misma clave: registro unico, checksum sha256 consistente.
4. Motor .tbit bajo 27 escrituras fisicas paralelas (18 claves + 9 sobre la misma clave):
   19/19 recuperaciones INTEGRIDAD_CONFIRMADA, WAL append-only con cada id resuelto en
   COMMITTED/ABORTED (ningun PENDING huerfano), checksum global calculable, sin bloqueos.
```

## Verificacion ejecutada

```text
npm test            -> 66/66 PASS (10 archivos, 4 tests nuevos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
```

---

# 25.37 Fase 71 - Tanda 2: Auditoria de proveedores IA y visibilidad del eslabon determinista

## Objetivo

Auditar uno por uno los proveedores del catalogo (Gemini, Grok/xAI, Qwen, Hermes, Ollama, LM Studio, OpenRouter y OpenAI-compatible dinamico), asegurar configuracion 100% por variables de entorno sin claves en el codigo, verificar el estado de nivel gratuito contra documentacion oficial (con fecha) y hacer visible cuando una respuesta proviene del eslabon determinista final.

## Gaps encontrados y corregidos

1. **Grok/xAI y Qwen exigian base URL sin default oficial.** Corregido: `https://api.x.ai/v1` (xAI, endpoint OpenAI-compatible oficial) y `https://dashscope.aliyuncs.com/compatible-mode/v1` (DashScope, modo compatible OpenAI de Qwen). Los overrides por env siguen teniendo prioridad.
2. **La respuesta del chat no indicaba que proveedor sirvio realmente.** Corregido: `/api/ai/chat` devuelve ahora `providerInfo` del proveedor REAL que sirvio (`FallbackProviderChain.getLastServed()`), `provider` con su etiqueta y `deterministicFallback: boolean`. El frontend (`App.tsx`) muestra un aviso explicito en el chat cuando la respuesta viene del eslabon determinista: "AVISO T-BIT: esta respuesta proviene del ESLABON DETERMINISTA LOCAL (reglas fijas, sin modelo de IA)...". El mismo marcado existe para agentes (`AgentRunResult.deterministicFallback`, Fase 69).

## Variables de entorno por proveedor (sin claves en el codigo)

```text
TBIT_AI_PROVIDER            id del proveedor solicitado (deterministic|openai|gemini|claude|grok|qwen|hermes|ollama|lmstudio|openai-compatible|openrouter)
TBIT_AI_FALLBACK_CHAIN      cadena de failover por ids, ej: gemini,openrouter,ollama
TBIT_AI_PROVIDER_TIMEOUT_MS timeout por intento (default 60000)
TBIT_LOCAL_AI_PROVIDER_TIMEOUT_MS timeout para proveedores locales (default 180000)
TBIT_AGENT_MAX_CONCURRENCY  concurrencia del pool de agentes (default 4)

OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
GEMINI_API_KEY / GEMINI_BASE_URL / GEMINI_MODEL
ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL
XAI_API_KEY (alias GROK_API_KEY) / XAI_BASE_URL (alias GROK_BASE_URL) / XAI_MODEL (alias GROK_MODEL)
QWEN_API_KEY / QWEN_BASE_URL / QWEN_MODEL
HERMES_API_KEY / HERMES_BASE_URL / HERMES_MODEL
OLLAMA_API_KEY / OLLAMA_BASE_URL / OLLAMA_MODEL
LMSTUDIO_API_KEY / LMSTUDIO_BASE_URL / LMSTUDIO_MODEL
OPENROUTER_API_KEY / OPENROUTER_BASE_URL / OPENROUTER_MODEL
Legacy: TBIT_LLM_API_KEY / TBIT_LLM_MODEL / TBIT_LLM_BASE_URL
```

## Verificacion uno por uno (tests `tests/AiProviderFactory.phase71.test.ts`, 14 tests)

```text
deterministic      -> siempre disponible, sin configuracion (ultimo eslabon)
openai             -> OpenAICompatibleProvider, https://api.openai.com/v1
gemini             -> GeminiProvider nativo (generateContent)
claude             -> AnthropicProvider nativo (messages)
grok/xai           -> OpenAICompatibleProvider, https://api.x.ai/v1 (default nuevo)
qwen               -> OpenAICompatibleProvider, DashScope compatible-mode (default nuevo)
hermes             -> local, http://localhost:11434/v1, sin API key
ollama             -> local, http://localhost:11434/v1, sin API key
lmstudio           -> local, http://localhost:1234/v1, sin API key
openai-compatible  -> dinamico, exige API key + base URL explicitas
openrouter         -> https://openrouter.ai/api/v1
Remotos sin clave  -> rechazados con error explicativo (nunca claves en codigo)
Cadena de failover -> determinista agregado automaticamente como ultimo eslabon
```

## Verificacion contra la red real (fecha de comprobacion: 2026-11-05)

```text
Alcanzabilidad de endpoints (GET sin clave; 401/403 = endpoint operativo y autenticado):
  openai            -> HTTP 401   OK
  gemini            -> HTTP 403   OK
  claude            -> HTTP 401   OK
  grok/xai          -> HTTP 401   OK
  qwen (DashScope)  -> HTTP 401   OK
  openrouter        -> HTTP 200   OK (catalogo publico de modelos)
  ollama/lmstudio   -> no activos en este entorno (esperado; son locales)

Nivel gratuito (verificado contra documentacion oficial, 2026-11-05):
  Gemini      -> SI: free tier en Google AI Studio ("Start building free of charge"),
                 con acceso limitado a modelos (p. ej. Gemini 4 Argon NO esta en free tier).
  OpenRouter  -> SI: 12 modelos con sufijo :free de 454 totales (verificado contra
                 https://openrouter.ai/api/v1/models).
  xAI (Grok)  -> SIN free tier verificado: pricing muestra solo modelos de pago
                 (grok-4.7: $2/$6 por 1M tokens in/out).
  OpenAI      -> API de pago (sin free tier de API verificado).
  Claude      -> API de pago (sin free tier de API verificado).
  Qwen        -> endpoint operativo; cuota gratuita de prueba NO VERIFICADA en la
                 documentacion consultada.
  Hermes      -> pesos abiertos, ejecutable local (gratuito como local). No verificado en runtime.
  Ollama / LM Studio -> ejecucion local gratuita; no activos en este entorno.

Failover real con claves: NO VERIFICADO. El archivo .env local no contiene claves de
proveedores IA (solo secretos T-BIT: HMAC, cifrado, API key local). .env esta en
.gitignore (verificado); ninguna clave fue impresa ni versionada.
```

## Verificacion ejecutada

```text
npm test            -> 80/80 PASS (11 archivos, 14 tests nuevos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
npm run build       -> PASS (vite 6.4.2, warning preexistente de chunk)
```

---

# 25.38 Fase 72 - Tanda 2: Verificacion anti-alucinacion en el chat principal

## Objetivo

Garantizar que el chat principal (TBitChatEngine) aplique, antes de responder, la verificacion contra Q-Vault y las citas, igual que el runtime de agentes (Fase 66), y que el indice semantico y los wikilinks se actualicen tras cada interaccion relevante.

## Gap encontrado y corregido

**El chat no aplicaba verificacion anti-alucinacion.** `procesarMensajeUsuario` respondia directamente del proveedor sin contrastar contra Q-Vault (a diferencia del runtime de agentes, que desde la Fase 66 usa `buildVaultContext` + `verifyAgainstVault`). Corregido con tres hooks opcionales en `TBitChatEngineOptions`, todos cableados en `server.ts` (`/api/ai/chat`) con la misma fuente de verdad que los agentes:

1. `vaultContextProvider` — recupera contexto relevante de Q-Vault ANTES de responder y lo inyecta en el mensaje de sistema (RAG contra el vault persistido).
2. `vaultVerifier` — verifica la respuesta final contra Q-Vault antes de entregarla; la respuesta incluye `verification` con `checkedTerms`/`verifiedTerms`/`unverifiedTerms` y `citations`.
3. `interactionPersister` — persiste en Q-Vault las interacciones relevantes (con uso de herramientas o con citas de respaldo) como `AI::Chat::<sesion>::<ts>`, con payload tipado, tags `chat`/`interaccion` y **wikilinks** `[[clave]]` a cada registro citado. Tras persistir se fuerza el refresco del indice semantico (`getSemanticIndexStats`, que reconstruye cuando cambia el fingerprint del query index). Las interacciones irrelevantes (saludo sin tools ni citas) NO se persisten, para no contaminar el vault.

Todo es best-effort: un fallo del vault (contexto, verificacion o persistencia) nunca rompe la respuesta del chat.

## Verificacion (tests `tests/TBitChatEngine.antiHallucination.phase72.test.ts`, 5 tests)

```text
1. El contexto de Q-Vault se inyecta en el mensaje de sistema antes de responder
   (verificado inspeccionando la llamada real al proveedor) y las citas viajan en la respuesta.
2. La verificacion entrega terminos verificados/no verificados con citas.
3. Las interacciones relevantes (con tools) se persisten; las irrelevantes (saludo) no.
4. Un vault caido nunca rompe la respuesta (best-effort garantizado por test).
5. Integracion real contra el vault fisico (directorio temporal): semilla con
   indexExternalMemoryRecord -> contexto recuperado -> "fenix" verificado ->
   interaccion persistida con wikilink [[Proyecto::Fenix::Descripcion]] comprobado
   en memory-core-index.json.
```

## Verificacion ejecutada

```text
npm test            -> 85/85 PASS (12 archivos, 5 tests nuevos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
```

---

# 25.39 Fase 73 - Tanda 2: Skills remotas verificadas contra la red real

## Objetivo

Probar contra la red real la descarga e indexacion de catalogos de los repositorios de referencia, con commit fijado y verificacion de integridad, tratando todo el contenido como no confiable, y ampliar el catalogo mas alla de las 3 skills semilla con skills reales verificadas.

## Implementacion

1. **`listRemoteCatalog(repo, commit?)`** (DynamicSkillManager): indexa el arbol git del repo via API de GitHub y devuelve las rutas `SKILL.md` con su tamano y el commit resuelto (fijable para instalacion posterior). Solo metadatos: este paso nunca descarga contenido.
2. **Manifiesto `skills/remote-catalog.json`** (versionado, solo metadatos, sin contenido de terceros): 8 skills reales verificadas contra la red el 2026-11-06, cada una con `repo@commit`, ruta, sha256 del contenido exacto y bytes. Fuentes: `rmaterile/agent-skills@301b02b1...` (5 skills) y `rmaterile/superpowers@22f0b463...` (3 skills).
3. **`installFromCatalog(id)`**: descarga con commit fijado desde raw.githubusercontent.com, verifica el sha256 del contenido contra el manifiesto (rechaza contenido manipulado upstream) y persiste en Q-Vault pasando por aiPermissions.
4. **`loadRemoteCatalogManifest()`**: tolera BOM; el manifiesto se excluye del catalogo local de skills (no es una skill).

## Catalogo ampliado (3 semilla -> 3 + 8 remotas verificadas, fecha: 2026-11-06)

```text
rmaterile/agent-skills @ 301b02b12bff98e4688e6984af6556802322bbde:
  test-driven-development      sha256 8fcaa57c...  16845 B
  security-and-hardening       sha256 35856685...  17578 B
  code-review-and-quality      sha256 a47551da...  21263 B
  context-engineering          sha256 5ee2929d...  15514 B
  debugging-and-error-recovery sha256 01cff31f...  10893 B
rmaterile/superpowers @ 22f0b463e7a5e579904dd6211a520321035526f7:
  systematic-debugging           sha256 51c6435d...  9530 B
  verification-before-completion sha256 2befe7fc...   3646 B
  writing-plans                  sha256 a6c67c19...  10335 B
```

## Verificacion contra la red real (tests `tests/DynamicSkillManager.remoteCatalog.phase73.test.ts`, 4 tests)

```text
1. Indexacion real del catalogo de rmaterile/agent-skills: 25 SKILL.md detectadas,
   commit resuelto = 301b02b1... (coincide con la verificacion manual del 2026-11-06).
2. Instalacion real de 3 skills del manifiesto con commit fijado: sha256 verificado,
   ejecucion como bloque "material de referencia NO CONFIABLE" que nunca prevalece
   sobre el libro T-BIT.
3. Anti-manipulacion: un manifiesto con sha256 falso RECHAZA la instalacion
   ("Integridad comprometida") aunque el contenido exista upstream.
4. Catalogo ampliado: 3 semilla + 5 remotas instaladas = 8, y detectSkillNeed
   encuentra "security-and-hardening" para una tarea de auditoria de inputs.
Sin red: los tests se omiten (NO VERIFICADO); nunca se inventa contenido.
```

## Verificacion ejecutada

```text
npm test            -> 89/89 PASS (13 archivos, 4 tests nuevos con red real)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
```

## Fase 79 (Tanda 4) — Corrección de la regresión del frontend compilado

Fecha: 2026-11-09. Rama: `feature/evolucion-tbit`. Decisiones: `DECISIONES_EVOLUCION.md`
D-011, D-012, D-013, D-014.

### Síntomas reportados (comprobados en navegador real por el usuario)

```text
C. npm run dev (127.0.0.1:5173)      -> la interfaz carga y muestra el primer
                                        arranque "Configura tu Q-Vault OS". OK (referencia).
A. npm run build + npx vite preview  -> pantalla negra; la interfaz no se dibuja.
B. npm run start:desktop (:3000)     -> el navegador muestra el código HTML como texto.
Build: aviso "Circular chunk: vendor-misc -> vendor-react -> vendor-misc" y
modulepreload de vendor-three-core (810 kB), vendor-fiber y vendor-drei en index.html.
```

### Causas raíz (diagnosticadas por reproducción, no por hipótesis)

1. **HTML entregado como texto (síntoma B):** `server.ts` tenía un middleware global
   `app.use((_req, res) => res.setHeader("Content-Type", "application/json; charset=utf-8"))`
   que fijaba el Content-Type de TODAS las respuestas. La librería `send` (usada por
   `express.static` y `res.sendFile`) no sobreescribe un Content-Type ya presente, de modo
   que el HTML se servía como `application/json` y el navegador lo mostraba como texto.
   Reproducido con `curl -i http://localhost:3111/` → `Content-Type: application/json`.
2. **Pantalla negra en el bundle (síntoma A):** la división manual de fragmentos
   (`manualChunks` de la Fase 78) creaba dependencias circulares entre chunks
   (`vendor-misc -> vendor-react -> vendor-misc`), que rompen el orden de inicialización
   del bundle en el navegador. Además, la "carga diferida de Quantum Engine" de la Fase 78
   nunca se implementó: `App.tsx` importaba `three`, `@react-three/fiber` y
   `@react-three/drei` de forma estática, por eso aparecían en el `modulepreload` de
   `index.html` (810 kB de three-core en la carga inicial).
3. **Defecto latente descubierto en el diagnóstico:** `vite build` (outDir `dist/`) vaciaba
   el directorio y borraba `dist/server.js` producido por `tsc -p tsconfig.node.json`: dos
   builds distintos compartiendo el mismo outDir.

### Correcciones aplicadas

1. **Entrega estática correcta — nuevo módulo `src/staticFrontend.ts`** (registrado en
   `tsconfig.node.json`): `registerStaticFrontend(app, distDir)` sirve el frontend con
   Content-Types reales (`/` → `text/html; charset=UTF-8`, JS → `text/javascript`,
   CSS → `text/css`), responde **404 JSON** para `/assets/*` inexistentes (nunca HTML),
   aplica la reserva SPA **solo para navegación** (Accept: text/html; nunca `/api` ni
   `/assets`) y añade `X-Content-Type-Options: nosniff`. En `server.ts`, el middleware JSON
   quedó acotado a `/api` (todas las rutas del API son `/api/*`; comportamiento del API
   intacto, incluida la autenticación por clave y el guard de instancia única).
2. **Carga diferida real de Quantum Engine:** las escenas 3D (`VoidScene`, `QVaultScene3D`
   y sus componentes auxiliares) se extrajeron **verbatim** de `App.tsx` a
   `src/quantum/QuantumScenes.tsx`, con tipos/colores/helpers compartidos en
   `src/quantum/quantumTypes.ts`. `App.tsx` las carga con `React.lazy` + `Suspense` y un
   estado de carga accesible (`role="status"`). `three/fiber/drei` ya no aparecen en el
   bundle inicial ni en el modulepreload: se descargan solo al abrir una vista 3D.
3. **Sin `manualChunks`:** cualquier frontera manual entre librerías acopladas crea ciclos
   (tras el primer arreglo apareció `vendor-fiber -> vendor-three-core -> vendor-fiber`).
   Al ser la pila 3D exclusiva del módulo de importación dinámica, Rollup la coloca solo en
   el chunk asíncrono sin fronteras artificiales. Resultado medido:

```text
ANTES  (Fase 78): index.html precargaba 5 chunks (three-core 810 kB incluido);
                  aviso "Circular chunk vendor-misc -> vendor-react"; total inicial ~1.400 kB.
DESPUES (Fase 79): entrada 407,45 kB (gzip 111,40 kB) + CSS 53,11 kB;
                   QuantumScenes (three/fiber/drei) 996,59 kB SOLO como chunk asíncrono;
                   modulepreload en index.html: 0; sin avisos "Circular chunk".
```

4. **outDir separados:** el frontend compila en `dist/frontend` (`vite.config.ts`);
   `server.ts` y `scripts/launch-desktop.cjs` apuntan a `dist/frontend/index.html`.
   `vite build` ya no borra `dist/server.js`.
5. **Verificación automática del bundle — `npm run verify:bundle`**
   (`scripts/verify-bundle.cjs`): ejecuta `vite build` y FALLA si hay avisos
   "Circular chunk" o si `dist/frontend/index.html` precarga three/fiber/drei. Añadido como
   paso obligatorio de CI tras `npm run build` (`.github/workflows/ci.yml`).
6. **Pruebas de entrega estática con servidor HTTP real**
   (`tests/StaticFrontend.phase79.test.ts`, 8 tests): para `/` y cada recurso referenciado
   por un `index.html` de prueba comprueba estado y Content-Type, que ningún recurso
   devuelva HTML, el 404 JSON de assets inexistentes, la reserva SPA solo para navegación,
   que `/api` no sea interceptado y la cabecera nosniff.
7. **Verificación en navegador real — `npm run verify:browser`**
   (`scripts/verify-browser.cjs`, usa `playwright-core` con el Chrome/Edge del sistema, sin
   descargar navegadores): comprueba que `#root` dibuja, que aparece la pantalla de primer
   arranque y que no hay excepciones no capturadas; lista los errores de consola.

### Verificación ejecutada (Windows, 2026-11-09)

```text
npm test              -> 97/97 PASS (14 archivos; 89 previos + 8 nuevos)
npm run logic:build   -> PASS
npx tsc --noEmit      -> 0 errores
npm run verify:bundle -> OK (sin chunks circulares; modulepreload: 0)

Navegador real (Chromium del sistema, headless, scripts/verify-browser.cjs):
  C. npm run dev  http://127.0.0.1:5173  -> OK: interfaz dibujada + primer arranque
  A. vite preview http://127.0.0.1:4173  -> OK: pantalla negra corregida
  B. start:desktop http://localhost:3222 -> OK: HTML como texto corregido

curl contra el servidor real (start:desktop, puerto 3222):
  GET /                          -> 200 text/html; charset=UTF-8 + nosniff
  GET /assets/index-*.js         -> 200 text/javascript; charset=UTF-8
  GET /assets/index-*.css        -> 200 text/css; charset=UTF-8
  GET /assets/no-existe.js       -> 404 application/json (nunca HTML)
  GET /vista/inexistente (Accept: text/html) -> 200 text/html (reserva SPA)
  GET /api/test                  -> 401 application/json (auth intacta)
```

Errores de consola residuales en la verificación (no son regresión): peticiones a la API
en `http://localhost:3000` (valor por defecto de `VITE_TBIT_API_BASE_URL`) cuando no hay
API escuchando en ese puerto, y `GET /favicon.ico` -> 404 (el proyecto no define favicon;
cosmético y preexistente).

### Procedimiento de comprobación manual (4 pasos, cualquier plataforma)

```text
1. npm run dev            -> abrir http://127.0.0.1:5173: debe verse el primer arranque
                             "Configura tu Q-Vault OS".
2. npm run build && npx vite preview -> abrir http://localhost:4173: debe verse la misma
                             pantalla (NO pantalla negra).
3. npm run start:desktop  -> abre http://localhost:3000: debe verse la interfaz (NO el
                             código HTML como texto).
4. Consola del navegador (F12): sin errores en rojo (salvo llamadas a la API sin clave
   o ausente en el puerto 3000, y el 404 de favicon, ambos esperados).
```

**NO VERIFICADO:** la comprobación manual en macOS y Linux (este entorno es Windows); el
flujo CI (Fase 75) la cubrirá al ejecutarse en GitHub Actions.

## Corrección del fallo intermitente de CI en macOS — token GITHUB_TOKEN para la API de GitHub (rama `fix/ci-github-token`, 2026-11-10)

### Síntoma y causa

El flujo `.github/workflows/ci.yml` (matriz ubuntu/macos/windows) falló una vez solo en
macOS, con un único test: `indexa el catalogo real de un repositorio de referencia con
commit resuelto` (`tests/DynamicSkillManager.remoteCatalog.phase73.test.ts`), con el error
`No se pudo indexar el catalogo de rmaterile/agent-skills (HTTP 403)` en
`DynamicSkillManager.listRemoteCatalog`. Al relanzar sin cambios, pasaron los tres sistemas:
fallo intermitente.

Causa más probable (coherente con la evidencia, no demostrable en local): la consulta SIN
autenticar a `https://api.github.com/repos/rmaterile/agent-skills/git/trees/HEAD?recursive=1`
agotó el límite de peticiones anónimas de GitHub (60 req/hora por IP) desde la IP compartida
del ejecutor de macOS. El repositorio de referencia sigue siendo público y accesible
(verificado el 2026-11-10: `api.github.com/repos/rmaterile/agent-skills` responde 200 con
`"visibility": "public"`), por lo que el 403 no fue por privacidad ni por desaparición del
repo. El mensaje de error original no incluía el cuerpo ni las cabeceras de rate limit de
GitHub, así que la causa real no quedaba registrada en el log.

### Cambios aplicados

1. **Diagnóstico visible** (`src/skills/DynamicSkillManager.ts`): los errores HTTP de GitHub
   (`listRemoteCatalog`, `installRemoteSkill`, `installFromCatalog`) incluyen ahora el
   mensaje del cuerpo de la respuesta y las cabeceras `x-ratelimit-remaining` y
   `x-ratelimit-reset` cuando existen. El token NUNCA aparece en mensajes de error, logs ni
   informes.
2. **Autenticación opcional con `GITHUB_TOKEN`**: las consultas a la API de GitHub envían la
   cabecera `Authorization: Bearer <token>` cuando la variable de entorno `GITHUB_TOKEN`
   está definida. El token SOLO se envía a `api.github.com` y `raw.githubusercontent.com`;
   el `fetch` usa seguimiento manual de redirecciones y ante una redirección a un host no
   permitido se continúa SIN token. Sin token, el comportamiento es idéntico al anterior.
3. **CI** (`.github/workflows/ci.yml`): `permissions: contents: read` (mínimos) y el paso de
   pruebas recibe `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` como variable de entorno del
   paso. El token no se escribe en el código ni en ningún archivo versionado. El disparador
   `push` pasa a `branches: [main, feature/evolucion-tbit]` (se ejecuta en cada push a main
   y en cada pull request; se mantiene `workflow_dispatch`).
4. **Pruebas sin red** (`tests/DynamicSkillManager.githubToken.test.ts`, 5 tests, fetch
   simulado): con token se envía `Authorization: Bearer` a `api.github.com` y a
   `raw.githubusercontent.com`; sin token no se envía; el token no aparece en el mensaje de
   error (que sí expone mensaje de GitHub y `x-ratelimit-*`); el token no viaja en
   redirecciones a hosts no permitidos; la instalación desde el catálogo mantiene commit
   fijado y verificación sha256 intactas.

### Variables de entorno

```text
GITHUB_TOKEN   opcional. Token de GitHub para autenticar las consultas de skills a la
               API (evita el límite anónimo de 60 req/h por IP). En CI se inyecta como
               el secreto automatico del repositorio. Sin el, todo sigue funcionando
               igual (sujeto al limite anonimo).
```

### Limitación conocida

Sin `GITHUB_TOKEN`, las consultas anónimas a la API de GitHub siguen sujetas al límite de
60 peticiones/hora por IP compartida: el fallo intermitente puede reaparecer en cualquier
plataforma de ejecución compartida. Con el token autenticado el límite sube a 5.000
peticiones/hora por repositorio. Además, la causa exacta del 403 de macOS no es
reproducible en local (este entorno es Windows y el límite es por IP del ejecutor): el
arreglo solo queda validado cuando el flujo se ejecute de nuevo en GitHub Actions.

### Verificación ejecutada (Windows, 2026-11-10)

```text
npm run logic:build   -> PASS
npx tsc --noEmit      -> 0 errores
npm test              -> 102/102 PASS (15 archivos; 97 previos + 5 nuevos, sin red simulada)
npm run verify:bundle -> OK (sin chunks circulares; modulepreload: 0)
npm run build         -> PASS (entrada 407,45 kB + QuantumScenes solo como chunk asincrono)
```

Las 4 pruebas de red real de `phase73` (catálogo, instalación con sha256, rechazo de
contenido manipulado y ampliación del catálogo) se mantienen intactas y pasaron con red.
