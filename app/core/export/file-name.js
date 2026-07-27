/**
 * THE NAME THE COACH SEES IN HIS SHARE SHEET, DERIVED FROM THE TITLE HE ALREADY GAVE.
 *
 * This lives on the pure side because it is a decision about text, not about the browser, and
 * because both halves of the seam need the same answer: the download link and the shared file must
 * not be named differently for the same export.
 *
 * The rule is one sentence: keep what a person would read, drop what a file system would fight
 * over, never produce an empty name. Everything else about it exists because a share sheet shows
 * this string to the coach and then to whoever he sends it to — `Diet — week of 3 August.xlsx` is
 * the artefact arriving with its own explanation, and `export-1.xlsx` is a file the client has to
 * ask about.
 */

/** Characters no common file system will accept, plus the ones a share target mangles. */
const FORBIDDEN = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\n', '\r', '\t'];

/** Long enough for a real title, short enough that no platform truncates it in the middle. */
const LIMIT = 80;

/**
 * A file name for an exported table.
 *
 * @param {string} title The table's own title.
 * @param {string} extension Including its dot, e.g. `.xlsx`.
 * @returns {string} Never empty, never only an extension's worth of nothing.
 */
export function exportFileName(title, extension) {
  let name = typeof title === 'string' ? title : '';
  for (const character of FORBIDDEN) name = name.split(character).join(' ');

  // Collapse the runs left behind by the substitutions above, so a title holding a path fragment
  // does not arrive as a name with a gap in the middle of it.
  while (name.includes('  ')) name = name.split('  ').join(' ');

  // A leading dot hides the file on the coach's own laptop, which is the one place he would go
  // looking for it after a fallback download.
  name = name.trim();
  while (name.startsWith('.')) name = name.slice(1).trim();

  if (name.length > LIMIT) name = name.slice(0, LIMIT).trim();
  // A trailing dot or space is dropped by some file systems on write, which turns one export into a
  // name the coach cannot find by the name he was shown.
  while (name.endsWith('.') || name.endsWith(' ')) name = name.slice(0, -1);

  return `${name === '' ? 'export' : name}${extension}`;
}
