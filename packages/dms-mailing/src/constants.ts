export const MODULE_ID = "mailing";
export const API_BASE_PATH = "/api/mailing";
export const TABLES_BASE_PATH = `${API_BASE_PATH}/tables`;
export const FRONTEND_MODULE_NAME = "@antelopejs/dms-mailing-frontend-vue";
export const EMAIL_TEMPLATE_NAME = "EmailMailingTemplate";

export const MAILING_ACCESS_PERMISSION = "mailing.access";
export const MAILING_TEMPLATES_MANAGE_PERMISSION = "mailing.templates.manage";
export const MAILING_SEND_PERMISSION = "mailing.send";
export const MAILING_SETTINGS_MANAGE_PERMISSION = "mailing.settings.manage";

export const OVERVIEW_PERIOD_SCOPE = "mailing-overview";
export const SENDS_PERIOD_SCOPE = "mailing-sends";

export const MAILING_SENDS_TOPIC = "mailing:sends";

export const GALLERY_DISPLAY_ID = "gallery";
export const TEMPLATE_CATEGORIES_TYPE_ID = "mailing_template_categories";
export const TEMPLATE_CATEGORY_TYPE_ID = "mailing_template_category";

export const DEFAULT_FALLBACK_LOCALE = "en";
export const DEFAULT_LOG_RETENTION_DAYS = 90;
export const MAX_SLUG_LENGTH = 64;
export const MAX_NAME_LENGTH = 120;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const HTTP_BAD_REQUEST = 400;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_UNPROCESSABLE = 422;

export const LOCALE_LIST_SEPARATOR = ",";

export const SYSTEM_VARIABLE_PATHS = ["unsubscribeUrl", "preferencesUrl"];

/**
 * Ceiling on a metrics window. `from`/`to` are plain query parameters, and the
 * daily series allocates one bucket per day, so an unbounded window lets a
 * caller size the response by hand.
 */
export const MAX_WINDOW_DAYS = 400;
