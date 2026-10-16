import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'], outfile: 'dist-server/server.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node24', packages: 'external', sourcemap: false,
});
