export function mockReqRes({ method = "POST", headers = {}, body = {} } = {}) {
  const req = { method, headers, body };
  const res = {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  };
  return { req, res };
}
