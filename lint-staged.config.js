// tsc doesn't type-check a subset of files reliably (it needs the whole program to
// resolve cross-file types), so run it over the whole project instead of the staged
// files. The function form below prevents lint-staged from appending staged file
// paths as tsc arguments, which would make tsc ignore tsconfig.json.
//
// US-53: the style lint (docs/STYLE-LINT.md) also uses the function form: it always checks the
// whole src/ against scripts/style-lint-baseline.json. It runs when a .tsx is staged, and also
// when what it depends on is: src/index.css (keyframes), the baseline itself (it can't go up)
// and the scripts that define the rules.
const styleLint = () => 'node scripts/lint-styles.mjs'

export default {
  '*.{ts,tsx}': () => 'tsc --noEmit',
  '*.tsx': styleLint,
  'src/index.css': styleLint,
  'scripts/{style-lint-baseline.json,lint-styles.mjs,snapshot-code-counts.mjs}': styleLint,
}
