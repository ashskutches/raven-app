/* Node 25+ ships its own global localStorage, which is undefined unless
   --localstorage-file is given, and it shadows jsdom's -- so every
   `localStorage.clear()` in a test throws. Turn Node's off and let jsdom's
   through. vitest.config.ts hands the result to `test.execArgv`.

   The gate is on 22.4 and not on the major alone: Web Storage arrived in
   v22.4.0, and a Node that does not know a flag does not ignore it -- it exits
   9 before running anything, which vitest reports as "Worker exited
   unexpectedly during starting state" from inside node_modules, naming nothing
   about this line. Gating on `>= 22` killed the whole suite for anyone on
   22.0-22.3, and nothing here pins a Node version to keep them off it.

   Its own module rather than a second export from vitest.config.ts: Vite loads
   that file as a rollup entry module, and a named export beside the default
   one makes it a mixed-exports entry, which prints a [MIXED_EXPORTS] warning
   above every `npm test` run. The config has one job -- export a config -- and
   this is a pure function two callers want. */
export function webstorageExecArgv(nodeVersion: string): string[] {
  const [major, minor] = nodeVersion.split('.').map(Number);

  return major > 22 || (major === 22 && minor >= 4)
    ? ['--no-experimental-webstorage']
    : [];
}
