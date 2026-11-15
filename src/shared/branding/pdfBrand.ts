import logo from './logoData';

export function pdfBrandFooter(currentPage: number, pageCount: number, horizontalMargin = 30) {
  return {
    columns: [
      { image: logo, width: 72 },
      { text: 'Generado con Agromax', fontSize: 7, color: '#64748b', margin: [8, 6, 0, 0] },
      { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 7, color: '#64748b', margin: [0, 6, 0, 0] },
    ],
    margin: [horizontalMargin, 4, horizontalMargin, 0],
  };
}
