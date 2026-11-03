import { isText, pick } from "../../mailing.mjs";

/** @typedef {import("../../mailing.mjs").Tab} Tab */

/**
 * @param {unknown} value Anything the browser returned
 * @returns {string} Its text, empty for nothing
 */
function asText(value) {
  return isText(value) ? value : "";
}

/**
 * @param {Tab} tab The tab
 * @returns {Promise<string>} The page text, whitespace collapsed to single spaces
 */
export async function pageText(tab) {
  return asText(await tab.page.locator("body").innerText()).replace(/\s+/g, " ");
}

/**
 * @param {Tab} tab The tab
 * @param {import("../../../../../packages/dms-mailing/node_modules/@antelopejs/dms/bin/control/browser.mjs").Target} target The element
 * @param {string} name The attribute
 * @returns {Promise<string>} The attribute, empty when missing
 */
export async function attributeOf(tab, target, name) {
  return asText(await tab.locator(target).first().getAttribute(name));
}

/**
 * @param {Tab} tab The tab
 * @param {import("../../../../../packages/dms-mailing/node_modules/@antelopejs/dms/bin/control/browser.mjs").Target} target The element
 * @returns {Promise<boolean>} Whether a radio or checkbox is checked
 */
export async function isChecked(tab, target) {
  return (await tab.locator(target).first().isChecked()) === true;
}

/**
 * @param {Tab} tab The tab
 * @param {number} ms How long to wait
 * @returns {Promise<void>}
 */
export async function wait(tab, ms) {
  await tab.page.waitForTimeout(ms);
}

/**
 * @param {Tab} tab The tab with a drawer or dialog open
 * @returns {Promise<string>} The text of the open dialog on one line
 */
export async function dialogText(tab) {
  return asText(await tab.page.getByRole("dialog").first().innerText()).replace(/\s+/g, " ");
}

/**
 * @param {Tab} tab The tab with a drawer or dialog open
 * @returns {Promise<string[]>} The names of the dialog's buttons (the accessible label, else the text)
 */
export async function dialogButtons(tab) {
  const count = Number(await tab.page.getByRole("dialog").first().getByRole("button").count());
  const names = [];
  for (let index = 0; index < count; index += 1) {
    const label = asText(await tab.page.getByRole("dialog").first().getByRole("button").nth(index).getAttribute("aria-label"));
    names.push(label === "" ? asText(await tab.page.getByRole("dialog").first().getByRole("button").nth(index).innerText()).trim() : label);
  }
  return names;
}

/**
 * @param {unknown} box A Playwright bounding box
 * @returns {{ x: number, y: number, width: number, height: number }} Its numbers, 0 for what is missing
 */
function numbersOf(box) {
  return { x: Number(pick(box, "x") ?? 0), y: Number(pick(box, "y") ?? 0), width: Number(pick(box, "width") ?? 0), height: Number(pick(box, "height") ?? 0) };
}

/**
 * @param {Tab} tab The tab
 * @param {string} text The exact text of an element
 * @returns {Promise<{ x: number, y: number, width: number }>} Where the first element with that text is, and the width of the open dialog
 */
export async function boxOfText(tab, text) {
  const place = numbersOf(await tab.page.getByText(text, { exact: true }).first().boundingBox());
  const dialog = numbersOf(await tab.page.getByRole("dialog").first().boundingBox());
  return { x: place.x, y: place.y, width: dialog.width };
}

/**
 * Drags the drawer's left edge.
 *
 * @param {Tab} tab The tab with an open drawer
 * @param {number} pixels How far to the left
 * @returns {Promise<void>}
 */
export async function dragDrawerEdge(tab, pixels) {
  const edge = numbersOf(await tab.page.getByRole("separator", { name: "Resize the drawer" }).boundingBox());
  await tab.page.mouse.move(edge.x + 2, edge.y + 200);
  await tab.page.mouse.down();
  await tab.page.mouse.move(edge.x + 2 - pixels, edge.y + 200, { steps: 8 });
  await tab.page.mouse.up();
}

/**
 * @param {Tab} tab The tab
 * @returns {string} The address the tab is at
 */
export function urlOf(tab) {
  return asText(tab.page.url());
}

/**
 * @param {Tab} tab The tab
 * @param {RegExp} name The accessible name of the rows
 * @returns {Promise<number>} How many table rows match
 */
export async function rowCount(tab, name) {
  return Number(await tab.page.getByRole("row", { name }).count());
}

/**
 * Clicks on the page beside the open drawer.
 *
 * @param {Tab} tab The tab
 * @returns {Promise<void>}
 */
export async function clickBesideDrawer(tab) {
  await tab.page.mouse.click(120, 400);
}
