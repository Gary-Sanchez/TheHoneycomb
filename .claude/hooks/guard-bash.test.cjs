// Tests de guard-bash.cjs (US-07). Sin dependencias: `node --test .claude/hooks/*.test.cjs`
// (ver .claude/README.md). Cada caso lanza el hook real con un payload JSON por stdin,
// igual que Claude Code, y verifica la decisión que imprime.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const HOOK = path.join(__dirname, "guard-bash.cjs");

function decisionFor(toolName, command) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { command } }),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `el hook salió con ${res.status}: ${res.stderr}`);
  const out = res.stdout.trim();
  if (!out) return null;
  return JSON.parse(out).hookSpecificOutput.permissionDecision;
}

const b64 = (s) => Buffer.from(s, "utf16le").toString("base64");

// [tool, command]
const DENY = [
  // --- QA #1: la tool PowerShell ---
  ["PowerShell", "git reset --hard"],
  ["PowerShell", "git reset --hard HEAD~1"],
  ["PowerShell", "git push --force origin main"],
  ["PowerShell", "git push -f"],
  ["PowerShell", "git clean -fd"],
  ["PowerShell", "Remove-Item -Recurse -Force .\\src"],
  ["PowerShell", "Remove-Item .\\src -recurse -force"],
  ["PowerShell", "remove-item .\\src -Rec -Fo"],
  ["PowerShell", "Remove-Item .\\src -r -fo"],
  ["PowerShell", "Remove-Item .\\src -r -f"], // -f ambiguo: tratado como -Force (conservador)
  ["PowerShell", "Remove-Item .\\src -Recurse:$true -Force"],
  ["PowerShell", "Remove-Item .\\src \u2013Recurse \u2013Force"], // guion largo
  ["PowerShell", "rm -r -fo .\\src"],
  ["PowerShell", "ri .\\src -Recurse -Force"],
  ["PowerShell", "del -Force -Recurse .\\src"],
  ["PowerShell", "rd .\\src -Recurse -Force"],
  ["PowerShell", "rmdir .\\src -Recurse -Force"],
  ["PowerShell", "erase .\\src -Recurse -Force"],
  ["PowerShell", "Get-ChildItem .\\dist | Remove-Item -Recurse -Force"],
  ["PowerShell", "Get-ChildItem | ForEach-Object { Remove-Item $_ -Recurse -Force }"],
  ["PowerShell", "if (Test-Path .\\dist) { Remove-Item .\\dist -Recurse -Force }"],
  ["PowerShell", "git status; git clean -f"],
  ["PowerShell", "& git push --force"],
  ["PowerShell", "& \"C:\\Program Files\\Git\\cmd\\git.exe\" reset --hard"],
  ["PowerShell", "Set-Location x; git -C \"C:/Users/Gary Ronald/Desktop/repo\" reset --hard"],
  ["PowerShell", "Write-Host hi\ngit reset --hard"],
  ["PowerShell", "Write-Host hi\r\nRemove-Item x -Recurse -Force"],
  ["PowerShell", "pwsh -Command \"Remove-Item x -Recurse -Force\""],
  ["PowerShell", "powershell -NoProfile -c \"git reset --hard\""],
  ["PowerShell", `powershell -EncodedCommand ${b64("git reset --hard")}`],
  ["PowerShell", "Invoke-Expression \"git push --force\""],
  ["PowerShell", "bash -c \"rm -rf ./x\""],
  ["PowerShell", "cmd /c \"rd /s /q x\""],
  ["PowerShell", "$(Remove-Item x -Recurse -Force)"],

  // --- QA #2: salto de línea como separador ---
  ["Bash", "echo hi\nrm -rf ./tmpdir"],
  ["Bash", "git status\ngit push --force"],
  ["Bash", "git status\r\ngit reset --hard"],

  // --- QA #3: wrappers ---
  ["Bash", "sudo rm -rf ./x"],
  ["Bash", "sudo -u root rm -rf ./x"],
  ["Bash", "env rm -rf ./x"],
  ["Bash", "env FOO=1 BAR=2 rm -rf ./x"],
  ["Bash", "env -S \"rm -rf ./x\""],
  ["Bash", "command rm -rf ./x"],
  ["Bash", "builtin rm -rf ./x"],
  ["Bash", "exec rm -rf ./x"],
  ["Bash", "nohup rm -rf ./x"],
  ["Bash", "time rm -rf ./x"],
  ["Bash", "timeout 5 rm -rf ./x"],
  ["Bash", "nice -n 10 rm -rf ./x"],
  ["Bash", "/bin/rm -rf ./x"],
  ["Bash", "bash -c \"rm -rf ./x\""],
  ["Bash", "sh -lc 'rm -rf ./x'"],
  ["Bash", "zsh -c 'cd x && rm -rf y'"],
  ["Bash", "(rm -rf ./x)"],
  ["Bash", "{ rm -rf ./x; }"],
  ["Bash", "find . -exec rm -rf {} +"],
  ["Bash", "find . -name node_modules -execdir rm -rf {} \\;"],
  ["Bash", "ls | xargs rm -rf"],
  ["Bash", "ls | xargs -0 -I{} rm -rf {}"],
  ["Bash", "echo $(rm -rf ./x)"],
  ["Bash", "echo \"$(rm -rf ./x)\""],
  ["Bash", "echo `rm -rf ./x`"],
  ["Bash", "eval \"rm -rf ./x\""],
  ["Bash", "bash <<EOF\nrm -rf ./x\nEOF"],
  ["Bash", "rm \\\n  -rf ./x"],
  ["Bash", "sudo git push --force"],
  ["Bash", "env GIT_TRACE=1 git reset --hard"],
  ["Bash", "bash -c \"git reset --hard\""],
  ["Bash", "sh -c 'git clean -fdx'"],
  ["Bash", "pwsh -Command \"Remove-Item x -Recurse -Force\""],
  ["Bash", "cmd //c rd //s //q x"],
  ["Bash", "git.exe push -f"],

  // --- Regresiones de fixes anteriores ---
  ["Bash", "rm -rf ./x"],
  ["Bash", "rm -fr ./x"],
  ["Bash", "rm -Rf ./x"],
  ["Bash", "rm -r -f ./x"],
  ["Bash", "rm --recursive --force ./x"],
  ["Bash", "rm ./x -rf"],
  ["Bash", "cd x && rm -rf y"],
  ["Bash", "npm run lint && rm -rf dist"],
  ["Bash", "git reset --hard"],
  ["Bash", "git reset --hard HEAD~1"],
  ["Bash", "git -C \"C:/Users/Gary Ronald/Desktop/TheHoneycomb/TheHoneycomb\" reset --hard HEAD~1"],
  ["Bash", "git clean -f"],
  ["Bash", "git clean -fd"],
  ["Bash", "git clean --force"],
  ["Bash", "git push --force"],
  ["Bash", "git push -f origin main"],
  ["Bash", "git push origin main --force"],
  ["Bash", "git push --force-with-lease"],
  ["Bash", "git push origin +b:main"],
  ["Bash", "git -c k=v push --force"],
  ["Bash", "X=rm; $X -rf ./d"],
  ["Bash", "G=git; ${G} push --force"],
];

