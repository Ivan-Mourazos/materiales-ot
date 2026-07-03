import ExcelJS from 'exceljs';

export async function buildReservationWorkbook(reservation) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'materiales-ot';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('RPS');
  sheet.properties.showGridLines = true;

  sheet.columns = [
    { header: 'OF', key: 'of', width: 12 },
    { header: 'ARTICULO', key: 'article', width: 18 },
    { header: 'CANTIDAD', key: 'quantity', width: 12 }
  ];

  for (const row of buildFinalRows(reservation.ofs)) {
    sheet.addRow({
      of: numericOf(row.of),
      article: row.code,
      quantity: row.quantity
    });
  }

  sheet.getColumn(1).numFmt = '0';
  // 'General' en vez de un formato personalizado con '#': Excel muestra el
  // separador decimal aunque no queden cifras que mostrar detrás (p. ej. "25,").
  sheet.getColumn(3).numFmt = 'General';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildOfWorkbook(ofBlock) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'materiales-ot';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('RPS');
  sheet.properties.showGridLines = true;
  sheet.columns = [
    { header: 'OF', key: 'of', width: 12 },
    { header: 'ARTICULO', key: 'article', width: 18 },
    { header: 'CANTIDAD', key: 'quantity', width: 12 }
  ];

  for (const row of buildFinalRows([ofBlock])) {
    sheet.addRow({
      of: numericOf(row.of),
      article: row.code,
      quantity: row.quantity
    });
  }

  sheet.getColumn(1).numFmt = '0';
  // 'General' en vez de un formato personalizado con '#': Excel muestra el
  // separador decimal aunque no queden cifras que mostrar detrás (p. ej. "25,").
  sheet.getColumn(3).numFmt = 'General';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildOrderArchiveWorkbook(reservation) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'materiales-ot';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('MATERIALES');
  sheet.properties.showGridLines = true;
  sheet.columns = [
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 44 },
    { width: 12 }
  ];

  sheet.getCell('A1').value = 'N PEDIDO';
  sheet.getCell('B1').value = reservation.orderCode || '';
  sheet.getCell('A2').value = 'N OFS';
  sheet.getCell('B2').value = reservation.ofs.length;
  sheet.getCell('A1').font = { bold: true };
  sheet.getCell('A2').font = { bold: true };
  applyBorder(sheet, 1, 1, 2, 2);

  let rowIndex = 4;
  for (const ofBlock of reservation.ofs) {
    sheet.getCell(rowIndex, 1).value = 'OF';
    sheet.getCell(rowIndex, 2).value = numericOf(ofBlock.of);
    sheet.getRow(rowIndex).font = { bold: true };
    sheet.getRow(rowIndex).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC000' }
    };
    applyBorder(sheet, rowIndex, 1, rowIndex, 5);

    rowIndex += 1;
    sheet.getRow(rowIndex).values = [null, 'TIPO', 'ARTICULO', 'DESCRIPCION', 'CANTIDAD'];
    sheet.getRow(rowIndex).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(rowIndex).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF808080' }
    };
    applyBorder(sheet, rowIndex, 1, rowIndex, 5);

    for (const line of ofBlock.materials) {
      rowIndex += 1;
      sheet.getRow(rowIndex).values = [
        null,
        line.kind || '',
        line.code,
        line.description || '',
        line.quantity
      ];
      applyBorder(sheet, rowIndex, 1, rowIndex, 5);
    }

    rowIndex += 2;
  }

  sheet.getColumn(2).numFmt = '0';
  sheet.getColumn(5).numFmt = 'General';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildFinalRows(ofs) {
  const grouped = new Map();

  for (const ofBlock of ofs) {
    for (const line of ofBlock.materials) {
      const key = `${ofBlock.of}||${line.code}`;
      const current = grouped.get(key) || {
        of: ofBlock.of,
        code: line.code,
        quantity: 0
      };

      current.quantity = roundQuantity(current.quantity + line.quantity);
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.values());
}

function numericOf(value) {
  const numeric = Number(String(value).trim());
  return Number.isFinite(numeric) ? numeric : String(value).trim();
}

function roundQuantity(value) {
  return Math.round(value * 1000000) / 1000000;
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
  };
}

function applyBorder(sheet, startRow, startCol, endRow, endCol) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      sheet.getCell(row, col).border = thinBorder();
    }
  }
}
