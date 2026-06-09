# PROMPT — PWA Polla Mundialista (Mundial 2026) — Firebase Realtime Database

Copia desde aquí hacia abajo y pégalo en Claude Code. Antes de pegar, completa la sección "MI STACK".

---

Quiero que construyas una **PWA de polla mundialista para el Mundial 2026**, completa y lista para producción. Lee TODO este documento antes de escribir código. La lógica de puntos debe implementarse exactamente como se define aquí, sin interpretaciones propias. Si algo es ambiguo, pregúntame antes de asumir.

## MI STACK (completar antes de usar)

- Servidor central (poller + validador): [ej: Node.js en mi VPS — escribe el tuyo]
- Base de datos en tiempo real: **Firebase Realtime Database, plan gratuito Spark** (obligatorio)
- Autenticación: **Firebase Authentication** (email/password o Google)
- Frontend PWA: [ej: React / Vue / vanilla — escribe el tuyo]

## 1. ARQUITECTURA GENERAL (modelo central → réplica)

- **Solo el servidor central consume la API de datos externa.** Usa el **Firebase Admin SDK** para escribir en Realtime Database. Los clientes NUNCA llaman a la API de fútbol.
- Los clientes se **suscriben directamente a Firebase RTDB** (listeners `on('value')` / `onValue`). Firebase es quien replica en tiempo real a todos los usuarios: NO implementar WebSockets ni SSE propios, esa función ya la cumple Firebase.
- Fuente de datos: **football-data.org** (plan gratuito, competición `WC`). Polling cada 60 s durante ventanas de partido, cada 30 min fuera de ellas, respetando 10 req/min. Fallback automático a API-Football (free) si la principal falla N veces, normalizando ambos formatos a un modelo interno único.
- **Regla de escritura mínima:** el servidor solo escribe en Firebase cuando un dato CAMBIÓ (comparar contra el último estado en memoria/cache local del servidor). Un partido con estado `FINISHED` y puntos calculados queda **sellado**: se deja de consultar, de comparar y de escribir. Nunca reescribir nodos de partidos finalizados (salvo corrección manual del admin).
- **Optimización para el plan Spark** (límites: 1 GB almacenamiento, 10 GB/mes de descarga, ~100 conexiones simultáneas):
    - Estructura de datos PLANA y por nodos pequeños: que un gol no provoque la re-descarga de todo el árbol. Separar `/partidos_en_vivo` (nodo pequeño y caliente al que todos escuchan) de `/partidos_finalizados` (histórico que se lee una vez y se cachea en el cliente).
    - Los clientes solo mantienen listeners sobre los nodos vivos (partidos del día, tabla de posiciones); el histórico se lee bajo demanda y se cachea con el Service Worker.
    - ADVERTENCIA en el README: el plan Spark admite ~100 conexiones simultáneas; si la empresa espera más usuarios conectados al mismo tiempo, documentar el paso al plan Blaze (pago por uso, con monto bajo a esta escala).
- **Panel de administración** (protegido, solo rol admin): corrección manual de resultados, marcado de partido como finalizado oficial, recálculo total de puntos, log de auditoría. El dato manual SIEMPRE prevalece sobre la API.
- Alertas (email o webhook) si el polling lleva más de 5 minutos fallando.

## 2. FLUJO DE ESCRITURA DE PRONÓSTICOS (crítico)

- Los clientes **NO escriben pronósticos directamente en Firebase**. Todo pronóstico viaja a un endpoint del servidor central (o Cloud Function), que valida el cierre y luego escribe en Firebase con el Admin SDK. Razón: la validación del lock debe ser inatacable.
- **Reglas de seguridad de Firebase**: los clientes tienen permiso de SOLO LECTURA sobre todos los nodos (con las restricciones de visibilidad de la sección 8); permiso de escritura únicamente para el Admin SDK. Entregar el archivo de reglas completo y explicado.
- El timestamp del registro de cada pronóstico lo asigna **el servidor** (nunca el cliente) y queda guardado junto al pronóstico: es el dato que se mostrará públicamente para la transparencia.

## 3. PWA

- `manifest.json` (instalable, standalone, íconos) + Service Worker.
- Offline: lectura del último estado cacheado (fixtures, mi polla, tabla, histórico). Las escrituras (guardar pronóstico) requieren conexión y fallan con mensaje claro si no la hay — nunca encolar escrituras offline (riesgo de guardar después del cierre).
- Assets: **escudos de equipos** desde football-data.org (campo `crest`), **fotos y nombres de jugadores** desde TheSportsDB (API free). Descargarlas y servirlas desde mi servidor/hosting al inicio del torneo (no hotlinking, no inflar la descarga de Firebase con imágenes — en Firebase solo van URLs).

