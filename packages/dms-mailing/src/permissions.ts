import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { RegisterPermission } from "@antelopejs/interface-dms/permissions";
import { MAILING_SEND_PERMISSION } from "./constants";
import { SendsPageController } from "./pages/sends";

// `@RegisterPage` publishes the page synchronously when the class is defined,
// so the sends page's default permission id is known once it is imported.
const sendsPagePermissionId = GetPermissionId(SendsPageController);

RegisterPermission(MAILING_SEND_PERMISSION, {
  id: MAILING_SEND_PERMISSION,
  title: "Send e-mails and tests",
  icon: "i-ph-paper-plane-tilt",
  description: "Trigger test sends and replay a previous send",
  dependencies: sendsPagePermissionId ? [sendsPagePermissionId] : [],
});
