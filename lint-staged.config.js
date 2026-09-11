// tsc doesn't type-check a subset of files reliably (it needs the whole program to
// resolve cross-file types), so run it over the whole project instead of the staged
// files. The function form below prevents lint-staged from appending staged file
// paths as tsc arguments, which would make tsc ignore tsconfig.json.
export default {
  '*.{ts,tsx}': () => 'tsc --noEmit',
}
