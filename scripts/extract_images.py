#!/usr/bin/env python3
import re
import sys
import base64
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: extract_images.py <markdown-file>")
    sys.exit(1)

md_path = Path(sys.argv[1])
if not md_path.exists():
    print(f"File not found: {md_path}")
    sys.exit(1)

text = md_path.read_text(encoding='utf-8')
pattern = re.compile(r"\[image(\d+)\]:\s*<data:image/[^;]+;base64,([^>]+)>", re.DOTALL)
matches = pattern.findall(text)
if not matches:
    print("No embedded data URI images found.")
    sys.exit(0)

out_dir = md_path.parent
created = []
for num, b64 in matches:
    fname = out_dir / f"image{num}.png"
    try:
        data = base64.b64decode(b64)
        with open(fname, 'wb') as f:
            f.write(data)
        created.append(str(fname.name))
    except Exception as e:
        print(f"Failed to decode image{num}: {e}")

print("Created images:")
for c in created:
    print(c)

# Optionally, replace the data URI definitions with file references in the markdown
new_text = pattern.sub(lambda m: f"[image{m.group(1)}]: {m.group(1)}.png", text)
backup = md_path.with_suffix(md_path.suffix + '.bak')
backup.write_text(text, encoding='utf-8')
md_path.write_text(new_text, encoding='utf-8')
print(f"Patched markdown and created backup: {backup.name}")
