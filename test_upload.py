import httpx
import os
import sys

folder = sys.argv[1]  # pass folder path as argument
files = []
for f in os.listdir(folder):
    if f.lower().endswith(('.jpg', '.jpeg', '.png')):
        files.append(('files', (f, open(os.path.join(folder, f), 'rb'), 'image/jpeg')))

print(f"Uploading {len(files)} images...")
response = httpx.post('http://localhost:8000/upload', files=files, timeout=60.0)
print(response.json())