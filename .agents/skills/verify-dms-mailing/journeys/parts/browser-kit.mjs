import { isText } from "../../mailing.mjs";

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
