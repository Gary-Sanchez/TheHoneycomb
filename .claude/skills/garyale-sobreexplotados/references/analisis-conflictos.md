# Análisis previo de conflictos entre tickets

Procedimiento compartido por [`garyale-sobreexplotados`](../SKILL.md) (desarrollo de varios tickets)
y [`super-tefinha-QA-en-lote`](../../super-tefinha-QA-en-lote/SKILL.md) (QA de varios tickets). Se
corre **antes** de crear worktrees o lanzar subagentes, y su salida es un **orden de trabajo** (y de
merge) que evita los conflictos o reduce la chance de que aparezcan. Es de solo lectura: no toca
ramas, worktrees ni Linear.

Por qué existe: el PR #46 (quick wins de UX) quedó aprobado funcionalmente pero no se podía mergear
porque, mientras se trabajaba, entraron a `main` US-43, US-45, US-46 y US-41 tocando los mismos 7
componentes. Hubo que resolver conflictos dos veces y en el camino se perdió un `aria-label`. Ver
venir eso antes de arrancar es más barato que arreglarlo después.

## 1. Juntar la "huella" de cada ticket

Para cada ticket, la lista de archivos (y, si se puede, funciones/componentes) que toca:

| Situación | De dónde sale la huella |
|---|---|
| Ticket sin rama todavía (desarrollo) | **Estimada**: research del ticket (subagente `Explore`) → archivos y símbolos que probablemente toque. Marcarla como estimada en el reporte. |
| Ticket con rama o PR (desarrollo retomado, o QA) | **Real**: `git diff --name-only origin/main...origin/<rama>` o `gh pr view <n> --json files`. |

Sumar siempre los **puntos calientes** del repo que arrastran cambios en pareja (de `CLAUDE.md`): si
un ticket toca uno, contar también su pareja aunque no aparezca todavía en la huella.

- `src/App.tsx` (handlers `handleX`) ↔ `db.ts` (funciones "Mirrors handleX").
- `src/types.ts` ↔ `validation.ts` (schemas zod espejados).
- `server.ts` (rutas, `requireAdmin`, `validateBody`) — casi todo cambio de API pasa por acá.
- Textos de UI: componentes en `src/components/` + `src/uiCopy.test.ts` (US-46 unificó textos;
  un cambio de copy en un ticket choca con cualquier otro que toque la misma línea).
- `index.html` ↔ `vite.config.ts` (`cspDevServerPlugin`) para cualquier origen nuevo en la CSP.
- `package.json` / `package-lock.json` — dos tickets que agregan dependencias **siempre** chocan en
  el lockfile.

## 2. Cruzar contra todo lo que está en vuelo

Comparar cada huella contra:

1. **Los otros tickets del lote** (todos contra todos).
2. **PRs abiertos del equipo que no son del lote**:
   `gh pr list -R Gary-Sanchez/TheHoneycomb --state open --json number,title,headRefName,files`.
   Son el riesgo que más se pasa por alto: un PR ajeno que se mergee primero obliga a resolver
   conflictos en todos los del lote que toquen lo mismo.
3. **Lo que entró a `main` desde la base de cada rama** (solo tickets con rama):
   `git log --oneline <merge-base>..origin/main -- <archivos de la huella>`.
4. **Relaciones en Linear**: `get_issue` con `includeRelations: true` → `blocks` / `blockedBy` /
   `relatedTo`, más menciones a otro `US-XX` en "Out of Scope" o en la descripción.

### Chequeo exacto con `git merge-tree` (cuando hay ramas)

Cuando ambos lados existen como commits, no adivinar: `git merge-tree` simula el merge **sin tocar
ningún worktree** (git ≥ 2.38; el repo usa 2.44) y devuelve exit `1` con la lista de archivos en
conflicto:

**Paso 1 — cada rama contra `main`:**

```bash
git merge-tree --write-tree --name-only --no-messages origin/main origin/<rama-A>
```

Exit `0` = sin conflictos de texto (la primera línea es el hash del árbol resultante, se ignora);
exit `1` = conflicto, y las líneas siguientes son los archivos. Una rama que **ya choca con `main`**
se resuelve aparte (tiene que traer `main` primero) y **no entra en el paso 2**: si entra, sus
conflictos con `main` aparecen repetidos en todos sus pares y tapan los conflictos reales.

**Paso 2 — cada par, simulando el orden real "primero A a `main`, después B":** comparar dos ramas
directo (`merge-tree A B`) da falsos positivos cuando nacieron de puntos distintos de `main`. Lo
correcto es fabricar el `main` que habría después de mergear A y probar B contra ese:

