import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const publicDirectory = path.resolve(process.cwd(), "public");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

export function parseCookies(request) {
  const cookieHeader = request.headers.cookie || "";

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex);
      const value = entry.slice(separatorIndex + 1);

      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function setCookie(response, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (config.publicBaseUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  const serializedCookie = parts.join("; ");
  const currentCookies = response.getHeader("Set-Cookie");

  if (!currentCookies) {
    response.setHeader("Set-Cookie", serializedCookie);
    return;
  }

  if (Array.isArray(currentCookies)) {
    response.setHeader("Set-Cookie", [...currentCookies, serializedCookie]);
    return;
  }

  response.setHeader("Set-Cookie", [currentCookies, serializedCookie]);
}

export function clearCookie(response, name) {
  setCookie(response, name, "", {
    expires: new Date(0),
    maxAge: 0
  });
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

export function sendRedirect(response, location) {
  response.writeHead(302, {
    Location: location
  });
  response.end();
}

export function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(body);
}

function resolveStaticFilePath(pathname) {
  const candidates = pathname === "/" ? ["/index.html"] : [pathname];

  if (pathname !== "/" && !path.extname(pathname)) {
    candidates.push(`${pathname}.html`);
    candidates.push(path.posix.join(pathname, "index.html"));
  }

  for (const candidate of candidates) {
    const normalizedPath = path
      .normalize(candidate)
      .replace(/^([/\\]+)/, "")
      .replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(publicDirectory, normalizedPath);

    if (filePath.startsWith(publicDirectory) && fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

export function serveStaticAsset(request, response) {
  const pathname = new URL(request.url, config.publicBaseUrl).pathname;
  const filePath = resolveStaticFilePath(pathname);

  if (!filePath) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const content = fs.readFileSync(filePath);

  response.writeHead(200, {
    "Content-Type": contentType
  });
  response.end(content);

  return true;
}
