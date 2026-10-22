# Lint de estilos con línea base (US-53)

Chequeo que impide **agregar** valores de estilo sueltos en los componentes. No obliga a corregir
los que ya existen: parte de una línea base (lo que había en `v4.0.0`) que solo puede bajar.

- Script: [`scripts/lint-styles.mjs`](../scripts/lint-styles.mjs) (tests en `scripts/lint-styles.test.ts`).
- Línea base: [`scripts/style-lint-baseline.json`](../scripts/style-lint-baseline.json).
- Reglas y regex: importadas de [`scripts/snapshot-code-counts.mjs`](../scripts/snapshot-code-counts.mjs)
  (US-51), las mismas con las que se midió [`SNAPSHOT-4.0.md`](SNAPSHOT-4.0.md) sección 1. Por
  eso la línea base inicial es exactamente esa tabla (TC-115). Las regex no se duplican acá: si
  cambian, cambian en ese script.

## Qué revisa

Todos los `.tsx` de `src/` del **working tree** (no de un ref de git), sin `*.test.tsx`, más
`src/index.css` para las animaciones. Cuenta por ocurrencia (una clase con variante u opacidad,
`hover:bg-[#…]` o `bg-[#…]/45`, cuenta igual).

| Regla (`id`) | Qué detecta | Línea base inicial |
|---|---|---:|
| `hex` | Hex arbitrarios en clases: `bg-[#…]`, `text-[#…]`, `border-[#…]` | 132 |
| `textPx` | Tamaños de texto sueltos: `text-[Npx]` | 28 |
| `rounded` | Radios sueltos: `rounded-[…]`, `rounded-t-[…]`, `rounded-tl-[…]`… | 39 |
| `rawColor` | Colores Tailwind crudos fuera de la paleta: `amber-*`, `red-*`, `gray-*` | 39 |
| `animate` | Usos de `animate-<nombre>` que no son built-in de Tailwind (`spin`, `ping`, `pulse`, `bounce`, `none`) ni tienen `--animate-<nombre>` en el `@theme` de `src/index.css`; más cada `--animate-*` cuyo `@keyframes` no existe | 0 |

No se revisan: el hex con otros prefijos (`accent-[#…]`, `from-[#…]`… — `hexOther` en
SNAPSHOT-4.0, que es solo informativo), espaciados, sombras, opacidades, ni archivos `.ts`, `.css`
(salvo las keyframes) o de test.

**Solo `.tsx`.** SNAPSHOT-4.0 cuenta `.ts` y `.tsx`, pero hoy ningún `.ts` de `src/` tiene
ocurrencias, así que los totales coinciden (13 archivos `.tsx` en v4.0.0). Si algún día un `.ts`
agrega clases sueltas, este lint no lo ve (fuera de alcance de US-53).

## Cuándo corre

- `npm run lint` = `tsc --noEmit && node scripts/lint-styles.mjs` (también en CI, que ya corre
  `npm run lint`).
- Pre-commit (`lint-staged.config.js`): si hay staged un `.tsx`, `src/index.css`,
  `scripts/style-lint-baseline.json`, `scripts/lint-styles.mjs` o `scripts/snapshot-code-counts.mjs`.
  Revisa siempre todo `src/` del working tree, no solo lo staged.
- A mano: `node scripts/lint-styles.mjs` (exit 0 = pasa, 1 = falla).

## Cómo leer la salida

Una línea por regla, `conteo/línea base`:

```
Lint de estilos (US-53): 13 archivos .tsx de src/ · línea base scripts/style-lint-baseline.json
  hex       133/132 FALLA: 1 por encima de la línea base — Hex arbitrarios en clases (…)
    src/App.tsx:301  [hex]  bg-[#2D3E35]
    src/components/AttendanceLogger.tsx:12  [hex]  bg-[#CCD5AE]
    …
  textPx    27/28 ok — se puede bajar la línea base de "textPx" a 27
  rounded   39/39 ok
  rawColor  39/39 ok
  animate   0/0 ok
FALLA. Corregí las ocurrencias nuevas (no subas la línea base). Ver docs/STYLE-LINT.md.
```

- `ok`: igual a la línea base.
- `ok — se puede bajar…`: hay menos ocurrencias que la línea base. Pasa, pero conviene bajarla
  (ver abajo), si no esa holgura permite que alguien agregue otras sin que el lint se queje.
- `FALLA`: la regla superó su línea base. Se listan **todas** las ocurrencias de esa regla
  (`archivo:línea  [regla]  match`), no solo la nueva: el lint no sabe cuál agregaste; buscá la de
  tu diff. Las reglas que pasan no listan detalle.
- `ERROR …`: problema con la línea base (inválida, subió, o supera v4.0.0). Siempre falla.

## Cómo bajar la línea base

En el **mismo PR** que corrige ocurrencias: editá `scripts/style-lint-baseline.json` y poné el
número que te dice el lint (`se puede bajar la línea base de "textPx" a 27`). Es un cambio
explícito y visible en el review. El campo `$comment` (y cualquier clave que empiece con `$`) se
ignora; cualquier otra clave desconocida, o un valor que no sea un entero ≥ 0, hace fallar el lint.

## Por qué no puede subir

La línea base es un techo que solo baja. El lint falla si algún valor de
`scripts/style-lint-baseline.json`:

1. es mayor que su versión commiteada: el mínimo por regla entre `origin/main` y `HEAD`
   (`git show <ref>:scripts/style-lint-baseline.json`; si el archivo no existe en ninguno — el PR
   que lo introduce — o no hay git, se saltea este punto); o
2. es mayor que el valor de v4.0.0 (`V4_CEILING` en el script: 132 / 28 / 39 / 39 / 0), que es fijo.

Límite: en CI el checkout es superficial y `HEAD` ya incluye el cambio del PR, así que ahí solo
aplica el punto 2; el punto 1 lo cubren `npm run lint` local y el pre-commit. Si de verdad hace
falta subirla (no debería), es una decisión que se discute en el PR y requiere cambiar el script.

## Modo absoluto (US-67)

Cuando todas las reglas lleguen a 0 en la línea base, el chequeo queda absoluto: cualquier
ocurrencia falla, y la salida lo indica (`modo absoluto`). US-67 es la que cierra ese camino.
