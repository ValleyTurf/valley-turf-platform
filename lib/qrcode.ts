import QRCode from "qrcode";
import sharp from "sharp";
import { readFile } from "fs/promises";
import path from "path";

const LOGO_PATH = path.join(process.cwd(), "public/branding/logo.svg");
const LOGO_RASTER_SIZE = 240;

let cachedLogoBuffer: Promise<Buffer | null> | null = null;

// The brand logo is a large vector file, so it's rasterized once per server
// instance (not once per QR code) and reused for every campaign card.
function getLogoBuffer(): Promise<Buffer | null> {
  if (!cachedLogoBuffer) {
    cachedLogoBuffer = (async () => {
      try {
        const svg = await readFile(LOGO_PATH);

        return await sharp(svg, { density: 300 })
          .resize(LOGO_RASTER_SIZE, LOGO_RASTER_SIZE, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 0 },
          })
          .png()
          .toBuffer();
      } catch (error) {
        console.error("Could not load brand logo for QR codes:", error);
        return null;
      }
    })();
  }

  return cachedLogoBuffer;
}

// High error correction (H) tolerates up to ~30% obstruction, so a logo
// covering roughly a quarter of the code (with a white backing square for
// contrast) stays comfortably scannable.
export async function generateBrandedQrCode(
  url: string,
  size = 640
): Promise<string> {
  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: size,
    type: "png",
  });

  const logoBuffer = await getLogoBuffer();

  if (!logoBuffer) {
    return `data:image/png;base64,${qrBuffer.toString("base64")}`;
  }

  const logoTargetSize = Math.round(size * 0.22);
  const pad = Math.round(logoTargetSize * 0.14);

  const [resizedLogo, backing] = await Promise.all([
    sharp(logoBuffer)
      .resize(logoTargetSize, logoTargetSize, { fit: "contain" })
      .toBuffer(),
    sharp({
      create: {
        width: logoTargetSize + pad * 2,
        height: logoTargetSize + pad * 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
  ]);

  const finalBuffer = await sharp(qrBuffer)
    .composite([
      { input: backing, gravity: "center" },
      { input: resizedLogo, gravity: "center" },
    ])
    .png()
    .toBuffer();

  return `data:image/png;base64,${finalBuffer.toString("base64")}`;
}
