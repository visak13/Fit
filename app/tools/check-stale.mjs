/**
 * IS THE COMMITTED BUILD OLDER THAN THE SOURCE?
 *
 * Recomputes the source stamp from the working tree and compares it with what `dist/` claims it
 * was built from. Exits 0 when they match, 1 when they do not, and 1 with a different message
 * when there is no build record at all.
 *
 * This is not the publish step and does not publish anything. It is the check the publish step
 * needs in order to refuse a stale artefact — the point being that the check is POSSIBLE, which
 * it would not be if the build left no marker behind.
 *
 *     npm run check:stale
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { OUTPUT_DIRECTORY } from './build-config.mjs';
import { applicationRoot, computeSourceStamp } from './source-stamp.mjs';

/** Derived from the one named output location, so moving the build cannot leave this behind. */
const BUILD_INFO_PATH = path.join(applicationRoot, OUTPUT_DIRECTORY, 'build-info.json');
const BUILD_INFO_LABEL = `${OUTPUT_DIRECTORY}/build-info.json`;

async function main() {
  const { stamp: currentStamp, fileCount } = await computeSourceStamp();

  let buildInfo;
  try {
    buildInfo = JSON.parse(await readFile(BUILD_INFO_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`STALE: ${BUILD_INFO_LABEL} is missing — there is no build to compare against.`);
      console.error('Run `npm run build`.');
      process.exitCode = 1;
      return;
    }
    console.error(`cannot read ${BUILD_INFO_LABEL}:`, error);
    process.exitCode = 1;
    return;
  }

  if (buildInfo.sourceStamp === currentStamp) {
    console.log(
      `FRESH: ${OUTPUT_DIRECTORY}/ was built from this source (stamp ${currentStamp}, ${fileCount} files).`,
    );
    console.log(`Built at ${buildInfo.builtAt}.`);
    return;
  }

  console.error(`STALE: ${OUTPUT_DIRECTORY}/ was NOT built from the current source.`);
  console.error(`  the artefact says it was built from : ${buildInfo.sourceStamp}`);
  console.error(`  the working tree hashes to          : ${currentStamp}`);
  console.error('');
  console.error(
    `Publishing now would serve the previous build. Run \`npm run build\` and commit ${OUTPUT_DIRECTORY}/.`,
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('stale check failed:', error);
  process.exitCode = 1;
});