## 4. REGLA DE ORO DEL CIERRE (lock)

- Todo pronóstico se puede crear y editar **hasta el kickoff oficial (timestamp UTC de la API)**. Desde ese instante es **inmutable**.
- Validación del cierre **solo en el servidor central**, contra el reloj del servidor en UTC. El reloj del cliente es irrelevante. El frontend deshabilita el formulario como UX, pero el servidor rechaza toda escritura tardía con error explícito.
- Si un partido se reprograma, el cierre sigue al nuevo kickoff de la API.
- **Partido iniciado sin pronóstico guardado = 0 puntos en todas las categorías de ese partido.** Sin excepciones ni valores por defecto.
- Cada pronóstico guarda timestamp de creación y de última edición asignados por el servidor, con historial de versiones (auditoría).

## 5. QUÉ PRONOSTICA EL USUARIO

**Por partido (todas las fases):**

- Marcador de los 90 minutos (goles equipo A, goles equipo B).

**Por partido (solo eliminatorias), opcional, cierra al mismo kickoff:**

- ¿Habrá tiempo extra? (sí/no).
- Si predijo que sí: marcador acumulado al final del tiempo extra.
- Ganador final del partido (clasificado), que cubre el caso de penales. El marcador de penales NO se pronostica ni puntúa; solo el ganador.

**Bonos de torneo (cierran al kickoff del PRIMER partido del Mundial):**

- Campeón del Mundial.
- Goleador del Mundial (jugador individual, con búsqueda por nombre y foto).

**Clasificados por ronda:**

- Equipos que pasan a 16avos (R32): cierra con el primer partido de fase de grupos.
- Equipos que pasan a octavos, cuartos, semis y final: cada lista cierra al kickoff del primer partido de la ronda previa correspondiente.

## 6. SISTEMA DE PUNTOS (implementar EXACTAMENTE así)

Todos los valores viven en una **configuración editable desde el panel admin** solo HASTA el primer partido del torneo; después queda bloqueada.

### 6.1 Puntos por partido (base) — evaluados sobre el marcador de los 90 minutos

