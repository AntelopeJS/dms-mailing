/** The same table with no prototype, so a lookup answers only the keys it declares and never `constructor` or `toString`. */
export function nullProto<Table extends object>(table: Table): Table {
  Object.setPrototypeOf(table, null);
  return table;
}
