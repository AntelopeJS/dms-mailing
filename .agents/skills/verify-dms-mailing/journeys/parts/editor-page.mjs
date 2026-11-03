import { check, list, mailing, pick } from "../../mailing.mjs";
import { created, save } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

export const journeys = [
  {
    id: "the-editor-page-has-its-panes-toolbar-and-keyboard-shortcuts",
    title: "the editor at /modules/mailing/templates/<id> shows the blocks, outline and variables tabs, the block, test data and template tabs and the toolbar, saves with Ctrl+S, opens the test dialog with T and goes back to Templates with Escape",
    entryPoint: "/modules/mailing/templates/<id>",
    async run(/** @type {Ctx} */ ctx) {
      const { id } = await created(ctx, { slug: "editor-page", name: "Editor page", category: "orders" });
      await save(ctx, id, { content: { locales: { en: { subject: "Subject", preheader: "", blocks: [] } } } });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(`/modules/mailing/templates/${id}`);
      await tab.visible({ role: "button", name: "Publish changes" });
      await ctx.verify("the editor shows its panes, toolbar and block palette", [
        tab.visible({ role: "button", name: "Back to the templates" }),
        tab.visible({ role: "radio", name: "Desktop" }),
        tab.visible({ role: "radio", name: "Mobile" }),
        tab.visible({ role: "radio", name: "Variables" }),
        tab.visible({ role: "radio", name: "Data" }),
        tab.visible({ role: "button", name: "Undo" }),
        tab.enabled({ role: "button", name: "Undo" }, { disabled: true }),
        tab.visible({ role: "button", name: "Test" }),
        tab.visible({ role: "tab", name: "Blocks" }),
        tab.visible({ role: "tab", name: "Outline" }),
        tab.visible({ role: "tab", name: "Variables 0" }),
        tab.visible({ role: "tab", name: "Block" }),
        tab.visible({ role: "tab", name: "Test data" }),
        tab.visible({ role: "tab", name: "Template" }),
        ...["Heading", "Paragraph", "Image", "Button", "List", "Total", "Code / OTP", "Divider"].map((name) => tab.visible({ role: "button", name, exact: true })),
      ], { critical: true });
      /** @returns {Promise<string[]>} The block types of the saved draft */
      const savedTypes = async () => {
        const read = await mailing(ctx, "read the draft", "GET", `/templates/${id}/content`);
        return list(read.body, "content", "locales", "en", "blocks").map((entry) => String(pick(entry, "type")));
      };
      await tab.click({ role: "button", name: "Heading", exact: true });
      await tab.press("Control+s");
      await tab.enabled({ role: "button", name: "Undo" }, { disabled: false });
      await ctx.verify("a block added from the palette is saved by Ctrl+S", [check("one heading in the draft", JSON.stringify(await savedTypes()) === '["heading"]', await savedTypes())]);
      await tab.press("Control+d");
      await tab.press("Control+s");
      await ctx.verify("Ctrl+D duplicates the selected block", [check("two headings", JSON.stringify(await savedTypes()) === '["heading","heading"]', await savedTypes())]);
      await tab.press("Control+z");
      await tab.press("Control+s");
      await ctx.verify("Ctrl+Z undoes the duplicate", [check("one heading", JSON.stringify(await savedTypes()) === '["heading"]', await savedTypes())]);
      await tab.press("Control+Shift+z");
      await tab.press("Control+s");
      await ctx.verify("Ctrl+Shift+Z redoes it", [check("two headings", JSON.stringify(await savedTypes()) === '["heading","heading"]', await savedTypes())]);
      await tab.click({ role: "button", name: "Paragraph", exact: true });
      await tab.press("Delete");
      await tab.press("Control+s");
      await ctx.verify("Delete removes the selected block", [check("the two headings remain", JSON.stringify(await savedTypes()) === '["heading","heading"]', await savedTypes())]);
      await tab.click({ role: "button", name: "Divider", exact: true });
      await tab.press("Backspace");
      await tab.press("Control+s");
      await ctx.verify("Backspace removes the selected block", [check("the two headings remain", JSON.stringify(await savedTypes()) === '["heading","heading"]', await savedTypes())]);
      await tab.press("t");
      await ctx.verify("T opens the test dialog", [tab.visible({ role: "dialog" })]);
      await tab.press("Escape");
      await ctx.verify("Escape closes the dialog and keeps the editor open", [tab.at(/^\/modules\/mailing\/templates\/[^/]+$/)]);
      await tab.press("Escape");
      await tab.press("Escape");
      await ctx.verify("Escape goes back to Templates", [tab.at(/^\/modules\/mailing\/templates$/)]);
    },
  },
];
