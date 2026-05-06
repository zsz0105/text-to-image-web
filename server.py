"""
文生图网站后端服务
支持本地运行 & 云端部署（Render）
"""

import json
import os
import hashlib
import hmac
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import urlopen, Request

# ========== 配置 ==========
PORT = int(os.environ.get('PORT', '8080'))
WEB_DIR = os.path.dirname(os.path.abspath(__file__))

# ========== HTTP 服务器 ==========
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/tencent/text2image':
            self._handle_tencent()
        else:
            self.send_error(404)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length))

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _handle_tencent(self):
        try:
            body = self._read_body()
            api_key = body.get('apiKey', '')
            prompt = body.get('prompt', '')
            size = body.get('size', '1024x1024')
            count = int(body.get('count', 1))

            if '::' not in api_key:
                self._json_response({'error': 'apiKey 格式错误，应为 SecretId::SecretKey'}, 400)
                return

            secret_id, secret_key = api_key.split('::', 1)
            w, h = size.split('x')

            images = []
            for _ in range(count):
                url = self._tencent_hunyuan_image(secret_id, secret_key, prompt, int(w), int(h))
                if url:
                    images.append(url)

            self._json_response({'images': images})

        except Exception as e:
            self._json_response({'error': str(e)}, 500)

    def _tencent_hunyuan_image(self, secret_id, secret_key, prompt, width=1024, height=1024):
        """腾讯混元图像生成"""
        service = 'hunyuan'
        host = 'hunyuan.tencentcloudapi.com'
        action = 'TextToImageLite'
        version = '2023-09-01'
        region = 'ap-guangzhou'
        timestamp = int(time.time())

        payload = json.dumps({
            'Prompt': prompt,
            'RspImgType': 'url',
            'Revise': 0,
        })

        # TC3 签名
        date = time.strftime('%Y-%m-%d', time.gmtime(timestamp))
        canonical_headers = f'content-type:application/json\nhost:{host}\n'
        signed_headers = 'content-type;host'
        hashed_request_payload = hashlib.sha256(payload.encode()).hexdigest()
        canonical_request = '\n'.join(['POST', '/', '', canonical_headers, signed_headers, hashed_request_payload])

        credential_scope = f'{date}/{service}/tc3_request'
        string_to_sign = '\n'.join([
            'TC3-HMAC-SHA256',
            str(timestamp),
            credential_scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        ])

        def _hmac256(key, msg):
            return hmac.new(key if isinstance(key, bytes) else key.encode(), msg.encode(), hashlib.sha256).digest()

        secret_date = _hmac256(f'TC3{secret_key}', date)
        secret_service = _hmac256(secret_date, service)
        secret_signing = _hmac256(secret_service, 'tc3_request')
        signature = hmac.new(secret_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()

        authorization = (
            f'TC3-HMAC-SHA256 Credential={secret_id}/{credential_scope}, '
            f'SignedHeaders={signed_headers}, Signature={signature}'
        )

        headers = {
            'Authorization': authorization,
            'Content-Type': 'application/json',
            'Host': host,
            'X-TC-Action': action,
            'X-TC-Timestamp': str(timestamp),
            'X-TC-Version': version,
            'X-TC-Region': region,
        }

        req = Request(f'https://{host}', data=payload.encode(), headers=headers, method='POST')
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())

        result = data.get('Response', {})
        if 'Error' in result:
            raise Exception(result['Error'].get('Message', '请求失败'))

        return result.get('ResultImage', '')


# ========== 启动 ==========
if __name__ == '__main__':
    print(f'启动文生图服务...')
    print(f'访问地址：http://localhost:{PORT}')
    print(f'网站目录：{WEB_DIR}')
    print(f'按 Ctrl+C 停止\n')
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n服务已停止')
