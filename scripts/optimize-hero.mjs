import sharp from 'sharp';
const source = 'public/media/print-workshop.png';
const { width, height } = await sharp(source).metadata();
if (!width || !height) throw new Error('Missing hero image dimensions.');
const narrowWidth = Math.round(height * 480 / 600);
// The existing mobile hero is 600px tall and positions its image at 65%.
// This crop preserves that same visible composition for viewports below 480px.
const crop = { left: Math.round((width - narrowWidth) * .65), top: 0, width: narrowWidth, height };
for (const [name, region] of [['wide', null], ['narrow', crop]]) {
  const image = () => region ? sharp(source).extract(region) : sharp(source);
  await image().avif({ quality: 60, effort: 5 }).toFile(`public/media/hero-${name}.avif`);
  await image().webp({ quality: 76, effort: 6 }).toFile(`public/media/hero-${name}.webp`);
}
console.log('Static hero variants generated with the existing composition and no upscaling.');
