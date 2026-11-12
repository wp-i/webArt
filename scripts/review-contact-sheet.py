"""Render the review request's exact, labelled frames for the current reviewer."""
import json, sys, math, hashlib
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[1]
request_file = (root / sys.argv[1]).resolve()
assert request_file.is_relative_to(root)
request = json.loads(request_file.read_text(encoding='utf-8'))
frames = request['images']
for group in range(math.ceil(len(frames) / 12)):
    subset = frames[group * 12:(group + 1) * 12]
    sheet = Image.new('RGB', (1800, math.ceil(len(subset) / 4) * 400), '#eceae6')
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(subset):
        filename = (root / frame['path']).resolve()
        assert filename.is_relative_to(root)
        assert hashlib.sha256(filename.read_bytes()).hexdigest() == frame['sha256']
        image = Image.open(filename).convert('RGB')
        image.thumbnail((444, 366))
        x, y = (index % 4) * 450, (index // 4) * 400
        sheet.paste(image, (x + (450-image.width)//2, y + 25))
        draw.text((x + 5, y + 5), frame['label'][:65], fill='#111111')
    output = request_file.with_name(request_file.stem.replace('-request','') + f'-sheet-{group+1}.jpg')
    sheet.save(output, quality=92)
    print(output)