```bash
T=$(git merge-tree --write-tree --no-messages origin/main origin/<rama-A> | head -1)
C=$(git commit-tree "$T" -p origin/main -p origin/<rama-A> -m "simulacion")
git merge-tree --write-tree --name-only --no-messages "$C" origin/<rama-B>
```

`commit-tree` crea un commit suelto que no queda en ninguna rama ni se pushea (git lo limpia solo).
Correrlo para cada par del lote, y para cada rama del lote contra las PRs abiertas ajenas que
comparten archivos con su huella. Antes de todo, `git fetch origin --prune`.

Ejemplo real (12/10/2026, PRs abiertas): de 8 PRs, #39 y #48 chocaban con `main`; entre las demás,
#55 → #54 chocaban en `package-lock.json` (dos tickets de dependencias) y #46 → #45 en
`DashboardStats.tsx`, mientras que #54 → #45 no chocaban aunque las dos tocan el dashboard.

## 3. Clasificar cada par

| Nivel | Criterio | Qué implica |
|---|---|---|
| 🟢 **Independientes** | Huellas sin archivos en común (ni puntos calientes en pareja) | Paralelo libre, cualquier orden |
| 🟡 **Solapan** | Comparten archivos, pero `merge-tree` da exit 0 (o, sin ramas, tocan zonas distintas del archivo) | Paralelo OK; mergear uno y **actualizar el otro con `main`** antes de mergearlo; re-correr tests del segundo |
| 🔴 **Chocan** | `merge-tree` da exit 1, o (sin ramas) tocan las mismas funciones/líneas/textos | Secuencial: el segundo se trabaja/prueba **después** de que el primero se mergee, o sobre la combinación de ambos |
| ⛓️ **Dependen** | B necesita código de A (tipo, endpoint, estado), o Linear dice `A blocks B` | A siempre antes que B; B no se mergea antes que A |

Un conflicto 🔴 con un **PR ajeno** no se resuelve desde esta skill: anotarlo y avisar al usuario
quién lo tiene (autor del PR), para que decida si esperar ese merge o coordinar.

## 4. Elegir el orden

Armar un grafo con ⛓️ y 🔴 como aristas "va antes que", y ordenar con estas reglas, en este orden
de prioridad:

1. **Dependencias primero**: si A ⛓️ B, A va antes.
2. **Lo que ya está listo para entrar a `main`**: entre tickets en 🔴, primero el que hoy no choca
   con `main` (exit 0 contra `origin/main`), tiene CI en verde o ya está más avanzado (en QA:
   `QA Ready` antes que `In Progress`).
3. **Lo más chico primero**: entre empates, el ticket con menos archivos cambiados / menor diff. Se
   mergea antes y el grande absorbe el conflicto una sola vez, en vez de que varios chicos tengan
   que rebasarse contra uno grande.
4. **Puntos calientes juntos y en serie**: si varios tickets tocan `App.tsx`/`db.ts`, no ponerlos en
   la misma tanda paralela aunque `merge-tree` hoy diga 🟡 — el desarrollo puede convertirlos en 🔴.
5. **Lo independiente, en paralelo** y sin restricciones, mientras se respeta la serie del resto.

El resultado son **tandas**: la tanda 1 contiene todo lo 🟢/🟡 que no depende de nada; cada cadena
🔴/⛓️ se reparte una por tanda. El mismo orden es el **orden de merge recomendado**.

## 5. Reporte (antes de arrancar, para que el usuario lo apruebe)

```
Análisis previo — <N> tickets (<fecha>)

| Par / ticket | Nivel | Archivos en común | Evidencia |
|---|---|---|---|
| US-38 × US-42 | 🔴 | src/components/DocumentParser.tsx | merge-tree exit 1 |
| US-38 × PR #51 (ajeno, @autor) | 🟡 | server.ts | merge-tree exit 0 |
| US-46 vs main | 🔴 | 3 archivos | hay que actualizar con main antes del QA |

Orden propuesto
- Tanda 1 (paralelo): US-42, US-46
- Tanda 2: US-38 (después del merge de US-42)
Orden de merge recomendado: US-42 → US-46 → US-38
Riesgos que no se pueden evitar: <lockfile, PR ajeno, etc.>
```

Marcar qué huellas son estimadas (sin rama) y cuáles reales. Si todo da 🟢, decirlo en una línea y
seguir: el análisis no tiene que ser más largo que el trabajo que ordena.

## 6. Re-chequear en el camino

El análisis es una foto: `main` sigue moviéndose. Volver a correr el paso 2 (con `merge-tree`)
**antes de cada tanda** y **antes de cada gate de merge/PR**. Si un par sube de nivel (🟡 → 🔴),
avisar y reordenar lo que falta en vez de seguir con el plan viejo.
