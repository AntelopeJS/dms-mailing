# Coverage: package

| Behaviour (page, section) | Journey | Check |
|---|---|---|
| The module loads `dist/index.js` and its types (package.json `main`, `types`, `exports`) | the-module-tarball-holds-what-its-manifest-names | `<target> is packed` per target |
| The module implements `@antelopejs/interface-dms-mailing` (README, Slugs/Compatibility) | the-module-tarball-holds-what-its-manifest-names | it implements interface-dms-mailing |
| The module ships the `dms-mailing` agent skill (README, Documentation) | the-module-tarball-holds-what-its-manifest-names | the skill ships |
| The dashboard layer ships with English and French locales (Installation) | the-module-tarball-holds-what-its-manifest-names | the dashboard layer ships with its locales |
| The e-mail template component ships (Introduction, How it fits together) | the-module-tarball-holds-what-its-manifest-names | the e-mail template component ships |
| Test files are not packed | the-module-tarball-holds-what-its-manifest-names | test files are not packed |
| The package is public | the-module-tarball-holds-what-its-manifest-names | public access |
| The interface exports SendTemplate, RecordEmailEvent, DeclareTemplate, DeclareTemplateCategory, DeclareSender, ImportSends and their types (Extending) | the-interface-tarball-exports-the-contract | exports `<name>` per name |
| The README compatibility table matches the module's dependency ranges | ranges-match-the-compatibility-table | `<name>` is in the table with the same range |
| The interface range stops below the next minor (AGENTS Versions) | ranges-match-the-compatibility-table | the range stops below the next minor |
| The renderer range is one minor (Installation, Requirements) | ranges-match-the-compatibility-table | the dashboard layer pins one renderer minor |
| Releasing the interface first, then the module (release workflows) | Not driven | CI workflows cannot run here |
| `ajs dms` refuses a renderer outside the range | Not driven | needs a second renderer build |