| Acierto                                                         | Puntos base | ¿Acumula?                                                        |
| --------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| Marcador exacto (90')                                           | 5           | NO acumula con los de abajo (los implica; se otorgan solo los 5) |
| Resultado 1X2 correcto (ganador o empate) sin marcador exacto   | 3           | Acumula con "total de goles"                                     |
| Cantidad total de goles correcta (suma A+B) sin marcador exacto | 1           | Acumula con "1X2"                                                |

### 6.2 Extras en eliminatorias (se suman a los base)

| Acierto                                                                                               | Puntos |
| ----------------------------------------------------------------------------------------------------- | ------ |
| Predijo correctamente si hubo o no tiempo extra (acertar el "no" también puntúa)                      | +2     |
| Marcador exacto al final del tiempo extra (solo si predijo que habría y hubo)                         | +3     |
| Ganador final del partido correcto (incluye definición por penales; el marcador de penales no cuenta) | +2     |

### 6.3 Multiplicador por fase (aplica a 6.1 y 6.2)

| Fase           | Multiplicador |
| -------------- | ------------- |
| Fase de grupos | ×1            |
| 16avos (R32)   | ×2            |
| Octavos (R16)  | ×2            |
| Cuartos        | ×3            |
| Semifinales    | ×4            |
| Tercer puesto  | ×4            |
| Final          | ×5            |

Puntos de un partido = (base + extras) × multiplicador. Todos los valores son enteros, sin decimales.

### 6.4 Bonos de torneo (sin multiplicador)

| Acierto                                                                                | Puntos por acierto |
| -------------------------------------------------------------------------------------- | ------------------ |
| Equipo clasificado a 16avos (por cada equipo correcto)                                 | 1                  |
| Equipo clasificado a octavos                                                           | 2                  |
| Equipo clasificado a cuartos                                                           | 3                  |
| Equipo clasificado a semis                                                             | 5                  |
| Equipo clasificado a la final                                                          | 8                  |
| Campeón del Mundial                                                                    | 20                 |
| Goleador del Mundial (si hay empate de goleadores, todos los empatados otorgan puntos) | 15                 |

### 6.5 Desempate en la tabla general (en este orden)

1. Más puntos totales. 2. Más marcadores exactos. 3. Más resultados 1X2. 4. Registro del pronóstico de campeón más antiguo.

## 7. TABLA DE POSICIONES EN VIVO + HISTORIAL

- **Tabla de posiciones de la polla que se mueve durante los partidos**: mientras un partido está `IN_PLAY`, el servidor recalcula en cada cambio de marcador unos **puntos provisionales** (como si el marcador actual fuera el final) y actualiza el nodo `/tabla_posiciones` en Firebase. Todos los clientes la ven moverse en vivo.
- La tabla distingue visualmente **puntos confirmados** (partidos finalizados) de **puntos provisionales** (partidos en curso). Al terminar el partido, los provisionales se convierten en confirmados mediante el motor de puntos definitivo y el partido se sella.
- Mostrar por usuario: posición, movimiento (▲▼ respecto a la última posición confirmada), puntos totales, y desglose al tocar su fila.
- **Historial de marcadores**: pantalla con todos los partidos finalizados (resultado de 90', tiempo extra y ganador por penales si aplicó, fecha, fase), navegable por fase y por equipo, leída desde `/partidos_finalizados` una sola vez y cacheada en el cliente.

## 8. TRANSPARENCIA DE PRONÓSTICOS (regla de visibilidad)

- Los pronósticos de cada usuario son **privados mientras el partido no haya iniciado**: nadie puede ver los pronósticos ajenos de partidos futuros (ni siquiera leyendo Firebase directamente — la estructura de datos y las reglas de seguridad deben garantizarlo: los pronósticos pendientes viven en un nodo no legible por clientes; solo el dueño ve los suyos vía un nodo espejo personal).
- Cuando el partido pasa a `IN_PLAY` o `FINISHED`, el servidor **publica** los pronósticos de todos los usuarios para ese partido en un nodo público de solo lectura, mostrando: usuario, marcador propuesto (y extra tiempo/ganador si aplica), y **fecha y hora exactas del registro (timestamp asignado por el servidor)**, para que todos verifiquen que se registró antes del cierre.
- Quien no registró pronóstico aparece en esa vista como "Sin pronóstico (0 pts)".

## 9. MOTOR DE CÁLCULO — CERO MARGEN DE ERROR

- Función pura, determinista y aislada: `calcularPuntos(pronóstico, resultadoOficial, fase, config) → desglose`. Sin acceso a base de datos ni efectos secundarios. Toda la app (incluidos los provisionales en vivo) puntúa SOLO a través de esta función.
- Devuelve **desglose por categoría**, que se persiste y se muestra al usuario.
- Cálculo **idempotente y recalculable**: reejecutar todo el torneo contra los resultados oficiales debe dar siempre lo mismo. Toda corrección manual del admin dispara recálculo total automático.
- Un partido solo puntúa definitivamente con estado `FINISHED` confirmado. Los provisionales se marcan siempre como provisionales.
- **Suite de tests obligatoria antes de dar por terminado** (quiero verla en verde): marcador exacto en cada fase; 1X2 + total de goles acumulados; empate acertado solo en resultado; eliminatoria resuelta en 90'; extra tiempo predicho y acertado en marcador; extra tiempo predicho que no ocurrió; "no habrá extra tiempo" acertado; penales con ganador acertado y fallado; usuario sin pronóstico = 0 en todo; escritura 1 segundo después del kickoff rechazada por el servidor; reprogramación de partido; empate de goleadores; provisional vs confirmado (que el provisional nunca se persista como definitivo); recálculo idempotente; desempates en los 4 niveles; y reglas de Firebase: cliente no puede escribir pronósticos, cliente no puede leer pronósticos ajenos de partidos futuros.

## 10. FUNCIONALIDAD DE USUARIO

- Registro/login con Firebase Authentication.
- Pantallas: calendario con escudos y nombres; formulario de pronóstico con cuenta regresiva al cierre; mis pronósticos (los cerrados en solo lectura con candado); **tabla de posiciones en vivo** (sección 7); **historial de marcadores** (sección 7); **pronósticos globales por partido en curso/terminado con fecha y hora de registro** (sección 8); brackets; selección de campeón y goleador con foto; clasificados por ronda; mi desglose de puntos partido a partido.

## 11. ENTREGABLES

1. Estructura completa del Realtime Database (árbol JSON documentado) + archivo de reglas de seguridad explicado.
2. Servidor central: poller + normalizador + fallback, endpoint de pronósticos con validación de lock, motor de puntos puro, publicador de pronósticos al iniciar partidos, cálculo provisional en vivo, sellado de partidos finalizados, panel admin.
3. Frontend PWA completo con las pantallas de la sección 10.
4. Suite de tests de la sección 9 en verde.
5. README: despliegue, configuración del proyecto Firebase (plan Spark), API token, y advertencia documentada del límite de ~100 conexiones simultáneas con instrucciones de paso a Blaze si se supera.

Empieza por: (1) estructura del RTDB + reglas de seguridad, (2) motor de puntos con tests, (3) poller y publicador, (4) el resto. Muéstrame (1) y (2) con tests pasando antes de continuar con el frontend.
