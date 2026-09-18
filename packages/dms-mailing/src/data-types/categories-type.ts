import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  DataType,
  RegisterDataType,
} from "@antelopejs/interface-dms/base/data-types";
import { TEMPLATE_CATEGORIES_TYPE_ID } from "../constants";
import { CATEGORIES_SCHEMA } from "../services/categories";

/**
 * The tenant's template categories as a settings field — a repeatable list of
 * {id, label, icon} that no built-in DataType models: the input is ours, and
 * the validation accepts the array or the JSON string a form field stores.
 */
@RegisterDataType(TEMPLATE_CATEGORIES_TYPE_ID)
export class TemplateCategoriesType extends DataType {
  constructor(public readonly options: Record<string, unknown> = {}) {
    super([], undefined, options);
  }

  protected defaultInputComponent() {
    return CustomComponent("DmsMailingCategoriesInput")
      .options(this.options)
      .serializeSync();
  }

  getValidation() {
    return CATEGORIES_SCHEMA;
  }
}
