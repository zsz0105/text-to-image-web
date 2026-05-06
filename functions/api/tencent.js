export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json();
  const { prompt, negPrompt, size, count } = data;

  const TENCENT_SECRET_ID = env.TENCENT_SECRET_ID || "";
  const TENCENT_SECRET_KEY = env.TENCENT_SECRET_KEY || "";

  // 腾讯云 API v3 签名
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payload = JSON.stringify({
    Prompt: prompt,
    Style: "000",
    RoundedEdges: true,
    Resolution: "1024:1024"
  });

  const hashedPayload = await sha256(payload);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:application/json; charset=utf-8\nhost:hunyuan.tencentcloudapi.com\n`,
    "content-type;host",
    hashedPayload
  ].join("\n");

  const hashedCanonical = await sha256(canonicalRequest);
  const credentialScope = `${date}/hunyuan/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    hashedCanonical
  ].join("\n");

  const secretDate = await hmac("TC3" + TENCENT_SECRET_KEY, date);
  const secretService = await hmac(secretDate, "hunyuan");
  const secretSigning = await hmac(secretService, "tc3_request");
  const signature = await hmacHex(secretSigning, stringToSign);

  const authorization = [
    "TC3-HMAC-SHA256",
    `Credential=${TENCENT_SECRET_ID}/${credentialScope}`,
    "SignedHeaders=content-type;host",
    `Signature=${signature}`
  ].join(", ");

  const resp = await fetch("https://hunyuan.tencentcloudapi.com", {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": "hunyuan.tencentcloudapi.com",
      "X-TC-Action": "TextToImageLite",
      "X-TC-Version": "2023-09-01",
      "X-TC-Region": "ap-guangzhou",
      "X-TC-Timestamp": String(timestamp)
    },
    body: payload
  });

  const result = await resp.json();
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key, message) {
  const encoder = new TextEncoder();
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

async function hmacHex(key, message) {
  const sig = await hmac(key, message);
  return Array.from(sig).map(b => b.toString(16).padStart(2, "0")).join("");
}
