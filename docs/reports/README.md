# Implementation reports

One report per phase of the v1 build. Each records where the CMS contradicted
the assumptions the work started from, and what was done instead — the CMS is
authoritative, so these are the load-bearing notes for anyone changing this
module later.

They are kept because several findings are not visible in the code: a column
without an explicit `@Access` is silently invisible, `TableViewRoutes.New`
returns `string[]`, a row action's `rowData` carries only the listable columns,
a trigger handle must be an opaque string to survive the module boundary, and a
backend display string needs `processI18n()` rather than `t()`.
