# Cierre de un PRD: versión, tag y Release (US-49)

Cada PRD cerrado queda como una versión fija y reproducible: un número en `package.json`, un tag
anotado en git, un GitHub Release con sus notas y el instalador de Windows.

## Esquema de versión

- `package.json` → `version` = `{MAJOR}.{MINOR}.{PATCH}`, donde `MAJOR.MINOR` es el número del PRD
  (PRD 4.0 → `4.0.0`, PRD 4.1 → `4.1.0`).
- Un hotfix sobre una versión publicada sube solo el `PATCH` (`4.0.0` → `4.0.1`).
- La versión se lee de `package.json` al compilar (`__APP_VERSION__`, `define` en `vite.config.ts`
  y `vitest.config.ts`) y se muestra en **Settings** como `The Honeycomb v4.0.0`, igual en web y
  en Electron.
- Tag = `v` + versión (`v4.0.0`). El tag va sobre el commit cuyo `package.json` ya tiene esa
  versión, así que `git checkout v4.0.0` muestra la misma versión en `package.json` y en Settings.

## Procedimiento de cierre

1. **Mergear la última US del PRD** a `main` (flujo normal de PR).
2. **Commit de cierre.** `main` está protegido, así que el commit de cierre entra por PR:
   - rama `gs/cierre-prd-X.Y` desde `main` actualizado;
   - `package.json` → `"version": "X.Y.0"` (y la raíz de `package-lock.json`, `npm install
     --package-lock-only` o a mano);
   - `docs/releases/vX.Y.0.md` con las notas: link al PRD (`https://github.com/Gary-Sanchez/TheHoneycomb/blob/vX.Y.0/docs/<archivo>`,
     espacios como `%20`) y la tabla de US con título y PR (ver `docs/releases/v4.0.0.md`);
   - PR, CI verde, merge.
3. **Tag anotado sobre el merge de ese PR** (el commit de `main` que trae la versión nueva):

   ```bash
   git checkout main && git pull
   git log -1 --oneline                      # el merge del PR de cierre
   git show HEAD:package.json | grep version # "X.Y.0"
   git tag -a vX.Y.0 HEAD -m "The Honeycomb vX.Y.0 (PRD X.Y)"
   git push origin vX.Y.0
   ```

4. **El workflow publica.** El push del tag dispara `.github/workflows/release.yml` (Windows):
   `npm ci` → `npm run lint` → `npm test` → `npm run build` → `electron-builder --win nsis`. Si
   un paso falla, el job se corta y no se publica nada. Si todo pasa, crea el Release `vX.Y.0` con
   `docs/releases/vX.Y.0.md` como notas (si falta, una nota genérica) y adjunta
   `release/The Honeycomb Setup X.Y.0.exe`. Si el Release ya existía, solo reemplaza el instalador.
5. **Verificar:** pestaña **Actions** en verde; el Release tiene notas e instalador; instalar el
   `.exe` y ver `The Honeycomb vX.Y.0` en Settings.

Si el workflow falla: arreglar en `main` por PR, borrar el tag (`git push origin :refs/tags/vX.Y.0`
y `git tag -d vX.Y.0`), y volver al paso 3 sobre el merge nuevo.

## Hotfix (PATCH)

1. PR con el fix **y** el bump `X.Y.Z` → `X.Y.(Z+1)` en `package.json`, más
   `docs/releases/vX.Y.(Z+1).md` (qué se corrigió, PR).
2. Tras el merge: `git tag -a vX.Y.(Z+1) <merge> -m "..."` y `git push origin vX.Y.(Z+1)`.
3. El workflow publica igual que en el cierre.

## Excepción del 4.0

El PRD 4.1 (§2.0) congela el 4.0 con dos US: US-49 (versión, tag, Release) y US-50 (base de prueba
fija, capturas de referencia, backup). Por decisión del product owner, `v4.0.0` va sobre el
**merge de US-50**, no sobre el de US-49: US-50 es la última US del snapshot y ya hereda
`"version": "4.0.0"` de US-49, así que ese merge cumple la regla (el tag apunta a un commit con la
versión) y además incluye todo el snapshot. No hay commit de cierre aparte.

## Tags retroactivos (PRD 2.0 y 3.0)

Se crearon después, sobre el último merge de cada PRD antes del PR que agrega el documento del PRD
siguiente:

| Tag | Commit | Por qué |
|---|---|---|
| `v2.0.0` | `99479c6` (merge #11, US-12) | último merge antes del PR #20 (`4efa501`, PRD 3.0) |
| `v3.0.0` | `82567ad` (merge #30, US-33) | último merge antes del PR #32 (`7ff87fb`, PRD 4.0) |

- En esos commits `package.json` dice `0.0.0` y Settings no muestra versión: el número es el del
  tag. Las notas lo aclaran.
- `release.yml` no existe en esos commits, así que el push del tag no dispara nada. El Release se
  crea a mano, sin instalador:

  ```bash
  git tag -a v2.0.0 99479c6 -m "The Honeycomb v2.0.0 (PRD 2.0, retroactivo)"
  git tag -a v3.0.0 82567ad -m "The Honeycomb v3.0.0 (PRD 3.0, retroactivo)"
  git push origin v2.0.0 v3.0.0
  gh release create v2.0.0 --verify-tag --title "The Honeycomb v2.0.0" --notes-file docs/releases/v2.0.0.md
  gh release create v3.0.0 --verify-tag --title "The Honeycomb v3.0.0" --notes-file docs/releases/v3.0.0.md
  ```

  (`--notes-file` se lee del checkout local, es decir de `main`, donde viven las notas.)
- Si alguna vez hace falta su instalador: `git checkout v3.0.0 && npm ci && npm run build &&
  npx electron-builder --win nsis --publish never`, y `gh release upload v3.0.0 "release/The Honeycomb Setup 0.0.0.exe"`
  (el nombre lleva `0.0.0` porque sale de `package.json`).

## Probar el workflow

Con un tag de prueba (lleva `-`, así que sale como **pre-release**):

```bash
git tag -a v0.0.1-test -m "prueba del workflow de release"
git push origin v0.0.1-test
# revisar Actions y el pre-release; después borrar Release y tag:
gh release delete v0.0.1-test --cleanup-tag --yes
git tag -d v0.0.1-test
```

El instalador de la prueba lleva la versión de `package.json`, no la del tag.

## Paquete de regresión (US-50)

_Pendiente: US-50 agrega acá el paso de base de prueba fija, capturas y checklist de regresión del
Release._
