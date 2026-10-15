import qrcode from "qrcode-generator";

/**
 * A QR code as a square grid of dark (`true`) and light modules, for the
 * pay-by-UPI code on an invoice. The paper draws it as SVG rectangles and the
 * PDF as vector squares, so both stay sharp and neither needs an image.
 *
 * Error correction level M (≈15%): a printed or photographed code still reads
 * with a smudge, and a `upi://pay` link stays a small, easy-to-scan version.
 * The text must be ASCII — a UPI link is (`upiPayLink` percent-encodes
 * everything else).
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/**
 * The dark modules as one SVG path (`M x y h1 v1 h-1 z` per module), in module
 * units — a viewBox of `0 0 size size` draws it. One path keeps the DOM small.
 */
export function qrPath(matrix: boolean[][]): string {
  const parts: string[] = [];
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return parts.join("");
}
