import sys
from PIL import Image, ImageStat

ref_dir, out = sys.argv[1], sys.argv[2]
scenes = [int(s) for s in sys.argv[3].split(',')]
for s in scenes:
    ref = Image.open(f'{ref_dir}/{s + 1}.jpg').convert('RGB')
    ren = Image.open(f'{out}/render{s}.png').convert('RGB')
    h = 480
    ref = ref.resize((round(ref.width * h / ref.height), h))
    ren = ren.resize((round(ren.width * h / ren.height), h))
    m = Image.new('RGB', (ref.width + ren.width + 8, h), (255, 255, 255))
    m.paste(ref, (0, 0))
    m.paste(ren, (ref.width + 8, 0))
    m.save(f'{out}/compare{s}.png')
    rows = []
    for name, img in (('ref', ref), ('3d ', ren)):
        bands = []
        for k in range(4):
            box = (0, img.height * k // 4, img.width, img.height * (k + 1) // 4)
            bands.append('(%3d,%3d,%3d)' % tuple(int(v) for v in ImageStat.Stat(img.crop(box)).mean))
        rows.append(f'  {name} bands top→bottom: ' + ' '.join(bands))
    print(f'scene {s}'); print('\n'.join(rows))
