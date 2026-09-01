import base64
import io
import json
import sys

import pdfplumber


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    content = base64.b64decode(payload.get("contentBase64", ""))
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        page_count = len(pdf.pages)
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    print(json.dumps({"pages": page_count, "text": text}, ensure_ascii=False))


if __name__ == "__main__":
    main()