const ALLOW = [
  // Bash: comandos normales
  ["Bash", "npm run lint"],
  ["Bash", "npm run build"],
  ["Bash", "npm run dev"],
  ["Bash", "npm run lint 2>&1 | tail -5"],
  ["Bash", "git status"],
  ["Bash", "git push origin gs/us-07-hooks-y-permisos-claude-code"],
  ["Bash", "git push -u origin my-branch"],
  ["Bash", "git reset --soft HEAD~1"],
  ["Bash", "git reset HEAD~1"],
  ["Bash", "git clean -n -f"],
  ["Bash", "git clean -nfd"],
  ["Bash", "git clean --dry-run -f"],
  ["Bash", "rm file.txt"],
  ["Bash", "rm -f file.txt"],
  ["Bash", "rm -r ./dir"],
  ["Bash", "sudo ls"],
  ["Bash", "bash -c \"echo hi\""],
  ["Bash", "find . -name '*.log' -exec rm {} \\;"],
  ["Bash", "ls -la # rm -rf ./x"],
  // Texto que menciona los patrones sin ejecutarlos
  ["Bash", "echo \"rm -rf ./x\""],
  ["Bash", "grep -rn \"git push --force\" .claude"],
  ["Bash", "git commit -m \"docs: explain why rm -rf and git reset --hard are blocked\""],
  [
    "Bash",
    "git commit -m \"$(cat <<'EOF'\nfix(hooks): deny rm -rf behind wrappers\n\ngit reset --hard and git push --force stay denied (US-07)\nEOF\n)\"",
  ],
  // PowerShell: comandos normales
  ["PowerShell", "Get-ChildItem"],
  ["PowerShell", "Get-ChildItem -Recurse -Force .\\src"],
  ["PowerShell", "Remove-Item .\\file.txt"],
  ["PowerShell", "Remove-Item .\\file.txt -Force"],
  ["PowerShell", "Remove-Item .\\dir -Recurse"],
  ["PowerShell", "Remove-Item .\\dir -Recurse -Force:$false"],
  ["PowerShell", "Remove-Item .\\dir -Recurse -Filter *.log"],
  ["PowerShell", "rm .\\file.txt"],
  ["PowerShell", "git status"],
  ["PowerShell", "git push origin my-branch"],
  ["PowerShell", "npm run lint"],
  ["PowerShell", "Write-Host \"git push --force\""],
  ["PowerShell", "git commit -m @'\nfix(hooks): deny git reset --hard\nRemove-Item x -Recurse -Force too\n'@"],
];

for (const [tool, command] of DENY) {
  test(`deny [${tool}] ${JSON.stringify(command)}`, () => {
    assert.equal(decisionFor(tool, command), "deny");
  });
}

for (const [tool, command] of ALLOW) {
  test(`allow [${tool}] ${JSON.stringify(command)}`, () => {
    assert.equal(decisionFor(tool, command), null);
  });
}

test("payload sin command o JSON inválido: sin decisión", () => {
  const res = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
  assert.equal(decisionFor("Bash", ""), null);
});
