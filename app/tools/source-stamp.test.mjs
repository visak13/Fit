/**
 * THE STALE-BUILD MARKER, PROVEN RATHER THAN ASSERTED.
 *
 * The whole value of the source stamp rests on one property: if a source byte changes, the stamp
 * changes. A marker that quietly failed to notice a change would be worse than no marker, because
 * the publish step would then report FRESH over a stale artefact and everyone would believe it.
 *
 * These build a small tree on disk and check the stamp actually moves — including for the file
 * classes that are easy to leave out of a hash by accident: the core the shell consumes, the
 * static files copied into the build, and a rename with no content change at all.
 *
 *     npm run test:tools
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { OUTPUT_DIRECTORY } from './build-config.mjs';
import { computeSourceStamp, listSourceFiles } from './source-stamp.mjs';

let root;

/** A minimal stand-in for the application's own layout. */
async function buildTree(at) {
  await mkdir(path.join(at, 'src', 'platform'), { recursive: true });
  await mkdir(path.join(at, 'core', 'model'), { recursive: true });
  await mkdir(path.join(at, 'public', 'icons'), { recursive: true });
  await mkdir(path.join(at, 'node_modules', 'somewhere'), { recursive: true });
  await mkdir(path.join(at, 'dist'), { recursive: true });

  await writeFile(path.join(at, 'src', 'main.tsx'), 'export const a = 1;\n');
  await writeFile(path.join(at, 'src', 'platform', 'thing.ts'), 'export const b = 2;\n');
  await writeFile(path.join(at, 'core', 'model', 'model.js'), 'export const c = 3;\n');
  await writeFile(path.join(at, 'core', 'model', 'model.test.js'), 'import "node:test";\n');
  await writeFile(path.join(at, 'core', 'model', 'index.js'), 'import "./model.test.js";\n');
  await writeFile(path.join(at, 'public', 'manifest.webmanifest'), '{"name":"Fit"}\n');
  await writeFile(path.join(at, 'public', 'icons', 'placeholder-192.png'), 'not really a png');
  await writeFile(path.join(at, 'index.html'), '<!doctype html>\n');
  await writeFile(path.join(at, 'package.json'), '{"name":"fit-app"}\n');
  await writeFile(path.join(at, 'node_modules', 'somewhere', 'lib.js'), 'export const d = 4;\n');
  await writeFile(path.join(at, 'dist', 'index.html'), '<!doctype html>built\n');
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'fit-stamp-'));
  await buildTree(root);
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the source stamp', () => {
  it('is stable when nothing changes', async () => {
    const first = await computeSourceStamp(root);
    const second = await computeSourceStamp(root);
    assert.equal(first.stamp, second.stamp);
  });

  it('moves when a shell source file changes', async () => {
    const before = await computeSourceStamp(root);
    await writeFile(path.join(root, 'src', 'main.tsx'), 'export const a = 99;\n');
    const after = await computeSourceStamp(root);
    assert.notEqual(after.stamp, before.stamp);
  });

  it('moves when the CORE changes — the change that would otherwise ship invisibly', async () => {
    const before = await computeSourceStamp(root);
    await writeFile(path.join(root, 'core', 'model', 'model.js'), 'export const c = 300;\n');
    const after = await computeSourceStamp(root);
    assert.notEqual(after.stamp, before.stamp);
  });

  it('moves when a static file copied into the build changes', async () => {
    const before = await computeSourceStamp(root);
    await writeFile(path.join(root, 'public', 'manifest.webmanifest'), '{"name":"Fit!"}\n');
    const after = await computeSourceStamp(root);
    assert.notEqual(after.stamp, before.stamp);
  });

  it('moves on a rename even when no content changed at all', async () => {
    const before = await computeSourceStamp(root);
    await rename(
      path.join(root, 'src', 'platform', 'thing.ts'),
      path.join(root, 'src', 'platform', 'renamed.ts'),
    );
    const after = await computeSourceStamp(root);
    assert.notEqual(after.stamp, before.stamp);
  });

  it('does not move when only the build-free core test gate changes', async () => {
    const before = await computeSourceStamp(root);
    await writeFile(path.join(root, 'core', 'model', 'model.test.js'), 'import "node:test";//x\n');
    const after = await computeSourceStamp(root);
    assert.equal(after.stamp, before.stamp);
  });

  it('does not move when only the built output changes', async () => {
    // dist/ is the artefact being judged; hashing it would make the stamp compare itself.
    const before = await computeSourceStamp(root);
    await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html>rebuilt\n');
    const after = await computeSourceStamp(root);
    assert.equal(after.stamp, before.stamp);
  });

  it('walks neither dependencies nor the built output', async () => {
    const files = await listSourceFiles(root);
    assert.ok(!files.some((file) => file.startsWith('node_modules/')));
    assert.ok(!files.some((file) => file.startsWith('dist/')));
  });

  it('does not depend on filesystem ordering', async () => {
    const files = await listSourceFiles(root);
    assert.deepEqual(files, [...files].sort());
  });

  it('EXCLUDES THE BUILD OUTPUT BY NAME AT ANY DEPTH, which is the only case that actually tests the rule', async () => {
    // The two assertions above about the built output pass VACUOUSLY, and that was measured rather
    // than suspected: deleting OUTPUT_DIRECTORY from IGNORED_DIRECTORY_NAMES entirely leaves this
    // whole file green. The reason is that the walker only descends src/, core/, public/ and
    // tools/, so a `dist/` sitting at the ROOT is never reached and the ignore rule never fires.
    // Both of those tests therefore prove the walker's shape, not the exclusion.
    //
    // The exclusion becomes load-bearing the moment the output lands inside a walked source root,
    // and it is written as a name matched at any depth precisely so it survives that move. If it
    // ever stopped firing, the artefact would become an input to the hash that judges it: every
    // build would change the stamp, so the next build would always disagree with the one before,
    // and the freshness marker would report STALE for ever and be learned as noise.
    //
    // This is the case that can actually fail. It reads OUTPUT_DIRECTORY from the one place it is
    // defined, so it keeps testing the real value if the publish step moves the output.
    const nested = path.join(root, 'public', OUTPUT_DIRECTORY);
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'index.html'), '<!doctype html>built\n');

    try {
      const files = await listSourceFiles(root);
      assert.ok(
        !files.some((file) => file.includes(`/${OUTPUT_DIRECTORY}/`)),
        `the build output was walked at public/${OUTPUT_DIRECTORY}/. The artefact is now an input `
          + 'to its own stamp and the freshness marker will report stale permanently.',
      );

      const before = await computeSourceStamp(root);
      await writeFile(path.join(nested, 'index.html'), '<!doctype html>rebuilt\n');
      const after = await computeSourceStamp(root);
      assert.equal(after.stamp, before.stamp, 'rebuilding the artefact must not move the stamp');
    } finally {
      await rm(nested, { recursive: true, force: true });
    }
  });
});
