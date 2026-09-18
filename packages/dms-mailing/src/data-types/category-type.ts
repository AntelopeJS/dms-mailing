import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  DataType,
  RegisterDataType,
} from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataCompareTypes } from "@antelopejs/interface-dms/base/data-types/compare-types";
import { z } from "zod";
import { TEMPLATE_CATEGORY_TYPE_ID } from "../constants";

/**
 * A template's category. Deliberately **not** a `SelectType`: that builds its
 * validation from a `z.enum` over build-time items, so every category the user
 * adds in Settings afterwards would be rejected on save. The authority is the
 * tenant's settings, so the value is validated as a plain optional string and
 * the input fetches the current list.
 *
 * `IsEmpty` / `IsNotEmpty` are what the table filter offers as
 * "uncategorised".
 */
@RegisterDataType(TEMPLATE_CATEGORY_TYPE_ID)
export class TemplateCategoryType extends DataType {
  constructor(public readonly options: Record<string, unknown> = {}) {
    super(
      [
        DefaultDataCompareTypes.Is,
        DefaultDataCompareTypes.IsNot,
        DefaultDataCompareTypes.IsEmpty,
        DefaultDataCompareTypes.IsNotEmpty,
      ],
      DefaultDataCompareTypes.Is,
      options,
    );
  }

  protected defaultInputComponent() {
    return CustomComponent("DmsMailingCategoryInput")
      .options(this.options)
      .serializeSync();
  }

  getValidation() {
    return z.string().optional();
  }
}
