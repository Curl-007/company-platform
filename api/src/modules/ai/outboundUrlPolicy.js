const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

function policyError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function parseAllowedPrivateHosts(value) {
  const source = value instanceof Set ? [...value] : Array.isArray(value) ? value : String(value || "").split(",");
  return new Set(source.map(normalizeHostname).filter(Boolean));
}

function ipv4Number(address) {
  const parts = String(address).split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return octets.reduce((result, value) => (result * 256) + value, 0) >>> 0;
}

function inIpv4Cidr(value, base, prefix) {
  const shift = 32 - prefix;
  return (value >>> shift) === (base >>> shift);
}

function isPublicIpv4(address) {
  const value = ipv4Number(address);
  if (value === null) return false;
  const blocked = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, prefix]) => inIpv4Cidr(value, ipv4Number(base), prefix));
}

function parseIpv6(address) {
  let input = normalizeHostname(address).split("%")[0];
  if (!input || input.includes(":::")) return null;

  const ipv4Match = input.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const v4 = ipv4Number(ipv4Match[1]);
    if (v4 === null) return null;
    input = `${input.slice(0, -ipv4Match[1].length)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 2 && missing < 1)) return null;
  const parts = [...left, ...new Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.reduce((result, part) => (result << 16n) | BigInt(parseInt(part, 16)), 0n);
}

function isPublicIpv6(address) {
  const value = parseIpv6(address);
  if (value === null) return false;

  // IPv4-mapped IPv6 must be evaluated using the IPv4 policy.
  if ((value >> 32n) === 0xffffn) {
    const mapped = Number(value & 0xffffffffn);
    const mappedAddress = [24, 16, 8, 0].map((shift) => (mapped >>> shift) & 0xff).join(".");
    return isPublicIpv4(mappedAddress);
  }

  // Only globally routable unicast addresses are accepted by default.
  if ((value >> 125n) !== 0b001n) return false;
  const documentationPrefix = parseIpv6("2001:db8::");
  if ((value >> 96n) === (documentationPrefix >> 96n)) return false;
  const documentationV2Prefix = parseIpv6("3fff::");
  if ((value >> 108n) === (documentationV2Prefix >> 108n)) return false;
  return true;
}

function isPublicIp(address) {
  const normalized = normalizeHostname(address);
  const family = net.isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

function validateAiProviderBaseUrl(value, { allowedPrivateHosts = [] } = {}) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw policyError("AI_PROVIDER_URL_INVALID", "AI Provider baseUrl must be a valid http/https URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw policyError("AI_PROVIDER_URL_INVALID", "AI Provider baseUrl must use http or https.");
  }
  if (url.username || url.password) {
    throw policyError("AI_PROVIDER_URL_CREDENTIALS_FORBIDDEN", "AI Provider baseUrl must not contain URL credentials.");
  }
  if (url.search || url.hash) {
    throw policyError("AI_PROVIDER_URL_INVALID", "AI Provider baseUrl must not contain a query string or fragment.");
  }

  const hostname = normalizeHostname(url.hostname);
  const allowlist = parseAllowedPrivateHosts(allowedPrivateHosts);
  if (allowlist.has(hostname)) return url;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw policyError("AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN", "AI Provider baseUrl cannot target localhost.");
  }
  if (net.isIP(hostname) && !isPublicIp(hostname)) {
    throw policyError("AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN", "AI Provider baseUrl cannot target a private or reserved address.");
  }
  return url;
}

function normalizedLookupAddresses(resolved) {
  const seen = new Set();
  return (Array.isArray(resolved) ? resolved : [resolved])
    .map((item) => {
      const address = typeof item === "string" ? item : item?.address;
      const family = net.isIP(address);
      return family ? { address, family } : null;
    })
    .filter((item) => {
      if (!item) return false;
      const key = `${item.family}:${item.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function createPinnedLookup(expectedHostname, addresses) {
  const expected = normalizeHostname(expectedHostname);
  const pinned = addresses.map((item) => ({ address: item.address, family: item.family }));
  return (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (typeof options === "number") {
      options = { family: options };
    }
    options ||= {};

    if (normalizeHostname(hostname) !== expected) {
      const error = policyError("AI_PROVIDER_PINNED_HOST_MISMATCH", "AI Provider socket lookup hostname did not match the validated host.");
      error.hostname = hostname;
      queueMicrotask(() => callback(error));
      return;
    }

    const requestedFamily = Number(options.family) || 0;
    const candidates = requestedFamily ? pinned.filter((item) => item.family === requestedFamily) : pinned;
    if (!candidates.length) {
      const error = new Error(`No validated address is available for ${hostname}.`);
      error.code = "ENOTFOUND";
      error.hostname = hostname;
      queueMicrotask(() => callback(error));
      return;
    }

    if (options.all) {
      queueMicrotask(() => callback(null, candidates.map((item) => ({ ...item }))));
      return;
    }
    queueMicrotask(() => callback(null, candidates[0].address, candidates[0].family));
  };
}

async function resolveAiProviderTarget(value, {
  allowedPrivateHosts = process.env.AI_PROVIDER_PRIVATE_HOST_ALLOWLIST,
  lookup = dns.lookup,
} = {}) {
  const allowlist = parseAllowedPrivateHosts(allowedPrivateHosts);
  const url = validateAiProviderBaseUrl(value, { allowedPrivateHosts: allowlist });
  const hostname = normalizeHostname(url.hostname);
  if (net.isIP(hostname)) {
    return Object.freeze({
      url,
      hostname,
      addresses: Object.freeze([{ address: hostname, family: net.isIP(hostname) }]),
      lookup: null,
    });
  }

  let resolved;
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    const wrapped = policyError("AI_PROVIDER_DNS_LOOKUP_FAILED", "AI Provider hostname could not be resolved.");
    wrapped.cause = error;
    throw wrapped;
  }
  const addresses = normalizedLookupAddresses(resolved);
  if (!addresses.length) {
    throw policyError("AI_PROVIDER_DNS_LOOKUP_FAILED", "AI Provider hostname did not resolve to an address.");
  }
  if (!allowlist.has(hostname) && addresses.some((item) => !isPublicIp(item.address))) {
    throw policyError("AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN", "AI Provider hostname resolves to a private or reserved address.");
  }
  return Object.freeze({
    url,
    hostname,
    addresses: Object.freeze(addresses.map((item) => Object.freeze({ ...item }))),
    lookup: createPinnedLookup(hostname, addresses),
  });
}

async function assertAiProviderUrlAllowed(value, options = {}) {
  return (await resolveAiProviderTarget(value, options)).url;
}

function buildAiProviderEndpoint(target, endpoint) {
  if (!target?.url || !(target.url instanceof URL)) {
    throw policyError("AI_PROVIDER_TARGET_INVALID", "AI Provider request target must be resolved before use.", 500);
  }
  const segment = String(endpoint || "").replace(/^\/+/, "");
  if (!segment || !/^[a-z0-9._~/-]+$/i.test(segment) || segment.split("/").includes("..")) {
    throw policyError("AI_PROVIDER_ENDPOINT_INVALID", "AI Provider request endpoint is invalid.", 500);
  }
  const url = new URL(target.url.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${segment}`;
  url.search = "";
  url.hash = "";
  return url;
}

function requestResolvedAiProviderTarget(target, endpoint, {
  method = "GET",
  headers: inputHeaders = {},
  body,
  signal,
  redirect = "error",
} = {}, {
  httpRequest = http.request,
  httpsRequest = https.request,
} = {}) {
  if (redirect !== "error") {
    return Promise.reject(policyError("AI_PROVIDER_REDIRECT_MODE_FORBIDDEN", "AI Provider requests must reject redirects.", 500));
  }
  const url = buildAiProviderEndpoint(target, endpoint);
  const hostname = normalizeHostname(url.hostname);
  if (!net.isIP(hostname) && typeof target.lookup !== "function") {
    return Promise.reject(policyError("AI_PROVIDER_PINNED_LOOKUP_MISSING", "AI Provider request is missing its validated DNS binding.", 500));
  }

  const headers = {};
  for (const [name, value] of Object.entries(inputHeaders || {})) {
    if (name.toLowerCase() !== "host") headers[name] = value;
  }
  headers.Host = url.host;
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "accept-encoding")) {
    headers["Accept-Encoding"] = "identity";
  }

  const requestOptions = {
    protocol: url.protocol,
    hostname,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method,
    headers,
    lookup: target.lookup || undefined,
    // A one-shot agent ensures an older socket for the same hostname cannot bypass this lookup binding.
    agent: false,
  };
  if (url.protocol === "https:" && !net.isIP(hostname)) requestOptions.servername = hostname;
  const transportRequest = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const cleanup = () => signal?.removeEventListener?.("abort", onAbort);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onAbort = () => {
      const error = new Error("AI Provider request was aborted.");
      error.name = "AbortError";
      error.code = "ABORT_ERR";
      request?.destroy(error);
      fail(error);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    try {
      request = transportRequest(requestOptions, (response) => {
        const status = Number(response.statusCode || 0);
        if (status >= 300 && status < 400) {
          response.resume?.();
          fail(policyError("AI_PROVIDER_REDIRECT_FORBIDDEN", "AI Provider redirects are not allowed.", 502));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.once("aborted", () => fail(new Error("AI Provider response was aborted.")));
        response.once("error", fail);
        response.once("end", () => {
          const payload = Buffer.concat(chunks);
          const text = payload.toString("utf8");
          succeed({
            ok: status >= 200 && status < 300,
            status,
            headers: response.headers || {},
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
      });
    } catch (error) {
      fail(error);
      return;
    }

    request.once("error", fail);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    request.end(body);
  });
}

async function requestAiProviderUrl(baseUrl, endpoint, options = {}, dependencies = {}) {
  const target = await resolveAiProviderTarget(baseUrl, dependencies);
  return requestResolvedAiProviderTarget(target, endpoint, options, dependencies);
}

module.exports = {
  assertAiProviderUrlAllowed,
  buildAiProviderEndpoint,
  createPinnedLookup,
  isPublicIp,
  normalizeHostname,
  parseAllowedPrivateHosts,
  requestAiProviderUrl,
  requestResolvedAiProviderTarget,
  resolveAiProviderTarget,
  validateAiProviderBaseUrl,
};
