export const MAX_REQUEST_BYTES = 16 * 1024;

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function readJsonObject(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestError("请求数据过大", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestError("请求数据过大", 413);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new RequestError("请求数据格式不正确");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RequestError("请求数据格式不正确");
  }

  return payload;
}

export function getBooleanField(payload, fieldName, defaultValue, label) {
  if (!(fieldName in payload)) {
    return defaultValue;
  }

  if (typeof payload[fieldName] !== "boolean") {
    throw new RequestError(`${label}必须是布尔值`);
  }

  return payload[fieldName];
}

export function handleRequestError(error) {
  if (error instanceof RequestError) {
    return json({ error: error.message }, error.status);
  }

  console.error(error);
  return json({ error: "服务器处理请求失败" }, 500);
}
