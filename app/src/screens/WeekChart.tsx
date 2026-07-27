/**
 * THE WEEK ITSELF — the one drawing of a diet week, wherever a diet week is drawn.
 *
 * It was written inside `DietScreen.tsx` when the read screen was the only thing that showed a week.
 * It lives here now because THREE surfaces draw one: the read screen, the editor's live preview of
 * what he is typing, and the import surface's preview of what a paste was understood as. Two copies
 * of this markup would drift, and the drift would be silent in the worst possible way — the coach
 * would confirm an import against one layout and read the saved plan under another. `console.css`
 * already made the same argument for the `.week` classes and put them in one place; this is the
 * markup that consumes them, put in one place for the same reason.
 *
 * Nothing about the drawing changed in the move, and nothing about it decides anything.
 *
 * Every judgement in here was made before this component ran. The rows are already in TIME order —
 * `core/diet/week.js` orders them through minutes-of-day, never through string comparison, because
 * nine o'clock sorts before ten as a time and after it as a string and the wrong answer looks merely
 * plausible. Every row already holds exactly one cell per day, in the same order, so the grid is
 * rectangular; a sparse row would render SHIFTED, with Thursday's lunch under Tuesday's column,
 * which is the specific way a chart lies to the person reading it fastest.
 *
 * **The day names come off the chart**, which takes them from the one frozen table in
 * `core/diet/week.js`. There is no list of day names in this file.
 *
 * So this draws and sorts nothing.
 */

import type { projectWeekChart } from '../../core/diet/diet.js';

/** The chart as `core/diet/chart.js` projects it. Consumed whole; nothing is re-derived from it. */
export type WeekChartView = ReturnType<typeof projectWeekChart>;

export function WeekChart({ chart, caption }: { chart: WeekChartView; caption: string }) {
  return (
    // Focusable and named: a container that scrolls and cannot be reached from a keyboard has hidden
    // its right-hand half. The name is the caption, so what is announced is whose week this is.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="week-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="week">
        <thead>
          <tr>
            {/* Deliberately without words: the row and column headings either side of it already
                say what they are, and "Time" over a column of times is a label read once and then
                carried on every screen for ever. */}
            <th scope="col" className="week-corner">
              <span className="visually-hidden">Time of day</span>
            </th>
            {chart.days.map((day) => (
              <th key={day.day} scope="col" className="week-day">
                {day.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {chart.rows.map((row) => (
            <tr key={row.time}>
              <th scope="row" className="week-time">
                {row.time}
                {/* The slot's own name, when every day on the row agrees on one. It is NOT repeated
                    inside the cells — the projection already left it out of them for exactly this
                    reason, so the coach does not read "Breakfast" three times across one line. */}
                {row.label !== null && <span className="week-slot">{row.label}</span>}
              </th>

              {row.cells.map((cell) => (
                <td key={`${row.time}-${cell.day}`} className="week-meal">
                  {/* An empty cell is EMPTY. A dash or a placeholder is a mark he has to learn the
                      meaning of, and an absence should look like one. */}
                  {cell.entries.map((entry, at) => (
                    // There is no identity on a line of a projection; the order is the meaning.
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={`${row.time}-${cell.day}-${at}`} className="week-meal-line">
                      {entry.text}
                    </span>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
