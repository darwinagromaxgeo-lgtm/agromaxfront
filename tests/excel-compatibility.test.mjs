import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

// Match the browser's ArrayBuffer input and the Excel exports used by the app.
for (const format of ['xlsx', 'xls']) {
  test(`${format} export/import preserves Spanish names, zeroes and decimals`, () => {
    const rows = [{ Producto: 'Maíz orgánico', Cantidad: 0, Precio: 12.75, IGV: 0.18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Productos');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: format });
    const restored = XLSX.read(bytes, { type: 'array' });
    assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.Productos), rows);
  });
}
