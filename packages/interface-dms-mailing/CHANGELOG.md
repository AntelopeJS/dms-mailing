# Changelog


## v0.9.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.8.0...v0.9.0)

### 🚀 Enhancements

- **frontend:** The frontend registration as a pure function, declared as dmsFrontend ([#60](https://github.com/AntelopeJS/dms-mailing/pull/60))
- Declare the sender, localized template names and category labels, locale-formatted amounts and dates ([#53](https://github.com/AntelopeJS/dms-mailing/pull/53))

### 🩹 Fixes

- **frontend:** Run on @antelopejs/dms-frontend 0.7 ([#58](https://github.com/AntelopeJS/dms-mailing/pull/58))
- **templates:** Drop the category quick filter dms#370 refuses ([#59](https://github.com/AntelopeJS/dms-mailing/pull/59), [#370](https://github.com/AntelopeJS/dms-mailing/issues/370))

### 📖 Documentation

- **mailing:** Align compatibility guidance for release 0.6 ([db420f0](https://github.com/AntelopeJS/dms-mailing/commit/db420f0))
- Clarify learning paths and illustrate real outcomes ([#54](https://github.com/AntelopeJS/dms-mailing/pull/54))

### 📦 Build

- **mailing:** Align runtime with published interface 0.8 ([b7264a3](https://github.com/AntelopeJS/dms-mailing/commit/b7264a3))

### 🏡 Chore

- **release:** @antelopejs/dms-mailing v0.6.0 ([d016cab](https://github.com/AntelopeJS/dms-mailing/commit/d016cab))
- **release:** @antelopejs/dms-mailing v0.6.1 ([2a52f9e](https://github.com/AntelopeJS/dms-mailing/commit/2a52f9e))

### ✅ Tests

- Give the DMS in the test stack the render secret dms 0.10 requires ([#61](https://github.com/AntelopeJS/dms-mailing/pull/61))

### ❤️ Contributors

- Maxime Westhoven <maxime@altab.be>
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.8.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.7.1...v0.8.0)

### 🚀 Enhancements

- Declare templates and categories from code, import past sends ([#51](https://github.com/AntelopeJS/dms-mailing/pull/51))

### 📦 Build

- Install frontend development dependencies from the root ([#48](https://github.com/AntelopeJS/dms-mailing/pull/48))

### 🏡 Chore

- **release:** @antelopejs/dms-mailing v0.5.1 ([61d1dc8](https://github.com/AntelopeJS/dms-mailing/commit/61d1dc8))

### ❤️ Contributors

- Maxime Westhoven ([@mwesto](http://github.com/mwesto))
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.1

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.7.0...v0.7.1)

### 🚀 Enhancements

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#41](https://github.com/AntelopeJS/dms-mailing/pull/41))

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

### 📦 Build

- **deps:** Require @antelopejs/interface-dms-mailing 0.7 ([#36](https://github.com/AntelopeJS/dms-mailing/pull/36))

### 🏡 Chore

- **release:** @antelopejs/dms-mailing v0.4.0 ([bde97fb](https://github.com/AntelopeJS/dms-mailing/commit/bde97fb))
- **release:** @antelopejs/dms-mailing v0.4.1 ([60bc570](https://github.com/AntelopeJS/dms-mailing/commit/60bc570))
- **release:** @antelopejs/dms-mailing v0.5.0 ([5701b22](https://github.com/AntelopeJS/dms-mailing/commit/5701b22))
- **release:** Prepare mailing interface 0.7.1 ([#49](https://github.com/AntelopeJS/dms-mailing/pull/49))

### 🤖 CI

- Speed up pipeline ([#38](https://github.com/AntelopeJS/dms-mailing/pull/38))

#### ⚠️ Breaking Changes

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#41](https://github.com/AntelopeJS/dms-mailing/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio

## v0.7.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.5.0...v0.7.0)

### 🚀 Enhancements

- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#27](https://github.com/AntelopeJS/dms-mailing/pull/27))
- ⚠️  Port the mailing module to DMS v2 and its redesign ([#34](https://github.com/AntelopeJS/dms-mailing/pull/34))

### 🩹 Fixes

- **db:** Stop the mailing webhook from creating settings and key the settings row per tenant ([#24](https://github.com/AntelopeJS/dms-mailing/pull/24))
- **deps:** Relax @antelopejs/interface-database to >=0.1.7 <1.0.0 ([#26](https://github.com/AntelopeJS/dms-mailing/pull/26))
- **deps:** Cap @antelopejs/interface-dms-mailing below the next minor and check interface ranges ([#29](https://github.com/AntelopeJS/dms-mailing/pull/29))
- **frontend-vue:** Send null to clear a template category ([#32](https://github.com/AntelopeJS/dms-mailing/pull/32))

### 💅 Refactors

- Namespace the gallery display id as mailing:gallery ([#33](https://github.com/AntelopeJS/dms-mailing/pull/33))

### 🏡 Chore

- **release:** @antelopejs/dms-mailing v0.3.1 ([abc7c03](https://github.com/AntelopeJS/dms-mailing/commit/abc7c03))
- **release:** @antelopejs/dms-mailing v0.3.2 ([f374a31](https://github.com/AntelopeJS/dms-mailing/commit/f374a31))
- **release:** @antelopejs/dms-mailing v0.3.3 ([2f9d6cf](https://github.com/AntelopeJS/dms-mailing/commit/2f9d6cf))
- **release:** @antelopejs/dms-mailing v0.3.4 ([2b0280b](https://github.com/AntelopeJS/dms-mailing/commit/2b0280b))
- **playground:** Open module source ranges ([#30](https://github.com/AntelopeJS/dms-mailing/pull/30))

#### ⚠️ Breaking Changes

- ⚠️  Port the mailing module to DMS v2 and its redesign ([#34](https://github.com/AntelopeJS/dms-mailing/pull/34))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.5.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.4.0...v0.5.0)

### 💅 Refactors

- **permissions:** ⚠️  Use the DMS default page permissions ([#17](https://github.com/AntelopeJS/dms-mailing/pull/17))

### 🏡 Chore

- **deps:** Update @antelopejs dependencies to latest ([#16](https://github.com/AntelopeJS/dms-mailing/pull/16))
- **release:** @antelopejs/dms-mailing v0.3.0 ([231430b](https://github.com/AntelopeJS/dms-mailing/commit/231430b))

#### ⚠️ Breaking Changes

- **permissions:** ⚠️  Use the DMS default page permissions ([#17](https://github.com/AntelopeJS/dms-mailing/pull/17))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/interface-v0.3.0...v0.4.0)

### 🩹 Fixes

- **playground:** Load dms before mailing ([#5](https://github.com/AntelopeJS/dms-mailing/pull/5))
- Route playground through public gateway ([#6](https://github.com/AntelopeJS/dms-mailing/pull/6))
- **playground:** Declare the interface packages the playground imports ([#9](https://github.com/AntelopeJS/dms-mailing/pull/9))

### 💅 Refactors

- **build:** Merge tsconfig.build.json into tsconfig.json ([#12](https://github.com/AntelopeJS/dms-mailing/pull/12))
- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#15](https://github.com/AntelopeJS/dms-mailing/pull/15))

### 🏡 Chore

- **release:** @antelopejs/dms-mailing v0.2.3 ([0135868](https://github.com/AntelopeJS/dms-mailing/commit/0135868))
- Add orb playground setup ([#2](https://github.com/AntelopeJS/dms-mailing/pull/2))
- **playground:** Use dms frontend 0.2.1 ([#3](https://github.com/AntelopeJS/dms-mailing/pull/3))
- **agents:** Install Node 24 in setup script ([#7](https://github.com/AntelopeJS/dms-mailing/pull/7))
- Remove the generated frontend check ([#8](https://github.com/AntelopeJS/dms-mailing/pull/8))
- **playground:** Derive the api origin from config variables ([#10](https://github.com/AntelopeJS/dms-mailing/pull/10))

### 🤖 CI

- **release:** Skip the npm auth pre-flight for trusted publishing ([#1](https://github.com/AntelopeJS/dms-mailing/pull/1))
- **release:** Release next from a dedicated branch and restore requireCommits ([#13](https://github.com/AntelopeJS/dms-mailing/pull/13))
- **release:** Reference the shared release workflows through v1 ([#14](https://github.com/AntelopeJS/dms-mailing/pull/14))

#### ⚠️ Breaking Changes

- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#15](https://github.com/AntelopeJS/dms-mailing/pull/15))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.0


### 💅 Refactors

- ⚠️  Publish under the public @antelopejs scope ([a86c6ef](https://github.com/AntelopeJS/dms-mailing/commit/a86c6ef))

#### ⚠️ Breaking Changes

- ⚠️  Publish under the public @antelopejs scope ([a86c6ef](https://github.com/AntelopeJS/dms-mailing/commit/a86c6ef))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms-mailing/compare/v0.1.0...v0.2.0)

### 💅 Refactors

- ⚠️  Publish dms-mailing from a two-package workspace ([#6](https://github.com/AntelopeJS/dms-mailing/pull/6))
- **sends:** ⚠️  Declare the revision column and drop legacy-row tolerance ([#7](https://github.com/AntelopeJS/dms-mailing/pull/7))

### 🏡 Chore

- Regenerate lockfiles against the published DMS packages ([#8](https://github.com/AntelopeJS/dms-mailing/pull/8))

#### ⚠️ Breaking Changes

- ⚠️  Publish dms-mailing from a two-package workspace ([#6](https://github.com/AntelopeJS/dms-mailing/pull/6))
- **sends:** ⚠️  Declare the revision column and drop legacy-row tolerance ([#7](https://github.com/AntelopeJS/dms-mailing/pull/7))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

