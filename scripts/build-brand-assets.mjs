import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = 'public/branding';
await mkdir(directory, { recursive: true });
const source = await sharp(`${directory}/artmaster-symbol-source.png`).trim().png().toBuffer();
await sharp(source).resize({ width: 1024, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(`${directory}/artmaster-symbol.png`);
await sharp(source).resize({ width: 256 }).webp({ lossless: true }).toFile(`${directory}/artmaster-symbol.webp`);
const sizes = [32, 48, 180, 192, 512];
for (const size of sizes) {
  const symbol = await sharp(source).resize({ width: Math.round(size * .78), height: Math.round(size * .78), fit: 'inside' }).png().toBuffer();
  const image = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } }).composite([{ input: symbol, gravity: 'centre' }]).png().toBuffer();
  await writeFile(`${directory}/${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png`, image);
}
const icoSizes = [32, 48];
const buffers = await Promise.all(icoSizes.map(size => readFile(`${directory}/icon-${size}.png`)));
const header = Buffer.alloc(6 + buffers.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(buffers.length, 4);
let offset = header.length;
for (let i = 0; i < buffers.length; i++) {
  const position = 6 + i * 16;
  header[position] = icoSizes[i]; header[position + 1] = icoSizes[i];
  header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(buffers[i].length, position + 8); header.writeUInt32LE(offset, position + 12);
  offset += buffers[i].length;
}
await writeFile('public/favicon.ico', Buffer.concat([header, ...buffers]));
const icon = (await readFile(`${directory}/icon-48.png`)).toString('base64');
await writeFile('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><image width="48" height="48" href="data:image/png;base64,${icon}"/></svg>`);
const logo = source.toString('base64');
const descriptions = {
  ro: ['Ideile tale, realizate la scară mare.', 'Print UV · Litere volumetrice · 3D · Laser · CNC', 'DURLEȘTI · REPUBLICA MOLDOVA'],
  ru: ['Ваши идеи — в большом масштабе.', 'УФ-печать · Объёмные буквы · 3D · Лазер · ЧПУ', 'ДУРЛЕШТЫ · РЕСПУБЛИКА МОЛДОВА'],
  en: ['Your ideas, realised on a larger scale.', 'UV print · Dimensional lettering · 3D · Laser · CNC', 'DURLEȘTI · REPUBLIC OF MOLDOVA'],
};
for (const [locale, [headline, services, location]] of Object.entries(descriptions)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#081923"/><rect x="0" y="594" width="1200" height="36" fill="#ffca05"/>
    <image x="72" y="66" width="94" height="84" href="data:image/png;base64,${logo}"/>
    <g font-family="DejaVu Sans,sans-serif"><text x="184" y="111" fill="white" font-size="48" font-weight="bold">ARTMASTER</text><text x="187" y="145" fill="#c2d0d9" font-size="16" letter-spacing="5">ADVERTISING GROUP</text>
    <text x="72" y="290" fill="white" font-size="44" font-weight="bold">${headline}</text><text x="72" y="361" fill="#c2d0d9" font-size="25">${services}</text><text x="72" y="491" fill="#ffca05" font-size="21">${location}</text><text x="1040" y="548" fill="white" text-anchor="end" font-size="23">artmaster.md</text></g></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toFile(`${directory}/share-${locale}.jpg`);
}
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="160"><rect width="720" height="160" fill="white"/><image x="16" y="20" width="126" height="116" href="data:image/png;base64,${logo}"/><g font-family="DejaVu Sans,sans-serif"><text x="172" y="86" fill="#10202a" font-size="64" font-weight="bold">ARTMASTER</text><text x="176" y="124" fill="#5a6a79" font-size="22" letter-spacing="5">ADVERTISING GROUP</text></g></svg>`;
await sharp(Buffer.from(wordmark)).png().toFile(`${directory}/artmaster-wordmark.png`);
console.log('Branding assets generated from the supplied symbol reference.');
