# Changelog


## v0.8.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.7.1...v0.8.0)

### 🚀 Enhancements

- **frontend:** Enforce the backend boundary in production builds ([#80](https://github.com/AntelopeJS/dms-mailing/pull/80))

### 🩹 Fixes

- Require @antelopejs/mongodb 1.5.1, which builds unique indexes before queries ([#76](https://github.com/AntelopeJS/dms-mailing/pull/76))
- **playground:** Declare the frontend, so renderer 0.9 serves it ([#73](https://github.com/AntelopeJS/dms-mailing/pull/73))
- **mailing:** Present API failures once through DMS core ([#111](https://github.com/AntelopeJS/dms-mailing/pull/111))

### 💅 Refactors

- Clean up the tests, comments, types and oversize files ([#78](https://github.com/AntelopeJS/dms-mailing/pull/78))
- **amp:** Narrow the forwarded location header with a JSDoc type guard ([#81](https://github.com/AntelopeJS/dms-mailing/pull/81))

### 📖 Documentation

- **changelog:** Upgrade notes of interface-dms-mailing 0.9.1 ([#71](https://github.com/AntelopeJS/dms-mailing/pull/71))
- **changelog:** Upgrade notes of dms-mailing 0.7.1 ([#72](https://github.com/AntelopeJS/dms-mailing/pull/72))
- **readme:** Link the DMS in the opening line ([#100](https://github.com/AntelopeJS/dms-mailing/pull/100))
- **readme:** Use one Discord invite ([#97](https://github.com/AntelopeJS/dms-mailing/pull/97))

### 📦 Build

- **deps:** Bump @antelopejs/tooling-configs to 0.2.17 ([#82](https://github.com/AntelopeJS/dms-mailing/pull/82))

### 🏡 Chore

- Adopt the guardrail pack from tooling-configs 0.2.0 ([#74](https://github.com/AntelopeJS/dms-mailing/pull/74))
- Configure Renovate with the shared preset ([#75](https://github.com/AntelopeJS/dms-mailing/pull/75))

### ✅ Tests

- **skills:** Add eval cases for dms-mailing ([#77](https://github.com/AntelopeJS/dms-mailing/pull/77))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.7.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.7.0...v0.7.1)

### Upgrade notes

- Runs on `@antelopejs/dms` `>=0.11.0`, `@antelopejs/interface-dms` `>=0.9.0`, `@antelopejs/dms-frontend` `>=0.9.0 <0.10.0`, `@antelopejs/interface-data-api` `>=0.4.0` ([#69](https://github.com/AntelopeJS/dms-mailing/pull/69)). **Upgrade together with dms 0.11 and dms-frontend 0.9.**
- **Breaking: the database module must enforce unique indexes** ([#68](https://github.com/AntelopeJS/dms-mailing/pull/68)). A template's slug is a unique index (`@antelopejs/interface-database` `>=0.1.11`, `@antelopejs/interface-database-decorators` `>=0.1.10`): use `@antelopejs/mongodb` ≥ 1.5.0 or `@antelopejs/postgres` ≥ 0.2.2. RethinkDB refuses this schema. The `mailing_template_slugs` table (slug claims) is gone; creating or duplicating a template on a taken slug answers `409 $dms_mailing.errors.duplicate_slug`.
- **Breaking:** declared templates and categories are written once ([#66](https://github.com/AntelopeJS/dms-mailing/pull/66)). An existing slug or category id is `kept`, whatever the code declares next; `declaredHash`, `pendingDeclaredHash`, `declarationSeedRevision` and `json_declared_categories` are no longer written. No migration: reset the database.
- **Breaking:** the database ready gate is removed ([#65](https://github.com/AntelopeJS/dms-mailing/pull/65)). Call `DeclareTemplate`, `DeclareTemplateCategory`, `DeclareSender` and `ImportSends` from a `Hook.TENANT_BEING_PROVISIONED` handler.
- A declared template is created already published as version 1, in one write: concurrent declarations of one slug answer one `created` and `kept` for the others, all at version 1 ([#70](https://github.com/AntelopeJS/dms-mailing/pull/70)).

### 🚀 Enhancements

- **settings:** Offer the module default on the settings fields that have one ([#67](https://github.com/AntelopeJS/dms-mailing/pull/67))

### 🩹 Fixes

- **declarations:** Create a declared template already published, in one write ([#70](https://github.com/AntelopeJS/dms-mailing/pull/70))

### 💅 Refactors

- **declarations:** Drop the database ready gate ([#65](https://github.com/AntelopeJS/dms-mailing/pull/65))
- **declarations:** Write declared templates and categories once ([#66](https://github.com/AntelopeJS/dms-mailing/pull/66))
- **templates:** A unique slug index instead of slug claims ([#68](https://github.com/AntelopeJS/dms-mailing/pull/68))

### 📦 Build

- **deps:** Run on dms 0.11, interface-dms 0.9 and dms-frontend 0.9 ([#69](https://github.com/AntelopeJS/dms-mailing/pull/69))

### 🏡 Chore

- **release:** @antelopejs/interface-dms-mailing v0.9.1 ([4b09056](https://github.com/AntelopeJS/dms-mailing/commit/4b09056))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.6.1...v0.7.0)

### 🚀 Enhancements

- **frontend:** The frontend registration as a pure function, declared as dmsFrontend ([#60](https://github.com/AntelopeJS/dms-mailing/pull/60))
- Declare the sender, localized template names and category labels, locale-formatted amounts and dates ([#53](https://github.com/AntelopeJS/dms-mailing/pull/53))
- **mailing:** Adopt the DMS page toolbar and live mode on Overview and Sends ([#55](https://github.com/AntelopeJS/dms-mailing/pull/55))
- **sends:** Open a send in a resizable right drawer ([#57](https://github.com/AntelopeJS/dms-mailing/pull/57))

### 🩹 Fixes

- **templates:** Drop the category quick filter dms#370 refuses ([#59](https://github.com/AntelopeJS/dms-mailing/pull/59), [#370](https://github.com/AntelopeJS/dms-mailing/issues/370))
- **templates:** Render the gallery without skeleton flashes or layout shift ([#56](https://github.com/AntelopeJS/dms-mailing/pull/56))

### 📦 Build

- Require interface-dms-mailing 0.9 and interface-dms 0.8 ([#63](https://github.com/AntelopeJS/dms-mailing/pull/63))
- Run on @antelopejs/dms 0.10 and @antelopejs/dms-frontend 0.8 ([#64](https://github.com/AntelopeJS/dms-mailing/pull/64))

### 🏡 Chore

- **release:** @antelopejs/interface-dms-mailing v0.9.0 ([613367c](https://github.com/AntelopeJS/dms-mailing/commit/613367c))

### ✅ Tests

- Give the DMS in the test stack the render secret dms 0.10 requires ([#61](https://github.com/AntelopeJS/dms-mailing/pull/61))

### ❤️ Contributors

- Maxime Westhoven <maxime@altab.be>
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.6.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.6.0...v0.6.1)

### 🩹 Fixes

- **frontend:** Run on @antelopejs/dms-frontend 0.7 ([#58](https://github.com/AntelopeJS/dms-mailing/pull/58))

### 📖 Documentation

- Clarify learning paths and illustrate real outcomes ([#54](https://github.com/AntelopeJS/dms-mailing/pull/54))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.6.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.5.1...v0.6.0)

### 🚀 Enhancements

- Declare templates and categories from code, import past sends ([#51](https://github.com/AntelopeJS/dms-mailing/pull/51))

### 📖 Documentation

- **mailing:** Align compatibility guidance for release 0.6 ([db420f0](https://github.com/AntelopeJS/dms-mailing/commit/db420f0))

### 📦 Build

- Install frontend development dependencies from the root ([#48](https://github.com/AntelopeJS/dms-mailing/pull/48))
- **mailing:** Align runtime with published interface 0.8 ([b7264a3](https://github.com/AntelopeJS/dms-mailing/commit/b7264a3))

### 🏡 Chore

- **release:** @antelopejs/interface-dms-mailing v0.8.0 ([7dc2dd6](https://github.com/AntelopeJS/dms-mailing/commit/7dc2dd6))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven <maxime@altab.be>

## v0.5.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.5.0...v0.5.1)

### 🔥 Performance

- **editor:** Drag with SortableJS through useSortable instead of vuedraggable ([#43](https://github.com/AntelopeJS/dms-mailing/pull/43))

### 🩹 Fixes

- **deps:** Move to @antelopejs/core 1.15.2, @antelopejs/interface-core 0.2.3 and @antelopejs/interface-dms 0.7.1 ([#42](https://github.com/AntelopeJS/dms-mailing/pull/42))
- **templates:** Keep each slug to one template when creations race ([#44](https://github.com/AntelopeJS/dms-mailing/pull/44))

### 📖 Documentation

- Add user guide, screenshots and dms-mailing skill ([#39](https://github.com/AntelopeJS/dms-mailing/pull/39))
- Streamline agent guidance ([#45](https://github.com/AntelopeJS/dms-mailing/pull/45))
- Establish the mailing consumer reference ([#46](https://github.com/AntelopeJS/dms-mailing/pull/46))
- Make dense guide sections easier to scan ([#47](https://github.com/AntelopeJS/dms-mailing/pull/47))

### 🏡 Chore

- **release:** Prepare mailing interface 0.7.1 ([#49](https://github.com/AntelopeJS/dms-mailing/pull/49))
- **release:** @antelopejs/interface-dms-mailing v0.7.1 ([2ac536a](https://github.com/AntelopeJS/dms-mailing/commit/2ac536a))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.5.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.4.1...v0.5.0)

### 🚀 Enhancements

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#41](https://github.com/AntelopeJS/dms-mailing/pull/41))

#### ⚠️ Breaking Changes

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#41](https://github.com/AntelopeJS/dms-mailing/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.4.0...v0.4.1)

### 🤖 CI

- Speed up pipeline ([#38](https://github.com/AntelopeJS/dms-mailing/pull/38))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.3.4...v0.4.0)

### 🚀 Enhancements

- ⚠️  Port the mailing module to DMS v2 and its redesign ([#34](https://github.com/AntelopeJS/dms-mailing/pull/34))

### 🩹 Fixes

- **frontend-vue:** Send null to clear a template category ([#32](https://github.com/AntelopeJS/dms-mailing/pull/32))

### 💅 Refactors

- Namespace the gallery display id as mailing:gallery ([#33](https://github.com/AntelopeJS/dms-mailing/pull/33))

### 📦 Build

- **deps:** Require @antelopejs/interface-dms-mailing 0.7 ([#36](https://github.com/AntelopeJS/dms-mailing/pull/36))

### 🏡 Chore

- **playground:** Open module source ranges ([#30](https://github.com/AntelopeJS/dms-mailing/pull/30))
- **release:** @antelopejs/interface-dms-mailing v0.7.0 ([a630cb8](https://github.com/AntelopeJS/dms-mailing/commit/a630cb8))

#### ⚠️ Breaking Changes

- ⚠️  Port the mailing module to DMS v2 and its redesign ([#34](https://github.com/AntelopeJS/dms-mailing/pull/34))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.4

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.3.3...v0.3.4)

### 🚀 Enhancements

- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#27](https://github.com/AntelopeJS/dms-mailing/pull/27))

### ❤️ Contributors

- Alessandro Aloisio

## v0.3.3

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.3.2...v0.3.3)

### 🩹 Fixes

- **deps:** Cap @antelopejs/interface-dms-mailing below the next minor and check interface ranges ([#29](https://github.com/AntelopeJS/dms-mailing/pull/29))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.2

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.3.1...v0.3.2)

### 🩹 Fixes

- **deps:** Relax @antelopejs/interface-database to >=0.1.7 <1.0.0 ([#26](https://github.com/AntelopeJS/dms-mailing/pull/26))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.3.0...v0.3.1)

### 🩹 Fixes

- **db:** Stop the mailing webhook from creating settings and key the settings row per tenant ([#24](https://github.com/AntelopeJS/dms-mailing/pull/24))

### 🏡 Chore

- Remove agent work reports ([#19](https://github.com/AntelopeJS/dms-mailing/pull/19))
- **release:** @antelopejs/interface-dms-mailing v0.5.0 ([#20](https://github.com/AntelopeJS/dms-mailing/pull/20))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.2.3...v0.3.0)

### 🩹 Fixes

- **playground:** Load dms before mailing ([#5](https://github.com/AntelopeJS/dms-mailing/pull/5))
- Route playground through public gateway ([#6](https://github.com/AntelopeJS/dms-mailing/pull/6))
- **playground:** Declare the interface packages the playground imports ([#9](https://github.com/AntelopeJS/dms-mailing/pull/9))

### 💅 Refactors

- **build:** Merge tsconfig.build.json into tsconfig.json ([#12](https://github.com/AntelopeJS/dms-mailing/pull/12))
- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#15](https://github.com/AntelopeJS/dms-mailing/pull/15))
- **permissions:** ⚠️  Use the DMS default page permissions ([#17](https://github.com/AntelopeJS/dms-mailing/pull/17))

### 🏡 Chore

- Add orb playground setup ([#2](https://github.com/AntelopeJS/dms-mailing/pull/2))
- **playground:** Use dms frontend 0.2.1 ([#3](https://github.com/AntelopeJS/dms-mailing/pull/3))
- **agents:** Install Node 24 in setup script ([#7](https://github.com/AntelopeJS/dms-mailing/pull/7))
- Remove the generated frontend check ([#8](https://github.com/AntelopeJS/dms-mailing/pull/8))
- **playground:** Derive the api origin from config variables ([#10](https://github.com/AntelopeJS/dms-mailing/pull/10))
- **release:** @antelopejs/interface-dms-mailing v0.4.0 ([a35a2bf](https://github.com/AntelopeJS/dms-mailing/commit/a35a2bf))

### 🤖 CI

- **release:** Skip the npm auth pre-flight for trusted publishing ([#1](https://github.com/AntelopeJS/dms-mailing/pull/1))
- **release:** Release next from a dedicated branch and restore requireCommits ([#13](https://github.com/AntelopeJS/dms-mailing/pull/13))
- **release:** Reference the shared release workflows through v1 ([#14](https://github.com/AntelopeJS/dms-mailing/pull/14))

#### ⚠️ Breaking Changes

- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#15](https://github.com/AntelopeJS/dms-mailing/pull/15))
- **permissions:** ⚠️  Use the DMS default page permissions ([#17](https://github.com/AntelopeJS/dms-mailing/pull/17))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.3

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.3.0...v0.2.3)

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.2.1...v0.2.2)

### 💅 Refactors

- **frontend:** Import the SDK through #dms/frontend-module ([#14](https://github.com/AntelopeJS/dms-mailing/pull/14))
- **frontend:** Import the SDK through #dms/frontend-module ([#15](https://github.com/AntelopeJS/dms-mailing/pull/15))

### 🏡 Chore

- Require @antelopejs/core 1.7 ([#13](https://github.com/AntelopeJS/dms-mailing/pull/13))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.2.0...v0.2.1)

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.1.1...v0.2.0)

### 🩹 Fixes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#10](https://github.com/AntelopeJS/dms-mailing/pull/10))

#### ⚠️ Breaking Changes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#10](https://github.com/AntelopeJS/dms-mailing/pull/10))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.2.0...v0.1.1)

### 🏡 Chore

- **release:** Build the interface package before releasing the runtime ([#9](https://github.com/AntelopeJS/dms-mailing/pull/9))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.0


### 🚀 Enhancements

- Scaffold the cms-mailing module ([371b252](https://github.com/AntelopeJS/dms-mailing/commit/371b252))
- **nuxt-layer:** Mailing pages, gallery display and detail drawers ([c284bc2](https://github.com/AntelopeJS/dms-mailing/commit/c284bc2))
- Mailing backend — data, engine, public interface and CMS pages ([d76fd5b](https://github.com/AntelopeJS/dms-mailing/commit/d76fd5b))
- **nuxt-layer:** Block editor and e-mail template ([03b6199](https://github.com/AntelopeJS/dms-mailing/commit/03b6199))
- Mailing integrations — automation, notifications, retention and realtime ([2b69a28](https://github.com/AntelopeJS/dms-mailing/commit/2b69a28))
- **mailing:** Locale badges on the cards, and KPIs that tell the truth ([565b1bb](https://github.com/AntelopeJS/dms-mailing/commit/565b1bb))
- **mailing:** Drop template versions, and a UX pass on the second review ([7d9d021](https://github.com/AntelopeJS/dms-mailing/commit/7d9d021))
- **mailing:** Editable categories, no invented presets, template settings in the editor ([248dbec](https://github.com/AntelopeJS/dms-mailing/commit/248dbec))
- Migrate Mailing frontend to Inertia ([#4](https://github.com/AntelopeJS/dms-mailing/pull/4))

### 🩹 Fixes

- Align the antelope modules on their current releases ([9a80590](https://github.com/AntelopeJS/dms-mailing/commit/9a80590))
- **mailing:** Wire the row actions, close the i18n gap and fix five layer bugs ([607bcf9](https://github.com/AntelopeJS/dms-mailing/commit/607bcf9))
- **mailing:** Apply the nine code-review findings ([6e7ee8b](https://github.com/AntelopeJS/dms-mailing/commit/6e7ee8b))
- **nuxt-layer:** Open the editor from the template drawer ([a283e5d](https://github.com/AntelopeJS/dms-mailing/commit/a283e5d))
- **ui:** Reopen the template selects and steady the detail drawer ([f0e80a5](https://github.com/AntelopeJS/dms-mailing/commit/f0e80a5))
- **metrics:** Count the current day and say what the provider cannot track ([b08da53](https://github.com/AntelopeJS/dms-mailing/commit/b08da53))
- **security:** Enforce the send permission and fail the webhook closed ([e53f239](https://github.com/AntelopeJS/dms-mailing/commit/e53f239))
- **editor:** Stop calling a variable unused the moment it is wired up ([fe1a391](https://github.com/AntelopeJS/dms-mailing/commit/fe1a391))
- Stop a hidden block blocking a send, and a failed save passing silently ([19b26c8](https://github.com/AntelopeJS/dms-mailing/commit/19b26c8))
- **retention:** Replace generic job lock with replay-safe retirement ([#1](https://github.com/AntelopeJS/dms-mailing/pull/1))
- **release:** Publish GitHub releases automatically ([#3](https://github.com/AntelopeJS/dms-mailing/pull/3))
- **release:** Install subproject dependencies ([#5](https://github.com/AntelopeJS/dms-mailing/pull/5))

### 💅 Refactors

- ⚠️  Drop segments and wire the automation module ([19c3553](https://github.com/AntelopeJS/dms-mailing/commit/19c3553))
- **config:** Declare the shared module versions once ([4d28704](https://github.com/AntelopeJS/dms-mailing/commit/4d28704))

### 📖 Documentation

- Describe the real module and keep the phase reports ([e1e907f](https://github.com/AntelopeJS/dms-mailing/commit/e1e907f))
- Keep the editor page investigation report ([2e64a14](https://github.com/AntelopeJS/dms-mailing/commit/2e64a14))
- Keep the locale badges and KPI audience report ([877f20b](https://github.com/AntelopeJS/dms-mailing/commit/877f20b))
- Keep the UX pass report ([6ee82c9](https://github.com/AntelopeJS/dms-mailing/commit/6ee82c9))
- Keep the categories and presets report ([b9d505e](https://github.com/AntelopeJS/dms-mailing/commit/b9d505e))

### 🏡 Chore

- Standardize CMS repository ([#2](https://github.com/AntelopeJS/dms-mailing/pull/2))

#### ⚠️ Breaking Changes

- ⚠️  Drop segments and wire the automation module ([19c3553](https://github.com/AntelopeJS/dms-mailing/commit/19c3553))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- MrSociety404 <fabrice@altab.be>

