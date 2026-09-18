import { RegisterModule } from "@antelopejs/interface-dms/page";

export const mailingModule = RegisterModule({
  id: "mailing",
  title: "$dms_mailing.title",
  description: "$dms_mailing.description",
  icon: "i-ph-envelope-simple",
  landingPage: "overview",
});
