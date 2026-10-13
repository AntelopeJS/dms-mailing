# Changelog


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

