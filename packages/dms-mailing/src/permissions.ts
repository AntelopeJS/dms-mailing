import {
  type Permission,
  RegisterPermission,
} from "@antelopejs/interface-dms/permissions";
import {
  MAILING_ACCESS_PERMISSION,
  MAILING_SEND_PERMISSION,
  MAILING_SETTINGS_MANAGE_PERMISSION,
  MAILING_TEMPLATES_MANAGE_PERMISSION,
} from "./constants";

const MAILING_PERMISSIONS: Permission[] = [
  {
    id: MAILING_ACCESS_PERMISSION,
    title: "Access mailing",
    icon: "i-ph-envelope-simple",
    description: "See templates, sends and mailing metrics",
  },
  {
    id: MAILING_TEMPLATES_MANAGE_PERMISSION,
    title: "Manage e-mail templates",
    icon: "i-ph-note-pencil",
    description: "Create, edit, publish, duplicate and archive templates",
    dependencies: [MAILING_ACCESS_PERMISSION],
  },
  {
    id: MAILING_SEND_PERMISSION,
    title: "Send e-mails and tests",
    icon: "i-ph-paper-plane-tilt",
    description: "Trigger test sends and replay a previous send",
    dependencies: [MAILING_ACCESS_PERMISSION],
  },
  {
    id: MAILING_SETTINGS_MANAGE_PERMISSION,
    title: "Manage mailing settings",
    icon: "i-ph-sliders",
    description: "Edit sender identity, retention and template categories",
    dependencies: [MAILING_ACCESS_PERMISSION],
  },
];

for (const permission of MAILING_PERMISSIONS) {
  RegisterPermission(permission.id, permission);
}
