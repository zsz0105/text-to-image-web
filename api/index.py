import os
import json
import base64
from http.server import BaseHTTPRequestHandler
import requests

TENCENT_SECRET_ID = os.environ.get("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = os.environ.get("TENCENT_SECRET_KEY", "")

# 复用本地 server.py 的签名逻辑
import hmac
import hashlib
import time
from datetime import datetime, timezone, timedelta

SERVICE = "hunyuan"
HOST = "hunyuan.tencentcloudapi.com"
REGION = "ap-guangzhou"
VERSION = "2023-09-01"
ACTION = "TextToImageLite"

def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

def get_signature(secret_id, secret_key):
    timestamp = int(time.time())
    date = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d")
    http_request_method = "POST"
    canonical_uri = "/"
    canonical_querystring = ""
    content_type = "application/json; charset=utf-8"
    host = HOST
    canonical_headers = f"content-type:{content_type}\nhost:{host}\n"
    signed_headers = "content-type;host"
    payload = json.dumps({
        "Prompt": "test",
        "Style": "000",
        "RoundedEdges": True,
        "Resolution": "1024:1024"
    }, ensure_ascii=False)
    hashed_request_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = (
        f"{http_request_method}\n{canonical_uri}\n{canonical_querystring}\n"
        f"{canonical_headers}\n{signed_headers}\n{hashed_request_payload}"
    )
    credential_scope = f"{date}/{SERVICE}/tc3_request"
    hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = f"TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical_request}"
    secret_date = sign(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = sign(secret_date, SERVICE)
    secret_signing = sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"TC3-HMAC-SHA256 Credential={secret_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return timestamp, authorization, content_type, host, payload

def call_hunyuan(prompt, style="000", resolution="1024:1024", rounded_edges=True):
    timestamp, authorization, content_type, host, _ = get_signature(TENCENT_SECRET_ID, TENCENT_SECRET_KEY)
    payload = json.dumps({
        "Prompt": prompt,
        "Style": style,
        "RoundedEdges": rounded_edges,
        "Resolution": resolution
    }, ensure_ascii=False)
    headers = {
        "Authorization": authorization,
        "Content-Type": content_type,
        "Host": host,
        "X-TC-Action": ACTION,
        "X-TC-Version": VERSION,
        "X-TC-Region": REGION,
        "X-TC-Timestamp": str(timestamp)
    }
    resp = requests.post(f"https://{host}", headers=headers, data=payload, timeout=60)
    return resp.json()

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        data = json.loads(body)

        prompt = data.get("prompt", "")
        style = data.get("style", "000")
        resolution = data.get("resolution", "1024:1024")
        rounded_edges = data.get("rounded_edges", True)

        result = call_hunyuan(prompt, style, resolution, rounded_edges)
        print("API result:", json.dumps(result, ensure_ascii=False)[:200])

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass
