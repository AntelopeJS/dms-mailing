import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Invariants of the frontend's locale catalogs: both locales carry the same
 * keys and the namespaces the pages use; every static key the backend emits
 * and every literal key the editor asks for resolves to a message; messages
 * compile and keep their placeholders across languages; French says
 * « modèle » and writes its plurals with three forms. Keys completed by a
 * template expression are resolved at runtime and are not checked. Prints the
 * violations only; exits 1 when there are any.
 */

type Messages = { [key: string]: string | Messages };

const PACKAGE = join(import.meta.dirname, "..");
const FRONTEND = join(PACKAGE, "frontend-vue");
const BACKEND_SOURCE = join(PACKAGE, "src");
const APP = join(FRONTEND, "app");
const LOCALES = join(FRONTEND, "i18n", "locales");

const NAMESPACES = [
  "overview",
  "templates",
  "editor",
  "sends",
  "settings",
  "metrics",
  "funnel",
  "errors",
  "blocks",
];

/**
 * `$dms_mailing.a.b` as the backend writes it. A literal that stops on a dot
 * is the prefix of a key completed by a template expression (`${status}`).
 */
const BACKEND_KEY = /\$dms_mailing\.[\w.]+/g;
const DYNAMIC_KEY_SUFFIX = ".";

/** The sources of the editor whose literal keys are checked. */
const EDITOR_SOURCES = [
  join(APP, "components", "Editor.vue"),
  join(APP, "composables", "useEditorActions.ts"),
  join(APP, "composables", "useEditorShortcuts.ts"),
  ...readdirSync(join(APP, "components", "editor"))
    .toSorted()
    .map((file) => join(APP, "components", "editor", file)),
];
const EDITOR_LITERAL_KEY =
  /'(dms_mailing\.(?:editor|blocks|templates\.status)\.[a-z_.]+)'/g;
const PREFIX_CONSTANT = /const (\w*KEY) = '(dms_mailing[a-z_.]*)'/g;
const PREFIXED_KEY = /\$\{(\w*KEY)\}\.([a-z_.]+)`/g;

/** `{name}` placeholders and `{'…'}` literals, the only braces a message holds. */
const BRACED = /\{'[^']*'\}|\{\w+\}/g;
const STRAY = /[{}@]/;
const PLACEHOLDER = /\{(\w+)\}/g;
const ANGLICISM = /\btemplates?\b/i;
const PLURAL_SEPARATOR = "|";
/**
 * vue-i18n's default rule picks, for three forms, the first at 0 and the
 * second at 1: French says « 0 envoi », so every French plural needs all
 * three.
 */
const FRENCH_PLURAL_FORMS = 3;

function isMessageTree(value: unknown): value is Messages {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isMessage)
  );
}

function isMessage(value: unknown): value is string | Messages {
  return typeof value === "string" || isMessageTree(value);
}

function isText(node: string | Messages | undefined): node is string {
  return typeof node === "string";
}

const shown = (file: string): string => relative(PACKAGE, file);

function readLocale(name: string): Messages {
  const file = join(LOCALES, `mailing-${name}.json`);
  const messages: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isMessageTree(messages)) {
    throw new Error(`${shown(file)}: not a tree of string messages`);
  }
  return messages;
}

function messagesOf(tree: Messages, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, node]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isText(node) ? [[path, node]] : messagesOf(node, path);
  });
}

function resolve(tree: Messages, key: string): string | Messages | undefined {
  let node: string | Messages | undefined = tree;
  for (const part of key.split(".")) {
    node = node === undefined || isText(node) ? undefined : node[part];
  }
  return node;
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .toSorted()
    .map((file) => join(directory, file));
}

function backendKeys(): string[] {
  const found = new Set<string>();
  for (const file of typescriptFiles(BACKEND_SOURCE)) {
    for (const [literal] of readFileSync(file, "utf8").matchAll(BACKEND_KEY)) {
      const key = literal.slice(1);
      if (!key.endsWith(DYNAMIC_KEY_SUFFIX)) found.add(key);
    }
  }
  return [...found].toSorted();
}

function editorKeys(source: string): string[] {
  const prefixes = new Map(
    [...source.matchAll(PREFIX_CONSTANT)].map(([, name, key]) => [name, key]),
  );
  const prefixValues = new Set(prefixes.values());
  const literal = [...source.matchAll(EDITOR_LITERAL_KEY)]
    .map(([, key]) => key)
    .filter((key) => !prefixValues.has(key));
  const prefixed = [...source.matchAll(PREFIXED_KEY)].flatMap(
    ([, name, rest]) => {
      const prefix = prefixes.get(name);
      return prefix === undefined ? [] : [`${prefix}.${rest}`];
    },
  );
  return [...literal, ...prefixed];
}

function placeholdersOf(message: string): string {
  return [
    ...new Set([...message.matchAll(PLACEHOLDER)].map(([, name]) => name)),
  ]
    .toSorted()
    .join();
}

const en = readLocale("en-GB");
const fr = readLocale("fr-FR");
const errors: string[] = [];
const locales: [string, Messages][] = [
  ["en-GB", en],
  ["fr-FR", fr],
];
const enMessages = messagesOf(en);
const frMessages = messagesOf(fr);
const frByKey = new Map(frMessages);
const enKeys = new Set(enMessages.map(([key]) => key));

for (const [key] of enMessages) {
  if (!frByKey.has(key)) errors.push(`fr-FR: missing key ${key}`);
}
for (const [key] of frMessages) {
  if (!enKeys.has(key)) errors.push(`en-GB: missing key ${key}`);
}

for (const [name, messages] of locales) {
  for (const namespace of NAMESPACES) {
    const node = resolve(messages, `dms_mailing.${namespace}`);
    if (node === undefined)
      errors.push(`${name}: no namespace dms_mailing.${namespace}`);
  }
}

const emitted = backendKeys();
if (emitted.length === 0) errors.push("src: no $dms_mailing key found");
for (const key of emitted) {
  for (const [name, messages] of locales) {
    if (!isText(resolve(messages, key)))
      errors.push(`${name}: the backend emits ${key}, which has no message`);
  }
}

const used = EDITOR_SOURCES.flatMap((file) =>
  editorKeys(readFileSync(file, "utf8")).map((key) => [file, key] as const),
);
if (used.length === 0) errors.push("editor: no literal key found");
for (const [file, key] of used) {
  if (!enKeys.has(key))
    errors.push(`en-GB: ${shown(file)} asks for ${key}, which has no message`);
}

for (const [name, messages] of [
  ["en-GB", enMessages],
  ["fr-FR", frMessages],
] as const) {
  for (const [key, message] of messages) {
    if (STRAY.test(message.replace(BRACED, "")))
      errors.push(`${name}: ${key} has a stray brace or an unescaped @`);
  }
}

for (const [key, message] of enMessages) {
  if (placeholdersOf(message) !== placeholdersOf(frByKey.get(key) ?? "")) {
    errors.push(`fr-FR: ${key} does not have the placeholders of en-GB`);
  }
}

for (const [key, message] of frMessages) {
  if (ANGLICISM.test(message))
    errors.push(`fr-FR: ${key} says « template », not « modèle »`);
  if (
    message.includes(PLURAL_SEPARATOR) &&
    message.split(PLURAL_SEPARATOR).length !== FRENCH_PLURAL_FORMS
  ) {
    errors.push(
      `fr-FR: ${key} is a plural without ${FRENCH_PLURAL_FORMS} forms`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
