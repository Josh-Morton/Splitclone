// Lets plain Node (≥ 22.15, which strips TypeScript types natively) run a
// script that imports the app's own domain modules, so a script categorises
// with exactly the code the app ships. The app's imports are extensionless
// ("./category"); Node's ESM resolver isn't, so retry those with ".ts".
//
//   node --import ./scripts/ts-hooks.mjs scripts/some-script.ts
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});
