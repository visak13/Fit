/**
 * THE ONE THING STANDING BETWEEN A NODE TEST AND THE REAL COMPONENT TREE.
 *
 * Node runs `.ts` by erasing its types, which is why every shell suite so far has been able to
 * import real source with no build step. It CANNOT run `.tsx`: JSX is not type syntax, it is a
 * transform, and Node refuses the file outright with "Unknown file extension .tsx".
 *
 * That refusal is why the checks in this application had all been written against source TEXT —
 * reading a file and asserting a string appears in it. Those checks are worth keeping, but there is
 * a whole class of question they cannot answer, and the no-dead-ends requirement is exactly that
 * class: whether an address RESOLVES, whether a screen RENDERS, whether the way out of it is really
 * there. A string search can only ask whether somebody typed something that looks right.
 *
 * So this hook teaches Node two things and nothing more:
 *
 *   1. `.tsx` is transpiled on the way in, by the TypeScript compiler this project already depends
 *      on, with the same `jsx` setting `tsconfig.json` declares. No new dependency, no bundle step,
 *      no second copy of the source on disk.
 *   2. An import with no extension resolves the way the bundler resolves it — `./AppFrame` finds
 *      `AppFrame.tsx`, `./navigation` finds `navigation.ts`. Application source is written for the
 *      bundler, and a test harness that could not follow it would force every module to be rewritten
 *      for the benefit of the tests.
 *
 * ## What it deliberately does NOT do
 *
 * It does not type-check — `npm run typecheck` is the gate for that, and doing it twice would make
 * the test run slow enough that somebody stops running it. It does not touch `.ts`, which Node
 * already handles natively: taking that over would mean every existing shell suite silently changed
 * how it loads, for no gain. It resolves only RELATIVE specifiers; anything bare goes to Node's own
 * resolver so `react`, `react-dom/server` and `react-router-dom` load exactly as they do in the
 * build.
 *
 * ## `import.meta.env`
 *
 * `AppFrame.tsx` reads `import.meta.env.BASE_URL` at module scope — the published sub-path, which
 * the bundler defines. Outside the bundler that object does not exist, and the module would throw
 * on import before any test could run. A prelude gives it a value ONLY where it is absent, so the
 * bundler's own value always wins and nothing here can mask a build-time defect. `/` is what Vite
 * itself uses when no base is configured.
 *
 *     node --import ./tools/tsx-test-hook.mjs --test src/shell/routes.test.ts
 *
 * It is wired into `npm run test:shell` by `tools/run-suite-tests.mjs`, so a suite gets it without
 * anyone remembering.
 */

import { registerHooks } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/** Tried in order for an import written without one, longest-established convention first. */
const EXTENSIONS = ['.tsx', '.ts'];

/**
 * Present in every transpiled module, and inert wherever the bundler has already done its job.
 *
 * `??=` rather than `=`: if a future harness or a bundled context supplies a real `env`, this must
 * not overwrite it. A test that quietly ran against a different base path than the build would be
 * the same class of defect as the ones this file exists to help catch.
 */
const IMPORT_META_PRELUDE =
  "import.meta.env ??= { BASE_URL: '/', MODE: 'test', DEV: false, PROD: false, SSR: true };\n";

function existsAsFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

    if (relative && !hasExtension && context.parentURL !== undefined) {
      for (const extension of EXTENSIONS) {
        const candidate = new URL(specifier + extension, context.parentURL);
        // No `format` of its own: Node decides, which is what leaves `.ts` on Node's native type
        // stripping. Declaring it here would hand a `.ts` file to the plain-JavaScript path and its
        // first type annotation would be a syntax error.
        if (existsAsFile(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.tsx')) return nextLoad(url, context);

    const path = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
      fileName: path,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        // The same value `tsconfig.json` declares. A harness that transformed JSX differently from
        // the build would be testing a component tree the coach never runs.
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: true,
      },
    });

    return { format: 'module', source: IMPORT_META_PRELUDE + outputText, shortCircuit: true };
  },
});
