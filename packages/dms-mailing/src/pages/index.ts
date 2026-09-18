// `./module` is imported first so RegisterModule fires before any
// @RegisterPage decorator runs: pages look their module up synchronously
// when the decorator is invoked at import time.
import "./module";

export * from "./module";
export * from "./overview";
export * from "./editor";
export * from "./sends";
export * from "./settings";
export * from "./templates";
