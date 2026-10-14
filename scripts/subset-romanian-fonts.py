"""Build optional Romanian font assets from the project's pinned font packages.
Requires fonttools + Brotli only when regenerating these committed assets.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

output = Path('public/fonts')
output.mkdir(parents=True, exist_ok=True)
characters = {0x0102, 0x0103, 0x0218, 0x0219, 0x021A, 0x021B}
for family in ('inter', 'manrope'):
    source = Path('node_modules') / f'@fontsource-variable/{family}/files' / f'{family}-latin-ext-wght-normal.woff2'
    font = TTFont(source)
    assert characters <= set(font.getBestCmap()), 'Required Romanian glyphs are missing'
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=characters)
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(output / f'{family}-romanian-wght.woff2')
    print(family, (output / f'{family}-romanian-wght.woff2').stat().st_size, 'bytes')
