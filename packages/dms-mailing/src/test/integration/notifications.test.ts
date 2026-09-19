import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const NOTIFICATIONS_BASE_PATH = "/settings/user/notifications";
const MAILING_PROVIDER_PATH = "/api/mailing/provider";
const MAILING_SETTINGS_PATH = "/api/mailing/settings";
const MAILING_CATEGORIES_PATH = "/api/mailing/templates/categories";

describe("[integration] notification routes", () => {
  it("serves DMS notifications and mailing provider routes", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const notificationResponses = await Promise.all([
      client.get(`${NOTIFICATIONS_BASE_PATH}/unread-count`),
      client.get(`${NOTIFICATIONS_BASE_PATH}/unread-preview`),
      client.get(`${NOTIFICATIONS_BASE_PATH}/categories`),
    ]);
    const mailingResponses = await Promise.all([
      client.get(MAILING_PROVIDER_PATH),
      client.get(MAILING_SETTINGS_PATH),
      client.get(MAILING_CATEGORIES_PATH),
    ]);

    for (const response of [...notificationResponses, ...mailingResponses]) {
      expect(response.status).to.equal(HTTP_OK);
    }
  });
});
