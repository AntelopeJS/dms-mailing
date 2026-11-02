/**
 * The screenshots of the Mailing docs, taken on the Helio demo. The onboarding
 * runs first and creates the administrator every other scene signs in as. No
 * scene signs out, because every scene shares one browser session.
 */
export default [
  {
    id: "onboarding",
    route: "/onboarding",
    setup: true,
    steps: [
      { action: "fill", selector: 'input[name="name"]', value: "Helio" },
      {
        action: "click",
        selector: 'button:has-text("Continue to administrator")',
      },
      { action: "wait", selector: 'input[name="firstName"]' },
      { action: "fill", selector: 'input[name="firstName"]', value: "Sophie" },
      { action: "fill", selector: 'input[name="lastName"]', value: "Lambert" },
      {
        action: "fill",
        selector: 'input[name="email"]',
        value: "sophie.lambert@helio.be",
      },
      {
        action: "fill",
        selector: 'input[name="password"]',
        value: "HelioDocs2026!",
      },
      {
        action: "click",
        selector: 'button:has-text("Create administrator account")',
      },
      { action: "wait", selector: 'button:has-text("Open the dashboard")' },
      { action: "click", selector: 'button:has-text("Open the dashboard")' },
    ],
  },
  {
    id: "mailing-overview",
    route: "/modules/mailing/overview",
    steps: [{ action: "wait", selector: ".apexcharts-canvas" }],
    output: "packages/dms-mailing/docs/images/captures/mailing-overview.webp",
  },
  {
    id: "mailing-overview-lower",
    route: "/modules/mailing/overview",
    viewport: { width: 1440, height: 1400 },
    steps: [{ action: "wait", selector: 'text="Funnel · sent to clicked"' }],
    crop: 'text="Funnel · sent to clicked" >> xpath=ancestor::div[contains(., "Open rate by domain")][1]',
    output:
      "packages/dms-mailing/docs/images/captures/mailing-overview-lower.webp",
  },
  {
    id: "mailing-templates",
    route: "/modules/mailing/templates",
    viewport: { width: 1440, height: 1240 },
    steps: [{ action: "wait", selector: 'text="Installation scheduled"' }],
    output: "packages/dms-mailing/docs/images/captures/mailing-templates.webp",
  },
  {
    id: "mailing-new-template",
    route: "/modules/mailing/templates",
    steps: [
      { action: "wait", selector: 'text="Installation scheduled"' },
      { action: "click", selector: 'button:has-text("New template")' },
      { action: "wait", selector: '[role="dialog"]' },
    ],
    crop: '[role="dialog"]',
    output:
      "packages/dms-mailing/docs/images/captures/mailing-new-template.webp",
  },
  {
    id: "mailing-editor",
    route: "/modules/mailing/templates",
    steps: [
      { action: "click", selector: 'text="Installation scheduled"' },
      { action: "wait", selector: "[data-block-id]" },
    ],
    output: "packages/dms-mailing/docs/images/captures/mailing-editor.webp",
  },
  {
    id: "mailing-editor-block",
    route: "/modules/mailing/templates",
    steps: [
      { action: "click", selector: 'text="Installation scheduled"' },
      { action: "wait", selector: "[data-block-id]" },
      { action: "click", selector: 'button:text-is("Data")' },
      { action: "click", selector: "[data-block-id] >> nth=0" },
    ],
    output:
      "packages/dms-mailing/docs/images/captures/mailing-editor-block.webp",
  },
  {
    id: "mailing-sends",
    route: "/modules/mailing/sends",
    steps: [{ action: "wait", selector: "tbody tr" }],
    output: "packages/dms-mailing/docs/images/captures/mailing-sends.webp",
  },
  {
    id: "mailing-send-drawer",
    route: "/modules/mailing/sends",
    steps: [
      { action: "wait", selector: "tbody tr" },
      { action: "click", selector: 'text="Problems"' },
      {
        action: "click",
        selector: 'tbody tr:has(:text-is("Bounced")) >> nth=0',
      },
      { action: "wait", selector: "[data-send-drawer]" },
    ],
    output:
      "packages/dms-mailing/docs/images/captures/mailing-send-drawer.webp",
  },
  {
    id: "mailing-settings",
    route: "/modules/mailing/settings",
    viewport: { width: 1440, height: 1000 },
    steps: [{ action: "wait", selector: 'text="Delivery guards"' }],
    output: "packages/dms-mailing/docs/images/captures/mailing-settings.webp",
  },
  {
    id: "mailing-settings-webhook",
    route: "/modules/mailing/settings",
    steps: [{ action: "wait", selector: 'text="Send a test event"' }],
    crop: "#dms-form-content-section-provider",
    output:
      "packages/dms-mailing/docs/images/captures/mailing-settings-webhook.webp",
  },
  {
    id: "mailing-suppressions",
    route: "/modules/mailing/suppressions",
    steps: [{ action: "wait", selector: "tbody tr" }],
    output:
      "packages/dms-mailing/docs/images/captures/mailing-suppressions.webp",
  },
];
