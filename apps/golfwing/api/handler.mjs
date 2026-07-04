import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler2 = i === middleware.length && next || void 0;
      }
      if (handler2) {
        try {
          res = await handler2(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer2) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer2) {
    buffer2[0] += str;
  } else {
    buffer2 = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer: buffer2, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer2))
    ).then(() => buffer2[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout2) => this.#layout = layout2;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler2) => {
          this.#addRoute(method, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler2) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler2);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app4) {
    const subApp = this.basePath(path);
    app4.routes.map((r) => {
      let handler2;
      if (app4.errorHandler === errorHandler) {
        handler2 = r.handler;
      } else {
        handler2 = async (c, next) => (await compose([], app4.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler2);
    return this;
  }
  #addRoute(method, path, handler2) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { basePath: this._basePath, path, method, handler: handler2 };
    this.router.add(method, path, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b2) {
  if (a.length === 1) {
    return b2.length === 1 ? a < b2 ? -1 : 1 : -1;
  }
  if (b2.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b2 === ONLY_WILDCARD_REG_EXP_STR || b2 === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b2 === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b2.length ? a < b2 ? -1 : 1 : b2.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b2) => b2.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler2) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler2, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler2, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler2, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler2) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler2]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler2, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler2) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler: handler2, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler2) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler: handler2,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b2) => {
        return a.score - b2.score;
      });
    }
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler2) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler2);
      }
      return;
    }
    this.#node.insert(method, path, handler2);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const defaults = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: []
  };
  const opts = {
    ...defaults,
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        if (opts.credentials) {
          return (origin) => origin || null;
        }
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*" || opts.credentials) {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*" || opts.credentials) {
      c.header("Vary", "Origin", { append: true });
    }
  };
};

// node_modules/hono/dist/utils/compress.js
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/(?!event-stream(?:[;\s]|$))[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|wasm|x-httpd-php|x-javascript|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml))(?:[;\s]|$)/i;

// node_modules/hono/dist/utils/mime.js
var getMimeType = (filename, mimes = baseMimes) => {
  const regexp = /\.([a-zA-Z0-9]+?)$/;
  const match2 = filename.match(regexp);
  if (!match2) {
    return;
  }
  let mimeType = mimes[match2[1].toLowerCase()];
  if (mimeType && mimeType.startsWith("text")) {
    mimeType += "; charset=utf-8";
  }
  return mimeType;
};
var _baseMimes = {
  aac: "audio/aac",
  avi: "video/x-msvideo",
  avif: "image/avif",
  av1: "video/av1",
  bin: "application/octet-stream",
  bmp: "image/bmp",
  css: "text/css",
  csv: "text/csv",
  eot: "application/vnd.ms-fontobject",
  epub: "application/epub+zip",
  gif: "image/gif",
  gz: "application/gzip",
  htm: "text/html",
  html: "text/html",
  ico: "image/x-icon",
  ics: "text/calendar",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  jsonld: "application/ld+json",
  map: "application/json",
  mid: "audio/x-midi",
  midi: "audio/x-midi",
  mjs: "text/javascript",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  oga: "audio/ogg",
  ogv: "video/ogg",
  ogx: "application/ogg",
  opus: "audio/opus",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  rtf: "application/rtf",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  ts: "video/mp2t",
  ttf: "font/ttf",
  txt: "text/plain",
  wasm: "application/wasm",
  webm: "video/webm",
  weba: "audio/webm",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml",
  xml: "application/xml",
  zip: "application/zip",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary"
};
var baseMimes = _baseMimes;

// node_modules/hono/dist/middleware/serve-static/path.js
var defaultJoin = (...paths) => {
  let result = paths.filter((p) => p !== "").join("/");
  result = result.replace(/(?<=\/)\/+/g, "");
  const segments = result.split("/");
  const resolved = [];
  for (const segment of segments) {
    if (segment === ".." && resolved.length > 0 && resolved.at(-1) !== "..") {
      resolved.pop();
    } else if (segment !== ".") {
      resolved.push(segment);
    }
  }
  return resolved.join("/") || ".";
};

// node_modules/hono/dist/middleware/serve-static/index.js
var ENCODINGS = {
  br: ".br",
  zstd: ".zst",
  gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var DEFAULT_DOCUMENT = "index.html";
var serveStatic = (options) => {
  const root = options.root ?? "./";
  const optionPath = options.path;
  const join = options.join ?? defaultJoin;
  return async (c, next) => {
    if (c.finalized) {
      return next();
    }
    let filename;
    if (options.path) {
      filename = options.path;
    } else {
      try {
        filename = tryDecodeURI(c.req.path);
        if (/(?:^|[\/\\])\.{1,2}(?:$|[\/\\])|[\/\\]{2,}/.test(filename)) {
          throw new Error();
        }
      } catch {
        await options.onNotFound?.(c.req.path, c);
        return next();
      }
    }
    let path = join(
      root,
      !optionPath && options.rewriteRequestPath ? options.rewriteRequestPath(filename) : filename
    );
    if (options.isDir && await options.isDir(path)) {
      path = join(path, DEFAULT_DOCUMENT);
    }
    const getContent = options.getContent;
    let content = await getContent(path, c);
    if (content instanceof Response) {
      return c.newResponse(content.body, content);
    }
    if (content) {
      const mimeType = options.mimes && getMimeType(path, options.mimes) || getMimeType(path);
      c.header("Content-Type", mimeType || "application/octet-stream");
      if (options.precompressed && (!mimeType || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
        const acceptEncodingSet = new Set(
          c.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim())
        );
        for (const encoding of ENCODINGS_ORDERED_KEYS) {
          if (!acceptEncodingSet.has(encoding)) {
            continue;
          }
          const compressedContent = await getContent(path + ENCODINGS[encoding], c);
          if (compressedContent) {
            content = compressedContent;
            c.header("Content-Encoding", encoding);
            c.header("Vary", "Accept-Encoding", { append: true });
            break;
          }
        }
      }
      await options.onFound?.(path, c);
      return c.body(content);
    }
    await options.onNotFound?.(path, c);
    await next();
    return;
  };
};

// node_modules/hono/dist/adapter/cloudflare-workers/utils.js
var getContentFromKVAsset = async (path, options) => {
  let ASSET_MANIFEST;
  if (options && options.manifest) {
    if (typeof options.manifest === "string") {
      ASSET_MANIFEST = JSON.parse(options.manifest);
    } else {
      ASSET_MANIFEST = options.manifest;
    }
  } else {
    if (typeof __STATIC_CONTENT_MANIFEST === "string") {
      ASSET_MANIFEST = JSON.parse(__STATIC_CONTENT_MANIFEST);
    } else {
      ASSET_MANIFEST = __STATIC_CONTENT_MANIFEST;
    }
  }
  let ASSET_NAMESPACE;
  if (options && options.namespace) {
    ASSET_NAMESPACE = options.namespace;
  } else {
    ASSET_NAMESPACE = __STATIC_CONTENT;
  }
  const key = ASSET_MANIFEST[path];
  if (!key) {
    return null;
  }
  const content = await ASSET_NAMESPACE.get(key, { type: "stream" });
  if (!content) {
    return null;
  }
  return content;
};

// node_modules/hono/dist/adapter/cloudflare-workers/serve-static.js
var serveStatic2 = (options) => {
  return async function serveStatic22(c, next) {
    const getContent = async (path) => {
      return getContentFromKVAsset(path, {
        manifest: options.manifest,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        namespace: options.namespace ? options.namespace : c.env ? c.env.__STATIC_CONTENT : void 0
      });
    };
    return serveStatic({
      ...options,
      getContent
    })(c, next);
  };
};

// node_modules/hono/dist/adapter/cloudflare-workers/serve-static-module.js
var module = (options) => {
  return serveStatic2(options);
};

// node_modules/hono/dist/helper/websocket/index.js
var WSContext = class {
  #init;
  constructor(init) {
    this.#init = init;
    this.raw = init.raw;
    this.url = init.url ? new URL(init.url) : null;
    this.protocol = init.protocol ?? null;
  }
  send(source, options) {
    this.#init.send(source, options ?? {});
  }
  raw;
  binaryType = "arraybuffer";
  get readyState() {
    return this.#init.readyState;
  }
  url;
  protocol;
  close(code, reason) {
    this.#init.close(code, reason);
  }
};
var defineWebSocketHelper = (handler2) => {
  return ((...args) => {
    if (typeof args[0] === "function") {
      const [createEvents, options] = args;
      return async function upgradeWebSocket2(c, next) {
        const events = await createEvents(c);
        const result = await handler2(c, events, options);
        if (result) {
          return result;
        }
        await next();
      };
    } else {
      const [c, events, options] = args;
      return (async () => {
        const upgraded = await handler2(c, events, options);
        if (!upgraded) {
          throw new Error("Failed to upgrade WebSocket");
        }
        return upgraded;
      })();
    }
  });
};

// node_modules/hono/dist/adapter/cloudflare-workers/websocket.js
var upgradeWebSocket = defineWebSocketHelper(async (c, events) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return;
  }
  const webSocketPair = new WebSocketPair();
  const client = webSocketPair[0];
  const server = webSocketPair[1];
  const wsContext = new WSContext({
    close: (code, reason) => server.close(code, reason),
    get protocol() {
      return server.protocol;
    },
    raw: server,
    get readyState() {
      return server.readyState;
    },
    url: server.url ? new URL(server.url) : null,
    send: (source) => server.send(source)
  });
  if (events.onClose) {
    server.addEventListener("close", (evt) => events.onClose?.(evt, wsContext));
  }
  if (events.onMessage) {
    server.addEventListener("message", (evt) => events.onMessage?.(evt, wsContext));
  }
  if (events.onError) {
    server.addEventListener("error", (evt) => events.onError?.(evt, wsContext));
  }
  server.accept?.();
  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket is not typed
    webSocket: client
  });
});

// src/xlsxHelper.ts
function u8(s) {
  return new TextEncoder().encode(s);
}
function crc32(data) {
  const table = makeCrcTable();
  let crc = 4294967295;
  for (let i = 0; i < data.length; i++) {
    crc = crc >>> 8 ^ table[(crc ^ data[i]) & 255];
  }
  return (crc ^ 4294967295) >>> 0;
}
var _crcTable = null;
function makeCrcTable() {
  if (_crcTable) return _crcTable;
  _crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    _crcTable[n] = c;
  }
  return _crcTable;
}
function writeUint16LE(v) {
  return new Uint8Array([v & 255, v >> 8 & 255]);
}
function writeUint32LE(v) {
  return new Uint8Array([v & 255, v >> 8 & 255, v >> 16 & 255, v >> 24 & 255]);
}
function concat(...parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
function buildZip(files) {
  const entries = [];
  const localParts = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.content === "string" ? u8(f.content) : f.content;
    const crc = crc32(data);
    const nameBytes = u8(f.name);
    const localHeader = concat(
      new Uint8Array([80, 75, 3, 4]),
      // signature
      writeUint16LE(20),
      // version needed
      writeUint16LE(0),
      // flags
      writeUint16LE(0),
      // compression: stored
      writeUint16LE(0),
      // mod time
      writeUint16LE(0),
      // mod date
      writeUint32LE(crc),
      writeUint32LE(data.length),
      writeUint32LE(data.length),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0),
      // extra length
      nameBytes
    );
    entries.push({ name: f.name, data, crc, localOffset: offset });
    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;
  }
  const centralParts = [];
  for (const e of entries) {
    const nameBytes = u8(e.name);
    centralParts.push(
      concat(
        new Uint8Array([80, 75, 1, 2]),
        // signature
        writeUint16LE(20),
        // version made by
        writeUint16LE(20),
        // version needed
        writeUint16LE(0),
        // flags
        writeUint16LE(0),
        // compression
        writeUint16LE(0),
        // mod time
        writeUint16LE(0),
        // mod date
        writeUint32LE(e.crc),
        writeUint32LE(e.data.length),
        writeUint32LE(e.data.length),
        writeUint16LE(nameBytes.length),
        writeUint16LE(0),
        // extra
        writeUint16LE(0),
        // comment
        writeUint16LE(0),
        // disk start
        writeUint16LE(0),
        // internal attr
        writeUint32LE(0),
        // external attr
        writeUint32LE(e.localOffset),
        nameBytes
      )
    );
  }
  const centralDir = concat(...centralParts);
  const cdOffset = offset;
  const cdSize = centralDir.length;
  const eocd = concat(
    new Uint8Array([80, 75, 5, 6]),
    writeUint16LE(0),
    writeUint16LE(0),
    writeUint16LE(entries.length),
    writeUint16LE(entries.length),
    writeUint32LE(cdSize),
    writeUint32LE(cdOffset),
    writeUint16LE(0)
  );
  return concat(...localParts, centralDir, eocd);
}
function xmlEsc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function cellXml(col, row, value, styleId = 0) {
  const addr = colName(col) + row;
  if (value == null || value === "") {
    return `<c r="${addr}" s="${styleId}"/>`;
  }
  if (typeof value === "number") {
    return `<c r="${addr}" t="n" s="${styleId}"><v>${value}</v></c>`;
  }
  return `<c r="${addr}" t="inlineStr" s="${styleId}"><is><t>${xmlEsc(String(value))}</t></is></c>`;
}
function colName(col) {
  let name = "";
  let n = col;
  while (n >= 0) {
    name = String.fromCharCode(65 + n % 26) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}
var STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="\u6E38\u30B4\u30B7\u30C3\u30AF"/></font>
    <font><sz val="11"/><b/><name val="\u6E38\u30B4\u30B7\u30C3\u30AF"/></font>
    <font><sz val="11"/><color rgb="FFFFFFFF"/><b/><name val="\u6E38\u30B4\u30B7\u30C3\u30AF"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F8"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFBDC6D4"/></left>
      <right style="thin"><color rgb="FFBDC6D4"/></right>
      <top style="thin"><color rgb="FFBDC6D4"/></top>
      <bottom style="thin"><color rgb="FFBDC6D4"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0"  fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="3"  fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"/>
    <xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"/>
    <xf numFmtId="0"  fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;
function buildSheetXml(rows, colWidths = []) {
  const colDefs = colWidths.map((c) => `<col min="${c.col + 1}" max="${c.col + 1}" width="${c.width}" customWidth="1"/>`).join("");
  const rowXmls = rows.map((row, ri) => {
    const rn = ri + 1;
    const cells = row.cells.map((v, ci) => {
      const sid = row.styles?.[ci] ?? row.rowStyle ?? 0;
      return cellXml(ci, rn, v, sid);
    }).join("");
    return `<row r="${rn}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colDefs}</cols>
  <sheetData>${rowXmls}</sheetData>
</worksheet>`;
}
var WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="\u7D0D\u54C1\u5C65\u6B74" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
var WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
var CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
var ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
function buildXlsx(rows, colWidths = []) {
  const sheetXml = buildSheetXml(rows, colWidths);
  return buildZip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES },
    { name: "_rels/.rels", content: ROOT_RELS },
    { name: "xl/workbook.xml", content: WORKBOOK_XML },
    { name: "xl/_rels/workbook.xml.rels", content: WORKBOOK_RELS },
    { name: "xl/styles.xml", content: STYLES_XML },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml }
  ]);
}

// src/routes/api.ts
var app = new Hono2();
function getTenantId(c) {
  return c.get("sessionUser")?.tenantId ?? 1;
}
app.use("/*", async (c, next) => {
  const sessionUser = c.get("sessionUser");
  if (sessionUser?.isDemo && !["GET", "HEAD"].includes(c.req.method)) {
    return c.json({
      error: "\u30C7\u30E2\u30E2\u30FC\u30C9\u3067\u306F\u66F8\u304D\u8FBC\u307F\u64CD\u4F5C\u306F\u3067\u304D\u307E\u305B\u3093\u3002",
      demo: true
    }, 403);
  }
  return next();
});
function senderInfoFromEnv(env) {
  return {
    name: env.APP_SENDER_NAME,
    shop: env.APP_SENDER_SHOP,
    addr: env.APP_SENDER_ADDR,
    tel: env.APP_SENDER_TEL,
    mail: env.APP_SENDER_MAIL
  };
}
function yen(v) {
  if (v === null || v === void 0 || v === "") return "";
  const n = parseFloat(String(v));
  if (isNaN(n)) return String(v);
  return `\xA5${n.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;
}
function statusLabel(v) {
  const m = {
    draft: "\u4E0B\u66F8\u304D",
    draft_created: "\u4E0B\u66F8\u304D\u4F5C\u6210\u6E08",
    ordered: "\u767A\u6CE8\u6E08",
    partial: "\u4E00\u90E8\u5165\u8377",
    completed: "\u5B8C\u7D0D",
    cancelled: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    pool: "\u30D7\u30FC\u30EB\u4E2D"
  };
  return m[v] ?? v;
}
function today() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function nowCode() {
  const d = /* @__PURE__ */ new Date();
  return d.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}
function uuid5() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}
function normalize(v) {
  return (v ?? "").replace(/　/g, " ").trim();
}
async function resolveSupplier(db2, itemCategory, manufacturer, clubType, productId, tenantId = 1) {
  if (productId) {
    const p = await db2.prepare(
      "SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id WHERE p.id=? AND p.tenant_id=?"
    ).bind(productId, tenantId).first();
    if (p && p["default_supplier_id"]) {
      const s = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(p["default_supplier_id"], tenantId).first();
      return { supplier: s ?? null, rate: p["default_rate"] ?? null };
    }
  }
  const rows = await db2.prepare(
    `SELECT sr.*, s.*
       FROM supplier_rules sr
       JOIN suppliers s ON sr.supplier_id = s.id
       WHERE COALESCE(sr.item_category, '') IN ('', ?)
         AND COALESCE(sr.manufacturer, '') IN ('', ?)
         AND COALESCE(sr.club_type, '') IN ('', ?)
         AND s.is_active = 1
         AND sr.tenant_id = ?
       ORDER BY
         CASE WHEN sr.item_category = ? THEN 0 ELSE 1 END,
         CASE WHEN sr.manufacturer = ? THEN 0 ELSE 1 END,
         CASE WHEN sr.club_type = ? THEN 0 ELSE 1 END,
         sr.priority ASC,
         sr.id ASC
       LIMIT 1`
  ).bind(itemCategory, manufacturer, clubType, tenantId, itemCategory, manufacturer, clubType).first();
  if (rows) {
    const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(rows["supplier_id"], tenantId).first();
    return { supplier: supplier ?? null, rate: rows["rate"] ?? null };
  }
  return { supplier: null, rate: null };
}
function composeMail(order, items, supplier, senderInfo) {
  const subject = `\u767A\u6CE8\u306E\u304A\u9858\u3044`;
  const lines = items.map((item) => {
    const spec = item["spec"] ? ` / ${item["spec"]}` : "";
    const color = item["color"] ? ` / ${item["color"]}` : "";
    const clubType = item["club_type"] ? ` / ${item["club_type"]}` : "";
    const unit = item["unit"] || "\u672C";
    return `\u30FB${item["item_category"]} / ${item["manufacturer"] || ""} / ${item["product_name"]}${spec}${color}${clubType} / ${item["quantity"]}${unit}`;
  });
  const honorific = supplier["honorific"] || "\u69D8";
  const contact = supplier["contact_name"] || "\u3054\u62C5\u5F53\u8005";
  const orderNote = (order["order_note"] || "").trim();
  const sn = senderInfo?.name || "";
  const greeting = sn ? `\u304A\u4E16\u8A71\u306B\u306A\u3063\u3066\u304A\u308A\u307E\u3059\u3002
${sn}\u3067\u3054\u3056\u3044\u307E\u3059\u3002` : "\u304A\u4E16\u8A71\u306B\u306A\u3063\u3066\u304A\u308A\u307E\u3059\u3002";
  const sigLines = [];
  if (senderInfo?.shop) sigLines.push(senderInfo.shop);
  if (senderInfo?.addr) sigLines.push(senderInfo.addr);
  if (senderInfo?.tel) sigLines.push(`TEL\uFF1A${senderInfo.tel}`);
  if (senderInfo?.mail) sigLines.push(`mail\uFF1A${senderInfo.mail}`);
  const sig = sigLines.length ? `---------------------------
${sigLines.join("\n")}
---------------------------` : "";
  const body = `${supplier["name"]}
${contact}${honorific}

${greeting}

\u4E0B\u8A18\u306E\u901A\u308A\u3001\u767A\u6CE8\u3092\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002

${lines.join("\n")}
${orderNote ? `
\u5099\u8003:
${orderNote}
` : ""}
\u3054\u78BA\u8A8D\u306E\u307B\u3069\u3001\u3088\u308D\u3057\u304F\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002
${sig ? "\n" + sig : ""}`;
  return { subject, body };
}
async function computeStatus(db2, orderId) {
  const [summaryRow, curRow] = await Promise.all([
    db2.prepare(
      `SELECT
         COALESCE(SUM(poi.quantity), 0)          AS ordered_total,
         COALESCE(SUM(ri_agg.received_qty), 0)   AS received_total,
         COUNT(poi.id)                            AS item_count
       FROM purchase_order_items poi
       LEFT JOIN (
         SELECT purchase_order_item_id, SUM(received_quantity) AS received_qty
         FROM receipt_items
         GROUP BY purchase_order_item_id
       ) ri_agg ON ri_agg.purchase_order_item_id = poi.id
       WHERE poi.purchase_order_id = ?`
    ).bind(orderId).first(),
    db2.prepare("SELECT status FROM purchase_orders WHERE id=?").bind(orderId).first()
  ]);
  const itemCount = summaryRow?.item_count ?? 0;
  const orderedTotal = summaryRow?.ordered_total ?? 0;
  const receivedTotal = summaryRow?.received_total ?? 0;
  if (!itemCount) return "draft";
  if (receivedTotal <= 0) {
    const s = curRow?.status ?? "draft";
    return ["draft", "draft_created", "ordered"].includes(s) ? s : "ordered";
  }
  if (receivedTotal < orderedTotal) return "partial";
  return "completed";
}
async function updateOrderStatus(db2, orderId) {
  const status = await computeStatus(db2, orderId);
  await db2.prepare("UPDATE purchase_orders SET status=? WHERE id=?").bind(status, orderId).run();
}
app.get("/dashboard", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const [products, suppliers, orders, backorders] = await Promise.all([
    db2.prepare("SELECT COUNT(*) AS c FROM products WHERE is_active=1 AND tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1 AND tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM purchase_orders WHERE tenant_id=?").bind(tenantId).first(),
    db2.prepare(
      `SELECT COUNT(*) AS c FROM (
          SELECT poi.id
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.purchase_order_id
          LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
          WHERE po.tenant_id = ?
          GROUP BY poi.id, poi.quantity
          HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
        )`
    ).bind(tenantId).first()
  ]);
  const recentOrders = await db2.prepare(
    `SELECT po.*, s.name AS supplier_name,
              COUNT(poi.id) AS line_count,
              COALESCE(SUM(poi.amount), 0) AS total_amount,
              COALESCE(SUM(poi.quantity), 0) AS total_qty
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       WHERE po.tenant_id = ?
       GROUP BY po.id
       ORDER BY po.id DESC
       LIMIT 10`
  ).bind(tenantId).all();
  return c.json({
    counts: {
      products: products?.c ?? 0,
      suppliers: suppliers?.c ?? 0,
      orders: orders?.c ?? 0,
      backorders: backorders?.c ?? 0
    },
    recent_orders: recentOrders.results.map((r) => ({
      ...r,
      status_label: statusLabel(r["status"]),
      total_amount_yen: yen(r["total_amount"])
    }))
  });
});
app.get("/products", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const q = normalize(c.req.query("q"));
  const cat = c.req.query("category") || "";
  let sql = `SELECT p.*, s.name AS supplier_name
             FROM products p
             LEFT JOIN suppliers s ON p.default_supplier_id = s.id
             WHERE p.is_active = 1 AND p.tenant_id = ?`;
  const params = [tenantId];
  if (cat) {
    sql += " AND p.item_category = ?";
    params.push(cat);
  }
  if (q) {
    sql += " AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += " ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000";
  const stmt = db2.prepare(sql);
  const rows = await stmt.bind(...params).all();
  return c.json({
    rows: rows.results.map((r) => ({ ...r, list_price_yen: yen(r["list_price"]) }))
  });
});
app.get("/suppliers", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const rows = await db2.prepare("SELECT * FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all();
  return c.json({ rows: rows.results });
});
app.get("/rules", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const rows = await db2.prepare(
    `SELECT sr.*, s.name AS supplier_name
       FROM supplier_rules sr
       JOIN suppliers s ON sr.supplier_id=s.id
       WHERE sr.tenant_id = ?
       ORDER BY sr.item_category, sr.manufacturer, sr.club_type, sr.priority`
  ).bind(tenantId).all();
  return c.json({ rows: rows.results });
});
app.get("/orders", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const status = (c.req.query("status") || "").trim();
  const supplier = (c.req.query("supplier") || "").trim();
  const q = (c.req.query("q") || "").trim();
  let sql = `SELECT po.*, s.name AS supplier_name,
                    COUNT(DISTINCT poi.id) AS line_count,
                    COALESCE(SUM(poi.amount),0) AS total_amount,
                    COALESCE(SUM(poi.quantity),0) AS total_qty
             FROM purchase_orders po
             JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
             WHERE po.tenant_id = ?`;
  const params = [tenantId];
  if (status) {
    sql += " AND po.status=?";
    params.push(status);
  }
  if (supplier) {
    sql += " AND s.name LIKE ?";
    params.push(`%${supplier}%`);
  }
  if (q) {
    sql += " AND (po.order_no LIKE ? OR po.customer_name LIKE ? OR po.ordered_by LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " GROUP BY po.id ORDER BY po.id DESC";
  const rows = await db2.prepare(sql).bind(...params).all();
  return c.json({
    rows: rows.results.map((r) => ({
      ...r,
      status_label: statusLabel(r["status"]),
      total_amount_yen: yen(r["total_amount"])
    }))
  });
});
app.get("/orders/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const order = await db2.prepare(
    `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method, s.phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id=s.id
       WHERE po.id=? AND po.tenant_id=?`
  ).bind(id, tenantId).first();
  if (!order) return c.json({ error: "Not found" }, 404);
  const items = await db2.prepare(
    `SELECT poi.*,
              COALESCE((SELECT SUM(received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id = poi.id), 0) AS received_qty
       FROM purchase_order_items poi
       WHERE poi.purchase_order_id=?
       ORDER BY poi.id`
  ).bind(id).all();
  const receipts = await db2.prepare("SELECT * FROM receipts WHERE purchase_order_id=? ORDER BY id DESC").bind(id).all();
  return c.json({
    order: { ...order, status_label: statusLabel(order["status"]) },
    items: items.results.map((r) => ({
      ...r,
      unit_price_yen: yen(r["unit_price"]),
      amount_yen: yen(r["amount"])
    })),
    receipts: receipts.results
  });
});
app.post("/orders", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const body = await c.req.json();
  const orderedBy = normalize(body.ordered_by) || "\u62C5\u5F53\u8005\u672A\u8A2D\u5B9A";
  const orderDate = body.order_date || today();
  const customerName = normalize(body.customer_name);
  const usageType = normalize(body.usage_type);
  const requestedDeliveryDate = body.requested_delivery_date || null;
  const orderNote = normalize(body.order_note);
  const isPool = body["pool"] === true;
  const batchCode = nowCode() + "-" + Math.random().toString(36).substring(2, 8);
  const linesRaw = body.lines || [];
  const lines = [];
  for (const raw2 of linesRaw) {
    if (!raw2.product_name && !raw2.item_category) continue;
    if (!raw2.quantity || raw2.quantity <= 0) continue;
    let supplier = null;
    let autoRate = null;
    if (raw2.supplier_id) {
      const s = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND is_active=1 AND tenant_id=?").bind(raw2.supplier_id, tenantId).first();
      supplier = s ?? null;
    } else {
      const resolved = await resolveSupplier(
        db2,
        raw2.item_category,
        raw2.manufacturer,
        raw2.club_type || "",
        raw2.product_id,
        tenantId
      );
      supplier = resolved.supplier;
      autoRate = resolved.rate;
    }
    if (!supplier) {
      return c.json({ error: `\u767A\u6CE8\u5148\u304C\u7279\u5B9A\u3067\u304D\u306A\u3044\u660E\u7D30\u304C\u3042\u308A\u307E\u3059: ${raw2.product_name || raw2.manufacturer || "\u672A\u5165\u529B"}` }, 400);
    }
    const rate = raw2.rate != null ? raw2.rate : autoRate;
    let unitPrice = raw2.unit_price ?? null;
    if (unitPrice === null && raw2.list_price != null && rate != null) {
      unitPrice = Math.round(raw2.list_price * rate);
    }
    const amount = unitPrice != null ? unitPrice * raw2.quantity : null;
    lines.push({
      supplier_id: supplier["id"],
      item_category: raw2.item_category,
      manufacturer: raw2.manufacturer,
      product_name: raw2.product_name,
      spec: raw2.spec || "",
      color: raw2.color || "",
      club_type: raw2.club_type || "",
      quantity: raw2.quantity,
      list_price: raw2.list_price ?? null,
      rate,
      unit_price: unitPrice,
      amount,
      customer_name: customerName,
      usage_type: usageType,
      requested_delivery_date: requestedDeliveryDate,
      line_note: normalize(raw2.line_note),
      product_id: raw2.product_id ?? null
    });
  }
  if (lines.length === 0) {
    return c.json({ error: "\u767A\u6CE8\u660E\u7D30\u30921\u4EF6\u4EE5\u4E0A\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 400);
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (!grouped.has(line.supplier_id)) grouped.set(line.supplier_id, []);
    grouped.get(line.supplier_id).push(line);
  }
  const orderIds = [];
  for (const [supplierId, supplierLines] of grouped) {
    const orderNo = "PO-" + orderDate.replace(/-/g, "") + "-" + uuid5();
    const inserted = await db2.prepare(
      `INSERT INTO purchase_orders
          (batch_code, order_no, order_date, ordered_by, supplier_id, customer_name,
           usage_type, requested_delivery_date, status, order_note, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      batchCode,
      orderNo,
      orderDate,
      orderedBy,
      supplierId,
      customerName,
      usageType,
      requestedDeliveryDate,
      isPool ? "pool" : "draft_created",
      orderNote,
      tenantId
    ).run();
    const orderId = inserted.meta.last_row_id;
    for (const line of supplierLines) {
      await db2.prepare(
        `INSERT INTO purchase_order_items
            (purchase_order_id, product_id, item_category, manufacturer, product_name,
             spec, color, club_type, quantity, list_price, rate, unit_price, amount,
             customer_name, usage_type, requested_delivery_date, line_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        orderId,
        line.product_id,
        line.item_category,
        line.manufacturer,
        line.product_name,
        line.spec,
        line.color,
        line.club_type,
        line.quantity,
        line.list_price,
        line.rate,
        line.unit_price,
        line.amount,
        line.customer_name,
        line.usage_type,
        line.requested_delivery_date,
        line.line_note
      ).run();
    }
    if (!isPool) {
      const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(supplierId, tenantId).first();
      const order = await db2.prepare("SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?").bind(orderId, tenantId).first();
      if (supplier && order) {
        const { subject, body: body2 } = composeMail(order, supplierLines, supplier, senderInfoFromEnv(c.env));
        await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, body2, orderId).run();
      }
    }
    orderIds.push(orderId);
  }
  return c.json({ order_ids: orderIds, batch_code: batchCode, count: orderIds.length, pool: isPool });
});
app.post("/orders/:id/mark-ordered", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  await db2.prepare("UPDATE purchase_orders SET status=? WHERE id=? AND tenant_id=?").bind("ordered", id, tenantId).run();
  return c.json({ ok: true });
});
app.post("/orders/:id/regenerate-mail", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const order = await db2.prepare("SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?").bind(id, tenantId).first();
  if (!order) return c.json({ error: "\u767A\u6CE8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(order["supplier_id"], tenantId).first();
  if (!supplier) return c.json({ error: "\u4ED5\u5165\u5148\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const items = await db2.prepare(
    "SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id"
  ).bind(id).all();
  const { subject, body } = composeMail(order, items.results, supplier, senderInfoFromEnv(c.env));
  await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, body, id).run();
  return c.json({ ok: true, subject, body });
});
app.post("/orders/:id/items", async (c) => {
  const db2 = c.env.DB;
  const orderId = parseInt(c.req.param("id"));
  if (isNaN(orderId)) return c.json({ error: "\u4E0D\u6B63\u306AID\u3067\u3059\u3002" }, 400);
  const tenantId = getTenantId(c);
  const order = await db2.prepare(
    `SELECT po.*, s.* FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.id = ? AND po.tenant_id = ?`
  ).bind(orderId, tenantId).first();
  if (!order) return c.json({ error: "\u767A\u6CE8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }, 404);
  const status = String(order["status"] ?? "");
  if (status !== "draft_created" && status !== "pool") {
    return c.json({ error: "\u4E0B\u66F8\u304D\u307E\u305F\u306F\u30D7\u30FC\u30EB\u72B6\u614B\u306E\u767A\u6CE8\u306B\u306E\u307F\u660E\u7D30\u3092\u8FFD\u52A0\u3067\u304D\u307E\u3059\u3002" }, 400);
  }
  const body = await c.req.json();
  if (!body.product_name && !body.item_category) {
    return c.json({ error: "\u5546\u54C1\u540D\u307E\u305F\u306F\u54C1\u76EE\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 400);
  }
  if (!body.quantity || body.quantity <= 0) {
    return c.json({ error: "\u6570\u91CF\u306F1\u4EE5\u4E0A\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 400);
  }
  const rate = body.rate ?? null;
  let unitPrice = body.unit_price ?? null;
  if (unitPrice === null && body.list_price != null && rate != null) {
    unitPrice = Math.round(body.list_price * rate);
  }
  const amount = unitPrice != null ? unitPrice * body.quantity : null;
  await db2.prepare(`
    INSERT INTO purchase_order_items
      (purchase_order_id, product_id, item_category, manufacturer, product_name,
       spec, color, club_type, quantity, list_price, rate, unit_price, amount,
       customer_name, usage_type, requested_delivery_date, line_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId,
    body.product_id ?? null,
    body.item_category ?? "",
    body.manufacturer ?? "",
    body.product_name,
    body.spec ?? "",
    body.color ?? "",
    body.club_type ?? "",
    body.quantity,
    body.list_price ?? null,
    rate,
    unitPrice,
    amount,
    order["customer_name"] ?? null,
    order["usage_type"] ?? null,
    order["requested_delivery_date"] ?? null,
    normalize(body.line_note)
  ).run();
  const allItems = await db2.prepare(
    "SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id"
  ).bind(orderId).all();
  const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(order["supplier_id"], tenantId).first();
  if (supplier) {
    const { subject, body: mailBody } = composeMail(order, allItems.results, supplier, senderInfoFromEnv(c.env));
    await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, mailBody, orderId).run();
  }
  return c.json({ ok: true });
});
app.put("/items/:poi_id", async (c) => {
  const db2 = c.env.DB;
  const poiId = parseInt(c.req.param("poi_id"));
  if (isNaN(poiId)) return c.json({ error: "\u4E0D\u6B63\u306AID\u3067\u3059\u3002" }, 400);
  const poi = await db2.prepare(
    "SELECT poi.*, po.status, po.supplier_id FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.id=?"
  ).bind(poiId).first();
  if (!poi) return c.json({ error: "\u660E\u7D30\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }, 404);
  const status = String(poi["status"] ?? "");
  if (status !== "draft_created" && status !== "pool") {
    return c.json({ error: "\u4E0B\u66F8\u304D\u307E\u305F\u306F\u30D7\u30FC\u30EB\u72B6\u614B\u306E\u767A\u6CE8\u306E\u307F\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002" }, 400);
  }
  const body = await c.req.json();
  const quantity = body.quantity != null ? Number(body.quantity) : Number(poi["quantity"]);
  const listPrice = body.list_price != null ? Number(body.list_price) : poi["list_price"] != null ? Number(poi["list_price"]) : null;
  const rate = body.rate != null ? Number(body.rate) : poi["rate"] != null ? Number(poi["rate"]) : null;
  let unitPrice = body.unit_price != null ? Number(body.unit_price) : poi["unit_price"] != null ? Number(poi["unit_price"]) : null;
  if (body.unit_price == null && listPrice != null && rate != null) {
    unitPrice = Math.round(listPrice * rate);
  }
  const amount = unitPrice != null ? Math.round(unitPrice * quantity) : null;
  await db2.prepare(`
    UPDATE purchase_order_items
    SET item_category=?, manufacturer=?, product_name=?,
        spec=?, color=?, club_type=?,
        quantity=?, list_price=?, rate=?, unit_price=?, amount=?,
        line_note=?
    WHERE id=?
  `).bind(
    normalize(body.item_category) ?? poi["item_category"],
    normalize(body.manufacturer) ?? poi["manufacturer"],
    normalize(body.product_name) ?? poi["product_name"],
    normalize(body.spec) ?? poi["spec"] ?? "",
    normalize(body.color) ?? poi["color"] ?? "",
    normalize(body.club_type) ?? poi["club_type"] ?? "",
    quantity,
    listPrice,
    rate,
    unitPrice,
    amount,
    normalize(body.line_note) ?? poi["line_note"] ?? "",
    poiId
  ).run();
  const orderId = Number(poi["purchase_order_id"]);
  const [order, supplier, allItems] = await Promise.all([
    db2.prepare("SELECT * FROM purchase_orders WHERE id=?").bind(orderId).first(),
    db2.prepare("SELECT * FROM suppliers WHERE id=?").bind(poi["supplier_id"]).first(),
    db2.prepare("SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id").bind(orderId).all()
  ]);
  if (order && supplier) {
    const { subject, body: mailBody } = composeMail(order, allItems.results, supplier, senderInfoFromEnv(c.env));
    await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, mailBody, orderId).run();
  }
  return c.json({ ok: true, amount });
});
app.delete("/items/:poi_id", async (c) => {
  const db2 = c.env.DB;
  const poiId = parseInt(c.req.param("poi_id"));
  if (isNaN(poiId)) return c.json({ error: "\u4E0D\u6B63\u306AID\u3067\u3059\u3002" }, 400);
  const poi = await db2.prepare(
    "SELECT poi.*, po.status FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.id=?"
  ).bind(poiId).first();
  if (!poi) return c.json({ error: "\u660E\u7D30\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }, 404);
  const status = String(poi["status"] ?? "");
  if (status !== "draft_created" && status !== "pool") {
    return c.json({ error: "\u4E0B\u66F8\u304D\u307E\u305F\u306F\u30D7\u30FC\u30EB\u72B6\u614B\u306E\u767A\u6CE8\u306E\u307F\u524A\u9664\u3067\u304D\u307E\u3059\u3002" }, 400);
  }
  const received = await db2.prepare(
    "SELECT COALESCE(SUM(received_quantity),0) AS total FROM receipt_items WHERE purchase_order_item_id=?"
  ).bind(poiId).first();
  if ((received?.total ?? 0) > 0) {
    return c.json({ error: "\u5165\u8377\u6E08\u307F\u660E\u7D30\u306F\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3002" }, 400);
  }
  await db2.prepare("DELETE FROM purchase_order_items WHERE id=?").bind(poiId).run();
  const orderId = Number(poi["purchase_order_id"]);
  const [order, supplier, allItems] = await Promise.all([
    db2.prepare("SELECT * FROM purchase_orders WHERE id=?").bind(orderId).first(),
    db2.prepare("SELECT * FROM suppliers WHERE id=?").bind(poi["supplier_id"]).first(),
    db2.prepare("SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id").bind(orderId).all()
  ]);
  if (order && supplier && allItems.results.length > 0) {
    const { subject, body: mailBody } = composeMail(order, allItems.results, supplier, senderInfoFromEnv(c.env));
    await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, mailBody, orderId).run();
  }
  return c.json({ ok: true });
});
app.get("/pool", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const orders = await db2.prepare(`
    SELECT po.id, po.order_no, po.order_date, po.ordered_by,
           po.customer_name, po.usage_type, po.order_note,
           s.id AS supplier_id, s.name AS supplier_name,
           s.free_shipping_threshold,
           COALESCE(SUM(poi.amount),0) AS total_amount,
           COALESCE(SUM(poi.quantity),0) AS total_qty,
           COUNT(DISTINCT poi.id) AS line_count
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.status = 'pool' AND po.tenant_id = ?
    GROUP BY po.id
    ORDER BY s.name, po.id
  `).bind(tenantId).all();
  const supplierMap = /* @__PURE__ */ new Map();
  for (const o of orders.results) {
    const sid = o["supplier_id"];
    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, {
        supplier_id: sid,
        supplier_name: o["supplier_name"],
        free_shipping_threshold: o["free_shipping_threshold"],
        orders: [],
        pool_total: 0
      });
    }
    const g = supplierMap.get(sid);
    g.orders.push(o);
    g.pool_total += o["total_amount"];
  }
  return c.json({ groups: Array.from(supplierMap.values()) });
});
app.get("/pool/items/:order_id", async (c) => {
  const db2 = c.env.DB;
  const orderId = parseInt(c.req.param("order_id"));
  const items = await db2.prepare(`
    SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id
  `).bind(orderId).all();
  return c.json({ items: items.results });
});
app.post("/pool/execute", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const body = await c.req.json();
  const ids = body.order_ids || [];
  if (ids.length === 0) return c.json({ error: "\u767A\u6CE8ID\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  for (const id of ids) {
    const order = await db2.prepare(
      `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method
       FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=? AND po.tenant_id=?`
    ).bind(id, tenantId).first();
    const items = await db2.prepare(
      "SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id"
    ).bind(id).all();
    const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(order?.["supplier_id"], tenantId).first();
    if (order && supplier) {
      const { subject, body: emailBody } = composeMail(order, items.results, supplier, senderInfoFromEnv(c.env));
      await db2.prepare(
        "UPDATE purchase_orders SET status=?, email_subject=?, email_body=? WHERE id=?"
      ).bind("draft_created", subject, emailBody, id).run();
    } else {
      await db2.prepare("UPDATE purchase_orders SET status=? WHERE id=?").bind("draft_created", id).run();
    }
  }
  const batchCode = nowCode() + "-pool-" + Math.random().toString(36).substring(2, 6);
  for (const id of ids) {
    await db2.prepare("UPDATE purchase_orders SET batch_code=? WHERE id=?").bind(batchCode, id).run();
  }
  return c.json({ ok: true, batch_code: batchCode, count: ids.length });
});
app.delete("/pool/:order_id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("order_id"));
  const tenantId = getTenantId(c);
  await db2.prepare("DELETE FROM purchase_order_items WHERE purchase_order_id=?").bind(id).run();
  await db2.prepare("DELETE FROM purchase_orders WHERE id=? AND status=? AND tenant_id=?").bind(id, "pool", tenantId).run();
  return c.json({ ok: true });
});
app.get("/mail-batch/:batch_code", async (c) => {
  const db2 = c.env.DB;
  const batchCode = c.req.param("batch_code");
  const tenantId = getTenantId(c);
  const orders = await db2.prepare(
    `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.batch_code = ? AND po.tenant_id = ?
       ORDER BY po.id`
  ).bind(batchCode, tenantId).all();
  const result = [];
  for (const order of orders.results) {
    const items = await db2.prepare("SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id").bind(order["id"]).all();
    result.push({
      order: { ...order, status_label: statusLabel(order["status"]) },
      items: items.results.map((r) => ({
        ...r,
        unit_price_yen: yen(r["unit_price"]),
        amount_yen: yen(r["amount"])
      }))
    });
  }
  return c.json({ batch_code: batchCode, orders: result });
});
app.get("/receipts", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const rows = await db2.prepare(
    `SELECT r.*, po.order_no, s.name AS supplier_name
       FROM receipts r
       LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE r.tenant_id = ?
       ORDER BY r.id DESC
       LIMIT 200`
  ).bind(tenantId).all();
  return c.json({ rows: rows.results });
});
app.post("/receipts", async (c) => {
  const db2 = c.env.DB;
  const body = await c.req.json();
  const orderId = body.order_id;
  const receivedDate = body.received_date || today();
  const slipDate = body.slip_date || null;
  const inspectedBy = normalize(body.inspected_by);
  const note = normalize(body.note);
  const noSlip = body.no_slip ? 1 : 0;
  const slipVerified = slipDate || noSlip ? 1 : 0;
  const slipNote = normalize(body.slip_note);
  const actualSupplierId = body.actual_supplier_id ?? null;
  const tenantId = getTenantId(c);
  const validItems = (body.items || []).filter((i) => i.received_quantity > 0);
  const allPoiIds = validItems.map((i) => i.purchase_order_item_id);
  const poiMap = /* @__PURE__ */ new Map();
  const parallelChecks = [];
  if (actualSupplierId) {
    parallelChecks.push(
      db2.prepare("SELECT id FROM suppliers WHERE id=? AND tenant_id=?").bind(actualSupplierId, tenantId).first().then((sup) => {
        if (!sup) throw new Error("\u6307\u5B9A\u3057\u305F\u4ED5\u5165\u5148\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002");
      })
    );
  }
  if (allPoiIds.length > 0) {
    const inClause = allPoiIds.map(() => "?").join(",");
    parallelChecks.push(
      db2.prepare(`SELECT id, list_price, unit_price FROM purchase_order_items WHERE id IN (${inClause})`).bind(...allPoiIds).all().then((rows) => {
        for (const p of rows.results) poiMap.set(p.id, p);
      })
    );
  }
  try {
    await Promise.all(parallelChecks);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "\u5165\u529B\u30A8\u30E9\u30FC" }, 400);
  }
  const ins = await db2.prepare(
    `INSERT INTO receipts
        (purchase_order_id, received_date, slip_date, inspected_by, note,
         slip_verified, no_slip, slip_note, actual_supplier_id,
         slip_checked_by, slip_checked_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderId,
    receivedDate,
    slipDate,
    inspectedBy,
    note,
    slipVerified,
    noSlip,
    slipNote,
    actualSupplierId,
    inspectedBy,
    slipVerified ? (/* @__PURE__ */ new Date()).toISOString() : null,
    tenantId
  ).run();
  const receiptId = ins.meta.last_row_id;
  let added = 0;
  const itemStmts = [];
  for (const item of validItems) {
    const poi = poiMap.get(item.purchase_order_item_id);
    const listPrice = poi?.list_price ?? null;
    const actualUnitPrice = item.actual_unit_price != null ? Number(item.actual_unit_price) : poi?.unit_price ?? null;
    const actualRate = actualUnitPrice != null && listPrice != null && listPrice > 0 ? Math.round(actualUnitPrice / listPrice * 1e4) / 1e4 : null;
    const actualAmount = actualUnitPrice != null ? Math.round(actualUnitPrice * item.received_quantity) : null;
    itemStmts.push(
      db2.prepare(
        `INSERT INTO receipt_items
          (receipt_id, purchase_order_item_id, received_quantity, note,
           actual_unit_price, actual_rate, actual_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        receiptId,
        item.purchase_order_item_id,
        item.received_quantity,
        normalize(item.note),
        actualUnitPrice,
        actualRate,
        actualAmount
      )
    );
    added += item.received_quantity;
  }
  await Promise.all([
    itemStmts.length > 0 ? db2.batch(itemStmts) : Promise.resolve(),
    updateOrderStatus(db2, orderId)
  ]);
  return c.json({ ok: true, receipt_id: receiptId, added_quantity: added });
});
app.put("/receipts/:id", async (c) => {
  const db2 = c.env.DB;
  const receiptId = parseInt(c.req.param("id"));
  if (isNaN(receiptId)) return c.json({ error: "\u4E0D\u6B63\u306AID\u3067\u3059\u3002" }, 400);
  const body = await c.req.json();
  const tenantId = getTenantId(c);
  const [receipt, existingItems] = await Promise.all([
    db2.prepare("SELECT id, purchase_order_id FROM receipts WHERE id=? AND tenant_id=?").bind(receiptId, tenantId).first(),
    db2.prepare("SELECT id, purchase_order_item_id FROM receipt_items WHERE receipt_id=?").bind(receiptId).all()
  ]);
  if (!receipt) return c.json({ error: "\u7D0D\u54C1\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }, 404);
  if (body.actual_supplier_id != null) {
    const sup = await db2.prepare("SELECT id FROM suppliers WHERE id=? AND tenant_id=?").bind(body.actual_supplier_id, tenantId).first();
    if (!sup) return c.json({ error: "\u6307\u5B9A\u3057\u305F\u4ED5\u5165\u5148\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }, 400);
  }
  const poiMap = /* @__PURE__ */ new Map();
  for (const ri of existingItems.results) poiMap.set(ri.id, ri.purchase_order_item_id);
  const poiIdsForPrice = [];
  for (const item of body.items || []) {
    if (item.actual_unit_price == null) continue;
    const poiId = poiMap.get(item.receipt_item_id);
    if (poiId) poiIdsForPrice.push(poiId);
  }
  const poiPriceMap = /* @__PURE__ */ new Map();
  if (poiIdsForPrice.length > 0) {
    const inClause = poiIdsForPrice.map(() => "?").join(",");
    const poiRows = await db2.prepare(
      `SELECT id, list_price, quantity FROM purchase_order_items WHERE id IN (${inClause})`
    ).bind(...poiIdsForPrice).all();
    for (const p of poiRows.results) poiPriceMap.set(p.id, p);
  }
  const updatePromises = [];
  const sets = [];
  const binds = [];
  if (body.received_date !== void 0) {
    sets.push("received_date=?");
    binds.push(body.received_date);
  }
  if (body.slip_date !== void 0) {
    sets.push("slip_date=?");
    binds.push(body.slip_date || null);
  }
  if (body.inspected_by !== void 0) {
    sets.push("inspected_by=?");
    binds.push(normalize(body.inspected_by));
  }
  if (body.note !== void 0) {
    sets.push("note=?");
    binds.push(normalize(body.note));
  }
  if (body.slip_note !== void 0) {
    sets.push("slip_note=?");
    binds.push(normalize(body.slip_note));
  }
  if (body.no_slip !== void 0) {
    const noSlipVal = body.no_slip ? 1 : 0;
    sets.push("no_slip=?");
    binds.push(noSlipVal);
    if (body.no_slip) {
      sets.push("slip_verified=?");
      binds.push(1);
    }
  }
  const autoVerify = !!body.no_slip || !!(body.slip_date && body.slip_date.length > 0);
  if (!body.no_slip) {
    if (body.slip_verified !== void 0 || autoVerify) {
      const verifiedVal = autoVerify ? 1 : body.slip_verified ? 1 : 0;
      sets.push("slip_verified=?");
      binds.push(verifiedVal);
    }
  }
  const willBeVerified = autoVerify || body.slip_verified || body.no_slip;
  if (willBeVerified) {
    if (body.slip_checked_by !== void 0) {
      sets.push("slip_checked_by=?");
      binds.push(normalize(body.slip_checked_by));
    }
    sets.push("slip_checked_at=?");
    binds.push((/* @__PURE__ */ new Date()).toISOString());
  } else if (body.slip_verified === false && !body.no_slip) {
    sets.push("slip_checked_by=?");
    binds.push(null);
    sets.push("slip_checked_at=?");
    binds.push(null);
  }
  if (body.actual_supplier_id !== void 0) {
    sets.push("actual_supplier_id=?");
    binds.push(body.actual_supplier_id ?? null);
  }
  if (sets.length) {
    binds.push(receiptId);
    updatePromises.push(
      db2.prepare(`UPDATE receipts SET ${sets.join(",")} WHERE id=?`).bind(...binds).run()
    );
  }
  const itemStmtsPut = [];
  for (const item of body.items || []) {
    if (!item.receipt_item_id) continue;
    const poiId = poiMap.get(item.receipt_item_id);
    const poiData = poiId ? poiPriceMap.get(poiId) : void 0;
    const listPrice = poiData?.list_price ?? null;
    if (item.actual_unit_price != null) {
      const actualUnitPrice = Number(item.actual_unit_price);
      const actualRate = listPrice != null && listPrice > 0 ? Math.round(actualUnitPrice / listPrice * 1e4) / 1e4 : null;
      const actualAmount = Math.round(actualUnitPrice * item.received_quantity);
      itemStmtsPut.push(
        db2.prepare(
          `UPDATE receipt_items SET received_quantity=?, note=?,
           actual_unit_price=?, actual_rate=?, actual_amount=?
           WHERE id=? AND receipt_id=?`
        ).bind(
          item.received_quantity,
          normalize(item.note),
          actualUnitPrice,
          actualRate,
          actualAmount,
          item.receipt_item_id,
          receiptId
        )
      );
    } else {
      itemStmtsPut.push(
        db2.prepare("UPDATE receipt_items SET received_quantity=?, note=? WHERE id=? AND receipt_id=?").bind(item.received_quantity, normalize(item.note), item.receipt_item_id, receiptId)
      );
    }
  }
  if (itemStmtsPut.length > 0) {
    updatePromises.push(db2.batch(itemStmtsPut));
  }
  if (receipt.purchase_order_id) {
    updatePromises.push(updateOrderStatus(db2, receipt.purchase_order_id));
  }
  await Promise.all(updatePromises);
  return c.json({ ok: true });
});
app.get("/receipts/slip-status", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const rows = await db2.prepare(`
    SELECT
      SUM(CASE WHEN slip_verified=1 OR no_slip=1 THEN 1 ELSE 0 END) AS checked,
      SUM(CASE WHEN slip_verified=0 AND no_slip=0 THEN 1 ELSE 0 END) AS unchecked,
      SUM(CASE WHEN no_slip=1 THEN 1 ELSE 0 END) AS no_slip_count,
      COUNT(*) AS total
    FROM receipts WHERE tenant_id=?
  `).bind(tenantId).first();
  return c.json(rows);
});
app.post("/receipts/free", async (c) => {
  const db2 = c.env.DB;
  const body = await c.req.json();
  if (!body.supplier_id) return c.json({ error: "\u4ED5\u5165\u5148\u306F\u5FC5\u9808\u3067\u3059\u3002" }, 400);
  if (!body.items || body.items.length === 0) return c.json({ error: "\u660E\u7D30\u304C\u7A7A\u3067\u3059\u3002" }, 400);
  const receivedDate = body.received_date || today();
  const slipDate = body.slip_date || null;
  const inspectedBy = normalize(body.inspected_by);
  const note = normalize(body.note);
  const noSlip = body.no_slip ? 1 : 0;
  const slipVerified = slipDate || noSlip ? 1 : 0;
  const slipNote = normalize(body.slip_note);
  const tenantId = getTenantId(c);
  const ins = await db2.prepare(
    `INSERT INTO receipts
      (purchase_order_id, received_date, slip_date, inspected_by, note,
       slip_verified, no_slip, slip_note,
       slip_checked_by, slip_checked_at, tenant_id)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    receivedDate,
    slipDate,
    inspectedBy,
    note,
    slipVerified,
    noSlip,
    slipNote,
    inspectedBy,
    slipVerified ? (/* @__PURE__ */ new Date()).toISOString() : null,
    tenantId
  ).run();
  const receiptId = ins.meta.last_row_id;
  const freeItemStmts = [];
  for (const item of body.items) {
    if (!item.product_name?.trim() || !(item.quantity > 0)) continue;
    const itemNote = [item.product_name.trim(), item.spec?.trim(), item.note?.trim()].filter(Boolean).join(" / ");
    const actualUnitPrice = item.unit_price != null ? Number(item.unit_price) : null;
    const actualAmount = actualUnitPrice != null ? Math.round(actualUnitPrice * item.quantity) : null;
    freeItemStmts.push(
      db2.prepare(
        `INSERT INTO receipt_items
          (receipt_id, purchase_order_item_id, received_quantity, note,
           actual_unit_price, actual_rate, actual_amount)
         VALUES (?, NULL, ?, ?, ?, NULL, ?)`
      ).bind(receiptId, item.quantity, itemNote, actualUnitPrice, actualAmount)
    );
  }
  if (freeItemStmts.length > 0) {
    await db2.batch(freeItemStmts);
  }
  return c.json({ ok: true, receipt_id: receiptId });
});
app.get("/backorders", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const rows = await db2.prepare(
    `SELECT po.order_no, po.order_date, po.customer_name, po.usage_type, po.requested_delivery_date,
              po.id AS purchase_order_id,
              s.name AS supplier_name,
              poi.*,
              COALESCE(SUM(ri.received_quantity), 0) AS received_qty,
              (poi.quantity - COALESCE(SUM(ri.received_quantity), 0)) AS backorder_qty,
              MAX(r.received_date) AS last_received_date
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.purchase_order_id = po.id
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
       LEFT JOIN receipts r ON ri.receipt_id = r.id
       WHERE po.tenant_id = ?
       GROUP BY poi.id
       HAVING COALESCE(SUM(ri.received_quantity), 0) < poi.quantity
       ORDER BY po.order_date DESC, po.order_no DESC`
  ).bind(tenantId).all();
  return c.json({ rows: rows.results });
});
app.get("/products-for-order", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const rows = await db2.prepare(
    `SELECT p.id, p.item_category, p.manufacturer, p.name, p.spec, p.club_type,
              p.list_price, p.default_rate, s.name AS supplier_name
       FROM products p
       LEFT JOIN suppliers s ON p.default_supplier_id = s.id
       WHERE p.is_active = 1 AND p.tenant_id = ?
       ORDER BY p.item_category, p.manufacturer, p.name
       LIMIT 5000`
  ).bind(tenantId).all();
  return c.json({ products: rows.results });
});
app.get("/receipts/download", async (c) => {
  const db2 = c.env.DB;
  const from = c.req.query("from") || "";
  const to = c.req.query("to") || "";
  const supplierId = c.req.query("supplier_id") || "";
  const tenantId = getTenantId(c);
  let sql = `
    SELECT
      po.order_date,
      po.ordered_by,
      po.order_no,
      COALESCE(sa.name, s.name) AS supplier_name,
      s.payment_method,
      po.customer_name,
      po.usage_type,
      r.received_date,
      r.slip_date,
      r.inspected_by,
      poi.item_category,
      poi.manufacturer,
      poi.product_name,
      poi.spec,
      poi.color,
      poi.club_type,
      ri.received_quantity,
      poi.list_price,
      -- \u5B9F\u969B\u306E\u639B\u7387: receipt_items.actual_rate > poi.rate \u306E\u512A\u5148\u9806
      COALESCE(ri.actual_rate,  poi.rate)       AS used_rate,
      -- \u5B9F\u969B\u306E\u5358\u4FA1: receipt_items.actual_unit_price > poi.unit_price \u306E\u512A\u5148\u9806
      COALESCE(ri.actual_unit_price, poi.unit_price) AS used_unit_price,
      -- \u5B9F\u969B\u306E\u91D1\u984D: receipt_items.actual_amount > \u8A08\u7B97\u5024 \u306E\u512A\u5148\u9806
      COALESCE(ri.actual_amount,
               ri.received_quantity * poi.unit_price) AS used_amount,
      ri.note             AS item_note,
      r.note              AS receipt_note
    FROM receipt_items ri
    JOIN receipts r             ON ri.receipt_id = r.id
    JOIN purchase_orders po     ON r.purchase_order_id = po.id
    JOIN suppliers s            ON po.supplier_id = s.id
    LEFT JOIN suppliers sa      ON r.actual_supplier_id = sa.id
    JOIN purchase_order_items poi ON ri.purchase_order_item_id = poi.id
    WHERE r.tenant_id = ?`;
  const binds = [tenantId];
  if (from) {
    sql += ` AND r.received_date >= ?`;
    binds.push(from);
  }
  if (to) {
    sql += ` AND r.received_date <= ?`;
    binds.push(to);
  }
  if (supplierId) {
    sql += ` AND (po.supplier_id = ? OR r.actual_supplier_id = ?)`;
    binds.push(Number(supplierId));
    binds.push(Number(supplierId));
  }
  sql += ` ORDER BY r.received_date DESC, r.id DESC, poi.id ASC`;
  const res = await db2.prepare(sql).bind(...binds).all();
  const data = res.results;
  function fmtDate(v) {
    if (!v) return "";
    const s = String(v).trim();
    const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    return s;
  }
  const HEADERS = [
    "\u6CE8\u6587\u65E5",
    //  0
    "\u6CE8\u6587\u8005",
    //  1
    "\u54C1\u76EE",
    //  2
    "\u30E1\u30FC\u30AB\u30FC\u540D",
    //  3
    "\u54C1\u540D",
    //  4
    "\u500B\u6570",
    //  5
    "\u767A\u6CE8\u5148",
    //  6
    "\u5099\u8003",
    //  7  ← 商品備考(item_note)
    "\u9867\u5BA2\u540D",
    //  8
    "\u5546\u54C1\u5230\u7740\u65E5",
    //  9
    "\u691C\u54C1\u8005",
    // 10
    "\u7D0D\u54C1\u66F8\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u65E5",
    // 11
    "\u5B9A\u4FA1",
    // 12
    "\u639B\u3051\u7387",
    // 13
    "\u5358\u4FA1",
    // 14
    "\u500B\u6570",
    // 15  ← 入荷数の再掲
    "\u91D1\u984D",
    // 16
    "\u652F\u6255\u3044",
    // 17  ← DB未管理（空欄）
    "\u5099\u8003",
    // 18  ← 納品備考(receipt_note)
    "\u9001\u6599",
    // 19  ← DB未管理（空欄）
    // ── 追加情報（指定列の後ろ）──
    "\u767A\u6CE8\u756A\u53F7",
    // 20
    "\u4ED5\u69D8",
    // 21
    "\u8272",
    // 22
    "\u7A2E\u985E",
    // 23
    "\u7528\u9014"
    // 24
  ];
  const headerRow = {
    cells: HEADERS,
    rowStyle: 1
  };
  const dataRows = data.map((r) => ({
    cells: [
      fmtDate(r["order_date"]),
      //  0 注文日
      r["ordered_by"],
      //  1 注文者
      r["item_category"],
      //  2 品目
      r["manufacturer"],
      //  3 メーカー名
      r["product_name"],
      //  4 品名
      r["received_quantity"] != null ? Number(r["received_quantity"]) : null,
      //  5 個数
      r["supplier_name"],
      //  6 発注先
      r["item_note"],
      //  7 備考（商品備考）
      r["customer_name"],
      //  8 顧客名
      fmtDate(r["received_date"]),
      //  9 商品到着日
      r["inspected_by"],
      // 10 検品者
      fmtDate(r["slip_date"]),
      // 11 納品書に記載されている日
      r["list_price"] != null ? Number(r["list_price"]) : null,
      // 12 定価
      r["used_rate"] != null ? Number(r["used_rate"]) : null,
      // 13 掛け率（実績優先）
      r["used_unit_price"] != null ? Number(r["used_unit_price"]) : null,
      // 14 単価（実績優先）
      r["received_quantity"] != null ? Number(r["received_quantity"]) : null,
      // 15 個数（再掲）
      r["used_amount"] != null ? Number(r["used_amount"]) : null,
      // 16 金額（実績優先）
      r["payment_method"] ?? null,
      // 17 支払い（仕入先マスタから）
      r["receipt_note"],
      // 18 備考（納品備考）
      null,
      // 19 送料（未管理）
      r["order_no"],
      // 20 発注番号
      r["spec"],
      // 21 仕様
      r["color"],
      // 22 色
      r["club_type"],
      // 23 種類
      r["usage_type"]
      // 24 用途
    ],
    //         0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
    styles: [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 3, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0]
  }));
  const totalQty = data.reduce((s, r) => s + (Number(r["received_quantity"]) || 0), 0);
  const totalAmount = data.reduce((s, r) => s + (Number(r["used_amount"]) || 0), 0);
  const TOTAL_COLS = HEADERS.length;
  const totalCells = Array(TOTAL_COLS).fill(null);
  totalCells[0] = "\u5408\u8A08";
  totalCells[5] = totalQty;
  totalCells[15] = totalQty;
  totalCells[16] = totalAmount;
  const totalRow = {
    cells: totalCells,
    styles: Array(TOTAL_COLS).fill(5)
  };
  const colWidths = [
    { col: 0, width: 12 },
    // 注文日
    { col: 1, width: 14 },
    // 注文者
    { col: 2, width: 12 },
    // 品目
    { col: 3, width: 22 },
    // メーカー名
    { col: 4, width: 30 },
    // 品名
    { col: 5, width: 8 },
    // 個数
    { col: 6, width: 22 },
    // 発注先
    { col: 7, width: 20 },
    // 備考（商品）
    { col: 8, width: 16 },
    // 顧客名
    { col: 9, width: 12 },
    // 商品到着日
    { col: 10, width: 10 },
    // 検品者
    { col: 11, width: 18 },
    // 納品書に記載されている日
    { col: 12, width: 10 },
    // 定価
    { col: 13, width: 8 },
    // 掛け率
    { col: 14, width: 10 },
    // 単価
    { col: 15, width: 8 },
    // 個数（再掲）
    { col: 16, width: 12 },
    // 金額
    { col: 17, width: 10 },
    // 支払い
    { col: 18, width: 20 },
    // 備考（納品）
    { col: 19, width: 8 },
    // 送料
    { col: 20, width: 22 },
    // 発注番号
    { col: 21, width: 20 },
    // 仕様
    { col: 22, width: 10 },
    // 色
    { col: 23, width: 10 },
    // 種類
    { col: 24, width: 10 }
    // 用途
  ];
  const xlsxBytes = buildXlsx([headerRow, ...dataRows, totalRow], colWidths);
  const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo"
  }).replace(/\//g, "");
  const filename = encodeURIComponent(`\u7D0D\u54C1\u5C65\u6B74_${dateStr}.xlsx`);
  return new Response(xlsxBytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Content-Length": String(xlsxBytes.length)
    }
  });
});
app.post("/suppliers", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  const r = await db2.prepare(`
    INSERT INTO suppliers
      (name, alias_names, contact_name, honorific, order_method, order_method_detail,
       phone, fax, fax_number, email, cc_emails, line_id, line_group_id,
       payment_method, shipping_rule, free_shipping_threshold, website, postal_code, address, notes, is_active, updated_at, tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,?)
  `).bind(
    normalize(b2["name"]),
    normalize(b2["alias_names"]),
    normalize(b2["contact_name"]),
    normalize(b2["honorific"]) || "\u69D8",
    normalize(b2["order_method"]),
    normalize(b2["order_method_detail"]),
    normalize(b2["phone"]),
    normalize(b2["fax"]),
    normalize(b2["fax_number"]),
    normalize(b2["email"]),
    normalize(b2["cc_emails"]),
    normalize(b2["line_id"]),
    normalize(b2["line_group_id"]),
    normalize(b2["payment_method"]),
    normalize(b2["shipping_rule"]),
    b2["free_shipping_threshold"] ? parseInt(b2["free_shipping_threshold"]) : null,
    normalize(b2["website"]),
    normalize(b2["postal_code"]),
    normalize(b2["address"]),
    normalize(b2["notes"]),
    tenantId
  ).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});
app.put("/suppliers/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  await db2.prepare(`
    UPDATE suppliers SET
      name=?, alias_names=?, contact_name=?, honorific=?, order_method=?, order_method_detail=?,
      phone=?, fax=?, fax_number=?, email=?, cc_emails=?, line_id=?, line_group_id=?,
      payment_method=?, shipping_rule=?, free_shipping_threshold=?, website=?, postal_code=?, address=?, notes=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(b2["name"]),
    normalize(b2["alias_names"]),
    normalize(b2["contact_name"]),
    normalize(b2["honorific"]) || "\u69D8",
    normalize(b2["order_method"]),
    normalize(b2["order_method_detail"]),
    normalize(b2["phone"]),
    normalize(b2["fax"]),
    normalize(b2["fax_number"]),
    normalize(b2["email"]),
    normalize(b2["cc_emails"]),
    normalize(b2["line_id"]),
    normalize(b2["line_group_id"]),
    normalize(b2["payment_method"]),
    normalize(b2["shipping_rule"]),
    b2["free_shipping_threshold"] ? parseInt(b2["free_shipping_threshold"]) : null,
    normalize(b2["website"]),
    normalize(b2["postal_code"]),
    normalize(b2["address"]),
    normalize(b2["notes"]),
    id,
    tenantId
  ).run();
  return c.json({ ok: true });
});
app.delete("/suppliers/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  await db2.prepare("UPDATE suppliers SET is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(id, tenantId).run();
  return c.json({ ok: true });
});
app.get("/product-suppliers/:product_id", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const productId = parseInt(c.req.param("product_id"));
  if (isNaN(productId)) return c.json({ error: "\u4E0D\u6B63\u306AID" }, 400);
  const rows = await db2.prepare(`
    SELECT ps.*, s.name AS supplier_name
    FROM product_suppliers ps
    JOIN suppliers s ON ps.supplier_id=s.id
    WHERE ps.product_id=? AND ps.tenant_id=?
    ORDER BY ps.is_default DESC, ps.sort_order ASC, ps.id ASC
  `).bind(productId, tenantId).all();
  return c.json(rows.results);
});
app.post("/product-suppliers", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  const productId = parseInt(String(b2["product_id"] || ""));
  const supplierId = parseInt(String(b2["supplier_id"] || ""));
  if (isNaN(productId) || isNaN(supplierId)) return c.json({ error: "\u4E0D\u6B63\u306AID" }, 400);
  if (b2["is_default"]) {
    await db2.prepare("UPDATE product_suppliers SET is_default=0 WHERE product_id=? AND tenant_id=?").bind(productId, tenantId).run();
  }
  const r = await db2.prepare(`
    INSERT INTO product_suppliers (product_id, supplier_id, rate, is_default, notes, sort_order, tenant_id)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    productId,
    supplierId,
    b2["rate"] ? parseFloat(String(b2["rate"])) : null,
    b2["is_default"] ? 1 : 0,
    b2["notes"] ? String(b2["notes"]) : null,
    b2["sort_order"] ? parseInt(String(b2["sort_order"])) : 0,
    tenantId
  ).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});
app.put("/product-suppliers/:id", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const id = parseInt(c.req.param("id"));
  const b2 = await c.req.json();
  if (b2["is_default"]) {
    const ps = await db2.prepare("SELECT product_id FROM product_suppliers WHERE id=? AND tenant_id=?").bind(id, tenantId).first();
    if (ps) {
      await db2.prepare("UPDATE product_suppliers SET is_default=0 WHERE product_id=? AND tenant_id=?").bind(ps.product_id, tenantId).run();
    }
  }
  const supplierId = b2["supplier_id"] ? parseInt(String(b2["supplier_id"])) : null;
  if (!supplierId || supplierId === 0) {
    await db2.prepare("UPDATE product_suppliers SET is_default=? WHERE id=? AND tenant_id=?").bind(b2["is_default"] ? 1 : 0, id, tenantId).run();
  } else {
    await db2.prepare(`
      UPDATE product_suppliers SET supplier_id=?, rate=?, is_default=?, notes=?, sort_order=?
      WHERE id=? AND tenant_id=?
    `).bind(
      supplierId,
      b2["rate"] != null ? parseFloat(String(b2["rate"])) : null,
      b2["is_default"] ? 1 : 0,
      b2["notes"] ? String(b2["notes"]) : null,
      b2["sort_order"] ? parseInt(String(b2["sort_order"])) : 0,
      id,
      tenantId
    ).run();
  }
  return c.json({ ok: true });
});
app.delete("/product-suppliers/:id", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const id = parseInt(c.req.param("id"));
  await db2.prepare("DELETE FROM product_suppliers WHERE id=? AND tenant_id=?").bind(id, tenantId).run();
  return c.json({ ok: true });
});
app.get("/products/:id/suppliers", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const productId = parseInt(c.req.param("id"));
  if (isNaN(productId)) return c.json({ error: "\u4E0D\u6B63\u306AID" }, 400);
  const rows = await db2.prepare(`
    SELECT ps.supplier_id, s.name AS supplier_name, ps.rate, ps.is_default, ps.notes
    FROM product_suppliers ps
    JOIN suppliers s ON ps.supplier_id=s.id
    WHERE ps.product_id=? AND ps.tenant_id=?
    ORDER BY ps.is_default DESC, ps.sort_order ASC
  `).bind(productId, tenantId).all();
  if (rows.results.length > 0) {
    return c.json(rows.results);
  }
  const prod = await db2.prepare(`
    SELECT p.default_supplier_id AS supplier_id, s.name AS supplier_name, p.default_rate AS rate
    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
    WHERE p.id=? AND p.tenant_id=?
  `).bind(productId, tenantId).first();
  return c.json(prod?.supplier_id ? [{ ...prod, is_default: 1, notes: null }] : []);
});
app.post("/products", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  const r = await db2.prepare(`
    INSERT INTO products
      (product_code, barcode, item_category, manufacturer, name, spec, color, club_type,
       list_price, default_rate, default_supplier_id, unit, source, is_active, tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
  `).bind(
    normalize(b2["product_code"]),
    normalize(b2["barcode"]),
    normalize(b2["item_category"]),
    normalize(b2["manufacturer"]),
    normalize(b2["name"]),
    normalize(b2["spec"]),
    normalize(b2["color"]),
    normalize(b2["club_type"]),
    b2["list_price"] ? Number(b2["list_price"]) : null,
    b2["default_rate"] ? Number(b2["default_rate"]) : null,
    b2["default_supplier_id"] ? Number(b2["default_supplier_id"]) : null,
    normalize(b2["unit"]) || "\u672C",
    normalize(b2["source"]),
    tenantId
  ).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});
app.get("/products/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const row = await db2.prepare(
    `SELECT p.*, s.name AS supplier_name FROM products p
     LEFT JOIN suppliers s ON s.id = p.default_supplier_id
     WHERE p.id=? AND p.is_active=1 AND p.tenant_id=?`
  ).bind(id, tenantId).first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});
app.put("/products/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  await db2.prepare(`
    UPDATE products SET
      product_code=?, barcode=?, item_category=?, manufacturer=?, name=?, spec=?, color=?, club_type=?,
      list_price=?, default_rate=?, default_supplier_id=?, unit=?, source=?
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(b2["product_code"]),
    normalize(b2["barcode"]),
    normalize(b2["item_category"]),
    normalize(b2["manufacturer"]),
    normalize(b2["name"]),
    normalize(b2["spec"]),
    normalize(b2["color"]),
    normalize(b2["club_type"]),
    b2["list_price"] ? Number(b2["list_price"]) : null,
    b2["default_rate"] ? Number(b2["default_rate"]) : null,
    b2["default_supplier_id"] ? Number(b2["default_supplier_id"]) : null,
    normalize(b2["unit"]) || "\u672C",
    normalize(b2["source"]),
    id,
    tenantId
  ).run();
  return c.json({ ok: true });
});
app.delete("/products/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  await db2.prepare("UPDATE products SET is_active=0 WHERE id=? AND tenant_id=?").bind(id, tenantId).run();
  return c.json({ ok: true });
});
app.post("/products/bulk-update", async (c) => {
  const db2 = c.env.DB;
  const body = await c.req.json();
  const { ids, fields } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: "\u5BFE\u8C61ID\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093" }, 400);
  }
  if (ids.length > 500) {
    return c.json({ error: "\u4E00\u5EA6\u306B\u7DE8\u96C6\u3067\u304D\u308B\u306E\u306F500\u4EF6\u307E\u3067\u3067\u3059" }, 400);
  }
  const ALLOWED = {
    manufacturer: (v) => String(v ?? "").trim() || null,
    item_category: (v) => String(v ?? "").trim() || null,
    club_type: (v) => String(v ?? "").trim() || null,
    default_rate: (v) => {
      const n = parseFloat(String(v));
      return isNaN(n) ? null : Math.min(1, Math.max(0, n));
    },
    list_price: (v) => {
      const n = parseFloat(String(v).replace(/,/g, ""));
      return isNaN(n) ? null : n;
    },
    default_supplier_id: (v) => {
      const n = parseInt(String(v));
      return isNaN(n) ? null : n;
    },
    unit: (v) => String(v ?? "").trim() || null
  };
  const setClauses = [];
  const setValues = [];
  for (const [key, converter] of Object.entries(ALLOWED)) {
    if (key in fields && fields[key] !== "" && fields[key] !== null && fields[key] !== void 0) {
      const val = converter(fields[key]);
      if (val !== null) {
        setClauses.push(`${key}=?`);
        setValues.push(val);
      }
    }
  }
  if (setClauses.length === 0) {
    return c.json({ error: "\u66F4\u65B0\u3059\u308B\u9805\u76EE\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093" }, 400);
  }
  const tenantId = getTenantId(c);
  const placeholders = ids.map(() => "?").join(",");
  const sql = `UPDATE products SET ${setClauses.join(", ")} WHERE id IN (${placeholders}) AND tenant_id=?`;
  await db2.prepare(sql).bind(...setValues, ...ids, tenantId).run();
  return c.json({ ok: true, updated: ids.length });
});
app.post("/products/bulk-import", async (c) => {
  const db2 = c.env.DB;
  const body = await c.req.json();
  const rows = body.rows;
  const mode = body.mode === "upsert" ? "upsert" : "insert";
  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: "rows \u304C\u7A7A\u3067\u3059" }, 400);
  }
  if (rows.length > 1e3) {
    return c.json({ error: "\u4E00\u5EA6\u306B\u767B\u9332\u3067\u304D\u308B\u306E\u306F1,000\u4EF6\u307E\u3067\u3067\u3059" }, 400);
  }
  const n = (v) => normalize(v);
  const num = (v) => {
    const x = Number(String(v ?? "").replace(/,/g, "").trim());
    return isNaN(x) ? null : x;
  };
  const supplierCache = /* @__PURE__ */ new Map();
  const tenantId = getTenantId(c);
  const resolveSupplierName = async (nameRaw) => {
    const key = nameRaw.trim();
    if (!key) return null;
    if (supplierCache.has(key)) return supplierCache.get(key);
    const exact = await db2.prepare(
      "SELECT id FROM suppliers WHERE name=? AND is_active=1 AND tenant_id=? LIMIT 1"
    ).bind(key, tenantId).first();
    if (exact) {
      supplierCache.set(key, exact.id);
      return exact.id;
    }
    const like = await db2.prepare(
      "SELECT id FROM suppliers WHERE name LIKE ? AND is_active=1 AND tenant_id=? ORDER BY length(name) LIMIT 1"
    ).bind(`%${key}%`, tenantId).first();
    const id = like?.id ?? null;
    supplierCache.set(key, id);
    return id;
  };
  const parseVariations = (raw2) => {
    const segments = raw2.split("|").map((s) => s.trim()).filter(Boolean);
    return segments.map((seg) => {
      const colonIdx = seg.indexOf(":");
      if (colonIdx >= 0) {
        const backline = seg.slice(0, colonIdx).trim();
        const colors = seg.slice(colonIdx + 1).trim();
        if (!colors) return null;
        return { backline, colors };
      } else {
        return { backline: "", colors: seg };
      }
    }).filter((x) => x !== null);
  };
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    const item_category = n(r["item_category"] ?? r["\u54C1\u76EE"]);
    const name = n(r["name"] ?? r["\u5546\u54C1\u540D"]);
    const manufacturer = n(r["manufacturer"] ?? r["\u30E1\u30FC\u30AB\u30FC"]);
    const spec = n(r["spec"] ?? r["\u4ED5\u69D8"]);
    const color = n(r["color"] ?? r["\u8272"]);
    const club_type = n(r["club_type"] ?? r["\u7A2E\u985E"]);
    const list_price = num(r["list_price"] ?? r["\u5B9A\u4FA1"]);
    const default_rate = num(r["default_rate"] ?? r["\u639B\u7387"]);
    const unit = n(r["unit"] ?? r["\u5358\u4F4D"]) || "\u672C";
    const barcode = n(r["barcode"] ?? r["\u30D0\u30FC\u30B3\u30FC\u30C9"]);
    const product_code = n(r["product_code"] ?? r["\u54C1\u756A"]);
    const source = n(r["source"] ?? r["\u51FA\u5178"]);
    const supplier_name_raw = n(
      r["supplier_name"] ?? r["\u4ED5\u5165\u5148\u540D"] ?? r["\u4ED5\u5165\u5148"] ?? r["\u767A\u6CE8\u5148"] ?? r["\u767A\u6CE8\u5148\u540D"]
    );
    const variations_raw = n(r["variations"] ?? r["\u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3"] ?? r["\u30D0\u30EA\u30A8"]);
    if (!item_category) {
      errors.push({ row: rowNum, msg: "\u54C1\u76EE\u304C\u7A7A\u3067\u3059" });
      skipped++;
      continue;
    }
    if (!name) {
      errors.push({ row: rowNum, msg: "\u5546\u54C1\u540D\u304C\u7A7A\u3067\u3059" });
      skipped++;
      continue;
    }
    if (default_rate !== null && (default_rate < 0 || default_rate > 1)) {
      errors.push({ row: rowNum, msg: `\u639B\u7387\u306F0\u301C1\u306E\u7BC4\u56F2\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044 (\u5024: ${default_rate})` });
      skipped++;
      continue;
    }
    let default_supplier_id = null;
    if (supplier_name_raw) {
      default_supplier_id = await resolveSupplierName(supplier_name_raw);
      if (default_supplier_id === null) {
        errors.push({ row: rowNum, msg: `\u4ED5\u5165\u5148\u540D "${supplier_name_raw}" \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u4ED5\u5165\u5148\u672A\u8A2D\u5B9A\u3067\u767B\u9332\u3057\u307E\u3059\uFF09` });
      }
    }
    const varItems = variations_raw ? parseVariations(variations_raw) : [];
    if (varItems.length > 0) {
      for (const v of varItems) {
        const varSpec = [spec, v.backline].filter(Boolean).join(" / ");
        const varColor = v.colors;
        try {
          if (mode === "upsert") {
            const existing = await db2.prepare(
              `SELECT id FROM products
               WHERE name=? AND manufacturer IS ? AND spec IS ? AND is_active=1 AND tenant_id=? LIMIT 1`
            ).bind(name, manufacturer || null, varSpec || null, tenantId).first();
            if (existing) {
              await db2.prepare(`
                UPDATE products SET
                  item_category=?, color=?, club_type=?,
                  list_price=?, default_rate=?, unit=?, source=?,
                  default_supplier_id=COALESCE(?, default_supplier_id)
                WHERE id=?
              `).bind(
                item_category,
                varColor || null,
                club_type || null,
                list_price,
                default_rate,
                unit,
                source || null,
                default_supplier_id,
                existing.id
              ).run();
              updated++;
              continue;
            }
          }
          await db2.prepare(`
            INSERT INTO products
              (item_category, manufacturer, name, spec, color, club_type,
               list_price, default_rate, unit, source, default_supplier_id, is_active, tenant_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)
          `).bind(
            item_category,
            manufacturer || null,
            name,
            varSpec || null,
            varColor || null,
            club_type || null,
            list_price,
            default_rate,
            unit,
            source || null,
            default_supplier_id,
            tenantId
          ).run();
          inserted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNum, msg: `\u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3 "${v.backline || "\u8272\u306E\u307F"}": ${msg}` });
          skipped++;
        }
      }
      continue;
    }
    try {
      if (mode === "upsert" && product_code) {
        const existing = await db2.prepare(
          "SELECT id FROM products WHERE product_code=? AND is_active=1 AND tenant_id=? LIMIT 1"
        ).bind(product_code, tenantId).first();
        if (existing) {
          await db2.prepare(`
            UPDATE products SET
              item_category=?, manufacturer=?, name=?, spec=?, color=?, club_type=?,
              list_price=?, default_rate=?, unit=?, barcode=?, source=?,
              default_supplier_id=COALESCE(?, default_supplier_id)
            WHERE id=?
          `).bind(
            item_category,
            manufacturer || null,
            name,
            spec || null,
            color || null,
            club_type || null,
            list_price,
            default_rate,
            unit,
            barcode || null,
            source || null,
            default_supplier_id,
            existing.id
          ).run();
          updated++;
          continue;
        }
      }
      await db2.prepare(`
        INSERT INTO products
          (product_code, barcode, item_category, manufacturer, name, spec, color, club_type,
           list_price, default_rate, unit, source, default_supplier_id, is_active, tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
      `).bind(
        product_code || null,
        barcode || null,
        item_category,
        manufacturer || null,
        name,
        spec || null,
        color || null,
        club_type || null,
        list_price,
        default_rate,
        unit,
        source || null,
        default_supplier_id,
        tenantId
      ).run();
      inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNum, msg });
      skipped++;
    }
  }
  return c.json({ ok: true, inserted, updated, skipped, errors });
});
app.post("/rules", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  const r = await db2.prepare(`
    INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes, tenant_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    normalize(b2["item_category"]) || null,
    normalize(b2["manufacturer"]) || null,
    normalize(b2["club_type"]) || null,
    Number(b2["supplier_id"]),
    b2["rate"] ? Number(b2["rate"]) : null,
    Number(b2["priority"]) || 100,
    normalize(b2["notes"]),
    tenantId
  ).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});
app.put("/rules/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const b2 = await c.req.json();
  await db2.prepare(`
    UPDATE supplier_rules SET
      item_category=?, manufacturer=?, club_type=?, supplier_id=?, rate=?, priority=?, notes=?
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(b2["item_category"]) || null,
    normalize(b2["manufacturer"]) || null,
    normalize(b2["club_type"]) || null,
    Number(b2["supplier_id"]),
    b2["rate"] ? Number(b2["rate"]) : null,
    Number(b2["priority"]) || 100,
    normalize(b2["notes"]),
    id,
    tenantId
  ).run();
  return c.json({ ok: true });
});
app.delete("/rules/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  await db2.prepare("DELETE FROM supplier_rules WHERE id=? AND tenant_id=?").bind(id, tenantId).run();
  return c.json({ ok: true });
});
app.post("/orders/:id/copy", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const src = await db2.prepare("SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?").bind(id, tenantId).first();
  if (!src) return c.json({ error: "Not found" }, 404);
  const items = await db2.prepare("SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id").bind(id).all();
  const batchCode = nowCode() + "-" + Math.random().toString(36).substring(2, 8);
  const orderNo = "PO-" + today().replace(/-/g, "") + "-" + uuid5();
  const ins = await db2.prepare(`
    INSERT INTO purchase_orders
      (batch_code, order_no, order_date, ordered_by, supplier_id, customer_name,
       usage_type, requested_delivery_date, status, order_note, tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    batchCode,
    orderNo,
    today(),
    src["ordered_by"],
    src["supplier_id"],
    src["customer_name"],
    src["usage_type"],
    src["requested_delivery_date"],
    "draft_created",
    src["order_note"],
    tenantId
  ).run();
  const newOrderId = ins.meta.last_row_id;
  for (const item of items.results) {
    await db2.prepare(`
      INSERT INTO purchase_order_items
        (purchase_order_id, product_id, item_category, manufacturer, product_name,
         spec, color, club_type, quantity, list_price, rate, unit_price, amount,
         customer_name, usage_type, requested_delivery_date, line_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      newOrderId,
      item["product_id"],
      item["item_category"],
      item["manufacturer"],
      item["product_name"],
      item["spec"],
      item["color"],
      item["club_type"],
      item["quantity"],
      item["list_price"],
      item["rate"],
      item["unit_price"],
      item["amount"],
      item["customer_name"],
      item["usage_type"],
      item["requested_delivery_date"],
      item["line_note"]
    ).run();
  }
  const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(src["supplier_id"], tenantId).first();
  const newOrder = await db2.prepare("SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?").bind(newOrderId, tenantId).first();
  const newItems = await db2.prepare("SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id").bind(newOrderId).all();
  if (supplier && newOrder) {
    const { subject, body } = composeMail(newOrder, newItems.results, supplier, senderInfoFromEnv(c.env));
    await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, body, newOrderId).run();
  }
  return c.json({ ok: true, order_id: newOrderId, batch_code: batchCode });
});
app.put("/orders/:id/header", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "\u4E0D\u6B63\u306AID\u3067\u3059\u3002" }, 400);
  const tenantId = getTenantId(c);
  const order = await db2.prepare(
    `SELECT po.*, s.* FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ? AND po.tenant_id = ?`
  ).bind(id, tenantId).first();
  if (!order) return c.json({ error: "\u767A\u6CE8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }, 404);
  const body = await c.req.json();
  await db2.prepare(`
    UPDATE purchase_orders
    SET order_date=?, ordered_by=?, customer_name=?,
        usage_type=?, requested_delivery_date=?, order_note=?
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(body.order_date) || order["order_date"],
    normalize(body.ordered_by) || order["ordered_by"],
    normalize(body.customer_name) ?? null,
    normalize(body.usage_type) ?? null,
    normalize(body.requested_delivery_date) ?? null,
    normalize(body.order_note) ?? null,
    id,
    tenantId
  ).run();
  const updatedOrder = await db2.prepare("SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?").bind(id, tenantId).first();
  const supplier = await db2.prepare("SELECT * FROM suppliers WHERE id=? AND tenant_id=?").bind(order["supplier_id"], tenantId).first();
  const items = await db2.prepare(
    "SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id"
  ).bind(id).all();
  if (updatedOrder && supplier && items.results.length > 0) {
    const { subject, body: mailBody } = composeMail(updatedOrder, items.results, supplier, senderInfoFromEnv(c.env));
    await db2.prepare("UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?").bind(subject, mailBody, id).run();
  }
  return c.json({ ok: true });
});
app.post("/orders/:id/status", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  const tenantId = getTenantId(c);
  const { status } = await c.req.json();
  const allowed = ["draft", "draft_created", "ordered", "partial", "completed", "cancelled"];
  if (!allowed.includes(status)) return c.json({ error: "invalid status" }, 400);
  if (status === "completed") {
    const today2 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const items = await db2.prepare(`
      SELECT poi.id AS poi_id, poi.quantity,
             COALESCE(SUM(ri.received_quantity), 0) AS received_qty
      FROM purchase_order_items poi
      LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
      WHERE poi.purchase_order_id = ?
      GROUP BY poi.id, poi.quantity
    `).bind(id).all();
    const pendingItems = items.results.filter((i) => i.received_qty < i.quantity);
    if (pendingItems.length > 0) {
      const ins = await db2.prepare(
        `INSERT INTO receipts (purchase_order_id, received_date, slip_date, inspected_by, note)
         VALUES (?, ?, NULL, '', '\u5B8C\u7D0D\u51E6\u7406\u306B\u3088\u308A\u81EA\u52D5\u767B\u9332')`
      ).bind(id, today2).run();
      const receiptId = ins.meta.last_row_id;
      for (const item of pendingItems) {
        const remaining = item.quantity - item.received_qty;
        await db2.prepare(
          `INSERT INTO receipt_items (receipt_id, purchase_order_item_id, received_quantity, note)
           VALUES (?, ?, ?, '')`
        ).bind(receiptId, item.poi_id, remaining).run();
      }
    }
  }
  await db2.prepare("UPDATE purchase_orders SET status=? WHERE id=? AND tenant_id=?").bind(status, id, tenantId).run();
  let nextMailBatch = null;
  let nextOrderId = null;
  if (status === "ordered") {
    const cur = await db2.prepare(
      "SELECT customer_name, batch_code FROM purchase_orders WHERE id=? AND tenant_id=?"
    ).bind(id, tenantId).first();
    if (cur?.customer_name && cur.customer_name.trim() && !cur.customer_name.startsWith("\uFF08")) {
      const next = await db2.prepare(`
        SELECT po.id, po.batch_code
        FROM purchase_orders po
        WHERE po.tenant_id=?
          AND po.customer_name=?
          AND po.status='draft_created'
          AND po.id != ?
          AND po.batch_code IS NOT NULL
        ORDER BY po.id ASC
        LIMIT 1
      `).bind(tenantId, cur.customer_name, id).first();
      if (next) {
        nextMailBatch = next.batch_code;
        nextOrderId = next.id;
      } else {
        const next2 = await db2.prepare(`
          SELECT po.id
          FROM purchase_orders po
          WHERE po.tenant_id=?
            AND po.customer_name=?
            AND po.status='draft_created'
            AND po.id != ?
          ORDER BY po.id ASC
          LIMIT 1
        `).bind(tenantId, cur.customer_name, id).first();
        if (next2) {
          nextOrderId = next2.id;
        }
      }
    }
  }
  return c.json({ ok: true, next_mail_batch: nextMailBatch, next_order_id: nextOrderId });
});
app.delete("/orders/:id", async (c) => {
  const db2 = c.env.DB;
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "\u4E0D\u6B63\u306AID\u3067\u3059" }, 400);
  const tenantId = getTenantId(c);
  const order = await db2.prepare("SELECT id, order_no FROM purchase_orders WHERE id=? AND tenant_id=?").bind(id, tenantId).first();
  if (!order) return c.json({ error: "\u767A\u6CE8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const receiptIds = await db2.prepare(
    "SELECT id FROM receipts WHERE purchase_order_id=?"
  ).bind(id).all();
  for (const r of receiptIds.results) {
    await db2.prepare("DELETE FROM receipt_items WHERE receipt_id=?").bind(r.id).run();
  }
  await db2.prepare("DELETE FROM receipts WHERE purchase_order_id=?").bind(id).run();
  await db2.prepare("DELETE FROM purchase_order_items WHERE purchase_order_id=?").bind(id).run();
  await db2.prepare("DELETE FROM purchase_orders WHERE id=?").bind(id).run();
  return c.json({ ok: true, order_no: order.order_no });
});
var BACKUP_TABLES = ["suppliers", "supplier_rules", "products", "purchase_orders", "purchase_order_items", "receipts", "receipt_items"];
function csvEscape(v) {
  if (v === null || v === void 0) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function rowsToCsv(rows) {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows.map((r) => keys.map((k) => csvEscape(r[k])).join(",")).join("\n");
  return header + "\n" + body;
}
function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return obj;
  });
}
app.get("/dashboard/pending-inspection", async (c) => {
  const db2 = c.env.DB;
  const tenantId = getTenantId(c);
  const res = await db2.prepare(`
    SELECT
      poi.id            AS poi_id,
      poi.purchase_order_id AS order_id,
      po.order_no,
      po.status,
      po.order_date,
      s.name            AS supplier_name,
      po.customer_name,
      poi.item_category,
      poi.manufacturer,
      poi.product_name,
      poi.spec,
      poi.color,
      poi.club_type,
      poi.quantity,
      COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty,
      poi.is_free
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.status IN ('ordered','partial')
      AND poi.inspected = 0
      AND po.tenant_id = ?
    ORDER BY po.order_date ASC, po.id ASC, poi.id ASC
    LIMIT 200
  `).bind(tenantId).all();
  return c.json({ items: res.results });
});
app.patch("/orders/:id/items/:poi_id/inspect", async (c) => {
  const db2 = c.env.DB;
  const orderId = Number(c.req.param("id"));
  const poiId = Number(c.req.param("poi_id"));
  const tenantId = getTenantId(c);
  if (isNaN(orderId) || isNaN(poiId)) {
    return c.json({ error: "Invalid id" }, 400);
  }
  const poi = await db2.prepare(
    `SELECT poi.id, poi.inspected FROM purchase_order_items poi
     JOIN purchase_orders po ON po.id = poi.purchase_order_id
     WHERE poi.id=? AND poi.purchase_order_id=? AND po.tenant_id=?`
  ).bind(poiId, orderId, tenantId).first();
  if (!poi) {
    return c.json({ error: "\u660E\u7D30\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  }
  await db2.prepare(
    "UPDATE purchase_order_items SET inspected=1 WHERE id=?"
  ).bind(poiId).run();
  const remain = await db2.prepare(
    "SELECT COUNT(*) AS c FROM purchase_order_items WHERE purchase_order_id=? AND inspected=0"
  ).bind(orderId).first();
  const allInspected = (remain?.c ?? 0) === 0;
  return c.json({ ok: true, all_inspected: allInspected });
});
app.get("/backup/all", async (c) => {
  const db2 = c.env.DB;
  const data = {};
  for (const tbl of BACKUP_TABLES) {
    const res = await db2.prepare(`SELECT * FROM ${tbl} ORDER BY id`).all();
    data[tbl] = res.results;
  }
  const payload = {
    exported_at: (/* @__PURE__ */ new Date()).toISOString(),
    version: "1.0",
    tables: data
  };
  const filename = `golfwing_backup_${today()}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
});
app.get("/backup/csv/:table", async (c) => {
  const tbl = c.req.param("table");
  if (!BACKUP_TABLES.includes(tbl)) return c.json({ error: "Unknown table" }, 400);
  const db2 = c.env.DB;
  const res = await db2.prepare(`SELECT * FROM ${tbl} ORDER BY id`).all();
  const csv = rowsToCsv(res.results);
  const filename = `${tbl}_${today()}.csv`;
  return new Response("\uFEFF" + csv, {
    // BOM付きUTF-8 → Excelで開ける
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
});
app.post("/backup/restore/all", async (c) => {
  let payload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "JSON\u30D1\u30FC\u30B9\u30A8\u30E9\u30FC" }, 400);
  }
  if (!payload?.tables) return c.json({ error: "tables \u30D5\u30A3\u30FC\u30EB\u30C9\u304C\u3042\u308A\u307E\u305B\u3093" }, 400);
  const db2 = c.env.DB;
  const stats = {};
  const deleteOrder = ["receipt_items", "receipts", "purchase_order_items", "purchase_orders", "supplier_rules", "products", "suppliers"];
  try {
    for (const tbl of deleteOrder) {
      await db2.prepare(`DELETE FROM ${tbl}`).run();
    }
    const insertOrder = ["suppliers", "products", "supplier_rules", "purchase_orders", "purchase_order_items", "receipts", "receipt_items"];
    for (const tbl of insertOrder) {
      const rows = payload.tables[tbl] ?? [];
      if (rows.length === 0) {
        stats[tbl] = 0;
        continue;
      }
      const keys = Object.keys(rows[0]).filter((k) => k !== "id");
      const allKeys = Object.keys(rows[0]);
      let inserted = 0;
      for (const row of rows) {
        const placeholders = allKeys.map(() => "?").join(",");
        const vals = allKeys.map((k) => row[k] ?? null);
        await db2.prepare(`INSERT OR REPLACE INTO ${tbl} (${allKeys.join(",")}) VALUES (${placeholders})`).bind(...vals).run();
        inserted++;
      }
      stats[tbl] = inserted;
      void keys;
    }
    return c.json({ ok: true, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: "\u30EA\u30B9\u30C8\u30A2\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: " + msg }, 500);
  }
});
app.post("/backup/restore/csv", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON\u30D1\u30FC\u30B9\u30A8\u30E9\u30FC" }, 400);
  }
  const { table, mode = "append", csv } = body;
  if (!table || !BACKUP_TABLES.includes(table)) {
    return c.json({ error: "\u4E0D\u6B63\u306A\u30C6\u30FC\u30D6\u30EB\u540D\u3067\u3059" }, 400);
  }
  if (!csv || csv.trim() === "") return c.json({ error: "CSV\u30C7\u30FC\u30BF\u304C\u7A7A\u3067\u3059" }, 400);
  const rows = parseCsv(csv);
  if (rows.length === 0) return c.json({ error: "CSV\u306B\u6709\u52B9\u306A\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093" }, 400);
  const db2 = c.env.DB;
  let inserted = 0;
  const errors = [];
  try {
    if (mode === "replace") {
      await db2.prepare(`DELETE FROM ${table}`).run();
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (Object.values(row).every((v) => v === "")) continue;
      try {
        const keys = Object.keys(row);
        const placeholders = keys.map(() => "?").join(",");
        const vals = keys.map((k) => {
          const v = row[k];
          if (v === "" || v === null || v === void 0) return null;
          const numCols = ["id", "is_active", "list_price", "default_rate", "rate", "priority", "quantity", "unit_price", "amount", "supplier_id", "default_supplier_id", "purchase_order_id", "product_id", "purchase_order_item_id"];
          if (numCols.includes(k) && v !== "") return isNaN(Number(v)) ? null : Number(v);
          return v;
        });
        await db2.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${placeholders})`).bind(...vals).run();
        inserted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`\u884C${i + 2}: ${msg}`);
      }
    }
    return c.json({ ok: true, inserted, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: "CSV\u30EA\u30B9\u30C8\u30A2\u4E2D\u306B\u30A8\u30E9\u30FC: " + msg }, 500);
  }
});

// src/routes/pages.ts
var app2 = new Hono2();
function yen2(v) {
  if (v === null || v === void 0 || v === "") return "";
  const n = parseFloat(String(v));
  if (isNaN(n)) return "";
  return `\xA5${n.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;
}
function statusLabel2(v) {
  const m = {
    draft: "\u4E0B\u66F8\u304D",
    draft_created: "\u4E0B\u66F8\u304D\u4F5C\u6210\u6E08",
    ordered: "\u767A\u6CE8\u6E08",
    partial: "\u4E00\u90E8\u5165\u8377",
    completed: "\u5B8C\u7D0D",
    cancelled: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    pool: "\u30D7\u30FC\u30EB\u4E2D"
  };
  return m[v] ?? v;
}
function statusBadge(status) {
  const colors = {
    draft: "secondary",
    draft_created: "info",
    ordered: "primary",
    partial: "warning",
    completed: "success",
    cancelled: "dark",
    pool: "warning"
  };
  return `<span class="badge text-bg-${colors[status] ?? "secondary"}">${statusLabel2(status)}</span>`;
}
function todayStr() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function getSession(c) {
  return c.get("sessionUser") ?? {
    username: "unknown",
    tenantId: 1,
    displayName: "",
    isDemo: false,
    isAdmin: false
  };
}
function getLayoutOpts(c) {
  const su = getSession(c);
  const isDemo = su.isDemo || c.env.DEMO_MODE === "1";
  return {
    appName: c.env.APP_NAME || "\u767A\u6CE8\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0",
    isDemo,
    username: su.displayName || su.username,
    tenantId: su.tenantId
  };
}
function layout(title, content, extraScripts = "", username = "", opts = {}) {
  const appName = opts.appName || "\u767A\u6CE8\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0";
  const isDemo = opts.isDemo ?? false;
  const demoBanner = isDemo ? `
<div id="demo-banner" style="
  background: linear-gradient(90deg,#7c3aed,#4f46e5);
  color:#fff;padding:8px 16px;font-size:0.8rem;font-weight:600;
  display:flex;align-items:center;justify-content:space-between;
  gap:8px;position:sticky;top:0;z-index:2000;
">
  <span><i class="fas fa-flask me-2"></i>\u30C7\u30E2\u30E2\u30FC\u30C9 \u2014 \u30C7\u30FC\u30BF\u306F\u5B9A\u671F\u7684\u306B\u30EA\u30BB\u30C3\u30C8\u3055\u308C\u307E\u3059\u3002\u66F8\u304D\u8FBC\u307F\u64CD\u4F5C\u306F\u7121\u52B9\u3067\u3059\u3002</span>
  <a href="https://golfwing-order.pages.dev" target="_blank"
     style="color:#fff;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:6px;font-size:0.75rem;white-space:nowrap">
    <i class="fas fa-shopping-cart me-1"></i>\u5C0E\u5165\u306E\u304A\u554F\u3044\u5408\u308F\u305B
  </a>
</div>` : "";
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ${appName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
</head>
<body${isDemo ? ' class="is-demo"' : ""}>
${demoBanner}
<nav class="navbar navbar-expand-lg sticky-top">
  <div class="container-fluid px-3">
    <a class="navbar-brand" href="/">
      <span class="brand-icon"><i class="fas fa-golf-ball"></i></span>
      ${appName}
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navMenu">
      <div class="navbar-nav gap-1 ms-auto align-items-lg-center">
        <a class="nav-link" href="/dashboard"><i class="fas fa-home me-1"></i>\u4ECA\u65E5\u3084\u308B\u3053\u3068</a>
        <div class="nav-divider d-none d-lg-block"></div>
        <a class="nav-link" href="/orders/new"><i class="fas fa-plus me-1"></i>\u65B0\u898F\u767A\u6CE8</a>
        <a class="nav-link" href="/purchase-pool"><i class="fas fa-layer-group me-1"></i>\u767A\u6CE8\u30D7\u30FC\u30EB</a>
        <a class="nav-link" href="/orders"><i class="fas fa-list me-1"></i>\u767A\u6CE8\u4E00\u89A7</a>
        <a class="nav-link" href="/backorders"><i class="fas fa-exclamation-triangle me-1"></i>\u6B8B\u6CE8\u4E00\u89A7</a>
        <a class="nav-link" href="/receipts"><i class="fas fa-truck me-1"></i>\u7D0D\u54C1\u5C65\u6B74</a>
        <div class="nav-divider d-none d-lg-block"></div>
        <a class="nav-link" href="/products"><i class="fas fa-box me-1"></i>\u5546\u54C1\u30DE\u30B9\u30BF</a>
        <a class="nav-link" href="/suppliers"><i class="fas fa-building me-1"></i>\u4ED5\u5165\u5148</a>
        <a class="nav-link" href="/rules"><i class="fas fa-cog me-1"></i>\u5224\u5B9A\u30EB\u30FC\u30EB</a>
        <div class="nav-divider d-none d-lg-block"></div>
        <div class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center gap-1"
             href="#" data-bs-toggle="dropdown">
            <i class="fas fa-user-circle"></i>
            <span>${username || "admin"}</span>
          </a>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><h6 class="dropdown-header"><i class="fas fa-user me-1"></i>${username || "admin"}</h6></li>
            <li><a class="dropdown-item" href="/admin/backup"><i class="fas fa-database me-2 text-primary"></i>\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u7BA1\u7406</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="/logout"><i class="fas fa-sign-out-alt me-2"></i>\u30ED\u30B0\u30A2\u30A6\u30C8</a></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</nav>
<div id="flash-container"></div>
<div class="page-container">
  ${content}
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
function showFlash(message, type) {
  type = type || 'success';
  var el = document.getElementById('flash-container');
  var div = document.createElement('div');
  div.className = 'alert alert-' + type + ' alert-dismissible fade show';
  div.innerHTML = message + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
  el.appendChild(div);
  setTimeout(function(){ div.remove(); }, 5000);
}
</script>
${extraScripts}
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }
  });
}
app2.get("/dashboard", async (c) => {
  const db2 = c.env.DB;
  const opts = getLayoutOpts(c);
  const { tenantId } = opts;
  const today2 = todayStr();
  const [statusCounts, overdueRows, pendingRows, activeRows, draftRows] = await Promise.all([
    // ① 状態別カウント
    db2.prepare(`
      SELECT status, COUNT(*) AS c FROM purchase_orders
      WHERE tenant_id=? AND status NOT IN ('cancelled')
      GROUP BY status
    `).bind(tenantId).all(),
    // ② 対応が必要：発注済で7日以上経過かつ未入荷
    db2.prepare(`
      SELECT po.id, po.order_date, po.customer_name, po.status,
             s.name AS supplier_name, s.order_method,
             GROUP_CONCAT(poi.product_name, ' / ') AS products,
             COUNT(poi.id) AS item_count,
             CAST(julianday('now') - julianday(po.order_date) AS INTEGER) AS days_elapsed
      FROM purchase_orders po
      JOIN suppliers s ON s.id=po.supplier_id
      JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.tenant_id=? AND po.status='ordered'
        AND julianday('now') - julianday(po.order_date) >= 7
      GROUP BY po.id
      ORDER BY days_elapsed DESC
      LIMIT 20
    `).bind(tenantId).all(),
    // ③ 検品待ち：入荷済（partial/received）で未処理の明細
    db2.prepare(`
      SELECT po.id AS order_id, po.order_date, po.status,
             po.customer_name,
             s.name AS supplier_name,
             poi.id AS poi_id,
             poi.item_category, poi.manufacturer, poi.product_name, poi.spec, poi.color,
             poi.quantity,
             COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri
                       WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id=poi.purchase_order_id
      JOIN suppliers s ON s.id=po.supplier_id
      LEFT JOIN receipt_items ri2 ON ri2.purchase_order_item_id=poi.id
      WHERE po.tenant_id=?
        AND po.status IN ('partial','received')
        AND ri2.id IS NOT NULL
      GROUP BY poi.id
      ORDER BY po.order_date ASC, po.id ASC
      LIMIT 100
    `).bind(tenantId).all(),
    // ④ お客様対応中：発注済・一部入荷で顧客名あり
    db2.prepare(`
      SELECT po.id, po.order_date, po.status,
             po.customer_name,
             s.name AS supplier_name, s.order_method,
             COUNT(poi.id) AS item_count,
             COALESCE(SUM(poi.quantity),0) AS total_qty,
             COALESCE(SUM(COALESCE(
               (SELECT SUM(ri.received_quantity) FROM receipt_items ri
                WHERE ri.purchase_order_item_id=poi.id),0
             )),0) AS received_qty,
             CAST(julianday('now') - julianday(po.order_date) AS INTEGER) AS days_elapsed
      FROM purchase_orders po
      JOIN suppliers s ON s.id=po.supplier_id
      JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.tenant_id=?
        AND po.status IN ('ordered','partial')
        AND po.customer_name IS NOT NULL
        AND po.customer_name NOT LIKE '\uFF08%\uFF09'
        AND po.customer_name != ''
      GROUP BY po.id
      ORDER BY po.order_date ASC
      LIMIT 30
    `).bind(tenantId).all(),
    // ⑤ 下書き：まだ発注していない
    db2.prepare(`
      SELECT po.id, po.order_date, po.customer_name,
             s.name AS supplier_name,
             COUNT(poi.id) AS item_count
      FROM purchase_orders po
      JOIN suppliers s ON s.id=po.supplier_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.tenant_id=? AND po.status IN ('draft','draft_created')
      GROUP BY po.id
      ORDER BY po.id DESC
      LIMIT 10
    `).bind(tenantId).all()
  ]);
  const sc = {};
  for (const r of statusCounts.results) sc[r.status] = r.c;
  const orderedCount = sc["ordered"] ?? 0;
  const partialCount = sc["partial"] ?? 0;
  const draftCount = (sc["draft"] ?? 0) + (sc["draft_created"] ?? 0);
  const completedCount = sc["completed"] ?? 0;
  const activeCount = orderedCount + partialCount;
  const overdueCount = overdueRows.results.length;
  const overdueAlerts = overdueRows.results.map((r) => {
    const days = Number(r["days_elapsed"]);
    const urgColor = days >= 14 ? "#dc2626" : "#d97706";
    const urgLabel = days >= 14 ? "\u81F3\u6025\u78BA\u8A8D" : "\u8981\u78BA\u8A8D";
    return `
    <div class="dash-alert-item" data-order-id="${r["id"]}">
      <div class="dash-alert-left">
        <span class="dash-alert-days" style="color:${urgColor}">${days}\u65E5\u7D4C\u904E</span>
        <span class="dash-alert-urgency" style="background:${urgColor}20;color:${urgColor}">${urgLabel}</span>
      </div>
      <div class="dash-alert-center">
        <div class="dash-alert-customer">${esc(r["customer_name"] || "\uFF08\u4ED5\u5165\u30FB\u5728\u5EAB\uFF09")}</div>
        <div class="dash-alert-products">${esc(String(r["products"] ?? "").split(" / ").slice(0, 2).join(" / "))}</div>
        <div class="dash-alert-supplier"><i class="fas fa-building me-1 opacity-50"></i>${esc(r["supplier_name"])}<span class="ms-2 badge bg-secondary" style="font-size:0.65rem">${esc(r["order_method"])}</span></div>
      </div>
      <div class="dash-alert-right">
        <a href="/orders/${r["id"]}" class="btn btn-sm btn-outline-danger">\u8A73\u7D30 <i class="fas fa-arrow-right ms-1"></i></a>
      </div>
    </div>`;
  }).join("");
  const inspectMap = /* @__PURE__ */ new Map();
  for (const item of pendingRows.results) {
    const oid = Number(item["order_id"]);
    if (!inspectMap.has(oid)) {
      inspectMap.set(oid, {
        orderId: oid,
        orderDate: String(item["order_date"] ?? ""),
        status: String(item["status"] ?? ""),
        customerName: String(item["customer_name"] ?? ""),
        supplierName: String(item["supplier_name"] ?? ""),
        items: []
      });
    }
    inspectMap.get(oid).items.push(item);
  }
  const inspectCount = pendingRows.results.length;
  const inspectBlocks = Array.from(inspectMap.values()).map((grp) => {
    const itemCards = grp.items.map((item) => `
      <div class="inspect-item-card" data-poi-id="${item["poi_id"]}">
        <div class="inspect-item-info">
          <span class="inspect-item-cat">${esc(item["item_category"])}</span>
          <span class="inspect-item-name">${esc(item["manufacturer"] ? item["manufacturer"] + " " : "")}${esc(item["product_name"])}</span>
          ${item["spec"] ? `<span class="inspect-item-spec">${esc(item["spec"])}</span>` : ""}
          ${item["color"] ? `<span class="inspect-item-spec">${esc(item["color"])}</span>` : ""}
        </div>
        <div class="inspect-item-qty">
          <span class="qty-received">${item["received_qty"]}</span>
          <span class="qty-sep">/</span>
          <span class="qty-total">${item["quantity"]}</span>
          <span class="qty-unit">\u672C</span>
        </div>
        <button class="btn-inspect-done btn-dash-inspect"
          data-poi-id="${item["poi_id"]}" data-order-id="${grp.orderId}">
          <i class="fas fa-check me-1"></i>\u691C\u54C1\u6E08
        </button>
      </div>`).join("");
    return `
    <div class="inspect-order-block" data-order-id="${grp.orderId}" id="inspect-block-${grp.orderId}">
      <div class="inspect-order-header">
        <span class="inspect-order-customer"><i class="fas fa-user me-1 opacity-50"></i>${esc(grp.customerName || "\u4ED5\u5165\u30FB\u5728\u5EAB")}</span>
        <span class="inspect-order-supplier text-muted">${esc(grp.supplierName)}</span>
        <span class="ms-auto badge ${grp.status === "partial" ? "text-bg-warning" : "text-bg-success"}" id="remain-badge-${grp.orderId}">${grp.items.length}\u70B9</span>
        <a href="/orders/${grp.orderId}" class="inspect-order-link">\u8A73\u7D30</a>
      </div>
      <div class="inspect-items-wrap" id="inspect-items-${grp.orderId}">${itemCards}</div>
    </div>`;
  }).join("");
  const activeCards = activeRows.results.map((r) => {
    const days = Number(r["days_elapsed"]);
    const totalQty = Number(r["total_qty"]);
    const recvQty = Number(r["received_qty"]);
    const pct = totalQty > 0 ? Math.round(recvQty / totalQty * 100) : 0;
    const isPartial = String(r["status"]) === "partial";
    const statusColor = isPartial ? "#d97706" : "#3b82f6";
    const progressBar = isPartial ? `
      <div class="progress-wrap">
        <div class="progress" style="height:4px;border-radius:2px;background:#e5e7eb">
          <div class="progress-bar" style="width:${pct}%;background:#d97706"></div>
        </div>
        <span class="progress-label">${recvQty}/${totalQty} \u5165\u8377\u6E08</span>
      </div>` : "";
    return `
    <a href="/orders/${r["id"]}" class="active-order-card">
      <div class="active-order-top">
        <span class="active-order-customer">${esc(r["customer_name"])}</span>
        <span class="active-order-badge" style="background:${statusColor}20;color:${statusColor}">${statusLabel2(String(r["status"]))}</span>
      </div>
      <div class="active-order-supplier"><i class="fas fa-building me-1 opacity-40"></i>${esc(r["supplier_name"])}</div>
      ${progressBar}
      <div class="active-order-meta">
        <span><i class="fas fa-calendar me-1 opacity-40"></i>${esc(r["order_date"])}</span>
        <span class="ms-auto" style="color:${days >= 10 ? "#d97706" : "var(--gw-muted)"}">${days}\u65E5\u524D</span>
      </div>
    </a>`;
  }).join("");
  const draftItems = draftRows.results.map((r) => `
    <a href="/orders/${r["id"]}" class="draft-item">
      <i class="fas fa-file-alt me-2 opacity-40"></i>
      <span class="draft-customer">${esc(r["customer_name"] || "\uFF08\u9867\u5BA2\u672A\u8A2D\u5B9A\uFF09")}</span>
      <span class="draft-supplier text-muted ms-2">${esc(r["supplier_name"])}</span>
      <span class="ms-auto draft-date text-muted">${esc(r["order_date"])}</span>
    </a>`).join("");
  const dashCss = `<style>
/* \u2500\u2500 \u4ECA\u65E5\u3084\u308B\u3053\u3068 \u30D8\u30C3\u30C0\u30FC \u2500\u2500 */
.dash-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem; flex-wrap:wrap; gap:.75rem; }
.dash-title { font-size:1.1rem; font-weight:700; color:var(--gw-text); }
.dash-date { font-size:.8rem; color:var(--gw-muted); }

/* \u2500\u2500 \u72B6\u614B\u30B5\u30DE\u30EA\u30D0\u30FC \u2500\u2500 */
.status-bar { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:1.5rem; }
.status-pill { display:flex; align-items:center; gap:.4rem; padding:.35rem .75rem; border-radius:99px; font-size:.78rem; font-weight:600; border:1px solid transparent; text-decoration:none; transition:opacity .15s; }
.status-pill:hover { opacity:.8; }
.status-pill .pill-count { font-size:1rem; font-weight:700; }

/* \u2500\u2500 \u30BB\u30AF\u30B7\u30E7\u30F3\u5171\u901A \u2500\u2500 */
.dash-section { margin-bottom:1.5rem; }
.dash-section-header { display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem; }
.dash-section-title { font-size:.875rem; font-weight:700; color:var(--gw-text); }
.dash-section-badge { font-size:.7rem; padding:.2rem .5rem; border-radius:99px; font-weight:700; }
.dash-empty { text-align:center; padding:1.25rem; color:var(--gw-muted); font-size:.83rem; background:var(--gw-surface); border-radius:10px; }

/* \u2500\u2500 \u5BFE\u5FDC\u304C\u5FC5\u8981\u30A2\u30E9\u30FC\u30C8 \u2500\u2500 */
.dash-alert-list { display:flex; flex-direction:column; gap:.5rem; }
.dash-alert-item { display:flex; align-items:center; gap:.75rem; padding:.75rem 1rem; background:#fff9f0; border:1px solid #fed7aa; border-radius:10px; }
.dash-alert-left { display:flex; flex-direction:column; align-items:center; gap:.25rem; min-width:60px; }
.dash-alert-days { font-size:1rem; font-weight:800; line-height:1; }
.dash-alert-urgency { font-size:.65rem; font-weight:700; padding:.15rem .4rem; border-radius:4px; }
.dash-alert-center { flex:1; min-width:0; }
.dash-alert-customer { font-weight:700; font-size:.88rem; color:var(--gw-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dash-alert-products { font-size:.78rem; color:var(--gw-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dash-alert-supplier { font-size:.75rem; color:var(--gw-muted); margin-top:.15rem; }
.dash-alert-right { flex-shrink:0; }

/* \u2500\u2500 \u691C\u54C1\u5F85\u3061 \u2500\u2500 */
.inspect-order-block { background:var(--gw-surface); border-radius:10px; border:1px solid var(--gw-border); margin-bottom:.75rem; overflow:hidden; }
.inspect-order-header { display:flex; align-items:center; gap:.5rem; padding:.6rem .875rem; background:#f0fdf4; border-bottom:1px solid var(--gw-border); flex-wrap:wrap; }
.inspect-order-customer { font-weight:700; font-size:.85rem; }
.inspect-order-supplier { font-size:.78rem; }
.inspect-order-link { font-size:.75rem; color:var(--gw-green); text-decoration:none; white-space:nowrap; }
.inspect-items-wrap { padding:.5rem .875rem .75rem; display:flex; flex-direction:column; gap:.5rem; }
.inspect-item-card { display:flex; align-items:center; gap:.625rem; padding:.5rem .625rem; background:#fff; border:1px solid var(--gw-border); border-radius:8px; }
.inspect-item-info { flex:1; min-width:0; }
.inspect-item-cat { display:inline-block; font-size:.65rem; background:#e5e7eb; color:#6b7280; border-radius:4px; padding:.1rem .35rem; margin-right:.25rem; }
.inspect-item-name { font-size:.83rem; font-weight:600; }
.inspect-item-spec { font-size:.75rem; color:var(--gw-muted); margin-left:.25rem; }
.inspect-item-qty { font-size:.83rem; color:var(--gw-muted); white-space:nowrap; flex-shrink:0; }
.qty-received { color:var(--gw-green); font-weight:700; }
.qty-sep { margin:0 .15rem; }
.qty-total, .qty-unit { color:var(--gw-muted); }
.btn-inspect-done { flex-shrink:0; padding:.3rem .7rem; font-size:.75rem; font-weight:600; background:#f0fdf4; color:var(--gw-green); border:1px solid #86efac; border-radius:6px; cursor:pointer; transition:background .15s; white-space:nowrap; }
.btn-inspect-done:hover { background:#dcfce7; }
.btn-inspect-done:disabled { opacity:.5; cursor:default; }

/* \u2500\u2500 \u304A\u5BA2\u69D8\u5BFE\u5FDC\u4E2D \u2500\u2500 */
.active-orders-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:.625rem; }
.active-order-card { display:block; padding:.75rem 1rem; background:var(--gw-surface); border:1px solid var(--gw-border); border-radius:10px; text-decoration:none; color:var(--gw-text); transition:box-shadow .15s, transform .1s; }
.active-order-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.08); transform:translateY(-1px); color:var(--gw-text); }
.active-order-top { display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem; margin-bottom:.3rem; }
.active-order-customer { font-weight:700; font-size:.9rem; line-height:1.3; }
.active-order-badge { font-size:.68rem; font-weight:700; padding:.2rem .5rem; border-radius:99px; white-space:nowrap; flex-shrink:0; }
.active-order-supplier { font-size:.75rem; color:var(--gw-muted); margin-bottom:.4rem; }
.progress-wrap { margin:.4rem 0; }
.progress-label { font-size:.7rem; color:var(--gw-muted); display:block; margin-top:.2rem; }
.active-order-meta { display:flex; font-size:.72rem; color:var(--gw-muted); margin-top:.35rem; }

/* \u2500\u2500 \u4E0B\u66F8\u304D \u2500\u2500 */
.draft-list { display:flex; flex-direction:column; gap:.375rem; }
.draft-item { display:flex; align-items:center; padding:.55rem .875rem; background:var(--gw-surface); border:1px solid var(--gw-border); border-radius:8px; font-size:.82rem; text-decoration:none; color:var(--gw-text); transition:background .1s; }
.draft-item:hover { background:#f8fafc; color:var(--gw-text); }
.draft-customer { font-weight:600; }
.draft-date { font-size:.75rem; }
</style>`;
  const dashScript = `<script>
(function(){
  // \u691C\u54C1\u6E08\u307F\u30DC\u30BF\u30F3
  document.querySelectorAll('.btn-dash-inspect').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var poiId   = btn.dataset.poiId
      var orderId = btn.dataset.orderId
      var card    = btn.closest('.inspect-item-card')
      btn.disabled = true
      btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:.8rem;height:.8rem"></span>'
      try {
        var r = await fetch('/api/orders/'+orderId+'/items/'+poiId+'/inspect',{
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({inspected:1})
        })
        var d = await r.json()
        if(r.ok){
          card.style.transition = 'opacity 0.35s'
          card.style.opacity = '0'
          setTimeout(function(){
            card.remove()
            var wrap = document.getElementById('inspect-items-'+orderId)
            var remain = wrap ? wrap.querySelectorAll('.inspect-item-card').length : 0
            var badge = document.getElementById('remain-badge-'+orderId)
            if(badge) badge.textContent = remain+'\u70B9'
            if(remain === 0){
              var block = document.getElementById('inspect-block-'+orderId)
              if(block){ block.style.transition='opacity 0.35s'; block.style.opacity='0'; setTimeout(function(){ block.remove(); updateInspectBadge() },350) }
            }
            updateInspectBadge()
            showFlash('\u691C\u54C1\u6E08\u307F\u306B\u3057\u307E\u3057\u305F','success')
          }, 350)
        } else {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-check me-1"></i>\u691C\u54C1\u6E08'
          showFlash((d&&d.error)||'\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger')
        }
      } catch(e){
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-check me-1"></i>\u691C\u54C1\u6E08'
        showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F','danger')
      }
    })
  })

  function updateInspectBadge(){
    var total = document.querySelectorAll('.btn-dash-inspect').length
    var badge = document.getElementById('inspect-section-badge')
    if(badge) badge.textContent = total+'\u4EF6'
    if(total === 0){
      var sec = document.getElementById('inspect-section-body')
      if(sec) sec.innerHTML = '<div class="dash-empty"><i class="fas fa-check-circle text-success me-2"></i>\u691C\u54C1\u5F85\u3061\u306E\u5546\u54C1\u306F\u3042\u308A\u307E\u305B\u3093</div>'
    }
  }
})()
</script>`;
  const todayJP = (() => {
    const d = /* @__PURE__ */ new Date();
    const wd = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"][d.getDay()];
    return `${d.getFullYear()}\u5E74${d.getMonth() + 1}\u6708${d.getDate()}\u65E5\uFF08${wd}\uFF09`;
  })();
  const content = dashCss + `
<div class="dash-header">
  <div>
    <div class="dash-title"><i class="fas fa-home me-2" style="color:var(--gw-green)"></i>\u4ECA\u65E5\u3084\u308B\u3053\u3068</div>
    <div class="dash-date">${todayJP}</div>
  </div>
  <a class="btn btn-primary btn-sm" href="/orders/new"><i class="fas fa-plus me-1"></i>\u65B0\u898F\u767A\u6CE8</a>
</div>

<!-- \u2500\u2500 \u72B6\u614B\u30B5\u30DE\u30EA\u30D0\u30FC \u2500\u2500 -->
<div class="status-bar">
  <a href="/orders?status=draft" class="status-pill" style="background:#f1f5f9;color:#64748b;border-color:#e2e8f0">
    <i class="fas fa-file-alt"></i><span class="pill-count">${draftCount}</span>\u4E0B\u66F8\u304D
  </a>
  <a href="/orders?status=ordered" class="status-pill" style="background:#eff6ff;color:#3b82f6;border-color:#bfdbfe">
    <i class="fas fa-paper-plane"></i><span class="pill-count">${orderedCount}</span>\u767A\u6CE8\u6E08
  </a>
  <a href="/orders?status=partial" class="status-pill" style="background:#fffbeb;color:#d97706;border-color:#fde68a">
    <i class="fas fa-box-open"></i><span class="pill-count">${partialCount}</span>\u4E00\u90E8\u5165\u8377
  </a>
  <a href="/orders?status=completed" class="status-pill" style="background:#f0fdf4;color:#16a34a;border-color:#bbf7d0">
    <i class="fas fa-check-circle"></i><span class="pill-count">${completedCount}</span>\u5B8C\u7D0D
  </a>
</div>

<!-- \u2500\u2500 \u2460 \u5BFE\u5FDC\u304C\u5FC5\u8981 \u2500\u2500 -->
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-exclamation-circle" style="color:#dc2626"></i>
    <span class="dash-section-title">\u5BFE\u5FDC\u304C\u5FC5\u8981</span>
    <span class="dash-section-badge" style="background:${overdueCount > 0 ? "#fef2f2" : "#f0fdf4"};color:${overdueCount > 0 ? "#dc2626" : "#16a34a"}">${overdueCount}\u4EF6</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">\u767A\u6CE8\u304B\u30897\u65E5\u4EE5\u4E0A\u30FB\u672A\u5165\u8377</span>
  </div>
  <div class="dash-alert-list">
    ${overdueCount === 0 ? '<div class="dash-empty"><i class="fas fa-check-circle text-success me-2"></i>\u5BFE\u5FDC\u304C\u5FC5\u8981\u306A\u6848\u4EF6\u306F\u3042\u308A\u307E\u305B\u3093</div>' : overdueAlerts}
  </div>
</div>

<!-- \u2500\u2500 \u2461 \u691C\u54C1\u5F85\u3061 \u2500\u2500 -->
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-clipboard-check" style="color:${inspectCount > 0 ? "#d97706" : "#16a34a"}"></i>
    <span class="dash-section-title">\u691C\u54C1\u5F85\u3061</span>
    <span class="dash-section-badge" id="inspect-section-badge" style="background:${inspectCount > 0 ? "#fffbeb" : "#f0fdf4"};color:${inspectCount > 0 ? "#d97706" : "#16a34a"}">${inspectCount}\u4EF6</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">\u5165\u8377\u6E08\u30FB\u672A\u691C\u54C1</span>
  </div>
  <div id="inspect-section-body">
    ${inspectCount === 0 ? '<div class="dash-empty"><i class="fas fa-check-circle text-success me-2"></i>\u691C\u54C1\u5F85\u3061\u306E\u5546\u54C1\u306F\u3042\u308A\u307E\u305B\u3093</div>' : inspectBlocks}
  </div>
</div>

<!-- \u2500\u2500 \u2462 \u304A\u5BA2\u69D8\u5BFE\u5FDC\u4E2D \u2500\u2500 -->
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-user-clock" style="color:#3b82f6"></i>
    <span class="dash-section-title">\u304A\u5BA2\u69D8\u5BFE\u5FDC\u4E2D</span>
    <span class="dash-section-badge" style="background:#eff6ff;color:#3b82f6">${activeRows.results.length}\u4EF6</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">\u767A\u6CE8\u6E08\u30FB\u4E00\u90E8\u5165\u8377\uFF08\u9867\u5BA2\u540D\u3042\u308A\uFF09</span>
  </div>
  ${activeRows.results.length === 0 ? '<div class="dash-empty">\u5BFE\u5FDC\u4E2D\u306E\u304A\u5BA2\u69D8\u6848\u4EF6\u306F\u3042\u308A\u307E\u305B\u3093</div>' : `<div class="active-orders-grid">${activeCards}</div>`}
</div>

<!-- \u2500\u2500 \u2463 \u4E0B\u66F8\u304D \u2500\u2500 -->
${draftCount > 0 ? `
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-file-edit" style="color:#64748b"></i>
    <span class="dash-section-title">\u767A\u6CE8\u3057\u5FD8\u308C\u78BA\u8A8D</span>
    <span class="dash-section-badge" style="background:#f1f5f9;color:#64748b">${draftCount}\u4EF6</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">\u4E0B\u66F8\u304D\u30FB\u672A\u767A\u6CE8</span>
  </div>
  <div class="draft-list">${draftItems}</div>
</div>` : ""}

${dashScript}`;
  return layout("\u4ECA\u65E5\u3084\u308B\u3053\u3068", content, "", opts.username, opts);
});
app2.get("/products", async (c) => {
  const db2 = c.env.DB;
  const q = (c.req.query("q") || "").replace(/　/g, " ").trim();
  const cat = (c.req.query("cat") || "").trim();
  const tab = c.req.query("tab") === "discontinued" ? "discontinued" : "active";
  const isDiscontinued = tab === "discontinued";
  const ALLOWED_COLS = {
    manufacturer: "p.manufacturer",
    name: "p.name",
    list_price: "p.list_price",
    club_type: "p.club_type",
    item_category: "p.item_category"
  };
  const sortKey = c.req.query("sort") || "item_category";
  const sortCol = ALLOWED_COLS[sortKey] || "p.item_category";
  const sortDir = c.req.query("dir") === "desc" ? "DESC" : "ASC";
  const nextDir = (col) => {
    if (sortCol !== ALLOWED_COLS[col]) return "asc";
    return sortDir === "ASC" ? "desc" : "asc";
  };
  const PAGE_SIZE = 100;
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
  const { tenantId } = getLayoutOpts(c);
  let whereSql = isDiscontinued ? "WHERE p.is_active=0 AND p.tenant_id=?" : "WHERE p.is_active=1 AND p.tenant_id=?";
  const whereParams = [tenantId];
  if (cat) {
    whereSql += " AND p.item_category=?";
    whereParams.push(cat);
  }
  if (q) {
    whereSql += " AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ? OR p.spec LIKE ?)";
    const like = `%${q}%`;
    whereParams.push(like, like, like, like, like, like);
  }
  const countSql = `SELECT COUNT(*) AS c FROM products p ${whereSql}`;
  const countRes = await db2.prepare(countSql).bind(...whereParams).first();
  const totalCount = countRes?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const currentOffset = (currentPage - 1) * PAGE_SIZE;
  const secondary = sortCol === "p.manufacturer" ? ", p.name ASC" : sortCol === "p.name" ? ", p.manufacturer ASC" : ", p.manufacturer ASC, p.name ASC";
  let sql = `SELECT p.*, s.name AS supplier_name, s.id AS supplier_id
    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
    ${whereSql} ORDER BY ${sortCol} ${sortDir}${secondary} LIMIT ? OFFSET ?`;
  const params = [...whereParams, PAGE_SIZE, currentOffset];
  const stmt = db2.prepare(sql);
  const res = await stmt.bind(...params).all();
  const [cats, suppliers] = await Promise.all([
    db2.prepare(`SELECT DISTINCT item_category FROM products WHERE is_active=${isDiscontinued ? 0 : 1} AND tenant_id=? ORDER BY item_category`).bind(tenantId).all(),
    db2.prepare("SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all()
  ]);
  const supplierOpts = suppliers.results.map((s) => `<option value="${s["id"]}">${esc(s["name"])}</option>`).join("");
  const catOpts = cats.results.map((c2) => `<option value="${esc(c2.item_category)}">${esc(c2.item_category)}</option>`).join("");
  const catFilter = cats.results.map((c2) => {
    const sp2 = new URLSearchParams();
    sp2.set("cat", c2.item_category);
    if (q) sp2.set("q", q);
    if (sortKey !== "item_category") sp2.set("sort", sortKey);
    if (sortDir === "DESC") sp2.set("dir", "desc");
    if (isDiscontinued) sp2.set("tab", "discontinued");
    return `<a class="btn btn-sm ${cat === c2.item_category ? "btn-primary" : "btn-outline-secondary"}" href="/products?${sp2.toString()}">${esc(c2.item_category)}</a>`;
  }).join("");
  const ctColorMap = {
    DR: "danger",
    FW: "success",
    UT: "warning text-dark",
    IR: "secondary",
    PT: "dark",
    "DR/FW": "info text-dark"
  };
  const pageUrl = (p) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("cat", cat);
    if (sortKey !== "item_category") sp.set("sort", sortKey);
    if (sortDir === "DESC") sp.set("dir", "desc");
    if (p > 1) sp.set("page", String(p));
    if (isDiscontinued) sp.set("tab", "discontinued");
    return "/products?" + sp.toString();
  };
  const buildPager = () => {
    if (totalPages <= 1) return "";
    const WINDOW = 2;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || i >= currentPage - WINDOW && i <= currentPage + WINDOW) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...");
      }
    }
    const items = pages.map((p) => {
      if (p === "...") return `<li class="page-item disabled"><span class="page-link">\u2026</span></li>`;
      const active = p === currentPage;
      return `<li class="page-item ${active ? "active" : ""}">
        <a class="page-link" href="${pageUrl(p)}">${p}</a></li>`;
    }).join("");
    const prev = currentPage > 1 ? `<li class="page-item"><a class="page-link" href="${pageUrl(currentPage - 1)}"><i class="fas fa-chevron-left"></i></a></li>` : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-chevron-left"></i></span></li>`;
    const next = currentPage < totalPages ? `<li class="page-item"><a class="page-link" href="${pageUrl(currentPage + 1)}"><i class="fas fa-chevron-right"></i></a></li>` : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-chevron-right"></i></span></li>`;
    return `<nav aria-label="\u30DA\u30FC\u30B8\u30CD\u30FC\u30B7\u30E7\u30F3" class="mt-3">
  <ul class="pagination pagination-sm justify-content-center mb-0">
    ${prev}${items}${next}
  </ul>
</nav>`;
  };
  const sortLink = (col, label, extraCls = "") => {
    const active = sortCol === ALLOWED_COLS[col];
    const nd = nextDir(col);
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("cat", cat);
    sp.set("sort", col);
    sp.set("dir", nd);
    if (isDiscontinued) sp.set("tab", "discontinued");
    const icon = active ? sortDir === "ASC" ? '<i class="fas fa-sort-up ms-1 text-warning small"></i>' : '<i class="fas fa-sort-down ms-1 text-warning small"></i>' : '<i class="fas fa-sort ms-1 text-white-50 small"></i>';
    return `<a href="/products?${sp.toString()}" class="text-decoration-none text-white ${extraCls}">${label}${icon}</a>`;
  };
  const rows = res.results.map((r) => {
    const ct = String(r["club_type"] || "");
    const ctBadge = ct ? `<span class="badge bg-${ctColorMap[ct] || "secondary"}">${esc(ct)}</span>` : '<span class="text-muted">\u2014</span>';
    const actionBtns = isDiscontinued ? `<button class="btn btn-xs btn-outline-success btn-restore-product py-0 px-2" data-id="${r["id"]}" data-name="${esc(r["name"])}" title="\u6709\u52B9\u306B\u623B\u3059"><i class="fas fa-undo me-1"></i>\u5FA9\u6D3B</button>
         <button class="btn btn-xs btn-outline-danger btn-perm-del-product py-0 px-2 ms-1" data-id="${r["id"]}" data-name="${esc(r["name"])}" title="\u5B8C\u5168\u524A\u9664\uFF08\u767A\u6CE8\u5C65\u6B74\u306A\u3057\u306E\u307F\uFF09"><i class="fas fa-times"></i></button>` : `<button class="btn btn-xs btn-outline-primary btn-edit-product py-0 px-2" data-id="${r["id"]}" title="\u7DE8\u96C6"><i class="fas fa-edit"></i></button>
         <button class="btn btn-xs btn-outline-warning btn-disc-product py-0 px-2 ms-1" data-id="${r["id"]}" data-name="${esc(r["name"])}" title="\u5EC3\u76E4\u306B\u3059\u308B"><i class="fas fa-ban"></i></button>`;
    return `<tr data-id="${r["id"]}" class="${isDiscontinued ? "table-secondary" : ""}">
    <td class="text-center" style="width:36px">
      <input type="checkbox" class="form-check-input chk-product" value="${r["id"]}" style="width:1.1em;height:1.1em;cursor:pointer">
    </td>
    <td class="text-muted small">${r["id"]}</td>
    <td><span class="badge bg-secondary">${esc(r["item_category"])}</span></td>
    <td class="fw-semibold">${esc(r["manufacturer"])}</td>
    <td><strong>${esc(r["name"])}</strong></td>
    <td class="text-muted small">${esc(r["spec"])}</td>
    <td>${ctBadge}</td>
    <td class="text-end fw-semibold text-primary">${yen2(r["list_price"])}</td>
    <td class="text-center">${r["default_rate"] != null ? (Number(r["default_rate"]) * 100).toFixed(1) + "%" : ""}</td>
    <td class="small">
      <span class="me-1">${esc(r["supplier_name"]) || '<span class="text-muted">&#x2015;</span>'}</span>
      ${!isDiscontinued ? `<button class="btn btn-xs btn-outline-secondary py-0 px-1 btn-manage-suppliers"
        data-product-id="${r["id"]}"
        data-product-name="${esc(r["name"])}"
        title="\u4ED5\u5165\u5148\u3092\u8FFD\u52A0\u30FB\u7BA1\u7406"
        style="font-size:0.7rem">
        <i class="fas fa-truck me-1"></i>\u4ED5\u5165\u5148
      </button>` : ""}
    </td>
    <td class="text-muted small">${esc(r["barcode"])}</td>
    <td style="white-space:nowrap">${actionBtns}</td>
  </tr>`;
  }).join("");
  const supplierOptsJson = JSON.stringify(suppliers.results.map((s) => ({ id: s["id"], name: s["name"] })));
  const scripts = `<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script>window._PRODUCTS_PAGE_COUNT = '${res.results.length} \u4EF6\u8868\u793A\uFF08\u3053\u306E\u30DA\u30FC\u30B8\uFF09'; window._PRODUCTS_TAB = '${tab}'; window._SUPPLIERS = ${supplierOptsJson};</script>
<script src="/static/products-page.js"></script>`;
  const currentSortLabel = sortKey === "manufacturer" ? "\u30E1\u30FC\u30AB\u30FC" : sortKey === "name" ? "\u5546\u54C1\u540D" : sortKey === "list_price" ? "\u5B9A\u4FA1" : sortKey === "club_type" ? "\u7A2E\u985E" : "\u54C1\u76EE";
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-box me-2" style="color:var(--gw-green)"></i>\u5546\u54C1\u30DE\u30B9\u30BF</h1>
    <p class="page-subtitle" id="row-count-label"><strong>${totalCount.toLocaleString()}</strong> \u4EF6\u4E2D ${res.results.length} \u4EF6\u8868\u793A\uFF08${currentPage}/${totalPages} \u30DA\u30FC\u30B8\uFF09</p>
  </div>
  <div class="actions">
    <div class="btn-group">
      <button class="btn btn-outline-secondary" id="btn-dl-template" title="CSV\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9">
        <i class="fas fa-download me-1"></i>\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8
      </button>
      <button class="btn btn-outline-secondary" id="btn-template-help" title="\u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3\u5217\u306E\u66F8\u304D\u65B9">
        <i class="fas fa-question-circle"></i>
      </button>
    </div>
    <button class="btn btn-outline-primary" id="btn-import">
      <i class="fas fa-file-import me-1"></i>Excel/CSV\u4E00\u62EC\u8FFD\u52A0
    </button>
    <button class="btn btn-primary" onclick="openAddProduct()">
      <i class="fas fa-plus me-1"></i>\u5546\u54C1\u3092\u8FFD\u52A0
    </button>
  </div>
</div>

<!-- \u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3\u30D8\u30EB\u30D7\u30E2\u30FC\u30C0\u30EB -->
<div class="modal fade" id="varHelpModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title"><i class="fas fa-question-circle me-2 text-primary"></i>\u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3\u5217\u306E\u66F8\u304D\u65B9</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p class="text-muted small">\u8272\u30FB\u30D0\u30C3\u30AF\u30E9\u30A4\u30F3\u6709\u7121\u304C\u8907\u6570\u3042\u308B\u5546\u54C1\uFF08\u30B0\u30EA\u30C3\u30D7\u7B49\uFF09\u306B\u4F7F\u3044\u307E\u3059\u3002</p>
        <h6 class="fw-bold mt-3">\u25A0 \u30D0\u30C3\u30AF\u30E9\u30A4\u30F3\u6709\u7121\u3042\u308A</h6>
        <code class="d-block bg-light p-2 rounded small mb-1">BL\u7121:\u82721/\u82722/\u82723|BL\u6709:\u82721/\u82722/\u82723</code>
        <p class="small text-muted mb-0">\u4F8B: <code>BL\u7121:\u30D6\u30E9\u30C3\u30AF/\u30EC\u30C3\u30C9/\u30DB\u30EF\u30A4\u30C8|BL\u6709:\u30D6\u30E9\u30C3\u30AF/\u30EC\u30C3\u30C9/\u30DB\u30EF\u30A4\u30C8</code></p>
        <p class="small text-success">\u2192 BL\u7121\u30FBBL\u6709 \u305D\u308C\u305E\u308C1\u30EC\u30B3\u30FC\u30C9\u767B\u9332\uFF08\u767A\u6CE8\u6642\u306B\u8272\u3092\u30C9\u30ED\u30C3\u30D7\u30C0\u30A6\u30F3\u9078\u629E\uFF09</p>
        <h6 class="fw-bold mt-3">\u25A0 \u8272\u306E\u307F\u8907\u6570\uFF08BL\u533A\u5225\u306A\u3057\uFF09</h6>
        <code class="d-block bg-light p-2 rounded small mb-1">\u82721/\u82722/\u82723/\u82724</code>
        <p class="small text-muted mb-0">\u4F8B: <code>\u30D6\u30E9\u30C3\u30AF/\u30EC\u30C3\u30C9/\u30DB\u30EF\u30A4\u30C8/\u30D6\u30EB\u30FC</code></p>
        <p class="small text-success">\u2192 1\u30EC\u30B3\u30FC\u30C9\u767B\u9332\uFF08\u767A\u6CE8\u6642\u306B\u8272\u3092\u30C9\u30ED\u30C3\u30D7\u30C0\u30A6\u30F3\u9078\u629E\uFF09</p>
        <hr>
        <p class="small text-muted mb-0">\u203B \u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3\u304C\u306A\u3044\u5546\u54C1\u306F\u3053\u306E\u5217\u3092\u7A7A\u6B04\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
        <p class="small text-muted mb-0">\u203B \u30D0\u30EA\u30A8\u30FC\u30B7\u30E7\u30F3\u304C\u3042\u308B\u5834\u5408\u3001\u300C\u8272\u300D\u300C\u54C1\u756A\u300D\u5217\u306F\u7121\u8996\u3055\u308C\u307E\u3059\u3002</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">\u9589\u3058\u308B</button>
        <button type="button" class="btn btn-primary" id="btn-dl-template-from-help">
          <i class="fas fa-download me-1"></i>\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9
        </button>
      </div>
    </div>
  </div>
</div>

<!-- \u6709\u52B9 / \u5EC3\u76E4\u30BF\u30D6 -->
<ul class="nav nav-tabs mb-3">
  <li class="nav-item">
    <a class="nav-link ${!isDiscontinued ? "active fw-semibold" : ""}" href="/products">
      <i class="fas fa-box me-1"></i>\u6709\u52B9\u5546\u54C1
    </a>
  </li>
  <li class="nav-item">
    <a class="nav-link ${isDiscontinued ? "active fw-semibold text-danger" : "text-muted"}" href="/products?tab=discontinued">
      <i class="fas fa-ban me-1"></i>\u5EC3\u76E4\u5546\u54C1
    </a>
  </li>
</ul>

<!-- \u30AB\u30C6\u30B4\u30EA\u30D5\u30A3\u30EB\u30BF -->
<div class="d-flex gap-2 flex-wrap mb-2">
  <a class="btn btn-sm ${!cat ? "btn-dark" : "btn-outline-secondary"}" href="/products${isDiscontinued ? "?tab=discontinued" : q ? "?q=" + encodeURIComponent(q) : ""}">\u3059\u3079\u3066</a>
  ${catFilter}
</div>

<!-- \u691C\u7D22\u30D0\u30FC -->
<div class="row g-2 mb-3">
  <div class="col-md-6">
    <form class="d-flex gap-2" method="GET" action="/products">
      ${cat ? `<input type="hidden" name="cat" value="${esc(cat)}">` : ""}
      ${sortKey !== "item_category" ? `<input type="hidden" name="sort" value="${esc(sortKey)}">` : ""}
      ${sortDir === "DESC" ? `<input type="hidden" name="dir" value="desc">` : ""}
      ${isDiscontinued ? `<input type="hidden" name="tab" value="discontinued">` : ""}
      <input class="form-control" type="text" name="q" value="${esc(q)}"
        placeholder="\u30B5\u30FC\u30D0\u30FC\u691C\u7D22\uFF08\u30E1\u30FC\u30AB\u30FC\u30FB\u5546\u54C1\u540D\u30FB\u4ED5\u69D8\u2026\uFF09">
      <button class="btn btn-primary flex-shrink-0"><i class="fas fa-search"></i></button>
      ${q || cat ? `<a href="/products" class="btn btn-outline-secondary flex-shrink-0"><i class="fas fa-times"></i></a>` : ""}
    </form>
  </div>
  <div class="col-md-6">
    <div class="input-group">
      <span class="input-group-text bg-success text-white border-success">
        <i class="fas fa-bolt"></i>
      </span>
      <input id="live-q" type="text" class="form-control border-success"
        placeholder="\u30DA\u30FC\u30B8\u5185\u77AC\u6642\u7D5E\u308A\u8FBC\u307F\uFF08\u5165\u529B\u3059\u308B\u3060\u3051\u30FB\u30B5\u30FC\u30D0\u30FC\u901A\u4FE1\u306A\u3057\uFF09" autocomplete="off">
      <button id="live-q-clear" class="btn btn-outline-secondary" type="button">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>
</div>

<!-- \u9078\u629E\u6642\u306B\u6D6E\u304D\u4E0A\u304C\u308B\u30A2\u30AF\u30B7\u30E7\u30F3\u30D0\u30FC -->
<div id="bulk-action-bar" class="d-none mb-2">
  <div class="alert alert-primary d-flex align-items-center gap-3 py-2 mb-0 shadow-sm">
    <span class="fw-bold"><i class="fas fa-check-square me-1"></i><span id="bulk-count">0</span> \u4EF6\u9078\u629E\u4E2D</span>
    <button class="btn btn-sm btn-warning" id="btn-bulk-edit">
      <i class="fas fa-edit me-1"></i>\u4E00\u62EC\u7DE8\u96C6
    </button>
    ${!isDiscontinued ? `<button class="btn btn-sm btn-outline-danger" id="btn-bulk-disc">
      <i class="fas fa-ban me-1"></i>\u4E00\u62EC\u5EC3\u76E4
    </button>` : `<button class="btn btn-sm btn-outline-success" id="btn-bulk-restore">
      <i class="fas fa-undo me-1"></i>\u4E00\u62EC\u5FA9\u6D3B
    </button>`}
    <button class="btn btn-sm btn-outline-secondary ms-auto" id="btn-bulk-clear">
      <i class="fas fa-times me-1"></i>\u9078\u629E\u89E3\u9664
    </button>
  </div>
</div>

<div class="card">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0" id="product-table">
      <thead>
        <tr>
          <th style="width:36px" class="text-center">
            <input type="checkbox" class="form-check-input" id="chk-all" style="width:1.1em;height:1.1em;cursor:pointer" title="\u5168\u9078\u629E">
          </th>
          <th class="text-white-50 small" style="width:46px">ID</th>
          <th>${sortLink("item_category", "\u54C1\u76EE")}</th>
          <th>${sortLink("manufacturer", "\u30E1\u30FC\u30AB\u30FC")}</th>
          <th>${sortLink("name", "\u5546\u54C1\u540D")}</th>
          <th class="text-white-50">\u4ED5\u69D8</th>
          <th>${sortLink("club_type", "\u7A2E\u985E")}</th>
          <th class="text-end">${sortLink("list_price", "\u5B9A\u4FA1", "text-end d-block")}</th>
          <th class="text-center text-white-50">\u639B\u7387</th>
          <th class="text-white-50">\u6A19\u6E96\u4ED5\u5165\u5148</th>
          <th class="text-white-50">\u30D0\u30FC\u30B3\u30FC\u30C9</th>
          <th class="text-white-50">\u64CD\u4F5C</th>
        </tr>
      </thead>
      <tbody id="product-tbody">
        ${rows || '<tr><td colspan="12" class="text-center py-4 text-muted">\u5BFE\u8C61\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="card-footer text-muted small d-flex justify-content-between align-items-center">
    <span>
      <i class="fas fa-sort me-1"></i>
      \u30BD\u30FC\u30C8: <strong>${currentSortLabel}</strong>
      ${sortDir === "ASC" ? '<i class="fas fa-arrow-up ms-1 text-success"></i> \u6607\u9806' : '<i class="fas fa-arrow-down ms-1 text-danger"></i> \u964D\u9806'}
    </span>
    <span class="text-muted">\u5168 ${totalCount.toLocaleString()} \u4EF6 / ${PAGE_SIZE}\u4EF6/\u30DA\u30FC\u30B8</span>
  </div>
</div>
${buildPager()}

<!-- \u2550\u2550\u2550\u2550 \u4E00\u62EC\u7DE8\u96C6\u30E2\u30FC\u30C0\u30EB \u2550\u2550\u2550\u2550 -->
<div class="modal fade" id="bulkEditModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-warning text-dark py-2">
        <h5 class="modal-title mb-0">
          <i class="fas fa-edit me-2"></i>\u9078\u629E\u5546\u54C1\u3092\u4E00\u62EC\u7DE8\u96C6
          <span class="badge bg-dark ms-2" id="bulk-edit-count-badge">0\u4EF6</span>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="alert alert-info py-2 small mb-3">
          <i class="fas fa-info-circle me-1"></i>
          <strong>\u5165\u529B\u3057\u305F\u9805\u76EE\u306E\u307F</strong>\u4E0A\u66F8\u304D\u3055\u308C\u307E\u3059\u3002\u7A7A\u6B04\u306E\u307E\u307E\u306B\u3057\u305F\u9805\u76EE\u306F\u5909\u66F4\u3055\u308C\u307E\u305B\u3093\u3002
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">\u54C1\u76EE</label>
            <input class="form-control" id="be-item-category" placeholder="\u5909\u66F4\u3057\u306A\u3044\u5834\u5408\u306F\u7A7A\u6B04">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">\u30E1\u30FC\u30AB\u30FC</label>
            <input class="form-control" id="be-manufacturer" placeholder="\u5909\u66F4\u3057\u306A\u3044\u5834\u5408\u306F\u7A7A\u6B04">
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">\u7A2E\u985E</label>
            <select class="form-select" id="be-club-type">
              <option value="">\u2014 \u5909\u66F4\u3057\u306A\u3044 \u2014</option>
              <option value="DR">DR</option>
              <option value="FW">FW</option>
              <option value="UT">UT</option>
              <option value="IR">IR</option>
              <option value="PT">PT</option>
              <option value="DR/FW">DR/FW</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">\u639B\u7387</label>
            <div class="input-group">
              <input class="form-control" id="be-rate" type="number" step="0.01" min="0" max="1" placeholder="\u4F8B: 0.45">
              <span class="input-group-text">\uFF080\u301C1\uFF09</span>
            </div>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">\u5B9A\u4FA1</label>
            <div class="input-group">
              <span class="input-group-text">\xA5</span>
              <input class="form-control" id="be-list-price" type="number" step="1" min="0" placeholder="\u5909\u66F4\u3057\u306A\u3044\u5834\u5408\u306F\u7A7A\u6B04">
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">\u6A19\u6E96\u4ED5\u5165\u5148</label>
            <select class="form-select" id="be-supplier">
              <option value="">\u2014 \u5909\u66F4\u3057\u306A\u3044 \u2014</option>
              ${supplierOpts}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label fw-semibold">\u5358\u4F4D</label>
            <select class="form-select" id="be-unit">
              <option value="">\u2014 \u5909\u66F4\u3057\u306A\u3044 \u2014</option>
              <option value="\u672C">\u672C</option>
              <option value="\u500B">\u500B</option>
              <option value="\u30C0\u30FC\u30B9">\u30C0\u30FC\u30B9</option>
              <option value="\u30BB\u30C3\u30C8">\u30BB\u30C3\u30C8</option>
              <option value="\u8DB3">\u8DB3</option>
            </select>
          </div>
        </div>
        <!-- \u30D7\u30EC\u30D3\u30E5\u30FC\u30EA\u30B9\u30C8 -->
        <div class="mt-3">
          <div class="fw-semibold small text-muted mb-1"><i class="fas fa-list me-1"></i>\u7DE8\u96C6\u5BFE\u8C61\u306E\u5546\u54C1</div>
          <div id="bulk-edit-preview" class="border rounded p-2 bg-light" style="max-height:180px;overflow-y:auto;font-size:0.8rem"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
        <button type="button" class="btn btn-warning fw-bold" id="btn-do-bulk-edit">
          <i class="fas fa-save me-1"></i>\u4E00\u62EC\u66F4\u65B0\u3092\u5B9F\u884C
        </button>
      </div>
    </div>
  </div>
</div>

<!-- \u2550\u2550\u2550\u2550 Excel/CSV \u4E00\u62EC\u30A4\u30F3\u30DD\u30FC\u30C8\u30E2\u30FC\u30C0\u30EB \u2550\u2550\u2550\u2550 -->
<div class="modal fade" id="importModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-xl modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white py-2">
        <h5 class="modal-title mb-0">
          <i class="fas fa-file-import me-2"></i>Excel / CSV \u4E00\u62EC\u30A4\u30F3\u30DD\u30FC\u30C8
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-3">

        <!-- \u30B9\u30C6\u30C3\u30D7\u30A4\u30F3\u30B8\u30B1\u30FC\u30BF\u30FC -->
        <div class="d-flex align-items-center gap-2 mb-3">
          <span id="import-step-file" class="badge rounded-pill bg-primary active px-3 py-2">
            <i class="fas fa-upload me-1"></i>\u2460 \u30D5\u30A1\u30A4\u30EB\u9078\u629E
          </span>
          <i class="fas fa-chevron-right text-muted small"></i>
          <span id="import-step-preview" class="badge rounded-pill bg-secondary px-3 py-2">
            <i class="fas fa-table me-1"></i>\u2461 \u30D7\u30EC\u30D3\u30E5\u30FC\u78BA\u8A8D
          </span>
          <i class="fas fa-chevron-right text-muted small"></i>
          <span id="import-step-done" class="badge rounded-pill bg-secondary px-3 py-2">
            <i class="fas fa-check me-1"></i>\u2462 \u5B8C\u4E86
          </span>
        </div>

        <!-- \u2460 \u30D5\u30A1\u30A4\u30EB\u9078\u629E\u30A8\u30EA\u30A2 -->
        <div class="card border-primary mb-3">
          <div class="card-body py-3">
            <div class="row g-3 align-items-start">
              <div class="col-md-8">
                <label class="form-label fw-semibold">
                  <i class="fas fa-file-excel me-1 text-success"></i>
                  \u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E <span class="text-muted small fw-normal">\uFF08.xlsx / .xls / .csv \u5BFE\u5FDC\uFF09</span>
                </label>
                <input type="file" class="form-control" id="import-file"
                  accept=".xlsx,.xls,.csv">
                <div class="text-danger small mt-1" id="import-file-error" style="display:none"></div>
                <div class="text-muted small mt-2">
                  <i class="fas fa-info-circle me-1"></i>
                  \u30D8\u30C3\u30C0\u30FC\u884C\uFF081\u884C\u76EE\uFF09\u306B\u5217\u540D\u304C\u5FC5\u8981\u3067\u3059\u3002
                  \u65E5\u672C\u8A9E\u5217\u540D\uFF08\u54C1\u76EE\u30FB\u30E1\u30FC\u30AB\u30FC\u30FB\u5546\u54C1\u540D\u2026\uFF09\u3068\u82F1\u8A9E\u5217\u540D\uFF08item_category\u30FBmanufacturer\u30FBname\u2026\uFF09\u3069\u3061\u3089\u3082\u4F7F\u3048\u307E\u3059\u3002
                </div>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">
                  <i class="fas fa-cog me-1"></i>\u30A4\u30F3\u30DD\u30FC\u30C8\u30E2\u30FC\u30C9
                </label>
                <select class="form-select" id="import-mode">
                  <option value="insert">\u65B0\u898F\u8FFD\u52A0\u306E\u307F\uFF08\u65E2\u5B58\u306F\u5909\u66F4\u3057\u306A\u3044\uFF09</option>
                  <option value="upsert">\u8FFD\u52A0 \uFF0B \u66F4\u65B0\uFF08\u54C1\u756A\u304C\u4E00\u81F4\u3057\u305F\u3089\u4E0A\u66F8\u304D\uFF09</option>
                </select>
                <div class="text-muted small mt-1">
                  \u300C\u66F4\u65B0\u300D\u30E2\u30FC\u30C9\u306F\u54C1\u756A(product_code)\u3067\u65E2\u5B58\u30EC\u30B3\u30FC\u30C9\u3092\u7167\u5408\u3057\u307E\u3059
                </div>
              </div>
            </div>

            <!-- \u5217\u30DE\u30C3\u30D4\u30F3\u30B0\u65E9\u898B\u8868 -->
            <div class="mt-3">
              <button class="btn btn-sm btn-outline-secondary" type="button"
                data-bs-toggle="collapse" data-bs-target="#col-mapping-help">
                <i class="fas fa-question-circle me-1"></i>\u5217\u540D\u306E\u5BFE\u5FDC\u8868\u3092\u8868\u793A
              </button>
              <div class="collapse mt-2" id="col-mapping-help">
                <table class="table table-sm table-bordered small mb-0" style="max-width:700px">
                  <thead><tr>
                    <th>\u65E5\u672C\u8A9E\u5217\u540D</th><th>\u82F1\u8A9E\u5217\u540D</th><th>\u5FC5\u9808</th><th>\u8AAC\u660E</th>
                  </tr></thead>
                  <tbody>
                    <tr><td class="fw-semibold">\u54C1\u76EE</td><td><code>item_category</code></td><td><span class="text-danger">\u5FC5\u9808</span></td><td>\u30B7\u30E3\u30D5\u30C8 / \u30B0\u30EA\u30C3\u30D7 / \u30DC\u30FC\u30EB \u306A\u3069</td></tr>
                    <tr><td class="fw-semibold">\u30E1\u30FC\u30AB\u30FC</td><td><code>manufacturer</code></td><td></td><td>\u30D5\u30B8\u30AF\u30E9 / \u30B0\u30E9\u30D5\u30A1\u30A4\u30C8\u30C7\u30B6\u30A4\u30F3 \u306A\u3069</td></tr>
                    <tr><td class="fw-semibold">\u5546\u54C1\u540D</td><td><code>name</code></td><td><span class="text-danger">\u5FC5\u9808</span></td><td>\u4F8B: SPEEDER NX 50</td></tr>
                    <tr><td class="fw-semibold">\u4ED5\u69D8</td><td><code>spec</code></td><td></td><td>\u4F8B: 5S, 6X, R</td></tr>
                    <tr><td class="fw-semibold">\u8272</td><td><code>color</code></td><td></td><td>\u4F8B: \u767D, \u9ED2</td></tr>
                    <tr><td class="fw-semibold">\u7A2E\u985E</td><td><code>club_type</code></td><td></td><td>DR / FW / UT / IR / PT</td></tr>
                    <tr><td class="fw-semibold">\u5B9A\u4FA1</td><td><code>list_price</code></td><td></td><td>\u6570\u5024\uFF08\u5186\uFF09</td></tr>
                    <tr><td class="fw-semibold">\u639B\u7387</td><td><code>default_rate</code></td><td></td><td>0\u301C1\u306E\u5C0F\u6570\uFF08\u4F8B: 0.55\uFF09</td></tr>
                    <tr><td class="fw-semibold">\u5358\u4F4D</td><td><code>unit</code></td><td></td><td>\u7701\u7565\u6642\u306F\u300C\u672C\u300D</td></tr>
                    <tr><td class="fw-semibold">\u30D0\u30FC\u30B3\u30FC\u30C9</td><td><code>barcode</code></td><td></td><td>JAN\u30B3\u30FC\u30C9\u306A\u3069</td></tr>
                    <tr><td class="fw-semibold">\u54C1\u756A</td><td><code>product_code</code></td><td></td><td>\u66F4\u65B0\u30E2\u30FC\u30C9\u306E\u7167\u5408\u30AD\u30FC</td></tr>
                    <tr><td class="fw-semibold">\u51FA\u5178</td><td><code>source</code></td><td></td><td>\u30E1\u30E2\u30FB\u51FA\u5178\u306A\u3069</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- \u2461 \u30D7\u30EC\u30D3\u30E5\u30FC\u30C6\u30FC\u30D6\u30EB -->
        <div id="import-preview-wrap" style="display:none">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div>
              <strong><i class="fas fa-table me-1 text-primary"></i>\u30D7\u30EC\u30D3\u30E5\u30FC</strong>
              <span class="text-muted small ms-2">
                \u5168 <strong id="import-row-count">0</strong> \u884C
                <span id="import-err-badge" class="ms-1"></span>
              </span>
              <span class="text-danger small ms-2" id="import-err-count-wrap">
                \uFF08<span id="import-err-count">0</span>\u884C\u306B\u30A8\u30E9\u30FC\u3042\u308A \u2014 \u30B9\u30AD\u30C3\u30D7\u3055\u308C\u307E\u3059\uFF09
              </span>
            </div>
          </div>
          <div class="table-responsive border rounded" style="max-height:320px;overflow-y:auto">
            <table class="table table-sm table-hover mb-0" style="font-size:0.8rem">
              <thead class="table-dark sticky-top" id="import-preview-thead"></thead>
              <tbody id="import-preview-tbody"></tbody>
            </table>
          </div>
          <div class="text-muted small mt-1" id="import-preview-more" style="display:none">
            <i class="fas fa-ellipsis-h me-1"></i>\u5148\u982D200\u884C\u306E\u307F\u8868\u793A\uFF08\u6B8B\u308A <span id="import-preview-more-count"></span> \u884C\u306F\u975E\u8868\u793A\uFF09
          </div>
        </div>

        <!-- \u2462 \u7D50\u679C\u8868\u793A -->
        <div id="import-result" style="display:none"></div>

      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">\u9589\u3058\u308B</button>
        <button type="button" class="btn btn-primary" id="btn-do-import" style="display:none">
          <i class="fas fa-file-import me-1"></i>\u30A4\u30F3\u30DD\u30FC\u30C8\u5B9F\u884C
        </button>
      </div>
    </div>
  </div>
</div>

<!-- \u5546\u54C1\u8FFD\u52A0\u30FB\u7DE8\u96C6\u30E2\u30FC\u30C0\u30EB -->
<div class="modal fade" id="productModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="pmTitle">\u5546\u54C1\u3092\u8FFD\u52A0</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <form id="productForm">
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u54C1\u76EE <span class="text-danger">*</span></label>
              <input class="form-control" name="item_category" list="dl-cat" placeholder="\u30B7\u30E3\u30D5\u30C8 / \u30B9\u30EA\u30FC\u30D6..." required>
              <datalist id="dl-cat">${catOpts}</datalist>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u30E1\u30FC\u30AB\u30FC</label>
              <input class="form-control" name="manufacturer" placeholder="\u30D5\u30B8\u30AF\u30E9, \u30B0\u30E9\u30D5\u30A1\u30A4\u30C8\u30C7\u30B6\u30A4\u30F3...">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u7A2E\u985E (club_type)</label>
              <input class="form-control" name="club_type" placeholder="DR / FW / IRON...">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">\u5546\u54C1\u540D <span class="text-danger">*</span></label>
              <input class="form-control" name="name" placeholder="\u4F8B: Tour AD CQ 6X" required>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u4ED5\u69D8</label>
              <input class="form-control" name="spec" placeholder="\u4F8B: 6X, S, R">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">\u8272</label>
              <input class="form-control" name="color" placeholder="\u4F8B: \u767D, \u9ED2">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">\u5B9A\u4FA1 (\u5186)</label>
              <input class="form-control text-end" name="list_price" type="number" min="0" step="100" placeholder="50000">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">\u639B\u7387 (\u4F8B: 0.54)</label>
              <input class="form-control text-end" name="default_rate" type="number" min="0" max="1" step="0.01" placeholder="0.54">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">\u5358\u4F4D</label>
              <input class="form-control" name="unit" value="\u672C" placeholder="\u672C / \u500B / \u7D44">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">\u6A19\u6E96\u4ED5\u5165\u5148</label>
              <select class="form-select" name="default_supplier_id">
                <option value="">\u2015 \u672A\u8A2D\u5B9A \u2015</option>
                ${supplierOpts}
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">\u30D0\u30FC\u30B3\u30FC\u30C9</label>
              <input class="form-control" name="barcode" placeholder="JAN\u30B3\u30FC\u30C9\u306A\u3069">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u54C1\u756A (product_code)</label>
              <input class="form-control" name="product_code">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">\u51FA\u5178 / \u30E1\u30E2</label>
              <input class="form-control" name="source">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>\u4FDD\u5B58</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- \u2550\u2550\u2550\u2550 \u8907\u6570\u4ED5\u5165\u5148\u7BA1\u7406\u30E2\u30FC\u30C0\u30EB \u2550\u2550\u2550\u2550 -->
<div class="modal fade" id="suppliersModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-success text-white">
        <h5 class="modal-title">
          <i class="fas fa-truck me-2"></i>\u4ED5\u5165\u5148\u8A2D\u5B9A: <span id="sup-modal-product-name"></span>
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p class="text-muted small mb-3">
          <i class="fas fa-info-circle me-1"></i>
          \u540C\u3058\u5546\u54C1\u3067\u3082\u4ED5\u5165\u5148\u3054\u3068\u306B\u639B\u3051\u7387\u304C\u7570\u306A\u308B\u5834\u5408\u3001\u3053\u3053\u3067\u8A2D\u5B9A\u3067\u304D\u307E\u3059\u3002\u767A\u6CE8\u4F5C\u6210\u6642\u306B\u4ED5\u5165\u5148\u3092\u9078\u629E\u3059\u308B\u3068\u639B\u3051\u7387\u304C\u81EA\u52D5\u53CD\u6620\u3055\u308C\u307E\u3059\u3002
        </p>
        <!-- \u73FE\u5728\u306E\u4ED5\u5165\u5148\u30EA\u30B9\u30C8 -->
        <div id="sup-modal-list" class="mb-3"></div>
        <!-- \u8FFD\u52A0\u30D5\u30A9\u30FC\u30E0 -->
        <div class="card border-primary">
          <div class="card-header bg-primary text-white py-2 small fw-semibold">
            <i class="fas fa-plus me-1"></i>\u4ED5\u5165\u5148\u3092\u8FFD\u52A0
          </div>
          <div class="card-body py-3">
            <div class="row g-2 align-items-end">
              <div class="col-md-5">
                <label class="form-label small fw-semibold mb-1">\u4ED5\u5165\u5148 <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="sup-add-supplier">
                  <option value="">\u2015 \u9078\u629E \u2015</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label small fw-semibold mb-1">\u639B\u7387 <span class="text-muted fw-normal">(\u4F8B: 0.65)</span></label>
                <input type="number" class="form-control form-control-sm text-end" id="sup-add-rate"
                  min="0" max="1" step="0.01" placeholder="0.65">
              </div>
              <div class="col-md-2 d-flex align-items-center pt-4">
                <div class="form-check mb-0">
                  <input class="form-check-input" type="checkbox" id="sup-add-default">
                  <label class="form-check-label small" for="sup-add-default">\u30C7\u30D5\u30A9\u30EB\u30C8</label>
                </div>
              </div>
              <div class="col-md-2">
                <button class="btn btn-primary btn-sm w-100" id="btn-sup-add">
                  <i class="fas fa-plus me-1"></i>\u8FFD\u52A0
                </button>
              </div>
              <div class="col-12">
                <label class="form-label small fw-semibold mb-1">\u5099\u8003 <span class="text-muted fw-normal small">(\u6025\u304E\u7528\u30FB\u9001\u6599\u7121\u6599\u6761\u4EF6\u306A\u3069)</span></label>
                <input type="text" class="form-control form-control-sm" id="sup-add-notes" placeholder="\u4F8B: \u6025\u304E\u306E\u5834\u5408\u306E\u307F\u3001\u30EF\u30FC\u30AF\u30B9\u7D4C\u7531">
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">\u9589\u3058\u308B</button>
      </div>
    </div>
  </div>
</div>`;
  const o1 = getLayoutOpts(c);
  return layout("\u5546\u54C1\u30DE\u30B9\u30BF", content, scripts, o1.username, o1);
});
app2.get("/suppliers", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const res = await db2.prepare("SELECT * FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all();
  function omBadge(m, detail) {
    const d = String(detail || m || "").toLowerCase();
    if (d === "line" || d.includes("\u30E9\u30A4\u30F3")) return '<span class="badge" style="background:#06C755"><i class="fab fa-line me-1"></i>LINE</span>';
    if (d === "fax" || d.includes("\u30D5\u30A1\u30C3\u30AF\u30B9") || d.includes("fax")) return '<span class="badge bg-secondary"><i class="fas fa-fax me-1"></i>FAX</span>';
    if (d === "email" || d === "mail" || d.includes("\u30E1\u30FC\u30EB")) return '<span class="badge bg-primary"><i class="fas fa-envelope me-1"></i>\u30E1\u30FC\u30EB</span>';
    if (d === "tel" || d.includes("\u96FB\u8A71")) return '<span class="badge bg-warning text-dark"><i class="fas fa-phone me-1"></i>\u96FB\u8A71</span>';
    if (d) return `<span class="badge bg-light text-dark border">${esc(String(m || detail))}</span>`;
    return '<span class="text-muted small">\u672A\u8A2D\u5B9A</span>';
  }
  const rows = res.results.map((r) => `<tr data-id="${r["id"]}">
    <td>
      <div class="fw-semibold">${esc(r["name"])}</div>
      ${esc(r["alias_names"]) ? `<div class="text-muted small">${esc(r["alias_names"])}</div>` : ""}
    </td>
    <td>${esc(r["contact_name"]) || ""}${esc(r["honorific"]) || ""}</td>
    <td>${omBadge(r["order_method"], r["order_method_detail"])}</td>
    <td class="small">
      ${r["email"] ? `<a href="mailto:${esc(r["email"])}" class="text-decoration-none">${esc(r["email"])}</a>` : ""}
      ${r["line_id"] ? `<br><span class="badge" style="background:#06C755;font-size:0.7rem"><i class="fab fa-line me-1"></i>${esc(r["line_id"])}</span>` : ""}
      ${r["fax"] || r["fax_number"] ? `<br><span class="text-muted"><i class="fas fa-fax me-1"></i>${esc(r["fax"] || r["fax_number"])}</span>` : ""}
    </td>
    <td class="small" style="max-width:200px">${r["cc_emails"] ? `<span class="text-muted" style="word-break:break-all;font-size:0.8rem">${esc(r["cc_emails"])}</span>` : '<span class="text-muted small">\u2015</span>'}</td>
    <td class="small">${r["phone"] ? `<a href="tel:${esc(r["phone"])}" class="text-decoration-none">${esc(r["phone"])}</a>` : ""}</td>
    <td class="small">${esc(r["payment_method"])}</td>
    <td class="small">${r["shipping_rule"] ? `<span class="badge bg-info text-dark"><i class="fas fa-truck me-1"></i>${esc(r["shipping_rule"])}</span>` : ""}</td>
    <td class="small" style="max-width:220px">${r["notes"] ? `<span class="text-muted" data-bs-toggle="tooltip" data-bs-placement="left" title="${esc(r["notes"])}" style="cursor:help;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:200px">${esc(r["notes"])}</span>` : ""}</td>
    <td>
      <button class="btn btn-xs btn-outline-primary btn-edit-sup py-0 px-2" data-row='${JSON.stringify(r).replace(/'/g, "&#39;")}'><i class="fas fa-edit"></i></button>
      <button class="btn btn-xs btn-outline-danger btn-del-sup py-0 px-2 ms-1" data-id="${r["id"]}" data-name="${esc(r["name"])}"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join("");
  const scripts = `<script>
// Tooltip\u3092\u6709\u52B9\u5316\uFF08\u5099\u8003\u306E\u7701\u7565\u8868\u793A\uFF09
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function(el){
  new bootstrap.Tooltip(el);
});

var supModal = new bootstrap.Modal(document.getElementById('supModal'));
var editingSupId = null;

function openAddSup(){
  editingSupId = null;
  document.getElementById('supTitle').textContent = '\u4ED5\u5165\u5148\u3092\u8FFD\u52A0';
  document.getElementById('supForm').reset();
  document.getElementById('fld-honorific').value='\u69D8';
  updateMethodFields();
  supModal.show();
}

function updateMethodFields(){
  var v = document.getElementById('fld-om-detail').value.toLowerCase();
  document.getElementById('row-email').style.display = (v===''||v==='email'||v==='mail') ? '' : 'none';
  document.getElementById('row-line').style.display  = (v==='line') ? '' : 'none';
  document.getElementById('row-fax').style.display   = (v==='fax') ? '' : 'none';
}
document.getElementById('fld-om-detail').addEventListener('change', updateMethodFields);

document.querySelectorAll('.btn-edit-sup').forEach(function(btn){
  btn.addEventListener('click', function(){
    var r = JSON.parse(this.dataset.row);
    editingSupId = r.id;
    document.getElementById('supTitle').textContent = '\u4ED5\u5165\u5148\u3092\u7DE8\u96C6';
    var f = document.getElementById('supForm');
    ['name','alias_names','contact_name','honorific','order_method','order_method_detail',
     'phone','fax','fax_number','email','cc_emails','line_id','line_group_id',
     'payment_method','shipping_rule','free_shipping_threshold','website','postal_code','address','notes'
    ].forEach(function(k){ if(f[k]) f[k].value = r[k]??''; });
    updateMethodFields();
    supModal.show();
  });
});

document.querySelectorAll('.btn-del-sup').forEach(function(btn){
  btn.addEventListener('click', function(){
    if(!confirm(this.dataset.name + ' \u3092\u7121\u52B9\u5316\u3057\u307E\u3059\u304B\uFF1F')) return;
    fetch('/api/suppliers/'+this.dataset.id, {method:'DELETE'}).then(function(r){
      if(r.ok){ showFlash('\u7121\u52B9\u5316\u3057\u307E\u3057\u305F','success'); setTimeout(function(){ location.reload(); },800); }
      else showFlash('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger');
    });
  });
});

document.getElementById('supForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var fd = new FormData(this); var body = {};
  fd.forEach(function(v,k){ body[k]=v; });
  var url = editingSupId ? '/api/suppliers/'+editingSupId : '/api/suppliers';
  var resp = await fetch(url, {method: editingSupId?'PUT':'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if(resp.ok){
    showFlash(editingSupId?'\u66F4\u65B0\u3057\u307E\u3057\u305F':'\u8FFD\u52A0\u3057\u307E\u3057\u305F','success');
    supModal.hide(); setTimeout(function(){ location.reload(); },800);
  } else {
    var err = await resp.json().catch(function(){ return {}; });
    showFlash(err.error||'\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger');
  }
});
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-building me-2" style="color:var(--gw-green)"></i>\u4ED5\u5165\u5148\u30DE\u30B9\u30BF</h1>
    <p class="page-subtitle">${res.results.length} \u4EF6\u767B\u9332</p>
  </div>
  <div class="actions">
    <button class="btn btn-primary" onclick="openAddSup()"><i class="fas fa-plus me-1"></i>\u4ED5\u5165\u5148\u3092\u8FFD\u52A0</button>
  </div>
</div>
<div class="card">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead><tr>
        <th>\u4ED5\u5165\u5148\u540D</th><th>\u62C5\u5F53\u8005</th><th>\u767A\u6CE8\u65B9\u6CD5</th><th>\u9023\u7D61\u5148</th>
        <th>CC\u30A2\u30C9\u30EC\u30B9</th><th>\u96FB\u8A71</th><th>\u652F\u6255\u3044</th><th>\u9001\u6599\u6761\u4EF6</th><th>\u5099\u8003</th><th>\u64CD\u4F5C</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center py-4 text-muted">\u4ED5\u5165\u5148\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- \u4ED5\u5165\u5148\u30E2\u30FC\u30C0\u30EB -->
<div class="modal fade" id="supModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="supTitle">\u4ED5\u5165\u5148\u3092\u8FFD\u52A0</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <form id="supForm">
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">\u4ED5\u5165\u5148\u540D <span class="text-danger">*</span></label>
              <input class="form-control" name="name" required placeholder="\u4F8B: \u30D5\u30B8\u30AF\u30E9\u30B7\u30E3\u30D5\u30C8\u682A\u5F0F\u4F1A\u793E">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">\u5225\u540D / \u7565\u79F0</label>
              <input class="form-control" name="alias_names" placeholder="\u4F8B: \u30D5\u30B8\u30AF\u30E9, Fujikura">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u62C5\u5F53\u8005\u540D</label>
              <input class="form-control" name="contact_name" id="fld-contact" placeholder="\u5C71\u7530">
            </div>
            <div class="col-md-2">
              <label class="form-label fw-semibold">\u656C\u79F0</label>
              <select class="form-select" name="honorific" id="fld-honorific">
                <option value="\u69D8">\u69D8</option><option value="\u5FA1\u4E2D">\u5FA1\u4E2D</option>
                <option value="\u3055\u3093">\u3055\u3093</option><option value="">\u306A\u3057</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">\u767A\u6CE8\u65B9\u6CD5</label>
              <div class="d-flex gap-2">
                <input class="form-control" name="order_method" placeholder="\u30E1\u30FC\u30EB / LINE / FAX \u306A\u3069">
                <select class="form-select" name="order_method_detail" id="fld-om-detail" style="min-width:120px">
                  <option value="">\u2015 \u533A\u5206 \u2015</option>
                  <option value="email">\u{1F4E7} \u30E1\u30FC\u30EB</option>
                  <option value="line">\u{1F4AC} LINE</option>
                  <option value="fax">\u{1F4E0} FAX</option>
                  <option value="tel">\u{1F4DE} \u96FB\u8A71</option>
                  <option value="other">\u305D\u306E\u4ED6</option>
                </select>
              </div>
              <div class="form-text">\u533A\u5206\u3092\u9078\u3076\u3068\u95A2\u9023\u30D5\u30A9\u30FC\u30E0\u304C\u8868\u793A\u3055\u308C\u307E\u3059</div>
            </div>

            <!-- \u30E1\u30FC\u30EB -->
            <div class="col-12" id="row-email">
              <label class="form-label fw-semibold"><i class="fas fa-envelope text-primary me-1"></i>\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9</label>
              <input class="form-control" name="email" type="email" placeholder="order@example.com">
            </div>
            <div class="col-12" id="row-cc-emails">
              <label class="form-label fw-semibold"><i class="fas fa-user-plus text-secondary me-1"></i>CC\u30A2\u30C9\u30EC\u30B9 <span class="fw-normal text-muted small">(\u8907\u6570\u6307\u5B9A\u6642\u306F\u30AB\u30F3\u30DE\u533A\u5207\u308A)</span></label>
              <input class="form-control" name="cc_emails" placeholder="cc1@example.com, cc2@example.com">
              <div class="form-text"><i class="fas fa-info-circle me-1"></i>\u767A\u6CE8\u30E1\u30FC\u30EB\u4F5C\u6210\u6642\u306BCC\u5019\u88DC\u3068\u3057\u3066\u8868\u793A\u3055\u308C\u307E\u3059</div>
            </div>
            <!-- LINE -->
            <div class="col-md-6" id="row-line" style="display:none">
              <label class="form-label fw-semibold"><i class="fab fa-line me-1" style="color:#06C755"></i>LINE ID / \u30C8\u30FC\u30AFID</label>
              <input class="form-control" name="line_id" placeholder="@xxxx \u307E\u305F\u306F\u500B\u4EBAID">
            </div>
            <div class="col-md-6" id="row-line2" style="display:none">
              <label class="form-label fw-semibold">LINE\u30B0\u30EB\u30FC\u30D7ID (\u4EFB\u610F)</label>
              <input class="form-control" name="line_group_id">
            </div>
            <!-- FAX -->
            <div class="col-md-6" id="row-fax" style="display:none">
              <label class="form-label fw-semibold"><i class="fas fa-fax me-1"></i>FAX\u756A\u53F7</label>
              <input class="form-control" name="fax_number" placeholder="03-XXXX-XXXX">
            </div>

            <div class="col-md-4">
              <label class="form-label fw-semibold">\u96FB\u8A71\u756A\u53F7</label>
              <input class="form-control" name="phone" placeholder="03-XXXX-XXXX">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">FAX (\u65E7\u30D5\u30A3\u30FC\u30EB\u30C9)</label>
              <input class="form-control" name="fax" placeholder="03-XXXX-XXXX">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u652F\u6255\u3044\u65B9\u6CD5</label>
              <input class="form-control" name="payment_method" placeholder="\u58F2\u639B / \u73FE\u91D1 / \u632F\u8FBC">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">\u9001\u6599\u6761\u4EF6</label>
              <input class="form-control" name="shipping_rule" placeholder="\u4F8B: 3\u4E07\u5186\u4EE5\u4E0A\u9001\u6599\u7121\u6599">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u9001\u6599\u7121\u6599\u30E9\u30A4\u30F3 <small class="text-muted fw-normal">\uFF08\u30D7\u30FC\u30EB\u6A5F\u80FD\u7528\u30FB\u5186\uFF09</small></label>
              <div class="input-group">
                <span class="input-group-text">\xA5</span>
                <input class="form-control" name="free_shipping_threshold" type="number" min="0" step="1000" placeholder="25000">
              </div>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">Web\u30B5\u30A4\u30C8</label>
              <input class="form-control" name="website" type="url" placeholder="https://...">
            </div>
            <div class="col-md-2">
              <label class="form-label fw-semibold">\u90F5\u4FBF\u756A\u53F7</label>
              <input class="form-control" name="postal_code" placeholder="000-0000">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">\u4F4F\u6240</label>
              <input class="form-control" name="address">
            </div>
            <div class="col-12">
              <label class="form-label fw-semibold">\u5099\u8003</label>
              <textarea class="form-control" name="notes" rows="2"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>\u4FDD\u5B58</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
  const o2 = getLayoutOpts(c);
  return layout("\u4ED5\u5165\u5148\u30DE\u30B9\u30BF", content, scripts, o2.username, o2);
});
app2.get("/rules", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const res = await db2.prepare(`
    SELECT sr.*, s.name AS supplier_name FROM supplier_rules sr
    JOIN suppliers s ON sr.supplier_id=s.id
    WHERE sr.tenant_id=?
    ORDER BY sr.item_category, sr.manufacturer, sr.club_type, sr.priority
  `).bind(tenantId).all();
  const suppliers = await db2.prepare("SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all();
  const supplierOpts = suppliers.results.map((s) => `<option value="${s["id"]}">${esc(s["name"])}</option>`).join("");
  const cats = await db2.prepare("SELECT DISTINCT item_category FROM products WHERE is_active=1 AND tenant_id=? ORDER BY item_category").bind(tenantId).all();
  const catOpts = cats.results.map((c2) => `<option value="${esc(c2.item_category)}">${esc(c2.item_category)}</option>`).join("");
  const rows = res.results.map((r) => `<tr data-id="${r["id"]}">
    <td>${r["item_category"] ? `<span class="badge bg-secondary">${esc(r["item_category"])}</span>` : '<span class="text-muted small">\u5168\u54C1\u76EE</span>'}</td>
    <td>${r["manufacturer"] ? esc(r["manufacturer"]) : '<span class="text-muted small">\u5168\u30E1\u30FC\u30AB\u30FC</span>'}</td>
    <td>${r["club_type"] ? esc(r["club_type"]) : '<span class="text-muted small">\u5168\u7A2E\u985E</span>'}</td>
    <td><strong>${esc(r["supplier_name"])}</strong></td>
    <td class="text-center">${r["rate"] != null ? (Number(r["rate"]) * 100).toFixed(1) + "%" : "\u2015"}</td>
    <td class="text-center"><span class="badge bg-light text-dark border">${r["priority"]}</span></td>
    <td class="small text-muted">${esc(r["notes"])}</td>
    <td>
      <button class="btn btn-xs btn-outline-primary btn-edit-rule py-0 px-2" data-row='${JSON.stringify(r).replace(/'/g, "&#39;")}'>  <i class="fas fa-edit"></i></button>
      <button class="btn btn-xs btn-outline-danger btn-del-rule py-0 px-2 ms-1" data-id="${r["id"]}"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join("");
  const scripts = `<script>
var ruleModal = new bootstrap.Modal(document.getElementById('ruleModal'));
var editingRuleId = null;

function openAddRule(){
  editingRuleId=null;
  document.getElementById('ruleTitle').textContent='\u30EB\u30FC\u30EB\u3092\u8FFD\u52A0';
  document.getElementById('ruleForm').reset();
  document.getElementById('rl-priority').value=100;
  ruleModal.show();
}

document.querySelectorAll('.btn-edit-rule').forEach(function(btn){
  btn.addEventListener('click',function(){
    var r=JSON.parse(this.dataset.row);
    editingRuleId=r.id;
    document.getElementById('ruleTitle').textContent='\u30EB\u30FC\u30EB\u3092\u7DE8\u96C6';
    var f=document.getElementById('ruleForm');
    f['item_category'].value=r.item_category??'';
    f['manufacturer'].value=r.manufacturer??'';
    f['club_type'].value=r.club_type??'';
    f['supplier_id'].value=r.supplier_id;
    f['rate'].value=r.rate!=null?r.rate:'';
    f['priority'].value=r.priority??100;
    f['notes'].value=r.notes??'';
    ruleModal.show();
  });
});

document.querySelectorAll('.btn-del-rule').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(!confirm('\u3053\u306E\u30EB\u30FC\u30EB\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
    fetch('/api/rules/'+this.dataset.id,{method:'DELETE'}).then(function(r){
      if(r.ok){showFlash('\u524A\u9664\u3057\u307E\u3057\u305F','success');setTimeout(function(){location.reload();},800);}
      else showFlash('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger');
    });
  });
});

document.getElementById('ruleForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var fd=new FormData(this);var body={};
  fd.forEach(function(v,k){body[k]=v;});
  var url=editingRuleId?'/api/rules/'+editingRuleId:'/api/rules';
  var resp=await fetch(url,{method:editingRuleId?'PUT':'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(resp.ok){
    showFlash(editingRuleId?'\u66F4\u65B0\u3057\u307E\u3057\u305F':'\u8FFD\u52A0\u3057\u307E\u3057\u305F','success');
    ruleModal.hide();setTimeout(function(){location.reload();},800);
  }else{showFlash('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger');}
});
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-sitemap me-2" style="color:var(--gw-green)"></i>\u4ED5\u5165\u5148\u5224\u5B9A\u30EB\u30FC\u30EB</h1>
    <p class="page-subtitle">\u54C1\u76EE\u30FB\u30E1\u30FC\u30AB\u30FC\u30FB\u7A2E\u985E\u304B\u3089\u767A\u6CE8\u5148\u3092\u81EA\u52D5\u5224\u5B9A\u3059\u308B\u30EB\u30FC\u30EB\u3067\u3059\u3002\u512A\u5148\u9806\u4F4D\u306E\u5C0F\u3055\u3044\u65B9\u304C\u512A\u5148\u3055\u308C\u307E\u3059\u3002</p>
  </div>
  <div class="actions">
    <button class="btn btn-primary" onclick="openAddRule()"><i class="fas fa-plus me-1"></i>\u30EB\u30FC\u30EB\u3092\u8FFD\u52A0</button>
  </div>
</div>

<div class="alert alert-info py-2 small mb-3">
  <i class="fas fa-info-circle me-1"></i>
  <strong>\u5224\u5B9A\u30ED\u30B8\u30C3\u30AF:</strong> \u5546\u54C1\u3092\u767A\u6CE8\u3059\u308B\u969B\u3001\u54C1\u76EE \u2192 \u30E1\u30FC\u30AB\u30FC \u2192 \u7A2E\u985E\u306E\u9806\u306B\u7D5E\u308A\u8FBC\u307F\u3001\u6700\u3082\u512A\u5148\u5EA6\u306E\u9AD8\u3044\u30EB\u30FC\u30EB\u306E\u4ED5\u5165\u5148\u306B\u81EA\u52D5\u632F\u308A\u5206\u3051\u3055\u308C\u307E\u3059\u3002\u7A7A\u6B04\u306F\u300C\u3059\u3079\u3066\u300D\u306B\u30DE\u30C3\u30C1\u3057\u307E\u3059\u3002
</div>

<div class="card">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead><tr>
        <th>\u54C1\u76EE</th><th>\u30E1\u30FC\u30AB\u30FC</th><th>\u7A2E\u985E</th><th>\u4ED5\u5165\u5148</th>
        <th class="text-center">\u639B\u7387</th><th class="text-center">\u512A\u5148\u9806\u4F4D</th><th>\u5099\u8003</th><th>\u64CD\u4F5C</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="text-center py-4 text-muted">\u30EB\u30FC\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- \u30EB\u30FC\u30EB\u8FFD\u52A0\u30FB\u7DE8\u96C6\u30E2\u30FC\u30C0\u30EB -->
<div class="modal fade" id="ruleModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="ruleTitle">\u30EB\u30FC\u30EB\u3092\u8FFD\u52A0</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <form id="ruleForm">
        <div class="modal-body">
          <div class="alert alert-warning py-2 small"><i class="fas fa-lightbulb me-1"></i>\u7A7A\u6B04\u306B\u3059\u308B\u3068\u300C\u3059\u3079\u3066\u306E\u54C1\u76EE / \u30E1\u30FC\u30AB\u30FC / \u7A2E\u985E\u300D\u306B\u30DE\u30C3\u30C1\u3057\u307E\u3059\u3002</div>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u54C1\u76EE</label>
              <input class="form-control" name="item_category" list="rl-cat" placeholder="\u7A7A\u6B04=\u5168\u54C1\u76EE">
              <datalist id="rl-cat">${catOpts}</datalist>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u30E1\u30FC\u30AB\u30FC</label>
              <input class="form-control" name="manufacturer" placeholder="\u7A7A\u6B04=\u5168\u30E1\u30FC\u30AB\u30FC">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u7A2E\u985E</label>
              <input class="form-control" name="club_type" placeholder="\u7A7A\u6B04=\u5168\u7A2E\u985E">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">\u4ED5\u5165\u5148 <span class="text-danger">*</span></label>
              <select class="form-select" name="supplier_id" required>
                <option value="">\u2015 \u9078\u629E \u2015</option>
                ${supplierOpts}
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u639B\u7387 (\u4F8B: 0.54)</label>
              <input class="form-control text-end" name="rate" type="number" min="0" max="1" step="0.01" placeholder="0.54">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">\u512A\u5148\u9806\u4F4D <small class="text-muted">(\u5C0F=\u512A\u5148)</small></label>
              <input class="form-control text-end" name="priority" id="rl-priority" type="number" min="1" value="100">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">\u5099\u8003</label>
              <input class="form-control" name="notes">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>\u4FDD\u5B58</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
  const o3 = getLayoutOpts(c);
  return layout("\u5224\u5B9A\u30EB\u30FC\u30EB", content, scripts, o3.username, o3);
});
app2.get("/purchase-pool", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const orders = await db2.prepare(`
    SELECT po.id, po.order_no, po.order_date, po.ordered_by,
           po.customer_name, po.usage_type, po.order_note,
           s.id AS supplier_id, s.name AS supplier_name,
           s.free_shipping_threshold,
           COALESCE(SUM(poi.amount),0) AS total_amount,
           COALESCE(SUM(poi.quantity),0) AS total_qty,
           COUNT(DISTINCT poi.id) AS line_count
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.status = 'pool' AND po.tenant_id=?
    GROUP BY po.id
    ORDER BY s.name, po.id
  `).bind(tenantId).all();
  const supplierMap = /* @__PURE__ */ new Map();
  for (const o of orders.results) {
    const sid = o["supplier_id"];
    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, {
        supplier_id: sid,
        supplier_name: o["supplier_name"],
        free_shipping_threshold: o["free_shipping_threshold"],
        orders: [],
        pool_total: 0
      });
    }
    const g = supplierMap.get(sid);
    g.orders.push(o);
    g.pool_total += o["total_amount"] || 0;
  }
  const groups = Array.from(supplierMap.values());
  const allOrderIds = orders.results.map((o) => o["id"]);
  const itemsByOrder = /* @__PURE__ */ new Map();
  for (const oid of allOrderIds) {
    const items = await db2.prepare(
      "SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id"
    ).bind(oid).all();
    itemsByOrder.set(oid, items.results);
  }
  const totalPoolOrders = orders.results.length;
  const groupsHtml = groups.length === 0 ? `
    <div class="text-center py-5 text-muted">
      <i class="fas fa-layer-group fa-3x mb-3 d-block opacity-50"></i>
      <p class="mb-0">\u30D7\u30FC\u30EB\u306B\u8FFD\u52A0\u3055\u308C\u305F\u767A\u6CE8\u306F\u3042\u308A\u307E\u305B\u3093</p>
      <a href="/orders/new" class="btn btn-primary mt-3">
        <i class="fas fa-plus me-1"></i>\u65B0\u898F\u767A\u6CE8\u3092\u4F5C\u6210
      </a>
    </div>` : groups.map((g) => {
    const threshold = g.free_shipping_threshold;
    const pct = threshold ? Math.min(100, Math.round(g.pool_total / threshold * 100)) : null;
    const remaining = threshold ? Math.max(0, threshold - g.pool_total) : null;
    const achieved = threshold ? g.pool_total >= threshold : false;
    const progressHtml = threshold ? `
      <div class="mb-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <small class="text-muted">\u9001\u6599\u7121\u6599\u307E\u3067</small>
          ${achieved ? `<span class="badge bg-success"><i class="fas fa-check me-1"></i>\u9001\u6599\u7121\u6599\u9054\u6210\uFF01</span>` : `<span class="text-danger fw-bold small">\u3042\u3068 \xA5${remaining.toLocaleString()}</span>`}
        </div>
        <div class="progress" style="height:10px">
          <div class="progress-bar ${achieved ? "bg-success" : "bg-warning"}"
               style="width:${pct}%" role="progressbar"></div>
        </div>
        <div class="d-flex justify-content-between mt-1">
          <small class="text-muted">\xA5${g.pool_total.toLocaleString()}</small>
          <small class="text-muted">\xA5${threshold.toLocaleString()}</small>
        </div>
      </div>` : `
      <div class="mb-2">
        <small class="text-muted">\u5408\u8A08\u91D1\u984D: <strong>\xA5${g.pool_total.toLocaleString()}</strong>\u3000\uFF08\u9001\u6599\u7121\u6599\u30E9\u30A4\u30F3\u672A\u8A2D\u5B9A\uFF09</small>
      </div>`;
    const ordersHtml = g.orders.map((o) => {
      const items = itemsByOrder.get(o["id"]) || [];
      const itemsHtml = items.map((item) => `
        <tr class="small">
          <td class="ps-3 text-muted">${esc(item["item_category"])}</td>
          <td>${esc(item["manufacturer"])}</td>
          <td>${esc(item["product_name"])}</td>
          <td>${esc(item["spec"])}</td>
          <td>${esc(item["color"])}</td>
          <td class="text-end">${item["quantity"]}</td>
          <td class="text-end">\xA5${(item["unit_price"] || 0).toLocaleString()}</td>
          <td class="text-end">\xA5${(item["amount"] || 0).toLocaleString()}</td>
          <td>${esc(item["line_note"])}</td>
        </tr>`).join("");
      return `
      <div class="border rounded mb-2 p-2 bg-light" data-order-id="${o["id"]}">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <span class="small text-muted me-2">${esc(o["order_date"])}</span>
            ${o["customer_name"] ? `<span class="small fw-bold me-2">${esc(o["customer_name"])}</span>` : ""}
            ${o["usage_type"] ? `<span class="badge bg-light text-dark border me-1">${esc(o["usage_type"])}</span>` : ""}
            <span class="small text-muted">${o["line_count"]}\u660E\u7D30</span>
            <strong class="ms-2">\xA5${(o["total_amount"] || 0).toLocaleString()}</strong>
            ${o["order_note"] ? `<span class="small text-muted ms-2"><i class="fas fa-sticky-note me-1"></i>${esc(o["order_note"])}</span>` : ""}
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-xs btn-outline-secondary btn-toggle-items py-0 px-2"
                    data-order-id="${o["id"]}" title="\u660E\u7D30\u3092\u8868\u793A">
              <i class="fas fa-list"></i>
            </button>
            <button class="btn btn-xs btn-outline-danger btn-remove-pool py-0 px-2"
                    data-order-id="${o["id"]}" title="\u30D7\u30FC\u30EB\u304B\u3089\u524A\u9664">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="items-area mt-2" id="items-${o["id"]}" style="display:none">
          <table class="table table-sm table-bordered mb-0 bg-white small">
            <thead>
              <tr>
                <th>\u54C1\u76EE</th><th>\u30E1\u30FC\u30AB\u30FC</th><th>\u5546\u54C1\u540D</th>
                <th>\u4ED5\u69D8</th><th>\u8272</th><th class="text-end">\u6570\u91CF</th>
                <th class="text-end">\u5358\u4FA1</th><th class="text-end">\u91D1\u984D</th><th>\u5099\u8003</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
      </div>`;
    }).join("");
    const orderIdsJson = JSON.stringify(g.orders.map((o) => o["id"]));
    return `
    <div class="card mb-4 ${achieved ? "border-success" : ""}" data-supplier-id="${g.supplier_id}">
      <div class="card-header d-flex justify-content-between align-items-center ${achieved ? "bg-success bg-opacity-10" : "bg-white"}">
        <div>
          <h5 class="mb-0"><i class="fas fa-truck me-2 text-primary"></i>${esc(g.supplier_name)}</h5>
          <small class="text-muted">${g.orders.length}\u4EF6\u306E\u767A\u6CE8</small>
        </div>
        <button class="btn btn-primary btn-execute-pool"
                data-order-ids='${orderIdsJson}'
                data-supplier="${esc(g.supplier_name)}">
          <i class="fas fa-paper-plane me-1"></i>\u307E\u3068\u3081\u3066\u767A\u6CE8\u3059\u308B
        </button>
      </div>
      <div class="card-body">
        ${progressHtml}
        <hr class="my-2">
        ${ordersHtml}
      </div>
    </div>`;
  }).join("");
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-layer-group me-2" style="color:#d97706"></i>\u767A\u6CE8\u30D7\u30FC\u30EB</h1>
    <p class="page-subtitle">\u9001\u6599\u7121\u6599\u30E9\u30A4\u30F3\u3092\u8D85\u3048\u305F\u3089\u307E\u3068\u3081\u3066\u767A\u6CE8 \u2014 \u73FE\u5728 <strong>${totalPoolOrders}</strong> \u4EF6\u30D7\u30FC\u30EB\u4E2D</p>
  </div>
  <div class="actions">
    <a href="/orders/new" class="btn btn-primary">
      <i class="fas fa-plus me-1"></i>\u65B0\u898F\u767A\u6CE8
    </a>
  </div>
</div>
${groupsHtml}
<div id="pool-toast" class="toast align-items-center text-white bg-success border-0 position-fixed bottom-0 end-0 m-3" role="alert" style="z-index:9999">
  <div class="d-flex">
    <div class="toast-body" id="pool-toast-msg"></div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
  </div>
</div>`;
  const scripts = `<script>
(function(){
  // \u660E\u7D30\u30C8\u30B0\u30EB
  document.querySelectorAll('.btn-toggle-items').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = this.dataset.orderId;
      var area = document.getElementById('items-' + id);
      if (!area) return;
      area.style.display = area.style.display === 'none' ? '' : 'none';
    });
  });

  // \u30D7\u30FC\u30EB\u304B\u3089\u524A\u9664
  document.querySelectorAll('.btn-remove-pool').forEach(function(btn){
    btn.addEventListener('click', async function(){
      if (!confirm('\u3053\u306E\u767A\u6CE8\u3092\u30D7\u30FC\u30EB\u304B\u3089\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      var id = this.dataset.orderId;
      var resp = await fetch('/api/pool/' + id, {method:'DELETE'});
      if (resp.ok) { location.reload(); }
      else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    });
  });

  // \u307E\u3068\u3081\u3066\u767A\u6CE8
  document.querySelectorAll('.btn-execute-pool').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var supplier = this.dataset.supplier;
      var ids = JSON.parse(this.dataset.orderIds);
      if (!confirm(supplier + ' \u306E ' + ids.length + ' \u4EF6\u3092\u307E\u3068\u3081\u3066\u767A\u6CE8\u3057\u307E\u3059\u304B\uFF1F\\n\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D\u304C\u4F5C\u6210\u3055\u308C\u307E\u3059\u3002')) return;
      this.disabled = true;
      this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u51E6\u7406\u4E2D...';
      var resp = await fetch('/api/pool/execute', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({order_ids: ids})
      });
      if (resp.ok) {
        var data = await resp.json();
        window.location.href = '/mail-batch/' + data.batch_code;
      } else {
        alert('\u767A\u6CE8\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        this.disabled = false;
        this.innerHTML = '<i class="fas fa-paper-plane me-1"></i>\u307E\u3068\u3081\u3066\u767A\u6CE8\u3059\u308B';
      }
    });
  });
})();
</script>`;
  const o4 = getLayoutOpts(c);
  return layout("\u767A\u6CE8\u30D7\u30FC\u30EB", content, scripts, o4.username, o4);
});
app2.get("/orders", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const status = (c.req.query("status") || "").trim();
  const supplier = (c.req.query("supplier") || "").trim();
  const q = (c.req.query("q") || "").trim();
  let sql = `SELECT po.id, po.order_no, po.order_date, po.status, po.customer_name, po.usage_type,
    s.name AS supplier_name,
    COUNT(DISTINCT poi.id) AS line_count,
    COALESCE(SUM(poi.amount),0) AS total_amount,
    COALESCE(SUM(poi.quantity),0) AS total_qty
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
    WHERE po.tenant_id=?`;
  const params = [tenantId];
  if (status) {
    sql += " AND po.status=?";
    params.push(status);
  }
  if (supplier) {
    sql += " AND s.name LIKE ?";
    params.push(`%${supplier}%`);
  }
  if (q) {
    sql += " AND (po.order_no LIKE ? OR po.customer_name LIKE ? OR po.ordered_by LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " GROUP BY po.id ORDER BY po.id DESC";
  const stmt = db2.prepare(sql);
  const res = params.length ? await stmt.bind(...params).all() : await stmt.all();
  const statusOpts = ["draft_created", "ordered", "partial", "completed", "cancelled"];
  const statusNames = {
    draft_created: "\u4E0B\u66F8\u304D\u4F5C\u6210\u6E08",
    ordered: "\u767A\u6CE8\u6E08",
    partial: "\u4E00\u90E8\u5165\u8377",
    completed: "\u5B8C\u7D0D",
    cancelled: "\u30AD\u30E3\u30F3\u30BB\u30EB"
  };
  const rows = res.results.map((r) => `<tr>
    <td><a href="/orders/${r["id"]}">${esc(r["order_no"])}</a></td>
    <td>${esc(r["order_date"])}</td>
    <td>${esc(r["supplier_name"])}</td>
    <td>${esc(r["customer_name"])}</td>
    <td>${esc(r["usage_type"])}</td>
    <td class="text-center">${r["line_count"]}</td>
    <td class="text-center">${r["total_qty"]}</td>
    <td class="text-end">${yen2(r["total_amount"])}</td>
    <td>${statusBadge(String(r["status"]))}</td>
    <td class="text-center">
      <button class="btn btn-xs btn-outline-danger py-0 px-2 btn-delete-order"
              data-order-id="${r["id"]}" data-order-no="${esc(r["order_no"])}"
              title="\u524A\u9664">
        <i class="fas fa-trash-alt"></i>
      </button>
    </td>
  </tr>`).join("");
  const listScript = `<script>
document.querySelectorAll('.btn-delete-order').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var orderNo = this.dataset.orderNo;
    var id = this.dataset.orderId;
    if (!confirm('\u767A\u6CE8\u300C' + orderNo + '\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\\n\\n\u5165\u8377\u5C65\u6B74\u3082\u542B\u3081\u3066\u5B8C\u5168\u306B\u524A\u9664\u3055\u308C\u307E\u3059\u3002\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    var r = await fetch('/api/orders/' + id, {method:'DELETE'});
    if (r.ok) {
      var row = btn.closest('tr');
      row.style.transition = 'opacity 0.3s';
      row.style.opacity = '0';
      setTimeout(function(){ row.remove(); }, 300);
    } else {
      var d = await r.json().catch(function(){ return {}; });
      alert(d.error || '\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    }
  });
});
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-list me-2" style="color:var(--gw-green)"></i>\u767A\u6CE8\u4E00\u89A7</h1>
    <p class="page-subtitle">\u767A\u6CE8\u5C65\u6B74\u3068\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u4E00\u89A7\u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
  </div>
  <div class="actions">
    <a class="btn btn-primary" href="/orders/new"><i class="fas fa-plus me-1"></i>\u65B0\u898F\u767A\u6CE8</a>
  </div>
</div>
<div class="card mb-3">
  <div class="card-body py-2">
    <form class="row g-2 align-items-center">
      <div class="col-md-2">
        <select name="status" class="form-select form-select-sm">
          <option value="">\u5168\u30B9\u30C6\u30FC\u30BF\u30B9</option>
          ${statusOpts.map((s) => `<option value="${s}" ${status === s ? "selected" : ""}>${statusNames[s]}</option>`).join("")}
        </select>
      </div>
      <div class="col-md-2"><input class="form-control form-control-sm" name="supplier" value="${esc(supplier)}" placeholder="\u4ED5\u5165\u5148\u3067\u7D5E\u308A\u8FBC\u307F"></div>
      <div class="col-md-3"><input class="form-control form-control-sm" name="q" value="${esc(q)}" placeholder="\u767A\u6CE8\u756A\u53F7\u30FB\u9867\u5BA2\u540D\u30FB\u767A\u6CE8\u8005"></div>
      <div class="col-auto"><button class="btn btn-sm btn-primary"><i class="fas fa-search me-1"></i>\u691C\u7D22</button></div>
      ${status || supplier || q ? '<div class="col-auto"><a href="/orders" class="btn btn-sm btn-outline-secondary"><i class="fas fa-times me-1"></i>\u30AF\u30EA\u30A2</a></div>' : ""}
    </form>
  </div>
</div>
<div class="card">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead><tr>
        <th>\u767A\u6CE8\u756A\u53F7</th><th>\u767A\u6CE8\u65E5</th><th>\u4ED5\u5165\u5148</th><th>\u9867\u5BA2\u540D</th><th>\u7528\u9014</th>
        <th class="text-center">\u660E\u7D30</th><th class="text-center">\u6570\u91CF</th>
        <th class="text-end">\u91D1\u984D</th><th>\u72B6\u614B</th><th></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center text-muted py-4">\u5BFE\u8C61\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${res.results.length}\u4EF6</div>
</div>`;
  const o5 = getLayoutOpts(c);
  return layout("\u767A\u6CE8\u4E00\u89A7", content, listScript, o5.username, o5);
});
app2.get("/orders/new", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const [productRes, supplierRes] = await Promise.all([
    db2.prepare(`
      SELECT p.id, p.item_category, p.manufacturer, p.name, p.spec, p.club_type,
             p.list_price, p.default_rate, s.name AS supplier_name
      FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
      WHERE p.is_active=1 AND p.tenant_id=? ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000
    `).bind(tenantId).all(),
    db2.prepare(`SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name`).bind(tenantId).all()
  ]);
  const dataScript = `<script>var PRODUCTS = ${JSON.stringify(productRes.results)};var SUPPLIERS = ${JSON.stringify(supplierRes.results)};</script>`;
  const modalHtml = `
<div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header py-2">
        <div class="d-flex align-items-center gap-2 flex-grow-1">
          <button type="button" id="modal-back" class="btn btn-sm btn-outline-secondary" style="display:none">
            <i class="fas fa-chevron-left me-1"></i>\u623B\u308B
          </button>
          <h6 class="modal-title mb-0 fw-bold" id="modal-title">\u30AB\u30C6\u30B4\u30EA\u30FC\u3092\u9078\u629E</h6>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="px-3 pt-2 pb-1" id="modal-search-wrap" style="display:none">
        <input type="text" id="modal-search" class="form-control form-control-sm"
               placeholder="\u5546\u54C1\u540D\u30FB\u4ED5\u69D8\u30FB\u7A2E\u985E\u3067\u7D5E\u308A\u8FBC\u307F\u2026">
      </div>
      <div class="modal-body p-0" id="modal-body" style="max-height:440px;overflow-y:auto"></div>
    </div>
  </div>
</div>`;
  const content = `
${dataScript}
${modalHtml}
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-plus-circle me-2" style="color:var(--gw-green)"></i>\u65B0\u898F\u767A\u6CE8</h1>
    <p class="page-subtitle">\u30AB\u30C6\u30B4\u30EA\u30FC\u304B\u3089\u5546\u54C1\u3092\u9078\u629E\u3057\u3066\u767A\u6CE8\u660E\u7D30\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
  </div>
  <div class="actions">
    <a href="/purchase-pool" class="btn btn-outline-secondary btn-sm"><i class="fas fa-layer-group me-1"></i>\u767A\u6CE8\u30D7\u30FC\u30EB</a>
    <a href="/orders" class="btn btn-outline-secondary btn-sm"><i class="fas fa-list me-1"></i>\u767A\u6CE8\u4E00\u89A7</a>
  </div>
</div>
<form id="order-form">
  <div class="card mb-3">
    <div class="card-header"><span class="card-title"><i class="fas fa-info-circle me-1"></i>\u767A\u6CE8\u30D8\u30C3\u30C0</span></div>
    <div class="card-body row g-3">
      <div class="col-6 col-md-2">
        <label class="form-label">\u767A\u6CE8\u65E5</label>
        <input class="form-control" type="date" name="order_date" value="${todayStr()}">
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">\u767A\u6CE8\u8005 <span class="text-danger">*</span></label>
        <input class="form-control" name="ordered_by" placeholder="\u53E4\u5DDD" required>
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">\u9867\u5BA2\u540D</label>
        <input class="form-control" name="customer_name" placeholder="\u4E0A\u7530\u69D8">
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">\u7528\u9014</label>
        <input class="form-control" name="usage_type" placeholder="\u53D6\u308A\u5BC4\u305B / \u5728\u5EAB\u7528">
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">\u5E0C\u671B\u7D0D\u671F</label>
        <input class="form-control" type="date" name="requested_delivery_date">
      </div>
      <div class="col-12">
        <label class="form-label">\u767A\u6CE8\u5099\u8003</label>
        <textarea class="form-control" name="order_note" rows="2"
                  placeholder="\u30E1\u30FC\u30EB\u672C\u6587\u3078\u5DEE\u3057\u8FBC\u3080\u5168\u4F53\u5099\u8003"></textarea>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div class="d-flex align-items-center gap-3">
        <strong><i class="fas fa-table me-1"></i>\u767A\u6CE8\u660E\u7D30</strong>
        <span class="text-muted small">
          \u5408\u8A08\u91D1\u984D\uFF1A<strong id="total-amount" class="text-primary fs-6">\u2015</strong>
        </span>
      </div>
      <button type="button" class="btn btn-sm btn-outline-primary" id="add-row">
        <i class="fas fa-plus me-1"></i>\u884C\u3092\u8FFD\u52A0
      </button>
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0" id="line-table">
        <thead>
          <tr>
            <th style="min-width:160px">\u9078\u629E\u5546\u54C1</th>
            <th style="min-width:72px">\u54C1\u76EE</th>
            <th style="min-width:90px">\u30E1\u30FC\u30AB\u30FC</th>
            <th style="min-width:150px">\u5546\u54C1\u540D</th>
            <th style="min-width:60px">\u4ED5\u69D8</th>
            <th style="min-width:55px">\u8272</th>
            <th style="min-width:65px">\u7A2E\u985E</th>
            <th style="min-width:55px">\u6570\u91CF</th>
            <th style="min-width:80px">\u5B9A\u4FA1</th>
            <th style="min-width:68px">\u639B\u7387</th>
            <th style="min-width:80px">\u5358\u4FA1</th>
            <th style="min-width:90px">\u5099\u8003</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="card-footer bg-white py-3">
      <!-- \u4ED5\u5165\u5148\u5099\u8003\u30D7\u30EC\u30D3\u30E5\u30FC\uFF08\u5546\u54C1\u9078\u629E\u5F8C\u306B\u81EA\u52D5\u8868\u793A\uFF09 -->
      <div id="supplier-notes-area"></div>
      <div class="d-flex justify-content-between align-items-center mt-2">
        <p class="text-muted small mb-0">
          <i class="fas fa-lightbulb me-1 text-warning"></i>
          \u5B9A\u4FA1\u30FB\u639B\u7387\u3092\u5165\u529B\u3059\u308B\u3068\u5358\u4FA1\u304C\u81EA\u52D5\u8A08\u7B97\u3055\u308C\u307E\u3059
        </p>
        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-primary btn-lg px-4">
            <i class="fas fa-paper-plane me-1"></i>\u767A\u6CE8\u30C7\u30FC\u30BF\u3068\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D\u3092\u4F5C\u6210
          </button>
          <button type="button" class="btn btn-outline-warning btn-lg px-4" id="btn-add-to-pool">
            <i class="fas fa-layer-group me-1"></i>\u30D7\u30FC\u30EB\u306B\u8FFD\u52A0
          </button>
        </div>
      </div>
    </div>
  </div>
</form>`;
  const newOrderScripts = `<script src="/static/new-order.js"></script>`;
  const o6 = getLayoutOpts(c);
  return layout("\u65B0\u898F\u767A\u6CE8", content, newOrderScripts, o6.username, o6);
});
app2.get("/mail-batch/:batch_code", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const batchCode = c.req.param("batch_code");
  const BATCH_DEFAULT_CC = c.env.APP_DEFAULT_CC || "";
  const orders = await db2.prepare(`
    SELECT po.*, s.name AS supplier_name, s.email AS supplier_email,
           s.cc_emails AS supplier_cc_emails, s.contact_name, s.order_method
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id
    WHERE po.batch_code=? AND po.tenant_id=? ORDER BY po.id
  `).bind(batchCode, tenantId).all();
  const groupMap = /* @__PURE__ */ new Map();
  for (const order of orders.results) {
    const items = await db2.prepare(
      "SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id"
    ).bind(order["id"]).all();
    const email = String(order["supplier_email"] ?? "") || `__no_email_${order["id"]}`;
    if (!groupMap.has(email)) {
      groupMap.set(email, {
        supplierName: String(order["supplier_name"] ?? ""),
        supplierEmail: String(order["supplier_email"] ?? ""),
        supplierCcEmails: String(order["supplier_cc_emails"] ?? ""),
        orderMethod: String(order["order_method"] ?? ""),
        orders: []
      });
    }
    groupMap.get(email).orders.push({ order, items: items.results });
  }
  const senderName = c.env.APP_SENDER_NAME || "";
  const senderShop = c.env.APP_SENDER_SHOP || "";
  const senderAddr = c.env.APP_SENDER_ADDR || "";
  const senderTel = c.env.APP_SENDER_TEL || "";
  const senderMail = c.env.APP_SENDER_MAIL || "";
  function buildMailBody(supplierName, contactName, honorific, orderNote, items) {
    const lines = items.map((item) => {
      const spec = item["spec"] ? ` / ${item["spec"]}` : "";
      const color = item["color"] ? ` / ${item["color"]}` : "";
      const clubType = item["club_type"] ? ` / ${item["club_type"]}` : "";
      const unit = String(item["unit"] || "\u672C");
      return `\u30FB${item["item_category"]} / ${item["manufacturer"] || ""} / ${item["product_name"]}${spec}${color}${clubType} / ${item["quantity"]}${unit}`;
    });
    const noteBlock = orderNote.trim() ? `
\u5099\u8003:
${orderNote.trim()}
` : "";
    const greeting = senderName ? `\u304A\u4E16\u8A71\u306B\u306A\u3063\u3066\u304A\u308A\u307E\u3059\u3002
${senderName}\u3067\u3054\u3056\u3044\u307E\u3059\u3002` : "\u304A\u4E16\u8A71\u306B\u306A\u3063\u3066\u304A\u308A\u307E\u3059\u3002";
    const sigLines = [];
    if (senderShop) sigLines.push(senderShop);
    if (senderAddr) sigLines.push(senderAddr);
    if (senderTel) sigLines.push(`TEL\uFF1A${senderTel}`);
    if (senderMail) sigLines.push(`mail\uFF1A${senderMail}`);
    const sig = sigLines.length ? `---------------------------
${sigLines.join("\n")}
---------------------------` : "";
    return `${supplierName}
${contactName}${honorific}

${greeting}

\u4E0B\u8A18\u306E\u901A\u308A\u3001\u767A\u6CE8\u3092\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002

${lines.join("\n")}
${noteBlock}
\u3054\u78BA\u8A8D\u306E\u307B\u3069\u3001\u3088\u308D\u3057\u304F\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002
${sig ? "\n" + sig : ""}`;
  }
  const cards = [];
  for (const [, group] of groupMap) {
    const allItems = group.orders.flatMap((g) => g.items);
    const itemRows = allItems.map((item) => `<tr>
      <td>${esc(item["item_category"])}</td><td>${esc(item["manufacturer"])}</td>
      <td>${esc(item["product_name"])}</td><td>${esc(item["spec"])}</td>
      <td>${esc(item["club_type"])}</td>
      <td class="text-center">${item["quantity"]}</td>
      <td class="text-end">${yen2(item["unit_price"])}</td>
      <td class="text-end">${yen2(item["amount"])}</td>
    </tr>`).join("");
    const firstOrder = group.orders[0].order;
    const emailSubject = String(firstOrder["email_subject"] ?? "\u767A\u6CE8\u306E\u304A\u9858\u3044");
    const orderNotesCombined = [...new Set(
      group.orders.map((g) => String(g.order["order_note"] ?? "").trim()).filter(Boolean)
    )].join("\n");
    const emailBody = buildMailBody(
      group.supplierName,
      String(firstOrder["contact_name"] ?? "\u3054\u62C5\u5F53\u8005"),
      String(firstOrder["honorific"] ?? "\u69D8"),
      orderNotesCombined,
      allItems
    );
    const supplierEmail = group.supplierEmail;
    const ccCandidates = [
      ...BATCH_DEFAULT_CC ? [BATCH_DEFAULT_CC] : [],
      ...group.supplierCcEmails ? group.supplierCcEmails.split(",").map((s) => s.trim()).filter(Boolean) : []
    ];
    const ccUniq = [...new Set(ccCandidates)];
    const initialCC = group.supplierCcEmails ? group.supplierCcEmails.split(",").map((s) => s.trim()).filter(Boolean).join(", ") : BATCH_DEFAULT_CC;
    const ccCandidateHtml = ccUniq.length > 0 ? `<div class="mt-1 d-flex flex-wrap gap-1">
          <span class="small text-muted me-1">CC\u5019\u88DC:</span>
          ${ccUniq.map(
      (addr) => `<button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 batch-cc-candidate"
              style="font-size:0.75rem" data-addr="${esc(addr)}">${esc(addr)}</button>`
    ).join("")}
        </div>` : "";
    const orderNos = group.orders.map((g) => String(g.order["order_no"])).join("\u3001");
    const orderLinks = group.orders.map(
      (g) => `<a class="btn btn-sm btn-outline-primary" href="/orders/${g.order["id"]}">
        <i class="fas fa-edit me-1"></i>${esc(String(g.order["order_no"]))}
      </a>`
    ).join("");
    const bodyEscaped = emailBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bodyJson = JSON.stringify(emailBody);
    const mailtoHref = supplierEmail ? "mailto:" + supplierEmail + "?" + (initialCC ? "cc=" + encodeURIComponent(initialCC) + "&" : "") + "subject=" + encodeURIComponent(emailSubject) + "&body=" + encodeURIComponent(emailBody) : "";
    const isMerged = group.orders.length > 1;
    cards.push(`
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <strong><i class="fas fa-building me-1"></i>${esc(group.supplierName)}</strong>
          ${isMerged ? `<span class="badge bg-warning text-dark ms-2"><i class="fas fa-compress-arrows-alt me-1"></i>${group.orders.length}\u4EF6\u307E\u3068\u3081</span>` : `<span class="text-muted ms-2 small">${esc(orderNos)}</span>`}
        </div>
        <div class="small text-muted">\u767A\u6CE8\u65B9\u6CD5: ${esc(group.orderMethod) || "\u672A\u8A2D\u5B9A"}</div>
      </div>
      <div class="card-body">
        <!-- \u5B9B\u5148\u30FBCC\u30FB\u4EF6\u540D -->
        <div class="row g-2 mb-3">
          <div class="col-md-4">
            <label class="form-label fw-semibold small text-muted mb-1">\u5B9B\u5148 (To)</label>
            <input class="form-control form-control-sm" readonly value="${esc(supplierEmail)}">
          </div>
          <div class="col-md-8">
            <label class="form-label fw-semibold small text-muted mb-1">CC <span class="text-muted fw-normal">(\u7DE8\u96C6\u53EF)</span></label>
            <input type="text" class="form-control form-control-sm batch-cc-input"
              data-email="${esc(supplierEmail)}"
              data-subject="${esc(emailSubject)}"
              data-body="${esc(emailBody)}"
              value="${esc(initialCC)}"
              autocomplete="off" placeholder="cc@example.com, cc2@example.com">
            ${ccCandidateHtml}
          </div>
          <div class="col-12">
            <label class="form-label fw-semibold small text-muted mb-1">\u4EF6\u540D</label>
            <input class="form-control form-control-sm" readonly value="${esc(emailSubject)}">
          </div>
        </div>
        <!-- \u672C\u6587 -->
        <div class="mb-3">
          <label class="form-label fw-semibold small text-muted mb-1">\u672C\u6587</label>
          <textarea class="form-control font-monospace batch-body-ta" rows="12" readonly>${bodyEscaped}</textarea>
        </div>
        <!-- \u660E\u7D30\u30C6\u30FC\u30D6\u30EB -->
        <div class="table-responsive mb-3">
          <table class="table table-sm mb-0">
            <thead><tr>
              <th>\u54C1\u76EE</th><th>\u30E1\u30FC\u30AB\u30FC</th><th>\u5546\u54C1\u540D</th><th>\u4ED5\u69D8</th><th>\u7A2E\u985E</th>
              <th class="text-center">\u6570\u91CF</th><th class="text-end">\u5358\u4FA1</th><th class="text-end">\u91D1\u984D</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <!-- \u30DC\u30BF\u30F3\u7FA4 -->
        <div class="d-flex gap-2 flex-wrap align-items-center">
          ${mailtoHref ? `<a class="btn btn-primary btn-sm batch-mailto-btn" href="${mailtoHref}"><i class="fas fa-envelope me-1"></i>\u30E1\u30FC\u30EB\u30BD\u30D5\u30C8\u3067\u958B\u304F</a>` : ""}
          <button class="btn btn-outline-success btn-sm" onclick="copyBody(this,${bodyJson})">
            <i class="fas fa-copy me-1"></i>\u672C\u6587\u3092\u30B3\u30D4\u30FC
          </button>
          <button class="btn btn-success btn-sm btn-mark-ordered"
            data-order-ids="${group.orders.map((g) => g.order["id"]).join(",")}">
            <i class="fas fa-paper-plane me-1"></i>\u767A\u6CE8\u6E08\u307F\u306B\u3059\u308B
          </button>
          <div class="ms-auto d-flex gap-1 flex-wrap">
            <span class="small text-muted align-self-center me-1">\u5546\u54C1\u8FFD\u52A0\u30FB\u7DE8\u96C6:</span>
            ${orderLinks}
          </div>
        </div>
      </div>
    </div>`);
  }
  const scripts = `<script>
function copyBody(btn, text){
  navigator.clipboard.writeText(text).then(function(){
    var orig = btn.innerHTML;
    btn.innerHTML='<i class="fas fa-check me-1"></i>\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F';
    btn.classList.replace('btn-outline-success','btn-success');
    setTimeout(function(){ btn.innerHTML=orig; btn.classList.replace('btn-success','btn-outline-success'); },2000);
  });
}

// CC\u5019\u88DC\u30DC\u30BF\u30F3 \u2192 CC\u5165\u529B\u6B04\u306B\u30A2\u30C9\u30EC\u30B9\u3092\u8FFD\u52A0/\u524A\u9664
document.querySelectorAll('.batch-cc-candidate').forEach(function(btn){
  btn.addEventListener('click', function(){
    var card = btn.closest('.card');
    var ccInp = card ? card.querySelector('.batch-cc-input') : null;
    if(!ccInp) return;
    var addr = btn.dataset.addr || '';
    var cur = ccInp.value.trim();
    var addrs = cur ? cur.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
    var idx = addrs.indexOf(addr);
    if(idx >= 0){
      // \u3059\u3067\u306B\u8FFD\u52A0\u6E08\u307F \u2192 \u524A\u9664
      addrs.splice(idx, 1);
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-outline-secondary');
    } else {
      // \u672A\u8FFD\u52A0 \u2192 \u8FFD\u52A0
      addrs.push(addr);
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-secondary');
    }
    ccInp.value = addrs.join(', ');
    ccInp.dispatchEvent(new Event('input'));
  });
  // \u521D\u671F\u72B6\u614B\u3067CC\u6B04\u306B\u542B\u307E\u308C\u3066\u3044\u308C\u3070\u30A2\u30AF\u30C6\u30A3\u30D6\u8868\u793A
  var card = btn.closest('.card');
  var ccInp = card ? card.querySelector('.batch-cc-input') : null;
  if(ccInp && ccInp.value.includes(btn.dataset.addr)){
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-secondary');
  }
});

// CC\u5165\u529B \u2192 mailto\u30EA\u30F3\u30AF\u3092\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u66F4\u65B0
document.querySelectorAll('.batch-cc-input').forEach(function(ccInp){
  var card = ccInp.closest('.card');
  var mailtoBtn = card ? card.querySelector('.batch-mailto-btn') : null;
  if(!mailtoBtn) return;
  function rebuild(){
    var email   = ccInp.dataset.email;
    var subject = ccInp.dataset.subject;
    var body    = ccInp.dataset.body;
    var cc      = ccInp.value.trim();
    var qs = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if(cc) qs += '&cc=' + encodeURIComponent(cc);
    mailtoBtn.href = 'mailto:' + email + '?' + qs;
  }
  ccInp.addEventListener('input', rebuild);
  rebuild(); // \u521D\u671F\u5316
});

// \u767A\u6CE8\u6E08\u307F\u306B\u3059\u308B
document.querySelectorAll('.btn-mark-ordered').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var ids = btn.dataset.orderIds.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    var label = ids.length > 1 ? ids.length + '\u4EF6\u306E\u767A\u6CE8' : '1\u4EF6\u306E\u767A\u6CE8';
    if(!confirm(label + '\u3092\u300C\u767A\u6CE8\u6E08\u307F\u300D\u306B\u66F4\u65B0\u3057\u307E\u3059\u304B\uFF1F')) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u66F4\u65B0\u4E2D...';

    try {
      // \u5404\u767A\u6CE8\u3092\u9806\u756A\u306B\u767A\u6CE8\u6E08\u307F\u3078\u66F4\u65B0
      var failed = [];
      for(var i = 0; i < ids.length; i++){
        var r = await fetch('/api/orders/' + ids[i] + '/status', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          credentials: 'include',
          body: JSON.stringify({status: 'ordered'}),
        });
        if(!r.ok) failed.push(ids[i]);
      }

      if(failed.length === 0){
        // \u6210\u529F\uFF1A\u30DC\u30BF\u30F3\u3092\u5B8C\u4E86\u8868\u793A\u306B\u3057\u3066\u30AB\u30FC\u30C9\u3092\u30B0\u30EC\u30FC\u30A2\u30A6\u30C8
        btn.innerHTML = '<i class="fas fa-check me-1"></i>\u767A\u6CE8\u6E08\u307F\u306B\u3057\u307E\u3057\u305F';
        btn.classList.replace('btn-success', 'btn-secondary');
        var card = btn.closest('.card');
        if(card){
          card.style.opacity = '0.6';
          card.querySelector('.card-header').style.background = '#f8f9fa';
        }
        // \u30E1\u30FC\u30EB\u30BD\u30D5\u30C8\u3067\u958B\u304F\u30DC\u30BF\u30F3\u306A\u3069\u4ED6\u30DC\u30BF\u30F3\u3082\u7121\u52B9\u5316
        var mailtoBtn = card ? card.querySelector('.batch-mailto-btn') : null;
        if(mailtoBtn) mailtoBtn.classList.replace('btn-primary','btn-secondary');

        // \u540C\u4E00\u9867\u5BA2\u306E\u6B21\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u3078\u81EA\u52D5\u9077\u79FB\uFF08\u6700\u5F8C\u306EAPI\u30EC\u30B9\u30DD\u30F3\u30B9\u3092\u4F7F\u7528\uFF09
        // \u203B\u8907\u6570ID\u3042\u308B\u5834\u5408\u306F\u6700\u5F8C\u306E\u30EC\u30B9\u30DD\u30F3\u30B9\u3092\u4F7F\u7528
        var nextBatch = null, nextOrder = null;
        for(var j = 0; j < ids.length; j++){
          var rCheck = await fetch('/api/orders/' + ids[j] + '/status', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({status: 'ordered'}),
          });
          // \u65E2\u306B\u66F4\u65B0\u6E08\u307F\u306A\u306E\u3067\u7D50\u679C\u306F\u7121\u8996\u3001next\u60C5\u5831\u3060\u3051\u53D6\u5F97
          try {
            var dCheck = await rCheck.json();
            if(dCheck.next_mail_batch) nextBatch = dCheck.next_mail_batch;
            else if(dCheck.next_order_id) nextOrder = dCheck.next_order_id;
          } catch(e2){}
        }
        if(nextBatch){
          setTimeout(function(){
            if(confirm('\u540C\u3058\u304A\u5BA2\u69D8\u306E\u5225\u4ED5\u5165\u5148\u3078\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u304C\u3042\u308A\u307E\u3059\u3002\u7D9A\u3051\u3066\u51E6\u7406\u3057\u307E\u3059\u304B\uFF1F')){
              location.href = '/mail-batch/' + nextBatch;
            }
          }, 600);
        } else if(nextOrder){
          setTimeout(function(){
            if(confirm('\u540C\u3058\u304A\u5BA2\u69D8\u306E\u5225\u4ED5\u5165\u5148\u3078\u306E\u767A\u6CE8\u304C\u3042\u308A\u307E\u3059\u3002\u7D9A\u3051\u3066\u51E6\u7406\u3057\u307E\u3059\u304B\uFF1F')){
              location.href = '/orders/' + nextOrder;
            }
          }, 600);
        }
      } else {
        alert('\u4E00\u90E8\u306E\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08ID: ' + failed.join(', ') + '\uFF09');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>\u767A\u6CE8\u6E08\u307F\u306B\u3059\u308B';
      }
    } catch(e){
      alert('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>\u767A\u6CE8\u6E08\u307F\u306B\u3059\u308B';
    }
  });
});
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-envelope-open-text me-2" style="color:var(--gw-green)"></i>\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D\u4E00\u89A7</h1>
    <p class="page-subtitle">\u4ED5\u5165\u5148\u3054\u3068\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D\u3067\u3059\u3002CC\u306F\u7DE8\u96C6\u53EF\u80FD\u3067\u3059\u3002\u300C\u30E1\u30FC\u30EB\u30BD\u30D5\u30C8\u3067\u958B\u304F\u300D\u3067Outlook\u306B\u8EE2\u8A18\u3067\u304D\u307E\u3059\u3002</p>
  </div>
  <div class="actions">
    <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-list me-1"></i>\u767A\u6CE8\u4E00\u89A7\u3078</a>
  </div>
</div>
${cards.length ? cards.join("") : '<div class="alert alert-warning">\u8A72\u5F53\u3059\u308B\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D\u304C\u3042\u308A\u307E\u305B\u3093\u3002</div>'}`;
  const o7 = getLayoutOpts(c);
  return layout("\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D", content, scripts, o7.username, o7);
});
app2.get("/orders/:id/edit", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u4E0D\u6B63\u306AID\u3067\u3059\u3002</div>', "", "", getLayoutOpts(c));
  const order = await db2.prepare(`
    SELECT po.*, s.name AS supplier_name
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id
    WHERE po.id=? AND po.tenant_id=?
  `).bind(id, tenantId).first();
  if (!order) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u767A\u6CE8\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002</div>', "", "", getLayoutOpts(c));
  const scripts = `<script>
(function(){
  var form    = document.getElementById('edit-header-form');
  var saveBtn = document.getElementById('btn-save-header');

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u4FDD\u5B58\u4E2D...';

    var payload = {
      order_date:                form.order_date.value.trim()                || null,
      ordered_by:                form.ordered_by.value.trim()                || null,
      customer_name:             form.customer_name.value.trim()             || null,
      usage_type:                form.usage_type.value.trim()                || null,
      requested_delivery_date:   form.requested_delivery_date.value.trim()   || null,
      order_note:                form.order_note.value.trim()                || null,
    };

    try {
      var r = await fetch('/api/orders/${id}/header', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      var d = await r.json();
      if (r.ok) {
        location.href = '/orders/${id}';
      } else {
        alert(d.error || '\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>\u4FDD\u5B58\u3057\u3066\u767A\u6CE8\u8A73\u7D30\u306B\u623B\u308B';
      }
    } catch(err) {
      alert('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>\u4FDD\u5B58\u3057\u3066\u767A\u6CE8\u8A73\u7D30\u306B\u623B\u308B';
    }
  });
})();
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-edit me-2" style="color:var(--gw-green)"></i>\u767A\u6CE8\u60C5\u5831\u3092\u7DE8\u96C6</h1>
    <p class="page-subtitle">${esc(order["order_no"])} / <strong>${esc(order["supplier_name"])}</strong></p>
  </div>
  <div class="actions">
    <a class="btn btn-outline-secondary" href="/orders/${id}">
      <i class="fas fa-arrow-left me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u3066\u623B\u308B
    </a>
  </div>
</div>

<form id="edit-header-form">
  <div class="card mb-3">
    <div class="card-header"><strong><i class="fas fa-info-circle me-1"></i>\u767A\u6CE8\u30D8\u30C3\u30C0\u30FC</strong></div>
    <div class="card-body row g-3">

      <div class="col-6 col-md-3">
        <label class="form-label">\u767A\u6CE8\u65E5</label>
        <input class="form-control" type="date" name="order_date"
          value="${esc(order["order_date"])}">
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">\u767A\u6CE8\u8005 <span class="text-danger">*</span></label>
        <input class="form-control" name="ordered_by"
          placeholder="\u53E4\u5DDD" value="${esc(order["ordered_by"])}" required>
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">\u9867\u5BA2\u540D</label>
        <input class="form-control" name="customer_name"
          placeholder="\u4E0A\u7530\u69D8" value="${esc(order["customer_name"])}">
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">\u7528\u9014</label>
        <input class="form-control" name="usage_type"
          placeholder="\u53D6\u308A\u5BC4\u305B / \u5728\u5EAB\u7528" value="${esc(order["usage_type"])}">
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">\u5E0C\u671B\u7D0D\u671F</label>
        <input class="form-control" type="date" name="requested_delivery_date"
          value="${esc(order["requested_delivery_date"])}">
      </div>

      <div class="col-12">
        <label class="form-label">\u767A\u6CE8\u5099\u8003 <span class="text-muted small">\uFF08\u30E1\u30FC\u30EB\u672C\u6587\u306E\u672B\u5C3E\u306B\u8FFD\u8A18\u3055\u308C\u307E\u3059\uFF09</span></label>
        <textarea class="form-control" name="order_note" rows="3"
          placeholder="\u30E1\u30FC\u30EB\u672C\u6587\u3078\u5DEE\u3057\u8FBC\u3080\u5168\u4F53\u5099\u8003">${esc(order["order_note"])}</textarea>
      </div>

    </div>
    <div class="card-footer bg-white d-flex justify-content-end gap-2">
      <a class="btn btn-outline-secondary" href="/orders/${id}">
        <i class="fas fa-times me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB
      </a>
      <button type="submit" class="btn btn-primary px-4" id="btn-save-header">
        <i class="fas fa-save me-1"></i>\u4FDD\u5B58\u3057\u3066\u767A\u6CE8\u8A73\u7D30\u306B\u623B\u308B
      </button>
    </div>
  </div>
</form>`;
  const o8 = getLayoutOpts(c);
  return layout(`\u767A\u6CE8\u60C5\u5831\u7DE8\u96C6 ${esc(order["order_no"])}`, content, scripts, o8.username, o8);
});
app2.get("/orders/:id", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u4E0D\u6B63\u306AID\u3067\u3059\u3002</div>', "", "", getLayoutOpts(c));
  const order = await db2.prepare(`
    SELECT po.*, s.name AS supplier_name, s.email AS supplier_email,
           s.cc_emails AS supplier_cc_emails,
           s.contact_name, s.honorific, s.order_method, s.order_method_detail,
           s.phone, s.line_id, s.fax, s.fax_number, s.website,
           s.notes AS supplier_notes, s.shipping_rule AS supplier_shipping_rule
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=? AND po.tenant_id=?
  `).bind(id, tenantId).first();
  if (!order) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u767A\u6CE8\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002</div>', "", "", getLayoutOpts(c));
  const curStatus = String(order["status"] ?? "");
  const isEditable = curStatus === "draft_created" || curStatus === "pool";
  const [items, receipts, productRes, supplierRes] = await Promise.all([
    db2.prepare(`
      SELECT poi.*,
        COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
      FROM purchase_order_items poi WHERE poi.purchase_order_id=? ORDER BY poi.id
    `).bind(id).all(),
    db2.prepare("SELECT * FROM receipts WHERE purchase_order_id=? ORDER BY id DESC").bind(id).all(),
    // 下書き/プールのときだけ商品マスタを取得（それ以外は空）
    isEditable ? db2.prepare(
      `SELECT p.id, p.item_category,
                           p.manufacturer AS maker_name,
                           p.name         AS product_name,
                           p.spec, p.color, p.club_type,
                           p.list_price, p.default_rate,
                           s.name AS supplier_name
                    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
                    WHERE p.is_active=1 AND p.tenant_id=? ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000`
    ).bind(tenantId).all() : Promise.resolve({ results: [] }),
    isEditable ? db2.prepare("SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all() : Promise.resolve({ results: [] })
  ]);
  const totalAmount = items.results.reduce((s, i) => s + (Number(i["amount"]) || 0), 0);
  const itemRows = items.results.map((item) => {
    const remaining = Number(item["quantity"] || 0) - Number(item["received_qty"] || 0);
    const pct = Number(item["quantity"] || 0) > 0 ? Math.round(Number(item["received_qty"] || 0) / Number(item["quantity"] || 0) * 100) : 0;
    const editBtns = isEditable ? `
      <td class="text-center" style="white-space:nowrap">
        <button class="btn btn-xs btn-outline-primary py-0 px-1 btn-edit-item"
          data-poi-id="${item["id"]}"
          data-item-category="${esc(item["item_category"])}"
          data-manufacturer="${esc(item["manufacturer"])}"
          data-product-name="${esc(item["product_name"])}"
          data-spec="${esc(item["spec"])}"
          data-color="${esc(item["color"])}"
          data-club-type="${esc(item["club_type"])}"
          data-quantity="${item["quantity"]}"
          data-list-price="${item["list_price"] ?? ""}"
          data-rate="${item["rate"] ?? ""}"
          data-unit-price="${item["unit_price"] ?? ""}"
          data-line-note="${esc(item["line_note"])}"
          title="\u7DE8\u96C6"><i class="fas fa-edit"></i></button>
        <button class="btn btn-xs btn-outline-danger py-0 px-1 ms-1 btn-delete-item"
          data-poi-id="${item["id"]}"
          data-product-name="${esc(item["product_name"])}"
          title="\u524A\u9664"><i class="fas fa-trash"></i></button>
      </td>` : "";
    return `<tr data-poi-id="${item["id"]}">
      <td><span class="badge bg-secondary">${esc(item["item_category"])}</span></td>
      <td class="small">${esc(item["manufacturer"])}</td>
      <td><strong>${esc(item["product_name"])}</strong></td>
      <td class="small text-muted">${[esc(item["spec"]), esc(item["color"])].filter(Boolean).join(" / ")}</td>
      <td class="small">${esc(item["club_type"])}</td>
      <td class="text-center fw-semibold">${item["quantity"]}</td>
      <td class="text-center cell-received">
        <span class="text-success fw-semibold recv-qty">${item["received_qty"]}</span>
        <div class="progress" style="height:4px;width:48px;margin:2px auto 0">
          <div class="progress-bar bg-success recv-bar" style="width:${pct}%"></div>
        </div>
      </td>
      <td class="text-center cell-remaining ${remaining > 0 ? "text-danger fw-bold" : "text-muted"}">${remaining}</td>
      <td class="text-end">${yen2(item["unit_price"])}</td>
      <td class="text-end fw-semibold">${yen2(item["amount"])}</td>
      <td class="small text-muted">${esc(item["line_note"])}</td>
      ${editBtns}
    </tr>`;
  }).join("");
  const receiptRows = receipts.results.length ? receipts.results.map((r) => `<tr>
        <td>${esc(r["received_date"])}</td><td>${esc(r["slip_date"]) || "\u2015"}</td>
        <td>${esc(r["inspected_by"]) || "\u2015"}</td><td>${esc(r["note"])}</td>
      </tr>`).join("") : '<tr><td colspan="4" class="text-center py-3 text-muted">\u307E\u3060\u7D0D\u54C1\u767B\u9332\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>';
  const emailBody = String(order["email_body"] ?? "");
  const emailSubject = String(order["email_subject"] ?? "");
  const supplierEmail = String(order["supplier_email"] ?? "");
  const lineId = String(order["line_id"] ?? "");
  const faxNum = String((order["fax_number"] || order["fax"]) ?? "");
  const phone = String(order["phone"] ?? "");
  const omDetail = String(order["order_method_detail"] ?? order["order_method"] ?? "").toLowerCase();
  const bodyEsc = emailBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bodyJson = JSON.stringify(emailBody);
  const noBodyBlock = `
<div class="alert alert-warning d-flex align-items-center gap-2 mb-2" id="no-body-alert">
  <i class="fas fa-exclamation-triangle"></i>
  <div class="flex-grow-1">\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304C\u307E\u3060\u4F5C\u6210\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002</div>
  <button class="btn btn-warning btn-sm" id="btn-regen-mail">
    <i class="fas fa-magic me-1"></i>\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u751F\u6210\u3059\u308B
  </button>
</div>`;
  const DEFAULT_CC = c.env.APP_DEFAULT_CC || "";
  const supplierCcEmails = String(order["supplier_cc_emails"] ?? "");
  const detailCcCandidates = [
    ...DEFAULT_CC ? [DEFAULT_CC] : [],
    ...supplierCcEmails ? supplierCcEmails.split(",").map((s) => s.trim()).filter(Boolean) : []
  ];
  const detailCcUniq = [...new Set(detailCcCandidates)];
  const initialDetailCC = supplierCcEmails ? supplierCcEmails.split(",").map((s) => s.trim()).filter(Boolean).join(", ") : DEFAULT_CC;
  const mailtoWithCC = supplierEmail ? "mailto:" + supplierEmail + "?" + (initialDetailCC ? "cc=" + encodeURIComponent(initialDetailCC) + "&" : "") + "subject=" + encodeURIComponent(emailSubject) + "&body=" + encodeURIComponent(emailBody) : "";
  const detailCcCandidateHtml = detailCcUniq.length > 0 ? `<div class="mt-1 d-flex flex-wrap gap-1">
        <span class="small text-muted me-1">CC\u5019\u88DC:</span>
        ${detailCcUniq.map(
    (addr) => `<button type="button" class="btn btn-xs detail-cc-candidate py-0 px-1 ${initialDetailCC.includes(addr) ? "btn-secondary" : "btn-outline-secondary"}"
            style="font-size:0.75rem" data-addr="${esc(addr)}">${esc(addr)}</button>`
  ).join("")}
      </div>` : "";
  const emailPanel = `
${emailBody ? "" : noBodyBlock}
<div class="mb-2 d-flex gap-2 flex-wrap align-items-center">
  <span class="fw-semibold text-muted small">\u5B9B\u5148:</span>
  <span>${supplierEmail ? `<a href="mailto:${esc(supplierEmail)}">${esc(supplierEmail)}</a>` : '<em class="text-muted">\u672A\u8A2D\u5B9A</em>'}</span>
</div>
<div class="mb-2">
  <label class="fw-semibold text-muted small mb-1" for="email-cc-input">CC:</label>
  <input type="text" id="email-cc-input" class="form-control form-control-sm"
    style="max-width:480px"
    value="${esc(initialDetailCC)}"
    placeholder="cc@example.com, cc2@example.com"
    autocomplete="off">
  ${detailCcCandidateHtml}
</div>
<div class="mb-2">
  <span class="fw-semibold text-muted small">\u4EF6\u540D:</span>
  <span class="ms-1" id="email-subject-span">${esc(emailSubject)}</span>
</div>
<div class="mb-2 position-relative">
  <textarea id="email-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2 flex-wrap">
  ${mailtoWithCC ? `<a class="btn btn-primary btn-sm" id="btn-mailto" href="${mailtoWithCC}"><i class="fas fa-envelope me-1"></i>\u30E1\u30FC\u30EB\u30BD\u30D5\u30C8\u3067\u958B\u304F</a>` : ""}
  <button class="btn btn-outline-success btn-sm" id="btn-copy-body"><i class="fas fa-copy me-1"></i>\u672C\u6587\u3092\u30B3\u30D4\u30FC</button>
</div>`;
  const linePanel = `
${emailBody ? "" : noBodyBlock}
<div class="alert alert-success py-2 mb-2">
  <i class="fab fa-line me-1"></i>
  LINE ID: <strong>${lineId || "\u672A\u8A2D\u5B9A"}</strong>
  ${lineId ? `<a class="btn btn-sm btn-success ms-3" href="https://line.me/R/ti/p/${esc(lineId)}" target="_blank"><i class="fab fa-line me-1"></i>LINE\u3067\u958B\u304F</a>` : ""}
</div>
<div class="mb-2 position-relative">
  <label class="form-label fw-semibold small text-muted">\u9001\u4FE1\u30C6\u30AD\u30B9\u30C8\uFF08\u30B3\u30D4\u30FC\u3057\u3066LINE\u306B\u8CBC\u308A\u4ED8\u3051\uFF09</label>
  <textarea id="line-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2">
  <button class="btn btn-success btn-sm" id="btn-copy-line"><i class="fas fa-copy me-1"></i>\u30C6\u30AD\u30B9\u30C8\u3092\u30B3\u30D4\u30FC</button>
</div>`;
  const faxPanel = `
${emailBody ? "" : noBodyBlock}
<div class="alert alert-secondary py-2 mb-2">
  <i class="fas fa-fax me-1"></i>
  FAX\u756A\u53F7: <strong>${faxNum || "\u672A\u8A2D\u5B9A"}</strong>
  ${phone ? ` / TEL: <strong>${esc(phone)}</strong>` : ""}
</div>
<div class="mb-2">
  <label class="form-label fw-semibold small text-muted">FAX\u672C\u6587\uFF08\u5370\u5237\u307E\u305F\u306F\u30B3\u30D4\u30FC\u3057\u3066\u3054\u5229\u7528\u304F\u3060\u3055\u3044\uFF09</label>
  <textarea id="fax-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2">
  <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="fas fa-print me-1"></i>\u5370\u5237</button>
  <button class="btn btn-outline-secondary btn-sm" id="btn-copy-fax"><i class="fas fa-copy me-1"></i>\u672C\u6587\u3092\u30B3\u30D4\u30FC</button>
</div>`;
  let orderPanel;
  let orderPanelTitle;
  let orderPanelIcon;
  if (omDetail === "line" || omDetail.includes("\u30E9\u30A4\u30F3")) {
    orderPanel = linePanel;
    orderPanelTitle = "LINE\u9001\u4FE1";
    orderPanelIcon = "fab fa-line text-success";
  } else if (omDetail === "fax" || omDetail.includes("fax") || omDetail.includes("\u30D5\u30A1\u30C3\u30AF\u30B9")) {
    orderPanel = faxPanel;
    orderPanelTitle = "FAX\u9001\u4FE1";
    orderPanelIcon = "fas fa-fax text-secondary";
  } else {
    orderPanel = emailPanel;
    orderPanelTitle = "\u30E1\u30FC\u30EB\u4E0B\u66F8\u304D";
    orderPanelIcon = "fas fa-envelope text-primary";
  }
  const statusButtons = {
    ordered: '<button class="btn btn-sm btn-primary" id="btn-s-ordered"><i class="fas fa-paper-plane me-1"></i>\u767A\u6CE8\u6E08\u306B\u66F4\u65B0</button>',
    completed: '<button class="btn btn-sm btn-success" id="btn-s-completed"><i class="fas fa-check-double me-1"></i>\u5B8C\u7D0D\u306B\u3059\u308B</button>',
    cancelled: '<button class="btn btn-sm btn-outline-danger" id="btn-s-cancelled"><i class="fas fa-ban me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB</button>'
  };
  const showButtons = curStatus === "draft_created" ? [statusButtons.ordered, statusButtons.cancelled] : curStatus === "ordered" ? [statusButtons.completed, statusButtons.cancelled] : curStatus === "partial" ? [statusButtons.completed, statusButtons.cancelled] : [];
  const addItemModalHtml = isEditable ? `
<div class="modal fade" id="addItemModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header py-2">
        <div class="d-flex align-items-center gap-2 flex-grow-1">
          <button type="button" id="aim-back" class="btn btn-sm btn-outline-secondary" style="display:none">
            <i class="fas fa-chevron-left me-1"></i>\u623B\u308B
          </button>
          <h6 class="modal-title mb-0 fw-bold" id="aim-title">\u30AB\u30C6\u30B4\u30EA\u30FC\u3092\u9078\u629E</h6>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="px-3 pt-2 pb-1" id="aim-search-wrap" style="display:none">
        <input type="text" id="aim-search" class="form-control form-control-sm" placeholder="\u5546\u54C1\u540D\u30FB\u4ED5\u69D8\u30FB\u7A2E\u985E\u3067\u7D5E\u308A\u8FBC\u307F\u2026">
      </div>
      <div class="modal-body p-0" id="aim-body" style="max-height:400px;overflow-y:auto"></div>
      <!-- \u78BA\u8A8D\u30D5\u30A9\u30FC\u30E0 -->
      <div class="modal-footer flex-column align-items-stretch d-none" id="aim-form-area">
        <div class="row g-2 w-100">
          <div class="col-12">
            <label class="form-label form-label-sm mb-1 fw-semibold">\u5546\u54C1\u540D</label>
            <input id="aim-pname" class="form-control form-control-sm" readonly>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u8272</label>
            <div id="aim-color-wrap">
              <input id="aim-color" class="form-control form-control-sm" placeholder="\u8272">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u6570\u91CF <span class="text-danger">*</span></label>
            <input id="aim-qty" type="number" min="1" value="1" class="form-control form-control-sm text-center">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u5B9A\u4FA1</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">\xA5</span>
              <input id="aim-list-price" type="number" min="0" class="form-control text-end">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u639B\u7387</label>
            <input id="aim-rate" type="number" min="0" max="1" step="0.001" class="form-control form-control-sm text-end" placeholder="0.55">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u5358\u4FA1</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">\xA5</span>
              <input id="aim-unit-price" type="number" min="0" class="form-control text-end" placeholder="\u81EA\u52D5\u8A08\u7B97">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u5099\u8003</label>
            <input id="aim-note" class="form-control form-control-sm" placeholder="\u4EFB\u610F">
          </div>
        </div>
        <div class="d-flex gap-2 w-100 mt-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" id="aim-back-form">
            <i class="fas fa-chevron-left me-1"></i>\u5546\u54C1\u9078\u629E\u306B\u623B\u308B
          </button>
          <button type="button" class="btn btn-primary btn-sm flex-grow-1" id="aim-submit">
            <i class="fas fa-plus me-1"></i>\u3053\u306E\u5546\u54C1\u3092\u8FFD\u52A0\u3059\u308B
          </button>
        </div>
      </div>
    </div>
  </div>
</div>` : "";
  const dataScript = isEditable ? `<script>var AIM_PRODUCTS=${JSON.stringify(productRes.results)};var AIM_SUPPLIERS=${JSON.stringify(supplierRes.results)};</script>` : "";
  const editItemModalHtml = isEditable ? `
<div class="modal fade" id="editItemModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header py-2">
        <h6 class="modal-title fw-bold" id="eim-title">\u660E\u7D30\u3092\u7DE8\u96C6</h6>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="eim-poi-id">
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label form-label-sm mb-1 fw-semibold">\u54C1\u76EE</label>
            <input id="eim-item-category" class="form-control form-control-sm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1 fw-semibold">\u30E1\u30FC\u30AB\u30FC</label>
            <input id="eim-manufacturer" class="form-control form-control-sm">
          </div>
          <div class="col-12">
            <label class="form-label form-label-sm mb-1 fw-semibold">\u5546\u54C1\u540D <span class="text-danger">*</span></label>
            <input id="eim-product-name" class="form-control form-control-sm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u4ED5\u69D8</label>
            <input id="eim-spec" class="form-control form-control-sm" placeholder="\u4F8B: 20cm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u8272</label>
            <input id="eim-color" class="form-control form-control-sm" placeholder="\u4F8B: \u30DB\u30EF\u30A4\u30C8">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u7A2E\u985E</label>
            <input id="eim-club-type" class="form-control form-control-sm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u6570\u91CF <span class="text-danger">*</span></label>
            <input id="eim-quantity" type="number" min="1" class="form-control form-control-sm text-center">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u5B9A\u4FA1</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">\xA5</span>
              <input id="eim-list-price" type="number" min="0" class="form-control text-end">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u639B\u7387</label>
            <input id="eim-rate" type="number" min="0" max="1" step="0.001" class="form-control form-control-sm text-end" placeholder="\u4F8B: 0.55">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u5358\u4FA1</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">\xA5</span>
              <input id="eim-unit-price" type="number" min="0" class="form-control text-end" placeholder="\u81EA\u52D5\u8A08\u7B97">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">\u5099\u8003</label>
            <input id="eim-line-note" class="form-control form-control-sm">
          </div>
        </div>
      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
        <button type="button" class="btn btn-primary btn-sm px-4" id="eim-submit">
          <i class="fas fa-save me-1"></i>\u4FDD\u5B58
        </button>
      </div>
    </div>
  </div>
</div>` : "";
  const scripts = `<script>
// ============================================================
// \u7D0D\u54C1\u5C65\u6B74\u30FB\u5165\u8377\u6E08\u6570\u3092Ajax\u3067\u5373\u6642\u66F4\u65B0
// ============================================================
(function(){
  var ORDER_ID = ${id};

  function yenFmt(v){
    if(v===null||v===undefined||v==='') return '';
    var n = parseFloat(String(v));
    return isNaN(n) ? '' : '\xA5' + n.toLocaleString('ja-JP',{maximumFractionDigits:0});
  }

  function refreshReceipts(){
    var spinner = document.getElementById('receipt-updating');
    if(spinner) spinner.style.display = '';

    fetch('/api/orders/' + ORDER_ID, {cache:'no-store', credentials:'include'})
      .then(function(r){ return r.json(); })
      .then(function(data){
        // \u2500\u2500 \u767A\u6CE8\u660E\u7D30\u306E\u5165\u8377\u6E08\u30FB\u6B8B\u6570\u3092\u66F4\u65B0 \u2500\u2500
        (data.items||[]).forEach(function(item){
          var tr = document.querySelector('#order-items-tbody tr[data-poi-id="'+item.id+'"]');
          if(!tr) return;
          var qty = Number(item.quantity||0);
          var recv = Number(item.received_qty||0);
          var rem  = qty - recv;
          var pct  = qty > 0 ? Math.round(recv/qty*100) : 0;

          var recvSpan = tr.querySelector('.recv-qty');
          if(recvSpan) recvSpan.textContent = recv;

          var recvBar = tr.querySelector('.recv-bar');
          if(recvBar) recvBar.style.width = pct + '%';

          var remCell = tr.querySelector('.cell-remaining');
          if(remCell){
            remCell.textContent = rem;
            remCell.className = 'text-center cell-remaining ' + (rem>0?'text-danger fw-bold':'text-muted');
          }
        });

        // \u2500\u2500 \u7D0D\u54C1\u5C65\u6B74\u30C6\u30FC\u30D6\u30EB\u3092\u66F4\u65B0 \u2500\u2500
        var tbody = document.getElementById('receipt-tbody');
        if(!tbody) return;
        var receipts = data.receipts||[];
        if(receipts.length === 0){
          tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">\u307E\u3060\u7D0D\u54C1\u767B\u9332\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>';
        } else {
          tbody.innerHTML = receipts.map(function(r){
            return '<tr>'+
              '<td>'+(r.received_date||'')+'</td>'+
              '<td>'+(r.slip_date||'\u2015')+'</td>'+
              '<td>'+(r.inspected_by||'\u2015')+'</td>'+
              '<td>'+(r.note||'')+'</td>'+
            '</tr>';
          }).join('');
        }
      })
      .catch(function(err){ console.warn('receipt refresh error', err); })
      .finally(function(){
        if(spinner) spinner.style.display = 'none';
      });
  }

  // \u30DA\u30FC\u30B8\u30ED\u30FC\u30C9\u76F4\u5F8C\u306B1\u56DE\u66F4\u65B0\uFF08URL\u306B ?_r= \u304C\u4ED8\u3044\u3066\u3044\u308B\u5834\u5408\uFF1D\u7D0D\u54C1\u767B\u9332\u76F4\u5F8C\uFF09
  var isAfterReceipt = location.search.indexOf('_r=') >= 0;
  if(isAfterReceipt){
    // URL\u304B\u3089 ?_r= \u3092\u9664\u53BB\uFF08URLSearchParams\u3092\u4F7F\u3063\u3066\u6B63\u898F\u8868\u73FE\u306E\u30A8\u30B9\u30B1\u30FC\u30D7\u554F\u984C\u3092\u56DE\u907F\uFF09
    var params = new URLSearchParams(location.search);
    params.delete('_r');
    var qs = params.toString();
    var cleanUrl = location.pathname + (qs ? '?' + qs : '');
    history.replaceState(null,'',cleanUrl);
    // \u7D0D\u54C1\u767B\u9332\u76F4\u5F8C\u306F\u78BA\u5B9F\u306B\u6700\u65B0\u30C7\u30FC\u30BF\u3092\u53D6\u5F97
    refreshReceipts();
  }

  // \u300C\u7D0D\u54C1\u767B\u9332\u300D\u30EA\u30F3\u30AF\u304B\u3089\u623B\u3063\u305F\u969B\u306B\u3082\u66F4\u65B0\uFF08\u30DA\u30FC\u30B8\u8868\u793A\u30A4\u30D9\u30F3\u30C8\uFF09
  window.addEventListener('pageshow', function(e){
    if(e.persisted){
      // bfcache \u304B\u3089\u5FA9\u5143\u3055\u308C\u305F\u5834\u5408\u306F\u5F37\u5236\u66F4\u65B0
      refreshReceipts();
    }
  });
})();

// \u30B3\u30D4\u30FC\u30DC\u30BF\u30F3\u6C4E\u7528
function makeCopyBtn(btnId, taId){
  var btn = document.getElementById(btnId);
  if(!btn) return;
  btn.addEventListener('click', function(){
    var text = document.getElementById(taId).value;
    navigator.clipboard.writeText(text).then(function(){
      var orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check me-1"></i>\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F';
      btn.classList.add('btn-success'); btn.classList.remove('btn-outline-success','btn-outline-secondary');
      setTimeout(function(){ btn.innerHTML=orig; btn.classList.remove('btn-success'); btn.classList.add('btn-outline-success'); },2000);
    });
  });
}
makeCopyBtn('btn-copy-body','email-body-ta');
makeCopyBtn('btn-copy-line','line-body-ta');
makeCopyBtn('btn-copy-fax','fax-body-ta');

// CC\u5019\u88DC\u30DC\u30BF\u30F3 \u2192 CC\u5165\u529B\u6B04\u306B\u30A2\u30C9\u30EC\u30B9\u3092\u8FFD\u52A0/\u524A\u9664\uFF08\u767A\u6CE8\u8A73\u7D30\u753B\u9762\uFF09
document.querySelectorAll('.detail-cc-candidate').forEach(function(btn){
  btn.addEventListener('click', function(){
    var ccInp = document.getElementById('email-cc-input');
    if(!ccInp) return;
    var addr = btn.dataset.addr || '';
    var cur = ccInp.value.trim();
    var addrs = cur ? cur.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
    var idx = addrs.indexOf(addr);
    if(idx >= 0){
      addrs.splice(idx, 1);
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-outline-secondary');
    } else {
      addrs.push(addr);
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-secondary');
    }
    ccInp.value = addrs.join(', ');
    ccInp.dispatchEvent(new Event('input'));
  });
});

// CC\u5165\u529B \u2192 mailto\u30EA\u30F3\u30AF\u3092\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u66F4\u65B0
(function(){
  var ccInput  = document.getElementById('email-cc-input');
  var mailto   = document.getElementById('btn-mailto');
  var bodyTa   = document.getElementById('email-body-ta');
  var subjSpan = document.getElementById('email-subject-span');
  var SUPPLIER_EMAIL = '${esc(supplierEmail)}';
  if (!ccInput || !mailto || !SUPPLIER_EMAIL) return;

  function rebuildMailto() {
    var cc      = ccInput.value.trim();
    var subject = subjSpan ? subjSpan.textContent : '';
    var body    = bodyTa   ? bodyTa.value         : '';
    var qs = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if (cc) qs += '&cc=' + encodeURIComponent(cc);
    mailto.href = 'mailto:' + SUPPLIER_EMAIL + '?' + qs;
  }

  ccInput.addEventListener('input', rebuildMailto);
  // \u521D\u671F\u5316\uFF08bodyTa\u306E\u5024\u304C\u5165\u3063\u3066\u304B\u3089\u5B9F\u884C\uFF09
  rebuildMailto();
})();

// \u30B9\u30C6\u30FC\u30BF\u30B9\u5909\u66F4
function bindStatus(btnId, status, label){
  var btn = document.getElementById(btnId);
  if(!btn) return;
  btn.addEventListener('click', async function(){
    if(!confirm(label + '\u306B\u5909\u66F4\u3057\u307E\u3059\u304B\uFF1F')) return;
    btn.disabled=true;
    var r = await fetch('/api/orders/${id}/status', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({status: status})
    });
    if(r.ok){
      showFlash(label+'\u306B\u66F4\u65B0\u3057\u307E\u3057\u305F','success');
      // \u300C\u767A\u6CE8\u6E08\u300D\u306B\u5909\u66F4\u3057\u305F\u5834\u5408: \u540C\u4E00\u9867\u5BA2\u306E\u6B21\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u3092\u78BA\u8A8D
      if(status === 'ordered'){
        try {
          var d = await r.json();
          if(d.next_mail_batch){
            setTimeout(function(){
              if(confirm('\u540C\u3058\u304A\u5BA2\u69D8\u306E\u5225\u4ED5\u5165\u5148\u3078\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u304C\u3042\u308A\u307E\u3059\u3002\u7D9A\u3051\u3066\u51E6\u7406\u3057\u307E\u3059\u304B\uFF1F')){
                location.href = '/mail-batch/' + d.next_mail_batch;
              } else {
                location.reload();
              }
            }, 600);
          } else if(d.next_order_id){
            setTimeout(function(){
              if(confirm('\u540C\u3058\u304A\u5BA2\u69D8\u306E\u5225\u4ED5\u5165\u5148\u3078\u306E\u767A\u6CE8\u304C\u3042\u308A\u307E\u3059\u3002\u7D9A\u3051\u3066\u51E6\u7406\u3057\u307E\u3059\u304B\uFF1F')){
                location.href = '/orders/' + d.next_order_id;
              } else {
                location.reload();
              }
            }, 600);
          } else {
            setTimeout(function(){ location.reload(); }, 900);
          }
        } catch(e2) {
          setTimeout(function(){ location.reload(); }, 900);
        }
      } else {
        setTimeout(function(){ location.reload(); }, 900);
      }
    }
    else { showFlash('\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger'); btn.disabled=false; }
  });
}
bindStatus('btn-s-ordered','ordered','\u767A\u6CE8\u6E08');
bindStatus('btn-s-completed','completed','\u5B8C\u7D0D');
bindStatus('btn-s-cancelled','cancelled','\u30AD\u30E3\u30F3\u30BB\u30EB');

// \u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u518D\u751F\u6210\u30DC\u30BF\u30F3
(function(){
  var regenBtn = document.getElementById('btn-regen-mail');
  if (!regenBtn) return;
  regenBtn.addEventListener('click', async function(){
    regenBtn.disabled = true;
    regenBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u751F\u6210\u4E2D...';
    try {
      var r = await fetch('/api/orders/${id}/regenerate-mail', {method:'POST'});
      var d = await r.json();
      if (r.ok) {
        // \u30C6\u30AD\u30B9\u30C8\u30A8\u30EA\u30A2\u30FB\u4EF6\u540D\u30B9\u30D1\u30F3\u3092\u66F4\u65B0
        var ta = document.getElementById('email-body-ta') || document.getElementById('line-body-ta') || document.getElementById('fax-body-ta');
        if (ta) ta.value = d.body || '';
        var subj = document.getElementById('email-subject-span');
        if (subj) subj.textContent = d.subject || '';
        // mailto\u30EA\u30F3\u30AF\u3092\u66F4\u65B0\uFF08CC\u5024\u3082\u4FDD\u6301\uFF09
        var mailto = document.getElementById('btn-mailto');
        if (mailto && '${supplierEmail}') {
          var ccInp = document.getElementById('email-cc-input');
          var cc = ccInp ? ccInp.value.trim() : '';
          var qs2 = 'subject=' + encodeURIComponent(d.subject||'') + '&body=' + encodeURIComponent(d.body||'');
          if (cc) qs2 += '&cc=' + encodeURIComponent(cc);
          mailto.href = 'mailto:${esc(supplierEmail)}?' + qs2;
        }
        // \u30A2\u30E9\u30FC\u30C8\u3092\u975E\u8868\u793A
        var alert = document.getElementById('no-body-alert');
        if (alert) alert.style.display = 'none';
        showFlash('\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u751F\u6210\u3057\u307E\u3057\u305F', 'success');
      } else {
        showFlash(d.error || '\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u306E\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F', 'danger');
        regenBtn.disabled = false;
        regenBtn.innerHTML = '<i class="fas fa-magic me-1"></i>\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u751F\u6210\u3059\u308B';
      }
    } catch(e) {
      showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F', 'danger');
      regenBtn.disabled = false;
      regenBtn.innerHTML = '<i class="fas fa-magic me-1"></i>\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u751F\u6210\u3059\u308B';
    }
  });
})();

// \u767A\u6CE8\u30B3\u30D4\u30FC
document.getElementById('btn-copy-order').addEventListener('click', async function(){
  if(!confirm('\u3053\u306E\u767A\u6CE8\u3092\u30B3\u30D4\u30FC\u3057\u3066\u518D\u767A\u6CE8\u30C7\u30FC\u30BF\u3092\u4F5C\u6210\u3057\u307E\u3059\u304B\uFF1F')) return;
  this.disabled=true;
  var r = await fetch('/api/orders/${id}/copy',{method:'POST'});
  var res = await r.json();
  if(r.ok){
    showFlash('\u518D\u767A\u6CE8\u30C7\u30FC\u30BF\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F\uFF08\u767A\u6CE8\u756A\u53F7: '+res.order_id+'\uFF09','success');
    setTimeout(function(){ location.href='/orders/'+res.order_id; },1200);
  } else { showFlash(res.error||'\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger'); this.disabled=false; }
});

// \u767A\u6CE8\u524A\u9664
document.getElementById('btn-delete-order').addEventListener('click', async function(){
  var orderNo = '${esc(String(order["order_no"]))}';
  if(!confirm('\u767A\u6CE8\u300C' + orderNo + '\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\\n\\n\u5165\u8377\u5C65\u6B74\u3082\u542B\u3081\u3066\u5B8C\u5168\u306B\u524A\u9664\u3055\u308C\u307E\u3059\u3002\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
  this.disabled=true;
  this.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>\u524A\u9664\u4E2D...';
  var r = await fetch('/api/orders/${id}',{method:'DELETE'});
  if(r.ok){
    showFlash('\u767A\u6CE8\u3092\u524A\u9664\u3057\u307E\u3057\u305F','success');
    setTimeout(function(){ location.href='/orders'; },900);
  } else {
    var d = await r.json().catch(function(){ return {}; });
    showFlash(d.error||'\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger');
    this.disabled=false;
    this.innerHTML='<i class="fas fa-trash-alt me-1"></i>\u524A\u9664';
  }
});

// ============================================================
// \u5546\u54C1\u8FFD\u52A0\u30E2\u30FC\u30C0\u30EB\uFF08\u4E0B\u66F8\u304D/\u30D7\u30FC\u30EB\u72B6\u614B\u306E\u307F\uFF09
// ============================================================
(function(){
  if (typeof AIM_PRODUCTS === 'undefined') return; // \u7DE8\u96C6\u4E0D\u53EF\u30B9\u30C6\u30FC\u30BF\u30B9\u3067\u306F\u4F55\u3082\u3057\u306A\u3044

  var ORDER_ID   = ${id};
  var products   = AIM_PRODUCTS;   // [{id, item_category, maker_name, product_name, spec, color, list_price, default_rate}, ...]
  var suppliers  = AIM_SUPPLIERS;  // [{id, name}, ...]

  // --- DOM refs ---
  var modal      = document.getElementById('addItemModal');
  var bsModal    = new bootstrap.Modal(modal);
  var titleEl    = document.getElementById('aim-title');
  var bodyEl     = document.getElementById('aim-body');
  var backBtn    = document.getElementById('aim-back');
  var searchWrap = document.getElementById('aim-search-wrap');
  var searchInp  = document.getElementById('aim-search');
  var formArea   = document.getElementById('aim-form-area');
  var pnameInp   = document.getElementById('aim-pname');
  var colorInp   = document.getElementById('aim-color');
  var qtyInp     = document.getElementById('aim-qty');
  var listPriceInp = document.getElementById('aim-list-price');
  var rateInp    = document.getElementById('aim-rate');
  var unitPriceInp = document.getElementById('aim-unit-price');
  var noteInp    = document.getElementById('aim-note');
  var submitBtn  = document.getElementById('aim-submit');
  var backFormBtn = document.getElementById('aim-back-form');

  // --- \u72B6\u614B ---
  var step = 'category'; // 'category' | 'maker' | 'product' | 'form'
  var selCategory = null;
  var selMaker    = null;
  var selProduct  = null; // null\u306E\u3068\u304D=\u30DE\u30B9\u30BF\u5916
  var isFreeMode  = false;
  var freeSupplierId = null;

  // --- \u30E6\u30FC\u30C6\u30A3\u30EA\u30C6\u30A3 ---
  function uniqueSorted(arr){ return arr.filter(function(v,i,a){ return v && a.indexOf(v)===i; }).sort(); }
  function filtered(keyword){
    var kw = keyword.trim().toLowerCase();
    return products.filter(function(p){
      if(selCategory && p.item_category !== selCategory) return false;
      if(selMaker    && p.maker_name    !== selMaker)    return false;
      if(!kw) return true;
      return (p.product_name||'').toLowerCase().indexOf(kw)>=0
          || (p.spec||'').toLowerCase().indexOf(kw)>=0
          || (p.color||'').toLowerCase().indexOf(kw)>=0;
    });
  }

  function listItem(label, onClick, badge){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
    btn.innerHTML = label + (badge ? ' <span class="badge bg-secondary rounded-pill">'+badge+'</span>' : '');
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- \u30B9\u30C6\u30C3\u30D7\u63CF\u753B ---
  function showCategory(){
    step = 'category'; selCategory = null; selMaker = null; selProduct = null; isFreeMode = false;
    titleEl.textContent = '\u30AB\u30C6\u30B4\u30EA\u30FC\u3092\u9078\u629E';
    backBtn.style.display = 'none';
    searchWrap.style.display = 'none';
    formArea.classList.add('d-none');
    bodyEl.innerHTML = '';
    var lg = document.createElement('div');
    lg.className = 'list-group list-group-flush';

    // \u30DE\u30B9\u30BF\u5916\u5546\u54C1\u30DC\u30BF\u30F3
    var freeBtn = document.createElement('button');
    freeBtn.type = 'button';
    freeBtn.className = 'list-group-item list-group-item-action text-success fw-semibold';
    freeBtn.innerHTML = '<i class="fas fa-pen me-2"></i>\u30DE\u30B9\u30BF\u5916\u5546\u54C1\u3092\u76F4\u63A5\u5165\u529B\u3059\u308B';
    freeBtn.addEventListener('click', function(){ showFreeForm(); });
    lg.appendChild(freeBtn);

    var cats = uniqueSorted(products.map(function(p){ return p.item_category; }));
    cats.forEach(function(cat){
      var cnt = products.filter(function(p){ return p.item_category===cat; }).length;
      lg.appendChild(listItem(cat, function(){ selCategory=cat; showMaker(); }, cnt));
    });
    bodyEl.appendChild(lg);
  }

  function showMaker(){
    step = 'maker'; selMaker = null; selProduct = null;
    titleEl.textContent = selCategory + ' \u203A \u30E1\u30FC\u30AB\u30FC';
    backBtn.style.display = '';
    searchWrap.style.display = 'none';
    formArea.classList.add('d-none');
    bodyEl.innerHTML = '';
    var lg = document.createElement('div');
    lg.className = 'list-group list-group-flush';
    var makers = uniqueSorted(products.filter(function(p){ return p.item_category===selCategory; }).map(function(p){ return p.maker_name; }));
    makers.forEach(function(mk){
      var cnt = products.filter(function(p){ return p.item_category===selCategory && p.maker_name===mk; }).length;
      lg.appendChild(listItem(mk, function(){ selMaker=mk; showProduct(); }, cnt));
    });
    bodyEl.appendChild(lg);
  }

  function showProduct(){
    step = 'product'; selProduct = null;
    titleEl.textContent = selMaker + ' \u203A \u5546\u54C1';
    backBtn.style.display = '';
    searchWrap.style.display = '';
    searchInp.value = '';
    formArea.classList.add('d-none');
    renderProductList('');
    searchInp.oninput = function(){ renderProductList(searchInp.value); };
  }

  function renderProductList(kw){
    bodyEl.innerHTML = '';
    var lg = document.createElement('div');
    lg.className = 'list-group list-group-flush';
    var list = filtered(kw);
    if(list.length === 0){
      lg.innerHTML = '<div class="text-center text-muted py-3 small">\u8A72\u5F53\u5546\u54C1\u304C\u3042\u308A\u307E\u305B\u3093</div>';
    } else {
      list.forEach(function(p){
        var label = p.product_name + (p.spec ? ' / '+p.spec : '') + (p.color ? ' <span class="text-muted small">['+p.color+']</span>' : '');
        lg.appendChild(listItem(label, function(){ selProduct=p; showForm(false); }));
      });
    }
    bodyEl.appendChild(lg);
  }

  function showFreeForm(){
    isFreeMode = true; selProduct = null;
    step = 'form';
    titleEl.textContent = '\u30DE\u30B9\u30BF\u5916\u5546\u54C1\u3092\u5165\u529B';
    backBtn.style.display = '';
    searchWrap.style.display = 'none';
    bodyEl.innerHTML = '';

    // \u4ED5\u5165\u5148\u30BB\u30EC\u30AF\u30C8\u3092\u52D5\u7684\u306B\u633F\u5165
    var supplierWrap = document.getElementById('aim-supplier-wrap');
    if(!supplierWrap){
      var col = document.createElement('div');
      col.className = 'col-12';
      col.id = 'aim-supplier-wrap';
      col.innerHTML = '<label class="form-label form-label-sm mb-1 fw-semibold">\u4ED5\u5165\u5148 <span class="text-danger">*</span></label>'
        + '<select id="aim-supplier-sel" class="form-select form-select-sm">'
        + '<option value="">-- \u4ED5\u5165\u5148\u3092\u9078\u629E --</option>'
        + suppliers.map(function(s){ return '<option value="'+s.id+'">'+s.name+'</option>'; }).join('')
        + '</select>';
      var rowDiv = formArea.querySelector('.row.g-2.w-100');
      if(rowDiv) rowDiv.insertBefore(col, rowDiv.firstChild);
    }

    pnameInp.readOnly = false;
    pnameInp.value = '';
    pnameInp.placeholder = '\u5546\u54C1\u540D\u3092\u5165\u529B';
    colorInp.value = '';
    qtyInp.value = '1';
    listPriceInp.value = '';
    rateInp.value = '';
    unitPriceInp.value = '';
    noteInp.value = '';
    formArea.classList.remove('d-none');
  }

  function showForm(fromSearch){
    isFreeMode = false;
    step = 'form';
    var p = selProduct;
    titleEl.textContent = p.product_name;
    backBtn.style.display = '';
    searchWrap.style.display = 'none';
    bodyEl.innerHTML = '';

    // \u4ED5\u5165\u5148\u30BB\u30EC\u30AF\u30C8\u3092\u524A\u9664\uFF08\u30DE\u30B9\u30BF\u5185\u5546\u54C1\u3067\u306F\u4E0D\u8981\uFF09
    var supplierWrap = document.getElementById('aim-supplier-wrap');
    if(supplierWrap) supplierWrap.remove();

    pnameInp.readOnly = true;
    pnameInp.value = p.product_name + (p.spec ? ' / '+p.spec : '');
    colorInp.value = p.color || '';
    qtyInp.value = '1';
    listPriceInp.value = p.list_price != null ? p.list_price : '';
    rateInp.value = p.default_rate != null ? p.default_rate : '';
    // \u5358\u4FA1\u3092\u81EA\u52D5\u8A08\u7B97
    if(p.list_price && p.default_rate){
      unitPriceInp.value = Math.round(p.list_price * p.default_rate);
    } else {
      unitPriceInp.value = '';
    }
    noteInp.value = '';
    formArea.classList.remove('d-none');
  }

  // \u5B9A\u4FA1\xD7\u639B\u7387 \u2192 \u5358\u4FA1 \u81EA\u52D5\u8A08\u7B97
  function calcUnitPrice(){
    var lp = parseFloat(listPriceInp.value);
    var rt = parseFloat(rateInp.value);
    if(!isNaN(lp) && !isNaN(rt)){
      unitPriceInp.value = Math.round(lp * rt);
    }
  }
  listPriceInp.addEventListener('input', calcUnitPrice);
  rateInp.addEventListener('input', calcUnitPrice);

  // --- \u623B\u308B\u30DC\u30BF\u30F3 ---
  backBtn.addEventListener('click', function(){
    if(step === 'maker')   { showCategory(); }
    else if(step === 'product') { showMaker(); }
    else if(step === 'form'){
      if(isFreeMode){ showCategory(); }
      else          { showProduct(); }
    }
  });
  backFormBtn.addEventListener('click', function(){
    if(isFreeMode){ showCategory(); }
    else          { showProduct(); }
  });

  // --- \u5546\u54C1\u8FFD\u52A0\u30DC\u30BF\u30F3 ---
  submitBtn.addEventListener('click', async function(){
    var qty = parseInt(qtyInp.value, 10);
    if(isNaN(qty) || qty < 1){ showFlash('\u6570\u91CF\u3092\u6B63\u3057\u304F\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044', 'warning'); return; }

    var unitPrice = parseFloat(unitPriceInp.value);
    if(isNaN(unitPrice) || unitPrice < 0){ showFlash('\u5358\u4FA1\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044', 'warning'); return; }

    var payload = {
      quantity:   qty,
      unit_price: unitPrice,
      list_price: parseFloat(listPriceInp.value) || null,
      rate:       parseFloat(rateInp.value)       || null,
      note:       noteInp.value.trim() || null,
      color:      colorInp.value.trim() || null,
    };

    if(isFreeMode){
      // \u30DE\u30B9\u30BF\u5916
      var pname = pnameInp.value.trim();
      if(!pname){ showFlash('\u5546\u54C1\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044', 'warning'); return; }
      var sel = document.getElementById('aim-supplier-sel');
      var suppId = sel ? parseInt(sel.value, 10) : NaN;
      if(isNaN(suppId) || !suppId){ showFlash('\u4ED5\u5165\u5148\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044', 'warning'); return; }
      payload.product_name = pname;
      payload.supplier_id  = suppId;
    } else {
      // \u30DE\u30B9\u30BF\u5185
      var p = selProduct;
      payload.product_id   = p.id;
      payload.product_name = p.product_name + (p.spec ? ' / '+p.spec : '');
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u8FFD\u52A0\u4E2D...';

    try {
      var r = await fetch('/api/orders/' + ORDER_ID + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      var d = await r.json();
      if(r.ok){
        bsModal.hide();
        showFlash('\u5546\u54C1\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F', 'success');
        // \u660E\u7D30\u30C6\u30FC\u30D6\u30EB\u3068\u5408\u8A08\u91D1\u984D\u3092\u66F4\u65B0\u3059\u308B\u305F\u3081\u30DA\u30FC\u30B8\u30EA\u30ED\u30FC\u30C9
        setTimeout(function(){ location.reload(); }, 800);
      } else {
        showFlash(d.error || '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F', 'danger');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-plus me-1"></i>\u3053\u306E\u5546\u54C1\u3092\u8FFD\u52A0\u3059\u308B';
      }
    } catch(e){
      showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F', 'danger');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-plus me-1"></i>\u3053\u306E\u5546\u54C1\u3092\u8FFD\u52A0\u3059\u308B';
    }
  });

  // \u30E2\u30FC\u30C0\u30EB\u3092\u958B\u304F\u305F\u3073\u306B\u521D\u671F\u5316
  modal.addEventListener('show.bs.modal', function(){
    // \u4ED5\u5165\u5148\u30BB\u30EC\u30AF\u30C8\u6B8B\u9AB8\u3092\u524A\u9664
    var sw = document.getElementById('aim-supplier-wrap');
    if(sw) sw.remove();
    pnameInp.readOnly = true;
    pnameInp.placeholder = '';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-plus me-1"></i>\u3053\u306E\u5546\u54C1\u3092\u8FFD\u52A0\u3059\u308B';
    showCategory();
  });

  // \u300C\u5546\u54C1\u3092\u8FFD\u52A0\u300D\u30DC\u30BF\u30F3\u304B\u3089\u30E2\u30FC\u30C0\u30EB\u3092\u958B\u304F
  var openBtn = document.getElementById('btn-add-item');
  if(openBtn){
    openBtn.addEventListener('click', function(){ bsModal.show(); });
  }
})();

// ============================================================
// \u660E\u7D30\u7DE8\u96C6\u30FB\u524A\u9664\uFF08isEditable\u306E\u3068\u304D\u306E\u307F\u52D5\u4F5C\uFF09
// ============================================================
(function(){
  var editModal = document.getElementById('editItemModal');
  if (!editModal) return;
  var bsEdit = new bootstrap.Modal(editModal);

  // --- \u7DE8\u96C6\u30D5\u30A9\u30FC\u30E0DOM ---
  var ePoiId    = document.getElementById('eim-poi-id');
  var eTitle    = document.getElementById('eim-title');
  var eIC       = document.getElementById('eim-item-category');
  var eMF       = document.getElementById('eim-manufacturer');
  var ePN       = document.getElementById('eim-product-name');
  var eSpec     = document.getElementById('eim-spec');
  var eColor    = document.getElementById('eim-color');
  var eCT       = document.getElementById('eim-club-type');
  var eQty      = document.getElementById('eim-quantity');
  var eLP       = document.getElementById('eim-list-price');
  var eRate     = document.getElementById('eim-rate');
  var eUP       = document.getElementById('eim-unit-price');
  var eNote     = document.getElementById('eim-line-note');
  var eSubmit   = document.getElementById('eim-submit');

  // \u5B9A\u4FA1\xD7\u639B\u7387 \u2192 \u5358\u4FA1 \u81EA\u52D5\u8A08\u7B97
  function calcUP(){
    var lp = parseFloat(eLP.value);
    var rt = parseFloat(eRate.value);
    if (!isNaN(lp) && !isNaN(rt)) eUP.value = Math.round(lp * rt);
  }
  eLP.addEventListener('input', calcUP);
  eRate.addEventListener('input', calcUP);

  // \u300C\u7DE8\u96C6\u300D\u30DC\u30BF\u30F3 \u2192 \u30E2\u30FC\u30C0\u30EB\u3092\u958B\u3044\u3066\u30C7\u30FC\u30BF\u3092\u30BB\u30C3\u30C8
  document.querySelectorAll('.btn-edit-item').forEach(function(btn){
    btn.addEventListener('click', function(){
      var d = btn.dataset;
      ePoiId.value  = d.poiId;
      eTitle.textContent = '\u660E\u7D30\u3092\u7DE8\u96C6: ' + d.productName;
      eIC.value     = d.itemCategory  || '';
      eMF.value     = d.manufacturer  || '';
      ePN.value     = d.productName   || '';
      eSpec.value   = d.spec          || '';
      eColor.value  = d.color         || '';
      eCT.value     = d.clubType      || '';
      eQty.value    = d.quantity      || '1';
      eLP.value     = d.listPrice     || '';
      eRate.value   = d.rate          || '';
      eUP.value     = d.unitPrice     || '';
      eNote.value   = d.lineNote      || '';
      eSubmit.disabled = false;
      eSubmit.innerHTML = '<i class="fas fa-save me-1"></i>\u4FDD\u5B58';
      bsEdit.show();
    });
  });

  // \u300C\u4FDD\u5B58\u300D\u30DC\u30BF\u30F3
  eSubmit.addEventListener('click', async function(){
    var poiId = ePoiId.value;
    if (!poiId) return;
    if (!ePN.value.trim()) { showFlash('\u5546\u54C1\u540D\u306F\u5FC5\u9808\u3067\u3059', 'warning'); return; }
    var qty = parseInt(eQty.value, 10);
    if (isNaN(qty) || qty < 1) { showFlash('\u6570\u91CF\u306F1\u4EE5\u4E0A\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044', 'warning'); return; }

    eSubmit.disabled = true;
    eSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u4FDD\u5B58\u4E2D...';

    var payload = {
      item_category: eIC.value.trim()   || null,
      manufacturer:  eMF.value.trim()   || null,
      product_name:  ePN.value.trim(),
      spec:          eSpec.value.trim()  || null,
      color:         eColor.value.trim() || null,
      club_type:     eCT.value.trim()    || null,
      quantity:      qty,
      list_price:    parseFloat(eLP.value)   || null,
      rate:          parseFloat(eRate.value) || null,
      unit_price:    parseFloat(eUP.value)   || null,
      line_note:     eNote.value.trim()  || null,
    };

    try {
      var r = await fetch('/api/items/' + poiId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      var d = await r.json();
      if (r.ok) {
        bsEdit.hide();
        showFlash('\u660E\u7D30\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F', 'success');
        setTimeout(function(){ location.reload(); }, 700);
      } else {
        showFlash(d.error || '\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F', 'danger');
        eSubmit.disabled = false;
        eSubmit.innerHTML = '<i class="fas fa-save me-1"></i>\u4FDD\u5B58';
      }
    } catch(e) {
      showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F', 'danger');
      eSubmit.disabled = false;
      eSubmit.innerHTML = '<i class="fas fa-save me-1"></i>\u4FDD\u5B58';
    }
  });

  // \u300C\u524A\u9664\u300D\u30DC\u30BF\u30F3
  document.querySelectorAll('.btn-delete-item').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var poiId = btn.dataset.poiId;
      var name  = btn.dataset.productName || '\uFF08\u4E0D\u660E\uFF09';
      if (!confirm('\u300C' + name + '\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
      btn.disabled = true;

      try {
        var r = await fetch('/api/items/' + poiId, {
          method: 'DELETE',
          credentials: 'include',
        });
        var d = await r.json();
        if (r.ok) {
          showFlash('\u660E\u7D30\u3092\u524A\u9664\u3057\u307E\u3057\u305F', 'success');
          setTimeout(function(){ location.reload(); }, 700);
        } else {
          showFlash(d.error || '\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F', 'danger');
          btn.disabled = false;
        }
      } catch(e) {
        showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F', 'danger');
        btn.disabled = false;
      }
    });
  });
})();
</script>`;
  const content = `
<!-- \u30DA\u30FC\u30B8\u30D8\u30C3\u30C0 -->
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-file-alt me-2" style="color:var(--gw-green)"></i>\u767A\u6CE8\u8A73\u7D30</h1>
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <span class="page-subtitle mb-0">${esc(order["order_no"])}</span>
      <span style="color:var(--gw-border)">|</span>
      <strong style="font-size:0.85rem">${esc(order["supplier_name"])}</strong>
      ${statusBadge(curStatus)}
    </div>
  </div>
  <div class="actions">
    ${showButtons.join("")}
    <a class="btn btn-sm btn-outline-secondary" href="/orders/${id}/edit"><i class="fas fa-edit me-1"></i>\u767A\u6CE8\u7DE8\u96C6</a>
    <a class="btn btn-sm btn-outline-secondary" href="/receipts/new/${id}"><i class="fas fa-truck me-1"></i>\u7D0D\u54C1\u767B\u9332</a>
    <button class="btn btn-sm btn-outline-secondary" id="btn-copy-order"><i class="fas fa-copy me-1"></i>\u518D\u767A\u6CE8</button>
    <button class="btn btn-sm btn-outline-danger" id="btn-delete-order"><i class="fas fa-trash-alt me-1"></i>\u524A\u9664</button>
    <a class="btn btn-sm btn-outline-secondary" href="/orders"><i class="fas fa-arrow-left me-1"></i>\u4E00\u89A7\u3078</a>
  </div>
</div>

<!-- \u4E0A\u6BB5: \u30D8\u30C3\u30C0\u60C5\u5831 + \u767A\u6CE8\u65B9\u6CD5\u5225\u30D1\u30CD\u30EB -->
<div class="row g-3 mb-3">
  <div class="col-lg-4">
    <div class="card h-100">
      <div class="card-header"><span class="card-title"><i class="fas fa-info-circle"></i>\u767A\u6CE8\u60C5\u5831</span></div>
      <div class="card-body py-2">
        <dl class="row mb-0 small">
          <dt class="col-5 text-muted">\u767A\u6CE8\u65E5</dt><dd class="col-7 fw-semibold">${esc(order["order_date"])}</dd>
          <dt class="col-5 text-muted">\u767A\u6CE8\u8005</dt><dd class="col-7">${esc(order["ordered_by"])}</dd>
          <dt class="col-5 text-muted">\u9867\u5BA2\u540D</dt><dd class="col-7">${esc(order["customer_name"]) || "\u2015"}</dd>
          <dt class="col-5 text-muted">\u7528\u9014</dt><dd class="col-7">${esc(order["usage_type"]) || "\u2015"}</dd>
          <dt class="col-5 text-muted">\u5E0C\u671B\u7D0D\u671F</dt><dd class="col-7">${esc(order["requested_delivery_date"]) || "\u2015"}</dd>
          <dt class="col-5">\u5408\u8A08\u91D1\u984D</dt><dd class="col-7 fw-bold" style="font-size:1rem;color:var(--gw-green)">${yen2(totalAmount)}</dd>
          <dt class="col-5 text-muted">\u62C5\u5F53\u8005</dt><dd class="col-7">${esc(order["contact_name"]) || ""} ${esc(order["honorific"]) || ""}</dd>
          <dt class="col-5 text-muted">\u767A\u6CE8\u65B9\u6CD5</dt><dd class="col-7">${esc(order["order_method"]) || "\u2015"}</dd>
          <dt class="col-5 text-muted">\u5099\u8003</dt><dd class="col-7 text-muted">${esc(order["order_note"]) || "\u2015"}</dd>
          ${order["supplier_shipping_rule"] ? `<dt class="col-5 text-muted">\u9001\u6599\u6761\u4EF6</dt><dd class="col-7"><span class="badge bg-info text-dark"><i class="fas fa-truck me-1"></i>${esc(order["supplier_shipping_rule"])}</span></dd>` : ""}
          ${order["supplier_notes"] ? `<dt class="col-5 text-warning"><i class="fas fa-exclamation-triangle"></i> \u4ED5\u5165\u5148\u5099\u8003</dt><dd class="col-7"><div class="alert alert-warning py-1 px-2 mb-0 small">${esc(order["supplier_notes"]).replace(/\n/g, "<br>")}</div></dd>` : ""}
        </dl>
      </div>
    </div>
  </div>
  <div class="col-lg-8">
    <div class="card h-100">
      <div class="card-header">
        <span class="card-title"><i class="${orderPanelIcon} me-1"></i>${orderPanelTitle}</span>
        <span class="ms-2 badge bg-light text-dark border small">${esc(order["order_method"]) || "\u65B9\u6CD5\u672A\u8A2D\u5B9A"}</span>
      </div>
      <div class="card-body">${orderPanel}</div>
    </div>
  </div>
</div>

<!-- \u767A\u6CE8\u660E\u7D30 -->
<div class="card mb-3">
  <div class="card-header d-flex justify-content-between align-items-center">
    <span class="card-title"><i class="fas fa-table me-1"></i>\u767A\u6CE8\u660E\u7D30</span>
    <div class="d-flex align-items-center gap-2">
      ${isEditable ? `<button class="btn btn-sm btn-primary" id="btn-add-item"><i class="fas fa-plus me-1"></i>\u5546\u54C1\u3092\u8FFD\u52A0</button>` : ""}
      <span class="badge text-bg-secondary">${items.results.length} \u54C1\u76EE / \u5408\u8A08 ${yen2(totalAmount)}</span>
    </div>
  </div>
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0" id="order-items-table">
      <thead><tr>
        <th>\u54C1\u76EE</th><th>\u30E1\u30FC\u30AB\u30FC</th><th>\u5546\u54C1\u540D</th><th>\u4ED5\u69D8\u30FB\u8272</th><th>\u7A2E\u985E</th>
        <th class="text-center">\u767A\u6CE8\u6570</th>
        <th class="text-center">\u5165\u8377\u6E08</th>
        <th class="text-center">\u6B8B\u6570</th>
        <th class="text-end">\u5358\u4FA1</th><th class="text-end">\u91D1\u984D</th><th>\u5099\u8003</th>
        ${isEditable ? '<th class="text-center" style="width:70px">\u64CD\u4F5C</th>' : ""}
      </tr></thead>
      <tbody id="order-items-tbody">${itemRows || '<tr><td colspan="11" class="text-center text-muted py-3">\u660E\u7D30\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- \u7D0D\u54C1\u5C65\u6B74 -->
<div class="card">
  <div class="card-header d-flex justify-content-between align-items-center">
    <div class="d-flex align-items-center gap-2">
      <span class="card-title"><i class="fas fa-truck me-1"></i>\u7D0D\u54C1\u5C65\u6B74</span>
      <span id="receipt-updating" class="spinner-border spinner-border-sm" style="display:none;color:var(--gw-green)" title="\u66F4\u65B0\u4E2D"></span>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="/receipts/new/${id}"><i class="fas fa-plus me-1"></i>\u7D0D\u54C1\u767B\u9332</a>
  </div>
  <div class="table-responsive">
    <table class="table table-sm mb-0">
      <thead><tr><th>\u5165\u8377\u65E5</th><th>\u7D0D\u54C1\u66F8\u65E5\u4ED8</th><th>\u691C\u54C1\u8005</th><th>\u5099\u8003</th></tr></thead>
      <tbody id="receipt-tbody">${receiptRows}</tbody>
    </table>
  </div>
</div>`;
  const o9 = getLayoutOpts(c);
  return layout(`\u767A\u6CE8\u8A73\u7D30 ${esc(order["order_no"])}`, dataScript + addItemModalHtml + editItemModalHtml + content, scripts, o9.username, o9);
});
app2.get("/receipts", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const from = c.req.query("from") || "";
  const to = c.req.query("to") || "";
  const supplierId = c.req.query("supplier_id") || "";
  const slipCheck = c.req.query("slip_check") || "";
  const flash = c.req.query("flash") || "";
  let sql = `
    SELECT r.id, r.received_date, r.slip_date, r.inspected_by, r.note,
           r.slip_verified, r.no_slip, r.slip_checked_by, r.slip_note,
           po.order_no, po.id AS purchase_order_id, po.customer_name,
           COALESCE(sa.name, s.name) AS supplier_name,
           COALESCE(sa.id,   s.id)   AS supplier_id,
           CASE WHEN r.actual_supplier_id IS NOT NULL THEN 1 ELSE 0 END AS supplier_changed,
           COUNT(ri.id) AS item_count,
           SUM(ri.received_quantity) AS total_qty,
           SUM(ri.received_quantity * COALESCE(poi.unit_price, 0)) AS total_amount
    FROM receipts r
    LEFT JOIN purchase_orders po ON r.purchase_order_id=po.id
    LEFT JOIN suppliers s  ON po.supplier_id=s.id
    LEFT JOIN suppliers sa ON r.actual_supplier_id=sa.id
    LEFT JOIN receipt_items ri ON ri.receipt_id=r.id
    LEFT JOIN purchase_order_items poi ON ri.purchase_order_item_id=poi.id
    WHERE r.tenant_id=?`;
  const binds = [tenantId];
  if (from) {
    sql += ` AND r.received_date >= ?`;
    binds.push(from);
  }
  if (to) {
    sql += ` AND r.received_date <= ?`;
    binds.push(to);
  }
  if (supplierId) {
    sql += ` AND (po.supplier_id = ? OR r.actual_supplier_id = ?)`;
    binds.push(Number(supplierId));
    binds.push(Number(supplierId));
  }
  if (slipCheck === "unchecked") {
    sql += ` AND r.slip_verified=0 AND r.no_slip=0`;
  } else if (slipCheck === "no_slip") {
    sql += ` AND r.no_slip=1`;
  } else if (slipCheck === "verified") {
    sql += ` AND r.slip_verified=1`;
  }
  sql += ` GROUP BY r.id ORDER BY r.received_date DESC, r.id DESC LIMIT 300`;
  const [supplierRes, res] = await Promise.all([
    db2.prepare("SELECT id, name FROM suppliers WHERE tenant_id=? ORDER BY name").bind(tenantId).all(),
    db2.prepare(sql).bind(...binds).all()
  ]);
  const supplierOptions = supplierRes.results.map(
    (s) => `<option value="${esc(s["id"])}" ${supplierId === String(s["id"]) ? "selected" : ""}>${esc(s["name"])}</option>`
  ).join("");
  const totalQty = res.results.reduce((s, r) => s + (Number(r["total_qty"]) || 0), 0);
  const totalAmount = res.results.reduce((s, r) => s + (Number(r["total_amount"]) || 0), 0);
  const uncheckedCount = res.results.filter((r) => !r["slip_verified"] && !r["no_slip"]).length;
  const noSlipCount = res.results.filter((r) => r["no_slip"]).length;
  const slipBadge = (r) => {
    if (r["no_slip"]) return `<span class="badge bg-secondary" title="${esc(r["slip_note"]) || ""}"><i class="fas fa-file-slash me-1"></i>\u7D0D\u54C1\u66F8\u306A\u3057</span>`;
    if (r["slip_verified"]) return `<span class="badge bg-success"   title="\u78BA\u8A8D\u8005: ${esc(r["slip_checked_by"]) || "\u2015"}"><i class="fas fa-check me-1"></i>\u78BA\u8A8D\u6E08</span>`;
    return `<span class="badge bg-warning text-dark"><i class="fas fa-exclamation me-1"></i>\u672A\u78BA\u8A8D</span>`;
  };
  const rows = res.results.map((r) => `<tr class="${!r["slip_verified"] && !r["no_slip"] ? "table-warning" : ""}">
    <td class="fw-semibold">${esc(r["received_date"])}</td>
    <td class="text-muted">${esc(r["slip_date"]) || "\u2015"}</td>
    <td>
      ${r["purchase_order_id"] ? `<a href="/orders/${r["purchase_order_id"]}" class="text-decoration-none fw-semibold">${esc(r["order_no"])}</a>` : `<span class="badge bg-secondary">\u30B7\u30B9\u30C6\u30E0\u5916</span>`}
    </td>
    <td>
      ${r["supplier_name"] ? esc(r["supplier_name"]) : '<span class="text-muted">\u2015</span>'}
      ${r["supplier_changed"] ? `<span class="badge bg-info text-dark ms-1" title="\u767A\u6CE8\u6642\u3068\u4ED5\u5165\u5148\u304C\u7570\u306A\u308A\u307E\u3059"><i class="fas fa-exchange-alt"></i></span>` : ""}
    </td>
    <td>${esc(r["customer_name"]) || "\u2015"}</td>
    <td class="text-center">${esc(r["item_count"])}</td>
    <td class="text-end">${Number(r["total_qty"]) || 0} \u500B</td>
    <td class="text-end fw-semibold">${yen2(r["total_amount"])}</td>
    <td class="text-center">${slipBadge(r)}</td>
    <td>${esc(r["inspected_by"]) || "\u2015"}</td>
    <td style="white-space:nowrap">
      <a href="/receipts/${r["id"]}/edit" class="btn btn-xs btn-outline-primary py-0 px-2">
        <i class="fas fa-edit"></i> \u7DE8\u96C6
      </a>
    </td>
  </tr>`).join("");
  const dlParams = new URLSearchParams();
  if (from) dlParams.set("from", from);
  if (to) dlParams.set("to", to);
  if (supplierId) dlParams.set("supplier_id", supplierId);
  const dlUrl = `/api/receipts/download${dlParams.toString() ? "?" + dlParams.toString() : ""}`;
  const slipCheckOptions = [
    { val: "", label: "\u2015 \u3059\u3079\u3066 \u2015" },
    { val: "unchecked", label: "\u26A0 \u672A\u78BA\u8A8D\u306E\u307F" },
    { val: "verified", label: "\u2713 \u78BA\u8A8D\u6E08\u306E\u307F" },
    { val: "no_slip", label: "\u25A1 \u7D0D\u54C1\u66F8\u306A\u3057\u306E\u307F" }
  ].map((o) => `<option value="${o.val}" ${slipCheck === o.val ? "selected" : ""}>${o.label}</option>`).join("");
  const content = `
${flash ? `<div class="alert alert-success alert-dismissible fade show py-2" role="alert">
  <i class="fas fa-check-circle me-1"></i>${esc(flash)}
  <button type="button" class="btn-close py-2" data-bs-dismiss="alert"></button>
</div>` : ""}
${uncheckedCount > 0 ? `<div class="alert alert-warning py-2 mb-3 d-flex align-items-center gap-2">
  <i class="fas fa-exclamation-triangle fa-lg"></i>
  <span>\u7D0D\u54C1\u66F8\u672A\u78BA\u8A8D\u304C <strong>${uncheckedCount}\u4EF6</strong> \u3042\u308A\u307E\u3059\u3002
    <a href="/receipts?slip_check=unchecked" class="alert-link ms-2">\u672A\u78BA\u8A8D\u306E\u307F\u8868\u793A</a>
  </span>
</div>` : ""}
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-truck me-2" style="color:var(--gw-green)"></i>\u7D0D\u54C1\u5C65\u6B74</h1>
    <p class="page-subtitle">\u767B\u9332\u6E08\u307F\u306E\u7D0D\u54C1\u30C7\u30FC\u30BF\u4E00\u89A7\u3067\u3059\u3002\u9EC4\u8272\u884C\u306F\u7D0D\u54C1\u66F8\u672A\u78BA\u8A8D\u3002</p>
  </div>
  <div class="actions">
    <a href="/receipts/free" class="btn btn-outline-secondary">
      <i class="fas fa-plus me-1"></i>\u30B7\u30B9\u30C6\u30E0\u5916\u767A\u6CE8\u7D0D\u54C1
    </a>
    <a href="${dlUrl}" class="btn btn-primary">
      <i class="fas fa-file-excel me-1"></i>Excel DL
    </a>
  </div>
</div>

<!-- \u30D5\u30A3\u30EB\u30BF\u30AB\u30FC\u30C9 -->
<div class="card mb-3">
  <div class="card-body py-2">
    <form method="GET" action="/receipts" class="row g-2 align-items-end">
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">\u5165\u8377\u65E5 From</label>
        <input type="date" name="from" value="${esc(from)}" class="form-control form-control-sm">
      </div>
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">To</label>
        <input type="date" name="to" value="${esc(to)}" class="form-control form-control-sm">
      </div>
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">\u4ED5\u5165\u5148</label>
        <select name="supplier_id" class="form-select form-select-sm" style="min-width:160px">
          <option value="">\u2015 \u3059\u3079\u3066 \u2015</option>
          ${supplierOptions}
        </select>
      </div>
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">\u7D0D\u54C1\u66F8\u30C1\u30A7\u30C3\u30AF</label>
        <select name="slip_check" class="form-select form-select-sm" style="min-width:150px">
          ${slipCheckOptions}
        </select>
      </div>
      <div class="col-auto d-flex gap-2">
        <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-search me-1"></i>\u7D5E\u308A\u8FBC\u307F</button>
        <a href="/receipts" class="btn btn-outline-secondary btn-sm">\u30EA\u30BB\u30C3\u30C8</a>
      </div>
    </form>
  </div>
</div>

<!-- \u30B5\u30DE\u30EA\u30FC\u30D0\u30C3\u30B8 -->
<div class="d-flex gap-3 mb-2 flex-wrap">
  <span class="badge bg-secondary fs-6 fw-normal px-3 py-2">
    <i class="fas fa-list me-1"></i>\u4EF6\u6570: <strong>${res.results.length}</strong> \u4EF6
  </span>
  <span class="badge bg-info text-dark fs-6 fw-normal px-3 py-2">
    <i class="fas fa-boxes me-1"></i>\u5408\u8A08\u5165\u8377\u6570: <strong>${totalQty}</strong> \u500B
  </span>
  <span class="badge bg-success fs-6 fw-normal px-3 py-2">
    <i class="fas fa-yen-sign me-1"></i>\u5408\u8A08\u91D1\u984D: <strong>${yen2(totalAmount)}</strong>
  </span>
  ${uncheckedCount > 0 ? `<span class="badge bg-warning text-dark fs-6 fw-normal px-3 py-2">
    <i class="fas fa-exclamation-triangle me-1"></i>\u7D0D\u54C1\u66F8\u672A\u78BA\u8A8D: <strong>${uncheckedCount}</strong> \u4EF6
  </span>` : ""}
  ${noSlipCount > 0 ? `<span class="badge bg-secondary fs-6 fw-normal px-3 py-2">
    <i class="fas fa-file-slash me-1"></i>\u7D0D\u54C1\u66F8\u306A\u3057: <strong>${noSlipCount}</strong> \u4EF6
  </span>` : ""}
</div>

<div class="card">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0 small">
      <thead>
        <tr>
          <th>\u5165\u8377\u65E5</th><th>\u7D0D\u54C1\u66F8\u65E5\u4ED8</th><th>\u767A\u6CE8\u756A\u53F7</th><th>\u4ED5\u5165\u5148</th>
          <th>\u9867\u5BA2\u540D</th><th class="text-center">\u54C1\u76EE\u6570</th>
          <th class="text-end">\u5165\u8377\u6570</th><th class="text-end">\u91D1\u984D</th>
          <th class="text-center">\u7D0D\u54C1\u66F8</th><th>\u691C\u54C1\u8005</th><th>\u64CD\u4F5C</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="11" class="text-center text-muted py-4">\u7D0D\u54C1\u5C65\u6B74\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody>
    </table>
  </div>
</div>`;
  const o10 = getLayoutOpts(c);
  return layout("\u7D0D\u54C1\u5C65\u6B74", content, "", o10.username, o10);
});
app2.get("/receipts/new/:order_id", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const orderId = parseInt(c.req.param("order_id"));
  if (isNaN(orderId)) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u4E0D\u6B63\u306AID\u3067\u3059\u3002</div>', "", "", getLayoutOpts(c));
  const [order, itemsRes, supplierRes] = await Promise.all([
    db2.prepare(`
      SELECT po.*, s.name AS supplier_name, s.payment_method
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id=s.id
      WHERE po.id=? AND po.tenant_id=?
    `).bind(orderId, tenantId).first(),
    db2.prepare(`
      SELECT poi.*,
        COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
      FROM purchase_order_items poi WHERE poi.purchase_order_id=? ORDER BY poi.id
    `).bind(orderId).all(),
    db2.prepare("SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all()
  ]);
  if (!order) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u767A\u6CE8\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002</div>', "", "", getLayoutOpts(c));
  const supplierOpts = supplierRes.results.map(
    (s) => `<option value="${s["id"]}">${esc(s["name"])}</option>`
  ).join("");
  const itemIds = itemsRes.results.map((i) => i["id"]);
  const itemRows = itemsRes.results.map((item) => {
    const remaining = Number(item["quantity"] || 0) - Number(item["received_qty"] || 0);
    const listPrice = item["list_price"] != null ? Number(item["list_price"]) : null;
    const rate = item["rate"] != null ? Number(item["rate"]) : null;
    const unitPrice = item["unit_price"] != null ? Number(item["unit_price"]) : null;
    const suggested = listPrice && rate ? Math.round(listPrice * rate) : unitPrice;
    const listFmt = listPrice ? listPrice.toLocaleString("ja-JP") : "";
    const rateFmt = rate ? (rate * 100).toFixed(1) + "%" : "";
    const suggestTip = listPrice && rate ? `<div class="text-muted" style="font-size:.7rem">\u5B9A\u4FA1 \xA5${listFmt} \xD7 ${rateFmt} = \xA5${suggested?.toLocaleString("ja-JP")}</div>` : "";
    return `<tr data-poi-id="${item["id"]}">
      <td class="small">
        <span class="text-muted">${esc(item["item_category"])} / ${esc(item["manufacturer"])}</span><br>
        <strong>${esc(item["product_name"])}</strong>${item["spec"] ? ` <span class="text-muted">${esc(item["spec"])}</span>` : ""}
        ${item["color"] ? `<br><span class="text-muted">${esc(item["color"])}</span>` : ""}
      </td>
      <td class="text-center fw-semibold">${item["quantity"]}</td>
      <td class="text-center text-success">${item["received_qty"]}</td>
      <td class="text-center ${remaining <= 0 ? "text-muted" : "text-danger fw-bold"}">${remaining}</td>
      <td style="min-width:110px">
        <input class="form-control form-control-sm text-center qty-input" type="number"
          min="0" max="${remaining > 0 ? remaining : 0}"
          name="rq_${item["id"]}" value="${remaining > 0 ? remaining : 0}"
          data-poi="${item["id"]}">
      </td>
      <td style="min-width:160px">
        <div class="input-group input-group-sm">
          <span class="input-group-text">\xA5</span>
          <input class="form-control text-end price-input" type="number" min="0" step="1"
            name="up_${item["id"]}" value="${unitPrice ?? ""}"
            placeholder="${suggested ?? ""}"
            data-list="${listPrice ?? ""}" data-rate="${rate ?? ""}"
            data-poi="${item["id"]}">
        </div>
        ${suggestTip}
      </td>
      <td><input class="form-control form-control-sm" name="rn_${item["id"]}" placeholder="\u884C\u5099\u8003"></td>
    </tr>`;
  }).join("");
  const scripts = `<script>
// \u5408\u8A08\u91D1\u984D\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u8A08\u7B97
function calcTotal(){
  var total = 0;
  document.querySelectorAll('.qty-input').forEach(function(qEl){
    var poi = qEl.dataset.poi;
    var pEl = document.querySelector('[name="up_'+poi+'"]');
    var qty = parseInt(qEl.value)||0;
    var price = parseFloat(pEl?.value||'0')||0;
    total += qty * price;
  });
  var el = document.getElementById('preview-total');
  if(el) el.textContent = '\xA5' + total.toLocaleString('ja-JP');
}
document.addEventListener('input', function(e){
  if(e.target.classList.contains('qty-input') || e.target.classList.contains('price-input')) calcTotal();
});

// \u7D0D\u54C1\u66F8\u306A\u3057\u30C8\u30B0\u30EB
(function(){
  var noSlipCb = document.getElementById('cb-no-slip-new');
  var slipDateEl = document.querySelector('[name="slip_date"]');
  if(!noSlipCb) return;
  noSlipCb.addEventListener('change', function(){
    if(noSlipCb.checked){
      slipDateEl.value = '';
      slipDateEl.disabled = true;
      slipDateEl.removeAttribute('required');
    } else {
      slipDateEl.disabled = false;
      slipDateEl.setAttribute('required', '');
    }
  });
})();

document.getElementById('receipt-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var form = e.target;
  var noSlipCb = document.getElementById('cb-no-slip-new');
  var isNoSlip = noSlipCb && noSlipCb.checked;

  // \u30D0\u30EA\u30C7\u30FC\u30B7\u30E7\u30F3
  var receivedDate = form.querySelector('[name="received_date"]').value;
  var slipDate     = form.querySelector('[name="slip_date"]').value;
  var inspectedBy  = form.querySelector('[name="inspected_by"]').value.trim();
  if(!receivedDate){ showFlash('\u5165\u8377\u65E5\u306F\u5FC5\u9808\u3067\u3059','danger'); return; }
  if(!isNoSlip && !slipDate){ showFlash('\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u7D0D\u54C1\u66F8\u304C\u306A\u3044\u5834\u5408\u306F\u300C\u7D0D\u54C1\u66F8\u306A\u3057\u300D\u306B\u30C1\u30A7\u30C3\u30AF\uFF09','danger'); return; }
  if(!inspectedBy){ showFlash('\u691C\u54C1\u8005\u306F\u5FC5\u9808\u3067\u3059','danger'); return; }

  var itemIds = ${JSON.stringify(itemIds)};
  var receiptItems = itemIds.map(function(id){
    var qEl = form.querySelector('[name="rq_'+id+'"]');
    var pEl = form.querySelector('[name="up_'+id+'"]');
    var nEl = form.querySelector('[name="rn_'+id+'"]');
    var qty = parseInt(qEl?.value||'0');
    var obj = {
      purchase_order_item_id: id,
      received_quantity: qty,
      note: nEl?.value||''
    };
    if(pEl && pEl.value !== '') obj.actual_unit_price = parseFloat(pEl.value);
    return obj;
  }).filter(function(i){ return i.received_quantity > 0; });

  if(receiptItems.length === 0){
    showFlash('\u5165\u8377\u6570\u30921\u4EE5\u4E0A\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044','danger'); return;
  }

  var actualSupEl = form.querySelector('[name="actual_supplier_id"]');
  var payload = {
    order_id:           ${orderId},
    received_date:      receivedDate,
    slip_date:          isNoSlip ? '' : slipDate,
    inspected_by:       inspectedBy,
    note:               form.querySelector('[name="note"]').value,
    no_slip:            isNoSlip,
    slip_note:          form.querySelector('[name="slip_note"]')?.value||'',
    actual_supplier_id: actualSupEl && actualSupEl.value ? parseInt(actualSupEl.value) : null,
    items: receiptItems
  };

  var btn = form.querySelector('button[type=submit]');
  btn.disabled=true;
  btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>\u4FDD\u5B58\u4E2D...';
  try {
    var resp = await fetch('/api/receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var result = await resp.json();
    if(!resp.ok){ showFlash(result.error||'\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u7D0D\u54C1\u767B\u9332\u3092\u4FDD\u5B58'; return; }
    window.location.replace('/orders/${orderId}?_r=' + Date.now());
  } catch(err){
    showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC: '+err.message,'danger');
    btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u7D0D\u54C1\u767B\u9332\u3092\u4FDD\u5B58';
  }
});

// \u521D\u671F\u8A08\u7B97
calcTotal();
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-truck me-2" style="color:var(--gw-green)"></i>\u7D0D\u54C1\u767B\u9332\u30FB\u691C\u54C1</h1>
    <p class="page-subtitle">${esc(order["order_no"])} \uFF0F ${esc(order["supplier_name"])}</p>
  </div>
  <div class="actions">
    <a href="/orders/${orderId}" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>\u767A\u6CE8\u8A73\u7D30\u3078\u623B\u308B</a>
  </div>
</div>

<!-- \u904B\u7528\u30AC\u30A4\u30C9 -->
<div class="alert alert-info d-flex gap-2 py-2 mb-3" style="font-size:.9rem">
  <i class="fas fa-clipboard-check mt-1 flex-shrink-0"></i>
  <div>
    <strong>\u691C\u54C1\u624B\u9806\uFF1A</strong>
    \u2460\u5165\u8377\u65E5\u30FB\u691C\u54C1\u8005\u3092\u5165\u529B\u3000\u2461\u7D0D\u54C1\u66F8\u306E\u65E5\u4ED8\u3092\u5165\u529B\uFF08\u7D0D\u54C1\u66F8\u304C\u306A\u3044\u5834\u5408\u306F\u300C\u7D0D\u54C1\u66F8\u306A\u3057\u300D\u306B\u30C1\u30A7\u30C3\u30AF\uFF09
    \u2462\u5404\u5546\u54C1\u306E<strong>\u5165\u8377\u6570</strong>\u3068<strong>\u7D0D\u54C1\u66F8\u8A18\u8F09\u306E\u5358\u4FA1</strong>\u3092\u78BA\u8A8D\u30FB\u5165\u529B\u3000\u2463\u4ED5\u5165\u5148\u304C\u9055\u3046\u5834\u5408\u306F\u5909\u66F4\u3000\u2464\u4FDD\u5B58
  </div>
</div>

<form id="receipt-form">

  <!-- \u2460 \u7D0D\u54C1\u30D8\u30C3\u30C0 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-info-circle me-1"></i>\u2460 \u5165\u8377\u60C5\u5831</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-3">
          <label class="form-label fw-semibold">\u5165\u8377\u65E5 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="received_date" value="${todayStr()}" required>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">
            \u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5 <span class="text-danger" id="slip-date-required-mark">*</span>
          </label>
          <input class="form-control" type="date" name="slip_date" required
            placeholder="\u7D0D\u54C1\u66F8\u306E\u65E5\u4ED8">
          <div class="form-text">\u7D0D\u54C1\u66F8\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u65E5\u4ED8</div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">\u691C\u54C1\u8005 <span class="text-danger">*</span></label>
          <input class="form-control" name="inspected_by" placeholder="\u4F8B: \u53E4\u5DDD" required>
        </div>
        <div class="col-md-3 d-flex align-items-end pb-1">
          <!-- \u7D0D\u54C1\u66F8\u306A\u3057 -->
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="cb-no-slip-new" name="no_slip"
              style="width:2.5em;height:1.3em">
            <label class="form-check-label ms-2 fw-semibold" for="cb-no-slip-new">
              <i class="fas fa-file-slash me-1 text-secondary"></i>\u7D0D\u54C1\u66F8\u306A\u3057
              <div class="text-muted fw-normal" style="font-size:.75rem">\u90F5\u9001\u5F85\u3061\u30FB\u7D1B\u5931\u306A\u3069</div>
            </label>
          </div>
        </div>
        <div class="col-12">
          <label class="form-label">\u5099\u8003</label>
          <textarea class="form-control" name="note" rows="2" placeholder="\u7279\u8A18\u4E8B\u9805\u304C\u3042\u308C\u3070\u8A18\u5165"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- \u2461 \u4ED5\u5165\u5148\uFF08\u5B9F\u969B\u306E\u4ED5\u5165\u5148\u304C\u9055\u3046\u5834\u5408\uFF09 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-building me-1"></i>\u2461 \u4ED5\u5165\u5148\u78BA\u8A8D</div>
    <div class="card-body">
      <div class="row g-3 align-items-end">
        <div class="col-md-5">
          <div class="mb-2 small">
            <span class="text-muted">\u767A\u6CE8\u6642\u306E\u4ED5\u5165\u5148:</span>
            <strong class="ms-1">${esc(order["supplier_name"])}</strong>
            ${order["payment_method"] ? `<span class="ms-2 badge text-bg-light border">${esc(order["payment_method"])}</span>` : ""}
          </div>
          <label class="form-label mb-1">\u5B9F\u969B\u306E\u4ED5\u5165\u5148 <span class="text-muted small fw-normal">\uFF08\u767A\u6CE8\u3068\u7570\u306A\u308B\u5834\u5408\u306E\u307F\uFF09</span></label>
          <select class="form-select" name="actual_supplier_id">
            <option value="">\u2015 \u767A\u6CE8\u6642\u306E\u4ED5\u5165\u5148\u306E\u307E\u307E \u2015</option>
            ${supplierOpts}
          </select>
        </div>
        <div class="col-md-7 small text-muted">
          <i class="fas fa-info-circle me-1"></i>\u5B9F\u969B\u306B\u7D0D\u54C1\u3057\u3066\u304D\u305F\u4ED5\u5165\u5148\u304C\u767A\u6CE8\u3068\u7570\u306A\u308B\u5834\u5408\uFF08\u4EE3\u66FF\u30FB\u76F4\u9001\u306A\u3069\uFF09\u306B\u5909\u66F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002
        </div>
      </div>
    </div>
  </div>

  <!-- \u2462 \u5165\u8377\u660E\u7D30\uFF08\u5358\u4FA1\u3092\u7D0D\u54C1\u66F8\u306B\u5408\u308F\u305B\u3066\u5165\u529B\uFF09 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
      <span><i class="fas fa-table me-1"></i>\u2462 \u5165\u8377\u660E\u7D30\uFF08\u7D0D\u54C1\u66F8\u306E\u91D1\u984D\u3092\u78BA\u8A8D\u3057\u3066\u5165\u529B\uFF09</span>
      <span class="badge bg-secondary" id="preview-total">\xA50</span>
    </div>
    <div class="table-responsive">
      <table class="table align-middle mb-0 small">
        <thead class="table-light">
          <tr>
            <th>\u5546\u54C1</th>
            <th class="text-center">\u767A\u6CE8\u6570</th>
            <th class="text-center">\u5165\u8377\u6E08</th>
            <th class="text-center">\u6B8B\u6570</th>
            <th class="text-center" style="min-width:110px">\u4ECA\u56DE\u5165\u8377\u6570 <span class="text-danger">*</span></th>
            <th style="min-width:170px">
              \u7D0D\u54C1\u66F8\u306E\u5358\u4FA1 <span class="text-danger">*</span>
              <div class="text-muted fw-normal" style="font-size:.7rem">\u767A\u6CE8\u5358\u4FA1\u3068\u7570\u306A\u308B\u5834\u5408\u306F\u4FEE\u6B63</div>
            </th>
            <th>\u884C\u5099\u8003</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
  </div>

  <!-- \u2463 \u7167\u5408\u30E1\u30E2 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-sticky-note me-1"></i>\u2463 \u7167\u5408\u30E1\u30E2\uFF08\u4EFB\u610F\uFF09</div>
    <div class="card-body">
      <textarea class="form-control" name="slip_note" rows="2"
        placeholder="\u4F8B: \u25CB\u25CB\u306E\u5358\u4FA1\u304C\u7D0D\u54C1\u66F8\u3067\u306F\xA51,800\u3067\u30B7\u30B9\u30C6\u30E0\u306E\xA52,000\u3068\u7570\u306A\u3063\u305F\u305F\u3081\u4FEE\u6B63\u3002\u5024\u5F15\u304D\u9023\u7D61\u3042\u308A\u3002"></textarea>
    </div>
  </div>

  <div class="sticky-actions d-flex justify-content-between align-items-center">
    <span class="text-muted small"><i class="fas fa-info-circle me-1"></i>\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5\u30FB\u691C\u54C1\u8005\u306F\u5FC5\u9808\u3067\u3059</span>
    <div>
      <a href="/orders/${orderId}" class="btn btn-outline-secondary me-2"><i class="fas fa-times me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB</a>
      <button type="submit" class="btn btn-primary btn-lg px-4"><i class="fas fa-save me-1"></i>\u7D0D\u54C1\u767B\u9332\u3092\u4FDD\u5B58</button>
    </div>
  </div>

</form>`;
  const o11 = getLayoutOpts(c);
  return layout("\u7D0D\u54C1\u767B\u9332\u30FB\u691C\u54C1", content, scripts, o11.username, o11);
});
app2.get("/receipts/free", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const suppliers = await db2.prepare(
    "SELECT id, name, payment_method FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name"
  ).bind(tenantId).all();
  const supplierOpts = suppliers.results.map(
    (s) => `<option value="${s["id"]}" data-pay="${esc(s["payment_method"])}">${esc(s["name"])}</option>`
  ).join("");
  const scripts = `<script>
var rowCount = 1;

// \u5408\u8A08\u91D1\u984D\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u8A08\u7B97
function calcFreeTotal(){
  var total = 0;
  document.querySelectorAll('#free-items-tbody tr').forEach(function(tr){
    var n = tr.dataset.row;
    var qty = parseInt(document.querySelector('[name="qty_'+n+'"]')?.value||'0')||0;
    var up  = parseFloat(document.querySelector('[name="up_'+n+'"]')?.value||'0')||0;
    total += qty * up;
  });
  var el = document.getElementById('free-preview-total');
  if(el) el.textContent = '\xA5' + total.toLocaleString('ja-JP');
}

function addRow(){
  rowCount++;
  var tbody = document.getElementById('free-items-tbody');
  var tr = document.createElement('tr');
  tr.dataset.row = rowCount;
  tr.innerHTML = \`
    <td><input class="form-control form-control-sm" name="pname_\${rowCount}" placeholder="\u5546\u54C1\u540D" required></td>
    <td><input class="form-control form-control-sm" name="spec_\${rowCount}" placeholder="\u4ED5\u69D8\u30FB\u8272\u306A\u3069"></td>
    <td><input class="form-control form-control-sm text-center qty-input" type="number" min="1" name="qty_\${rowCount}" value="1" required></td>
    <td>
      <div class="input-group input-group-sm">
        <span class="input-group-text">\xA5</span>
        <input class="form-control text-end up-input" type="number" min="0" step="1" name="up_\${rowCount}" placeholder="\u7D0D\u54C1\u66F8\u306E\u5358\u4FA1">
      </div>
      <div class="text-end text-muted row-subtotal" style="font-size:.72rem;margin-top:2px">\u5C0F\u8A08: \xA50</div>
    </td>
    <td><input class="form-control form-control-sm" name="note_\${rowCount}" placeholder="\u5099\u8003"></td>
    <td class="text-center">
      <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-del-row"><i class="fas fa-trash"></i></button>
    </td>
  \`;
  tr.querySelector('.btn-del-row').addEventListener('click', function(){
    if(document.querySelectorAll('#free-items-tbody tr').length > 1){
      tr.remove(); calcFreeTotal();
    } else {
      showFlash('\u660E\u7D30\u306F1\u884C\u4EE5\u4E0A\u5FC5\u8981\u3067\u3059','warning');
    }
  });
  tr.querySelectorAll('.qty-input,.up-input').forEach(function(inp){
    inp.addEventListener('input', function(){
      var n2 = tr.dataset.row;
      var q = parseInt(document.querySelector('[name="qty_'+n2+'"]')?.value||'0')||0;
      var p = parseFloat(document.querySelector('[name="up_'+n2+'"]')?.value||'0')||0;
      var st = tr.querySelector('.row-subtotal');
      if(st) st.textContent = '\u5C0F\u8A08: \xA5' + (q*p).toLocaleString('ja-JP');
      calcFreeTotal();
    });
  });
  tbody.appendChild(tr);
}

// \u7D0D\u54C1\u66F8\u306A\u3057\u30C8\u30B0\u30EB\u5236\u5FA1
function updateNoSlipUI(){
  var cb = document.getElementById('free-no-slip-cb');
  var slipDateGroup = document.getElementById('free-slip-date-group');
  var slipDateEl = document.querySelector('[name="slip_date"]');
  if(!cb || !slipDateGroup) return;
  if(cb.checked){
    slipDateGroup.style.opacity = '0.4';
    slipDateGroup.style.pointerEvents = 'none';
    if(slipDateEl){ slipDateEl.value = ''; slipDateEl.removeAttribute('required'); }
    var lbl = slipDateGroup.querySelector('label');
    if(lbl) lbl.innerHTML = '\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5 <span class="text-muted small">\uFF08\u7D0D\u54C1\u66F8\u306A\u3057\u306E\u305F\u3081\u4E0D\u8981\uFF09</span>';
  } else {
    slipDateGroup.style.opacity = '1';
    slipDateGroup.style.pointerEvents = '';
    if(slipDateEl) slipDateEl.setAttribute('required','required');
    var lbl2 = slipDateGroup.querySelector('label');
    if(lbl2) lbl2.innerHTML = '\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5 <span class="text-danger">*</span>';
  }
}

// \u4ED5\u5165\u5148\u5909\u66F4\u6642\u306B\u652F\u6255\u3044\u6761\u4EF6\u3092\u8868\u793A
function updatePayDisplay(){
  var sel = document.querySelector('[name="supplier_id"]');
  var el = document.getElementById('pay-method-display');
  if(!sel || !el) return;
  var opt = sel.options[sel.selectedIndex];
  var pay = opt ? (opt.dataset.pay||'') : '';
  el.textContent = pay ? ('\u652F\u6255\u3044\u6761\u4EF6: ' + pay) : '';
}

document.addEventListener('DOMContentLoaded', function(){
  // \u884C\u524A\u9664\u30DC\u30BF\u30F3\uFF08\u521D\u671F\u884C\uFF09
  document.querySelectorAll('#free-items-tbody .btn-del-row').forEach(function(btn){
    btn.addEventListener('click', function(){
      var tr = btn.closest('tr');
      if(document.querySelectorAll('#free-items-tbody tr').length > 1){
        tr.remove(); calcFreeTotal();
      } else {
        showFlash('\u660E\u7D30\u306F1\u884C\u4EE5\u4E0A\u5FC5\u8981\u3067\u3059','warning');
      }
    });
  });

  // \u521D\u671F\u884C\u306E\u5C0F\u8A08\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u8A08\u7B97
  document.querySelectorAll('#free-items-tbody tr').forEach(function(tr){
    tr.querySelectorAll('.qty-input,.up-input').forEach(function(inp){
      inp.addEventListener('input', function(){
        var n = tr.dataset.row;
        var q = parseInt(document.querySelector('[name="qty_'+n+'"]')?.value||'0')||0;
        var p = parseFloat(document.querySelector('[name="up_'+n+'"]')?.value||'0')||0;
        var st = tr.querySelector('.row-subtotal');
        if(st) st.textContent = '\u5C0F\u8A08: \xA5' + (q*p).toLocaleString('ja-JP');
        calcFreeTotal();
      });
    });
  });

  document.getElementById('btn-add-row').addEventListener('click', addRow);

  var noSlipCb = document.getElementById('free-no-slip-cb');
  if(noSlipCb) noSlipCb.addEventListener('change', updateNoSlipUI);
  updateNoSlipUI();

  var supSel = document.querySelector('[name="supplier_id"]');
  if(supSel) supSel.addEventListener('change', updatePayDisplay);

  document.getElementById('free-receipt-form').addEventListener('submit', async function(e){
    e.preventDefault();
    var f = e.target;
    var receivedDate = f.querySelector('[name="received_date"]').value;
    var noSlip = document.getElementById('free-no-slip-cb')?.checked || false;
    var slipDate = f.querySelector('[name="slip_date"]')?.value || '';
    var inspectedBy = (f.querySelector('[name="inspected_by"]').value||'').trim();

    // \u2500\u2500 \u30D0\u30EA\u30C7\u30FC\u30B7\u30E7\u30F3 \u2500\u2500
    if(!receivedDate){ showFlash('\u5165\u8377\u65E5\u306F\u5FC5\u9808\u3067\u3059','danger'); return; }
    if(!noSlip && !slipDate){ showFlash('\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u7D0D\u54C1\u66F8\u304C\u306A\u3044\u5834\u5408\u306F\u300C\u7D0D\u54C1\u66F8\u306A\u3057\u300D\u3092\u30AA\u30F3\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002','danger'); return; }
    if(!inspectedBy){ showFlash('\u691C\u54C1\u8005\u306F\u5FC5\u9808\u3067\u3059','danger'); return; }
    var supplierId = parseInt(f.querySelector('[name="supplier_id"]').value||'0');
    if(!supplierId){ showFlash('\u4ED5\u5165\u5148\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044','danger'); return; }

    var rows = document.querySelectorAll('#free-items-tbody tr');
    var items = [];
    var hasError = false;
    rows.forEach(function(tr){
      var n = tr.dataset.row;
      var pname = (f.querySelector('[name="pname_'+n+'"]')?.value||'').trim();
      var qty   = parseInt(f.querySelector('[name="qty_'+n+'"]')?.value||'0');
      if(!pname){ return; } // \u5546\u54C1\u540D\u7A7A\u884C\u306F\u30B9\u30AD\u30C3\u30D7
      if(qty <= 0){ showFlash('\u6570\u91CF\u306F1\u4EE5\u4E0A\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u884C: '+pname+'\uFF09','danger'); hasError=true; return; }
      var item = {
        product_name: pname,
        spec:         (f.querySelector('[name="spec_'+n+'"]')?.value||'').trim(),
        quantity:     qty,
        note:         (f.querySelector('[name="note_'+n+'"]')?.value||'').trim()
      };
      var upEl = f.querySelector('[name="up_'+n+'"]');
      if(upEl && upEl.value !== '') item.unit_price = parseFloat(upEl.value);
      items.push(item);
    });
    if(hasError) return;
    if(items.length === 0){ showFlash('\u660E\u7D30\u30921\u884C\u4EE5\u4E0A\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044','danger'); return; }

    var payload = {
      supplier_id:   supplierId,
      received_date: receivedDate,
      slip_date:     noSlip ? '' : slipDate,
      inspected_by:  inspectedBy,
      note:          (f.querySelector('[name="note"]').value||'').trim(),
      no_slip:       noSlip,
      slip_note:     (f.querySelector('[name="slip_note"]')?.value||'').trim(),
      items: items
    };

    var btn = f.querySelector('button[type=submit]');
    btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>\u4FDD\u5B58\u4E2D...';
    try {
      var resp = await fetch('/api/receipts/free',{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      var res = await resp.json();
      if(!resp.ok){ showFlash(res.error||'\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u7D0D\u54C1\u767B\u9332\u3092\u4FDD\u5B58'; return; }
      window.location.href = '/receipts?flash=' + encodeURIComponent('\u30B7\u30B9\u30C6\u30E0\u5916\u767A\u6CE8\u306E\u7D0D\u54C1\u3092\u767B\u9332\u3057\u307E\u3057\u305F');
    } catch(err){
      showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC: '+err.message,'danger');
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u7D0D\u54C1\u767B\u9332\u3092\u4FDD\u5B58';
    }
  });
});
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-plus-circle me-2" style="color:var(--gw-green)"></i>\u30B7\u30B9\u30C6\u30E0\u5916\u767A\u6CE8\u306E\u7D0D\u54C1\u767B\u9332</h1>
    <p class="page-subtitle">\u3053\u306E\u30B7\u30B9\u30C6\u30E0\u3067\u767A\u6CE8\u3057\u3066\u3044\u306A\u3044\u5546\u54C1\u306E\u7D0D\u54C1\u3092\u8A18\u9332\u3057\u307E\u3059\u3002</p>
  </div>
  <div class="actions">
    <a href="/receipts" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>\u7D0D\u54C1\u5C65\u6B74\u306B\u623B\u308B</a>
  </div>
</div>
<form id="free-receipt-form">

  <!-- \u2460 \u5165\u8377\u60C5\u5831 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-truck-loading me-1" style="color:var(--gw-green)"></i>\u2460 \u5165\u8377\u60C5\u5831</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label fw-semibold">\u4ED5\u5165\u5148 <span class="text-danger">*</span></label>
          <select class="form-select" name="supplier_id" required>
            <option value="">\u2015 \u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044 \u2015</option>
            ${supplierOpts}
          </select>
          <div id="pay-method-display" class="text-muted small mt-1"></div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">\u5165\u8377\u65E5 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="received_date" value="${todayStr()}" required>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">\u691C\u54C1\u8005 <span class="text-danger">*</span></label>
          <input class="form-control" name="inspected_by" placeholder="\u4F8B: \u53E4\u5DDD" required>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">\u5099\u8003</label>
          <textarea class="form-control" name="note" rows="2" placeholder="\u7D0D\u54C1\u66F8\u756A\u53F7\u30FB\u7279\u8A18\u4E8B\u9805\u306A\u3069"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- \u2461 \u7D0D\u54C1\u66F8\u7167\u5408 -->
  <div class="card mb-3 border-warning">
    <div class="card-header fw-semibold bg-warning bg-opacity-10">
      <i class="fas fa-file-invoice me-1"></i>\u2461 \u7D0D\u54C1\u66F8\u7167\u5408
      <span class="ms-2 small fw-normal text-muted">\u203B \u7D0D\u54C1\u66F8\u306E\u65E5\u4ED8\u3068\u91D1\u984D\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044</span>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-12">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="free-no-slip-cb" name="no_slip" value="1"
              style="width:2.5em;height:1.3em">
            <label class="form-check-label ms-2 fw-semibold" for="free-no-slip-cb">
              <i class="fas fa-file-slash me-1 text-secondary"></i>\u7D0D\u54C1\u66F8\u306A\u3057
              <span class="text-muted fw-normal small ms-2">\uFF08\u90F5\u9001\u5F85\u3061\u30FB\u7D1B\u5931\u30FB\u4E0D\u8981\u306A\u5834\u5408\u306A\u3069\uFF09</span>
            </label>
          </div>
        </div>
        <div class="col-md-3" id="free-slip-date-group">
          <label class="form-label fw-semibold">\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="slip_date" required>
          <div class="text-muted small mt-1"><i class="fas fa-info-circle me-1"></i>\u7D0D\u54C1\u66F8\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u65E5\u4ED8\u3092\u5165\u529B</div>
        </div>
        <div class="col-12">
          <label class="form-label">\u7167\u5408\u30E1\u30E2 <span class="text-muted small fw-normal">\uFF08\u5DEE\u7570\u30FB\u7279\u8A18\u4E8B\u9805\u304C\u3042\u308C\u3070\u8A18\u5165\uFF09</span></label>
          <textarea class="form-control" name="slip_note" rows="2"
            placeholder="\u4F8B: \u91D1\u984D\u304C\xA5200\u7570\u306A\u3063\u3066\u3044\u305F\u305F\u3081\u78BA\u8A8D\u4E2D\u3002\u4ED5\u5165\u5148\u3078\u554F\u3044\u5408\u308F\u305B\u6E08\u307F\u3002"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- \u2462 \u5165\u8377\u660E\u7D30 -->
  <div class="card mb-3">
    <div class="card-header d-flex align-items-center justify-content-between">
      <span class="fw-semibold"><i class="fas fa-table me-1"></i>\u2462 \u5165\u8377\u660E\u7D30\uFF08\u7D0D\u54C1\u66F8\u306E\u5358\u4FA1\u3092\u78BA\u8A8D\u3057\u3066\u5165\u529B\uFF09</span>
      <button type="button" id="btn-add-row" class="btn btn-outline-success btn-sm">
        <i class="fas fa-plus me-1"></i>\u884C\u3092\u8FFD\u52A0
      </button>
    </div>
    <div class="table-responsive">
      <table class="table align-middle mb-0 small">
        <thead>
          <tr>
            <th style="min-width:200px">\u5546\u54C1\u540D <span class="text-danger">*</span></th>
            <th style="min-width:130px">\u4ED5\u69D8\u30FB\u8272\u306A\u3069</th>
            <th class="text-center" style="min-width:80px">\u6570\u91CF <span class="text-danger">*</span></th>
            <th style="min-width:150px">
              \u5358\u4FA1 <span class="text-muted fw-normal">\uFF08\u7D0D\u54C1\u66F8\u8A18\u8F09\u5024\uFF09</span>
            </th>
            <th style="min-width:130px">\u884C\u5099\u8003</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="free-items-tbody">
          <tr data-row="1">
            <td><input class="form-control form-control-sm" name="pname_1" placeholder="\u5546\u54C1\u540D" required></td>
            <td><input class="form-control form-control-sm" name="spec_1" placeholder="\u4ED5\u69D8\u30FB\u8272\u306A\u3069"></td>
            <td><input class="form-control form-control-sm text-center qty-input" type="number" min="1" name="qty_1" value="1" required></td>
            <td>
              <div class="input-group input-group-sm">
                <span class="input-group-text">\xA5</span>
                <input class="form-control text-end up-input" type="number" min="0" step="1" name="up_1" placeholder="\u7D0D\u54C1\u66F8\u306E\u5358\u4FA1">
              </div>
              <div class="text-end text-muted row-subtotal" style="font-size:.72rem;margin-top:2px">\u5C0F\u8A08: \xA50</div>
            </td>
            <td><input class="form-control form-control-sm" name="note_1" placeholder="\u5099\u8003"></td>
            <td class="text-center">
              <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-del-row"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="card-footer d-flex justify-content-end align-items-center gap-3 py-2">
      <span class="text-muted small">\u5408\u8A08\u91D1\u984D\uFF08\u7D0D\u54C1\u66F8\u3068\u7167\u5408\uFF09:</span>
      <span id="free-preview-total" class="fw-bold fs-5">\xA50</span>
    </div>
  </div>

  <div class="d-flex justify-content-end gap-2">
    <a href="/receipts" class="btn btn-outline-secondary"><i class="fas fa-times me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB</a>
    <button type="submit" class="btn btn-success btn-lg px-4"><i class="fas fa-save me-1"></i>\u7D0D\u54C1\u767B\u9332\u3092\u4FDD\u5B58</button>
  </div>
</form>`;
  const o12 = getLayoutOpts(c);
  return layout("\u30B7\u30B9\u30C6\u30E0\u5916\u767A\u6CE8\u306E\u7D0D\u54C1\u767B\u9332", content, scripts, o12.username, o12);
});
app2.get("/products/new", async (c) => {
  const db2 = c.env.DB;
  const q = c.req.query;
  const prefill = {
    item_category: q("item_category") || "",
    manufacturer: q("manufacturer") || "",
    name: q("name") || "",
    spec: q("spec") || "",
    color: q("color") || "",
    club_type: q("club_type") || "",
    list_price: q("list_price") || "",
    default_rate: q("default_rate") || "0.65",
    supplier_id: q("supplier_id") || ""
  };
  const { tenantId } = getLayoutOpts(c);
  const suppliers = await db2.prepare("SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name").bind(tenantId).all();
  const supplierOpts = suppliers.results.map(
    (s) => `<option value="${s["id"]}" ${prefill.supplier_id === String(s["id"]) ? "selected" : ""}>${esc(s["name"])}</option>`
  ).join("");
  const scripts = `<script>
document.getElementById('new-product-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var f = this;
  var body = {
    item_category:       f.item_category.value.trim(),
    manufacturer:        f.manufacturer.value.trim(),
    name:                f.name.value.trim(),
    spec:                f.spec.value.trim(),
    color:               f.color.value.trim(),
    club_type:           f.club_type.value,
    list_price:          f.list_price.value ? parseFloat(f.list_price.value) : null,
    default_rate:        f.default_rate.value ? parseFloat(f.default_rate.value) : null,
    default_supplier_id: f.default_supplier_id.value ? parseInt(f.default_supplier_id.value) : null,
    unit:                f.unit.value || '\u672C',
    barcode:             f.barcode.value.trim(),
    product_code:        f.product_code.value.trim(),
    source:              f.source.value.trim(),
  };
  if(!body.item_category || !body.name){
    showFlash('\u54C1\u76EE\u3068\u5546\u54C1\u540D\u306F\u5FC5\u9808\u3067\u3059','danger'); return;
  }
  var btn = f.querySelector('button[type=submit]');
  btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>\u4FDD\u5B58\u4E2D...';
  try {
    var r = await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var res = await r.json();
    if(r.ok){
      location.href = '/products?flash=' + encodeURIComponent('\u300C'+body.name+'\u300D\u3092\u767B\u9332\u3057\u307E\u3057\u305F');
    } else {
      showFlash(res.error||'\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger');
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u767B\u9332\u3059\u308B';
    }
  } catch(err){
    showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC: '+err.message,'danger');
    btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u767B\u9332\u3059\u308B';
  }
});
</script>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-plus-circle me-2" style="color:var(--gw-green)"></i>\u5546\u54C1\u3092\u65B0\u898F\u767B\u9332</h1>
  </div>
  <div class="actions">
    <a href="/products" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>\u4E00\u89A7\u306B\u623B\u308B</a>
  </div>
</div>
<form id="new-product-form">
  <div class="card">
    <div class="card-body row g-3">
      <div class="col-md-3">
        <label class="form-label fw-semibold">\u54C1\u76EE <span class="text-danger">*</span></label>
        <input class="form-control" name="item_category" value="${esc(prefill.item_category)}" placeholder="\u30B7\u30E3\u30D5\u30C8 / \u30B0\u30EA\u30C3\u30D7 \u2026" required>
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">\u30E1\u30FC\u30AB\u30FC</label>
        <input class="form-control" name="manufacturer" value="${esc(prefill.manufacturer)}" placeholder="\u30D5\u30B8\u30AF\u30E9 / Golf Pride \u2026">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">\u5546\u54C1\u540D <span class="text-danger">*</span></label>
        <input class="form-control" name="name" value="${esc(prefill.name)}" placeholder="\u4F8B: SPEEDER NX 50" required>
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">\u4ED5\u69D8</label>
        <input class="form-control" name="spec" value="${esc(prefill.spec)}" placeholder="5S / R / 60S \u2026">
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">\u8272</label>
        <input class="form-control" name="color" value="${esc(prefill.color)}" placeholder="\u30D6\u30E9\u30C3\u30AF / \u30DB\u30EF\u30A4\u30C8 \u2026">
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">\u7A2E\u985E</label>
        <select class="form-select" name="club_type">
          <option value="">\u2015</option>
          ${["DR", "FW", "UT", "IR", "PT", "DR/FW"].map(
    (t) => `<option value="${t}" ${prefill.club_type === t ? "selected" : ""}>${t}</option>`
  ).join("")}
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">\u5B9A\u4FA1</label>
        <div class="input-group">
          <span class="input-group-text">\xA5</span>
          <input class="form-control" type="number" name="list_price" value="${esc(prefill.list_price)}" min="0" step="1" placeholder="0">
        </div>
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">\u639B\u7387</label>
        <input class="form-control" type="number" name="default_rate" value="${esc(prefill.default_rate)}" step="0.01" min="0" max="1" placeholder="0.65">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">\u6A19\u6E96\u4ED5\u5165\u5148</label>
        <select class="form-select" name="default_supplier_id">
          <option value="">\u2015 \u672A\u8A2D\u5B9A \u2015</option>
          ${supplierOpts}
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">\u5358\u4F4D</label>
        <select class="form-select" name="unit">
          <option value="\u672C">\u672C</option>
          <option value="\u500B">\u500B</option>
          <option value="\u30C0\u30FC\u30B9">\u30C0\u30FC\u30B9</option>
          <option value="\u30BB\u30C3\u30C8">\u30BB\u30C3\u30C8</option>
          <option value="\u8DB3">\u8DB3</option>
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">\u30D0\u30FC\u30B3\u30FC\u30C9</label>
        <input class="form-control" name="barcode" placeholder="JAN\u30B3\u30FC\u30C9\u306A\u3069">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">\u54C1\u756A</label>
        <input class="form-control" name="product_code">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">\u51FA\u5178 / \u30E1\u30E2</label>
        <input class="form-control" name="source">
      </div>
    </div>
    <div class="card-footer text-end">
      <a href="/products" class="btn btn-outline-secondary me-2"><i class="fas fa-times me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB</a>
      <button type="submit" class="btn btn-success btn-lg px-4"><i class="fas fa-save me-1"></i>\u767B\u9332\u3059\u308B</button>
    </div>
  </div>
</form>`;
  const o13 = getLayoutOpts(c);
  return layout("\u5546\u54C1\u65B0\u898F\u767B\u9332", content, scripts, o13.username, o13);
});
app2.get("/receipts/:id/edit", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const rid = parseInt(c.req.param("id"));
  if (isNaN(rid)) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u4E0D\u6B63\u306AID\u3067\u3059\u3002</div>', "", "", getLayoutOpts(c));
  const [receipt, itemsRes, supplierRes] = await Promise.all([
    db2.prepare(`
      SELECT r.*,
             po.order_no, po.id AS purchase_order_id,
             s.name AS order_supplier_name, s.id AS order_supplier_id,
             s.payment_method AS order_supplier_payment,
             sa.name AS actual_supplier_name
      FROM receipts r
      LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
      LEFT JOIN suppliers s  ON po.supplier_id = s.id
      LEFT JOIN suppliers sa ON r.actual_supplier_id = sa.id
      WHERE r.id=? AND r.tenant_id=?
    `).bind(rid, tenantId).first(),
    db2.prepare(`
      SELECT ri.id AS receipt_item_id, ri.received_quantity, ri.note AS item_note,
             ri.actual_unit_price, ri.actual_rate, ri.actual_amount,
             poi.id AS poi_id, poi.product_name, poi.spec, poi.color, poi.item_category,
             poi.manufacturer, poi.quantity AS ordered_qty,
             poi.unit_price AS order_unit_price,
             poi.list_price, poi.rate AS default_rate
      FROM receipt_items ri
      LEFT JOIN purchase_order_items poi ON ri.purchase_order_item_id = poi.id
      WHERE ri.receipt_id=?
      ORDER BY ri.id
    `).bind(rid).all(),
    db2.prepare("SELECT id, name, payment_method FROM suppliers WHERE tenant_id=? AND is_active=1 ORDER BY name").bind(tenantId).all()
  ]);
  if (!receipt) return layout("\u30A8\u30E9\u30FC", '<div class="alert alert-danger">\u7D0D\u54C1\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002</div>', "", "", getLayoutOpts(c));
  const isFreeReceipt = !receipt["purchase_order_id"];
  const currentSupplierId = receipt["actual_supplier_id"] ?? receipt["order_supplier_id"];
  const supplierChanged = !!receipt["actual_supplier_id"];
  const supplierOpts = supplierRes.results.map(
    (s) => `<option value="${s["id"]}" ${String(s["id"]) === String(currentSupplierId) ? "selected" : ""}>${esc(s["name"])}</option>`
  ).join("");
  const itemRows = itemsRes.results.map((item) => {
    if (isFreeReceipt) {
      const currentUp2 = item["actual_unit_price"] != null ? Number(item["actual_unit_price"]) : "";
      return `<tr data-ri-id="${item["receipt_item_id"]}">
        <td><input class="form-control form-control-sm" name="item_note_${item["receipt_item_id"]}" value="${esc(item["item_note"])}"></td>
        <td>
          <div class="input-group input-group-sm">
            <span class="input-group-text">\xA5</span>
            <input class="form-control text-end up-input" type="number" min="0" step="1"
              name="up_${item["receipt_item_id"]}" value="${currentUp2}" placeholder="\u7D0D\u54C1\u66F8\u306E\u5358\u4FA1"
              data-ri-id="${item["receipt_item_id"]}">
          </div>
        </td>
        <td>
          <input class="form-control form-control-sm text-center qty-input" type="number" min="1"
            name="rq_${item["receipt_item_id"]}" value="${item["received_quantity"]}"
            data-ri-id="${item["receipt_item_id"]}">
        </td>
        <td class="text-end fw-semibold small subtotal-cell" data-ri-id="${item["receipt_item_id"]}">
          ${item["actual_amount"] != null ? "\xA5" + Number(item["actual_amount"]).toLocaleString("ja-JP") : "\u2015"}
        </td>
      </tr>`;
    }
    const currentUp = item["actual_unit_price"] != null ? Number(item["actual_unit_price"]) : item["order_unit_price"] ?? "";
    const listPrice = item["list_price"] ? Number(item["list_price"]) : null;
    const defaultRate = item["default_rate"] ? Number(item["default_rate"]) : null;
    const sugg = listPrice && defaultRate ? Math.round(listPrice * defaultRate) : null;
    const currentAmt = item["actual_amount"] != null ? Number(item["actual_amount"]) : item["order_unit_price"] != null ? Math.round(Number(item["order_unit_price"]) * Number(item["received_quantity"])) : null;
    return `<tr data-ri-id="${item["receipt_item_id"]}">
      <td class="small">
        <span class="text-muted" style="font-size:.75rem">${esc(item["item_category"])} / ${esc(item["manufacturer"])}</span><br>
        <strong>${esc(item["product_name"])}</strong>${item["spec"] ? ' <span class="text-muted">' + esc(item["spec"]) + "</span>" : ""}
        ${item["color"] ? '<br><span class="text-muted small">' + esc(item["color"]) + "</span>" : ""}
      </td>
      <td class="text-center">${item["ordered_qty"]}</td>
      <td>
        <div class="input-group input-group-sm" style="min-width:130px">
          <span class="input-group-text">\xA5</span>
          <input class="form-control text-end up-input" type="number" min="0" step="1"
            name="up_${item["receipt_item_id"]}" value="${currentUp}"
            data-ri-id="${item["receipt_item_id"]}"
            data-list="${listPrice ?? ""}" data-rate="${defaultRate ?? ""}">
        </div>
        ${sugg ? `<div class="text-muted" style="font-size:.7rem">\u5B9A\u4FA1\xA5${listPrice.toLocaleString("ja-JP")} \xD7 ${defaultRate} = \xA5${sugg.toLocaleString("ja-JP")}</div>` : ""}
        ${item["actual_unit_price"] != null ? `<div class="text-success" style="font-size:.7rem"><i class="fas fa-check me-1"></i>\u5B9F\u7E3E\u5358\u4FA1\u3042\u308A</div>` : `<div class="text-warning" style="font-size:.7rem"><i class="fas fa-exclamation-triangle me-1"></i>\u767A\u6CE8\u6642\u5358\u4FA1\uFF08\u8981\u78BA\u8A8D\uFF09</div>`}
      </td>
      <td>
        <input class="form-control form-control-sm text-center qty-input" type="number" min="0"
          name="rq_${item["receipt_item_id"]}" value="${item["received_quantity"]}"
          data-ri-id="${item["receipt_item_id"]}">
      </td>
      <td class="text-end fw-semibold small subtotal-cell" data-ri-id="${item["receipt_item_id"]}">
        ${currentAmt != null ? "\xA5" + currentAmt.toLocaleString("ja-JP") : "\u2015"}
      </td>
      <td><input class="form-control form-control-sm" name="rn_${item["receipt_item_id"]}" value="${esc(item["item_note"])}"></td>
    </tr>`;
  }).join("");
  const riIds = itemsRes.results.map((i) => i["receipt_item_id"]);
  const theadHtml = isFreeReceipt ? `<tr>
        <th style="min-width:200px">\u5546\u54C1\u540D / \u5099\u8003</th>
        <th style="min-width:140px">\u5358\u4FA1\uFF08\u7D0D\u54C1\u66F8\uFF09</th>
        <th class="text-center" style="min-width:90px">\u5165\u8377\u6570</th>
        <th class="text-end" style="min-width:100px">\u5C0F\u8A08</th>
      </tr>` : `<tr>
        <th>\u5546\u54C1</th>
        <th class="text-center">\u767A\u6CE8\u6570</th>
        <th style="min-width:160px">
          \u5B9F\u969B\u306E\u5358\u4FA1 <span class="text-muted fw-normal small">\uFF08\u7D0D\u54C1\u66F8\u8A18\u8F09\u5024\uFF09</span>
        </th>
        <th class="text-center" style="min-width:90px">\u5165\u8377\u6570</th>
        <th class="text-end" style="min-width:100px">\u5C0F\u8A08</th>
        <th style="min-width:120px">\u884C\u5099\u8003</th>
      </tr>`;
  const backUrl = receipt["purchase_order_id"] ? `/orders/${receipt["purchase_order_id"]}` : "/receipts";
  const isVerified = !!receipt["slip_verified"];
  const isNoSlip = !!receipt["no_slip"];
  const itemsJson = JSON.stringify(itemsRes.results.map((i) => ({
    riId: i["receipt_item_id"],
    listPrice: i["list_price"] ?? null,
    defaultRate: i["default_rate"] ?? null
  })));
  const scripts = `<script>
var riIds   = ${JSON.stringify(riIds)};
var itemMeta = ${itemsJson}; // [{riId, listPrice, defaultRate}]

// \u5408\u8A08\u91D1\u984D\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u8A08\u7B97
function calcEditTotal(){
  var total = 0;
  riIds.forEach(function(id){
    var qEl = document.querySelector('[name="rq_'+id+'"]');
    var pEl = document.querySelector('[name="up_'+id+'"]');
    var qty = parseInt(qEl?.value||'0')||0;
    var up  = parseFloat(pEl?.value||'0')||0;
    var sub = qty * up;
    total += sub;
    var cell = document.querySelector('.subtotal-cell[data-ri-id="'+id+'"]');
    if(cell) cell.textContent = up > 0 ? ('\xA5' + sub.toLocaleString('ja-JP')) : '\u2015';
  });
  var el = document.getElementById('edit-preview-total');
  if(el) el.textContent = '\xA5' + total.toLocaleString('ja-JP');
}

// \u7D0D\u54C1\u66F8\u306A\u3057\u30C8\u30B0\u30EB\u5236\u5FA1
(function(){
  var noSlipCb   = document.getElementById('cb-no-slip');
  var slipDateEl = document.querySelector('[name="slip_date"]');
  var slipDateGroup = document.getElementById('slip-date-group');

  function updateSlipUI(){
    if(!noSlipCb) return;
    if(noSlipCb.checked){
      if(slipDateGroup){
        slipDateGroup.style.opacity = '0.4';
        slipDateGroup.style.pointerEvents = 'none';
      }
      if(slipDateEl) slipDateEl.value = '';
    } else {
      if(slipDateGroup){
        slipDateGroup.style.opacity = '1';
        slipDateGroup.style.pointerEvents = '';
      }
    }
  }
  if(noSlipCb) noSlipCb.addEventListener('change', updateSlipUI);
  updateSlipUI();
})();

document.addEventListener('DOMContentLoaded', function(){
  // \u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u8A08\u7B97\u30A4\u30D9\u30F3\u30C8
  riIds.forEach(function(id){
    var qEl = document.querySelector('[name="rq_'+id+'"]');
    var pEl = document.querySelector('[name="up_'+id+'"]');
    if(qEl) qEl.addEventListener('input', calcEditTotal);
    if(pEl) pEl.addEventListener('input', calcEditTotal);
  });
  calcEditTotal();

  document.getElementById('edit-receipt-form').addEventListener('submit', async function(e){
    e.preventDefault();
    var f = e.target;

    var receivedDate = f.querySelector('[name="received_date"]').value;
    var inspectedBy  = (f.querySelector('[name="inspected_by"]')?.value||'').trim();
    var noSlipCb     = document.getElementById('cb-no-slip');
    var noSlip       = noSlipCb ? noSlipCb.checked : false;
    var slipDate     = f.querySelector('[name="slip_date"]')?.value || '';

    // \u30D0\u30EA\u30C7\u30FC\u30B7\u30E7\u30F3
    if(!receivedDate){ showFlash('\u5165\u8377\u65E5\u306F\u5FC5\u9808\u3067\u3059','danger'); return; }
    if(!inspectedBy){ showFlash('\u691C\u54C1\u8005\u306F\u5FC5\u9808\u3067\u3059','danger'); return; }
    if(!noSlip && !slipDate){ showFlash('\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u7D0D\u54C1\u66F8\u304C\u306A\u3044\u5834\u5408\u306F\u300C\u7D0D\u54C1\u66F8\u306A\u3057\u300D\u3092\u30AA\u30F3\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002','danger'); return; }

    var items = riIds.map(function(id){
      var obj = {
        receipt_item_id:   id,
        received_quantity: parseInt(f.querySelector('[name="rq_'+id+'"]')?.value||'0'),
        note: f.querySelector('[name="rn_'+id+'"]')?.value || f.querySelector('[name="item_note_'+id+'"]')?.value || ''
      };
      var upEl = f.querySelector('[name="up_'+id+'"]');
      if(upEl && upEl.value !== '') obj.actual_unit_price = parseFloat(upEl.value);
      return obj;
    });

    var verifiedCb = document.getElementById('cb-slip-verified');
    var supEl      = f.querySelector('[name="actual_supplier_id"]');
    var checkerEl  = f.querySelector('[name="slip_checked_by"]');
    var slipNoteEl = f.querySelector('[name="slip_note"]');

    // slip_date\u5165\u529B\u6E08\u307F\u307E\u305F\u306Fno_slip\u306E\u5834\u5408\u306F\u81EA\u52D5\u3067\u78BA\u8A8D\u6E08\u307F
    var autoVerified = (!noSlip && !!slipDate) || noSlip;
    var manualVerified = verifiedCb ? verifiedCb.checked : false;

    var payload = {
      received_date:      receivedDate,
      slip_date:          noSlip ? '' : slipDate,
      inspected_by:       inspectedBy,
      note:               f.querySelector('[name="note"]')?.value || '',
      slip_verified:      autoVerified || manualVerified,
      no_slip:            noSlip,
      slip_checked_by:    checkerEl ? (checkerEl.value||'').trim() : '',
      slip_note:          slipNoteEl ? (slipNoteEl.value||'').trim() : '',
      actual_supplier_id: supEl && supEl.value ? parseInt(supEl.value) : null,
      items: items
    };

    // \u78BA\u8A8D\u8005\u304C\u672A\u5165\u529B\u306E\u3068\u304D\uFF08slip_checker\u306Finspected_by\u3067\u88DC\u5B8C\u3055\u308C\u308B\uFF09
    if(!payload.slip_checked_by) payload.slip_checked_by = inspectedBy;

    var btn = f.querySelector('button[type=submit]');
    btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>\u4FDD\u5B58\u4E2D...';
    try {
      var resp = await fetch('/api/receipts/${rid}', {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      var res = await resp.json();
      if(!resp.ok){ showFlash(res.error||'\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u5909\u66F4\u3092\u4FDD\u5B58'; return; }
      showFlash('\u4FDD\u5B58\u3057\u307E\u3057\u305F','success');
      setTimeout(function(){ window.location.href = '${backUrl}?flash='+encodeURIComponent('\u7D0D\u54C1\u5C65\u6B74\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F'); }, 800);
    } catch(err){
      showFlash('\u901A\u4FE1\u30A8\u30E9\u30FC: '+err.message,'danger');
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>\u5909\u66F4\u3092\u4FDD\u5B58';
    }
  });
});
</script>`;
  const slipStatusBanner = isNoSlip ? `<div class="alert alert-secondary py-2 mb-0 d-flex align-items-center gap-2"><i class="fas fa-file-slash"></i><span>\u7D0D\u54C1\u66F8\u306A\u3057 \u3068\u3057\u3066\u767B\u9332\u6E08\u307F ${receipt["slip_checked_by"] ? "\uFF08\u78BA\u8A8D\u8005: " + esc(receipt["slip_checked_by"]) + "\uFF09" : ""}</span></div>` : isVerified ? `<div class="alert alert-success py-2 mb-0 d-flex align-items-center gap-2"><i class="fas fa-check-circle"></i><span>\u7D0D\u54C1\u66F8\u78BA\u8A8D\u6E08\u307F ${receipt["slip_checked_by"] ? "\uFF08\u78BA\u8A8D\u8005: " + esc(receipt["slip_checked_by"]) + "\uFF09" : ""}</span></div>` : `<div class="alert alert-warning py-2 mb-0 d-flex align-items-center gap-2"><i class="fas fa-exclamation-triangle"></i><span><strong>\u7D0D\u54C1\u66F8\u304C\u672A\u78BA\u8A8D\u3067\u3059\u3002</strong>\u4E0B\u306E\u300C\u2461 \u7D0D\u54C1\u66F8\u7167\u5408\u300D\u30BB\u30AF\u30B7\u30E7\u30F3\u3067\u65E5\u4ED8\u3068\u91D1\u984D\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span></div>`;
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-edit me-2" style="color:var(--gw-green)"></i>\u7D0D\u54C1\u5C65\u6B74\u3092\u7DE8\u96C6</h1>
    <p class="page-subtitle">
      ${receipt["purchase_order_id"] ? `\u767A\u6CE8\u756A\u53F7: ${esc(receipt["order_no"])} / ${esc(receipt["order_supplier_name"])}` : '<span class="badge text-bg-secondary">\u30B7\u30B9\u30C6\u30E0\u5916\u767A\u6CE8</span>'}
      &nbsp;\u30FB\u7D0D\u54C1ID: ${rid}
    </p>
  </div>
  <div class="actions">
    <a href="${backUrl}" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>\u623B\u308B</a>
  </div>
</div>

${slipStatusBanner}

<form id="edit-receipt-form" class="mt-3">

  <!-- \u2460 \u5165\u8377\u60C5\u5831 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-truck-loading me-1" style="color:var(--gw-green)"></i>\u2460 \u5165\u8377\u60C5\u5831</div>
    <div class="card-body row g-3">
      <div class="col-md-3">
        <label class="form-label fw-semibold">\u5165\u8377\u65E5 <span class="text-danger">*</span></label>
        <input class="form-control" type="date" name="received_date" value="${esc(receipt["received_date"])}" required>
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">\u691C\u54C1\u8005 <span class="text-danger">*</span></label>
        <input class="form-control" name="inspected_by" value="${esc(receipt["inspected_by"]) || ""}" placeholder="\u4F8B: \u53E4\u5DDD" required>
      </div>
      <div class="col-12">
        <label class="form-label fw-semibold">\u5099\u8003</label>
        <textarea class="form-control" name="note" rows="2">${esc(receipt["note"]) || ""}</textarea>
      </div>
    </div>
  </div>

  <!-- \u2461 \u7D0D\u54C1\u66F8\u7167\u5408 -->
  <div class="card mb-3 ${!isVerified && !isNoSlip ? "border-warning" : isNoSlip ? "border-secondary" : "border-success"}">
    <div class="card-header fw-semibold ${!isVerified && !isNoSlip ? "bg-warning bg-opacity-25" : isNoSlip ? "" : "bg-success bg-opacity-10"}">
      <i class="fas fa-file-invoice me-1"></i>\u2461 \u7D0D\u54C1\u66F8\u7167\u5408
      <span class="ms-2 small fw-normal text-muted">\u203B \u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5\u30FB\u91D1\u984D\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044</span>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-12">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="cb-no-slip" name="no_slip" value="1"
              style="width:2.5em;height:1.3em" ${isNoSlip ? "checked" : ""}>
            <label class="form-check-label ms-2 fw-semibold" for="cb-no-slip">
              <i class="fas fa-file-slash me-1 text-secondary"></i>\u7D0D\u54C1\u66F8\u306A\u3057
              <span class="text-muted fw-normal small ms-2">\uFF08\u90F5\u9001\u5F85\u3061\u30FB\u7D1B\u5931\u30FB\u4E0D\u8981\u306A\u5834\u5408\u306A\u3069\uFF09</span>
            </label>
          </div>
        </div>
        <div class="col-md-3" id="slip-date-group">
          <label class="form-label fw-semibold">\u7D0D\u54C1\u66F8\u8A18\u8F09\u65E5 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="slip_date" value="${esc(receipt["slip_date"]) || ""}">
          <div class="text-muted small mt-1"><i class="fas fa-info-circle me-1"></i>\u7D0D\u54C1\u66F8\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u65E5\u4ED8</div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">\u78BA\u8A8D\u8005\u540D</label>
          <input class="form-control" name="slip_checked_by"
            value="${esc(receipt["slip_checked_by"]) || esc(receipt["inspected_by"]) || ""}"
            placeholder="\u4F8B: \u53E4\u5DDD">
          <div class="text-muted small mt-1">\u672A\u5165\u529B\u306E\u5834\u5408\u3001\u691C\u54C1\u8005\u540D\u3067\u88DC\u5B8C\u3055\u308C\u307E\u3059</div>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">\u7167\u5408\u30E1\u30E2 <span class="text-muted small fw-normal">\uFF08\u5DEE\u7570\u30FB\u7279\u8A18\u4E8B\u9805\u304C\u3042\u308C\u3070\u8A18\u5165\uFF09</span></label>
          <textarea class="form-control" name="slip_note" rows="2"
            placeholder="\u4F8B: \u91D1\u984D\u304C\xA5200\u7570\u306A\u3063\u305F\u305F\u3081\u5358\u4FA1\u3092\u4FEE\u6B63\u3002\u4ED5\u5165\u5148\u304B\u3089\u5024\u5F15\u304D\u9023\u7D61\u3042\u308A\u3002">${esc(receipt["slip_note"]) || ""}</textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- \u2462 \u4ED5\u5165\u5148 -->
  <div class="card mb-3 ${supplierChanged ? "border-info" : ""}">
    <div class="card-header fw-semibold">
      <i class="fas fa-building me-1"></i>\u2462 \u4ED5\u5165\u5148
      ${supplierChanged ? `<span class="badge bg-info text-dark ms-2"><i class="fas fa-exchange-alt me-1"></i>\u767A\u6CE8\u6642\u3068\u7570\u306A\u308B\u4ED5\u5165\u5148\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059</span>` : ""}
    </div>
    <div class="card-body">
      ${!isFreeReceipt ? `
      <div class="mb-2 small text-muted">
        <i class="fas fa-file-alt me-1"></i>\u767A\u6CE8\u6642\u306E\u4ED5\u5165\u5148:
        <strong>${esc(receipt["order_supplier_name"]) || "\u2015"}</strong>
        ${receipt["order_supplier_payment"] ? ` <span class="badge text-bg-light border ms-2">${esc(receipt["order_supplier_payment"])}</span>` : ""}
        ${supplierChanged ? `<span class="ms-2 text-info">\u2192 \u5B9F\u969B\u306E\u7D0D\u54C1\u5148\u304C\u7570\u306A\u308A\u307E\u3059</span>` : ""}
      </div>` : ""}
      <div class="row g-2 align-items-end">
        <div class="col-md-5">
          <label class="form-label mb-1">\u5B9F\u969B\u306E\u4ED5\u5165\u5148 <span class="text-muted small">\uFF08\u767A\u6CE8\u6642\u3068\u7570\u306A\u308B\u5834\u5408\u306E\u307F\u5909\u66F4\uFF09</span></label>
          <select class="form-select" name="actual_supplier_id">
            <option value="">\u2015 \u767A\u6CE8\u6642\u306E\u4ED5\u5165\u5148\u306E\u307E\u307E \u2015</option>
            ${supplierOpts}
          </select>
        </div>
        <div class="col-md-7 small text-muted">
          <i class="fas fa-info-circle me-1"></i>
          \u5B9F\u969B\u306B\u7D0D\u54C1\u3057\u3066\u304D\u305F\u4ED5\u5165\u5148\u304C\u767A\u6CE8\u3068\u7570\u306A\u308B\u5834\u5408\uFF08\u4F8B: \u4EE3\u66FF\u4ED5\u5165\u5148\u30FB\u76F4\u9001\u306A\u3069\uFF09\u306B\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002
        </div>
      </div>
    </div>
  </div>

  <!-- \u2463 \u5165\u8377\u660E\u7D30 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-table me-1"></i>\u2463 \u5165\u8377\u660E\u7D30\uFF08\u7D0D\u54C1\u66F8\u3068\u7167\u5408\u3057\u3066\u5B9F\u969B\u306E\u5358\u4FA1\u30FB\u6570\u91CF\u3092\u4FEE\u6B63\uFF09</div>
    <div class="table-responsive">
      <table class="table align-middle mb-0 small">
        <thead>${theadHtml}</thead>
        <tbody id="ri-tbody">${itemRows}</tbody>
      </table>
    </div>
    <div class="card-footer d-flex justify-content-end align-items-center gap-3 py-2">
      <span class="text-muted small">\u5408\u8A08\u91D1\u984D\uFF08\u7D0D\u54C1\u66F8\u3068\u7167\u5408\uFF09:</span>
      <span id="edit-preview-total" class="fw-bold fs-5">\u2015</span>
    </div>
  </div>

  <div class="d-flex justify-content-end gap-2 mb-4">
    <a href="${backUrl}" class="btn btn-outline-secondary"><i class="fas fa-times me-1"></i>\u30AD\u30E3\u30F3\u30BB\u30EB</a>
    <button type="submit" class="btn btn-primary btn-lg px-4"><i class="fas fa-save me-1"></i>\u5909\u66F4\u3092\u4FDD\u5B58</button>
  </div>
</form>`;
  const o14 = getLayoutOpts(c);
  return layout("\u7D0D\u54C1\u5C65\u6B74\u7DE8\u96C6", content, scripts, o14.username, o14);
});
app2.get("/backorders", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const res = await db2.prepare(`
    SELECT po.order_no, po.order_date, po.customer_name, po.usage_type,
           po.requested_delivery_date, po.id AS purchase_order_id,
           s.name AS supplier_name,
           poi.id AS poi_id, poi.item_category, poi.manufacturer, poi.product_name,
           poi.spec, poi.color, poi.club_type, poi.quantity,
           COALESCE(SUM(ri.received_quantity),0) AS received_qty,
           (poi.quantity - COALESCE(SUM(ri.received_quantity),0)) AS backorder_qty,
           MAX(r.received_date) AS last_received_date
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.purchase_order_id=po.id
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN receipt_items ri ON ri.purchase_order_item_id=poi.id
    LEFT JOIN receipts r ON ri.receipt_id=r.id
    WHERE po.tenant_id=?
    GROUP BY poi.id
    HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
    ORDER BY po.order_date DESC, po.order_no DESC
  `).bind(tenantId).all();
  const rows = res.results.map((r) => `<tr>
    <td>${esc(r["order_date"])}</td>
    <td><a href="/orders/${r["purchase_order_id"]}">${esc(r["order_no"])}</a></td>
    <td>${esc(r["supplier_name"])}</td>
    <td>${esc(r["customer_name"])}</td>
    <td>${esc(r["usage_type"])}</td>
    <td>${esc(r["item_category"])}</td>
    <td>${esc(r["manufacturer"])}</td>
    <td><strong>${esc(r["product_name"])}</strong></td>
    <td>${esc(r["spec"])} ${esc(r["color"])} ${esc(r["club_type"])}</td>
    <td class="text-center">${r["quantity"]}</td>
    <td class="text-center text-success">${r["received_qty"]}</td>
    <td class="text-center text-danger fw-bold">${r["backorder_qty"]}</td>
    <td>${esc(r["last_received_date"])}</td>
    <td>${esc(r["requested_delivery_date"])}</td>
  </tr>`).join("");
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-exclamation-triangle me-2" style="color:#d97706"></i>\u6B8B\u6CE8\u4E00\u89A7</h1>
    <p class="page-subtitle">\u672A\u5165\u8377\u30FB\u4E00\u90E8\u5165\u8377\u306E\u660E\u7D30\u3092\u4E00\u89A7\u8868\u793A\u3057\u307E\u3059\u3002</p>
  </div>
  <div class="actions">
    <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-list me-1"></i>\u767A\u6CE8\u4E00\u89A7\u3078</a>
  </div>
</div>
<div class="card">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead><tr>
        <th>\u767A\u6CE8\u65E5</th><th>\u767A\u6CE8\u756A\u53F7</th><th>\u4ED5\u5165\u5148</th><th>\u9867\u5BA2\u540D</th><th>\u7528\u9014</th>
        <th>\u54C1\u76EE</th><th>\u30E1\u30FC\u30AB\u30FC</th><th>\u5546\u54C1\u540D</th><th>\u4ED5\u69D8</th>
        <th class="text-center">\u767A\u6CE8</th><th class="text-center">\u5165\u8377\u6E08</th><th class="text-center">\u6B8B\u6570</th>
        <th>\u6700\u7D42\u5165\u8377\u65E5</th><th>\u5E0C\u671B\u7D0D\u671F</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="14" class="text-center py-4 text-muted"><i class="fas fa-check-circle text-success me-2"></i>\u6B8B\u6CE8\u306F\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${res.results.length}\u4EF6\u306E\u6B8B\u6CE8\u660E\u7D30</div>
</div>`;
  const o15 = getLayoutOpts(c);
  return layout("\u6B8B\u6CE8\u4E00\u89A7", content, "", o15.username, o15);
});
app2.get("/admin/backup", async (c) => {
  const db2 = c.env.DB;
  const { tenantId } = getLayoutOpts(c);
  const [p, s, po, poi, sr, r, ri] = await Promise.all([
    db2.prepare("SELECT COUNT(*) AS c FROM products WHERE is_active=1 AND tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1 AND tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM purchase_orders WHERE tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE po.tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM supplier_rules WHERE tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM receipts WHERE tenant_id=?").bind(tenantId).first(),
    db2.prepare("SELECT COUNT(*) AS c FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id WHERE r.tenant_id=?").bind(tenantId).first()
  ]);
  const tables = [
    { key: "products", label: "\u5546\u54C1\u30DE\u30B9\u30BF", icon: "fa-box", count: p?.c ?? 0, color: "primary" },
    { key: "suppliers", label: "\u4ED5\u5165\u5148\u30DE\u30B9\u30BF", icon: "fa-building", count: s?.c ?? 0, color: "success" },
    { key: "purchase_orders", label: "\u767A\u6CE8\u30D8\u30C3\u30C0\u30FC", icon: "fa-file-alt", count: po?.c ?? 0, color: "info" },
    { key: "purchase_order_items", label: "\u767A\u6CE8\u660E\u7D30", icon: "fa-list", count: poi?.c ?? 0, color: "info" },
    { key: "supplier_rules", label: "\u5224\u5B9A\u30EB\u30FC\u30EB", icon: "fa-cog", count: sr?.c ?? 0, color: "warning" },
    { key: "receipts", label: "\u7D0D\u54C1\u30D8\u30C3\u30C0\u30FC", icon: "fa-truck", count: r?.c ?? 0, color: "secondary" },
    { key: "receipt_items", label: "\u7D0D\u54C1\u660E\u7D30", icon: "fa-clipboard-list", count: ri?.c ?? 0, color: "secondary" }
  ];
  const tableRows = tables.map((t) => `
    <tr>
      <td><i class="fas ${t.icon} me-2 text-${t.color}"></i>${t.label}</td>
      <td class="text-center"><span class="badge bg-secondary">${t.count.toLocaleString("ja-JP")}\u4EF6</span></td>
      <td>
        <a href="/api/backup/csv/${t.key}" class="btn btn-xs btn-outline-primary py-0 px-2">
          <i class="fas fa-download me-1"></i>CSV
        </a>
      </td>
    </tr>`).join("");
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-database me-2" style="color:var(--gw-green)"></i>\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u7BA1\u7406</h1>
    <p class="page-subtitle">\u30C7\u30FC\u30BF\u306E\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u30FB\u30A4\u30F3\u30DD\u30FC\u30C8\u3092\u884C\u3044\u307E\u3059\u3002\u5B9A\u671F\u7684\u306A\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u63A8\u5968\u3057\u307E\u3059\u3002</p>
  </div>
</div>

<div class="row g-4">
  <!-- \u30A8\u30AF\u30B9\u30DD\u30FC\u30C8 -->
  <div class="col-lg-6">
    <div class="card h-100">
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0"><i class="fas fa-download me-2"></i>\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\uFF08\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\uFF09</h5>
      </div>
      <div class="card-body">
        <p class="text-muted small mb-3">
          <i class="fas fa-info-circle me-1 text-primary"></i>
          \u5168\u30C6\u30FC\u30D6\u30EB\u3092\u4E00\u62EC\u3067CSV\uFF08ZIP\uFF09\u3068\u3057\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002<br>
          \u500B\u5225\u30C6\u30FC\u30D6\u30EB\u306E\u307F\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3059\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059\u3002
        </p>
        <a href="/api/backup/all" class="btn btn-primary w-100 mb-3">
          <i class="fas fa-file-archive me-2"></i>\u5168\u30C7\u30FC\u30BF\u3092\u4E00\u62EC\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\uFF08JSON\uFF09
        </a>
        <div class="card border-0 bg-light">
          <div class="card-body p-2">
            <p class="small fw-semibold mb-2 text-muted">\u30C6\u30FC\u30D6\u30EB\u5225CSV\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9</p>
            <table class="table table-sm mb-0">
              <thead><tr>
                <th>\u30C6\u30FC\u30D6\u30EB</th><th class="text-center">\u4EF6\u6570</th><th>DL</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- \u30A4\u30F3\u30DD\u30FC\u30C8\uFF08\u30EA\u30B9\u30C8\u30A2\uFF09 -->
  <div class="col-lg-6">
    <div class="card h-100">
      <div class="card-header bg-warning text-dark">
        <h5 class="mb-0"><i class="fas fa-upload me-2"></i>\u30A4\u30F3\u30DD\u30FC\u30C8\uFF08\u30EA\u30B9\u30C8\u30A2\uFF09</h5>
      </div>
      <div class="card-body">
        <div class="alert alert-warning py-2 small mb-3">
          <i class="fas fa-exclamation-triangle me-1"></i>
          <strong>\u6CE8\u610F:</strong> \u30EA\u30B9\u30C8\u30A2\u306F\u65E2\u5B58\u30C7\u30FC\u30BF\u3092<strong>\u5B8C\u5168\u306B\u524A\u9664</strong>\u3057\u3066\u304B\u3089\u5FA9\u5143\u3057\u307E\u3059\u3002<br>
          \u5FC5\u305A\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3067\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u53D6\u3063\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002
        </div>

        <!-- \u5168\u4F53\u30EA\u30B9\u30C8\u30A2 -->
        <div class="card border-danger mb-3">
          <div class="card-body py-3">
            <p class="fw-semibold mb-2"><i class="fas fa-database me-1 text-danger"></i>\u5168\u30C7\u30FC\u30BF\u4E00\u62EC\u30EA\u30B9\u30C8\u30A2\uFF08JSON\uFF09</p>
            <div class="mb-2">
              <input type="file" class="form-control form-control-sm" id="restore-file-all" accept=".json">
            </div>
            <button class="btn btn-danger btn-sm w-100" id="btn-restore-all">
              <i class="fas fa-undo me-1"></i>\u30EA\u30B9\u30C8\u30A2\u5B9F\u884C
            </button>
          </div>
        </div>

        <!-- \u30C6\u30FC\u30D6\u30EB\u5225\u30EA\u30B9\u30C8\u30A2 -->
        <div class="card border-0 bg-light">
          <div class="card-body py-3">
            <p class="fw-semibold mb-2 small text-muted"><i class="fas fa-table me-1"></i>\u30C6\u30FC\u30D6\u30EB\u5225CSV\u30EA\u30B9\u30C8\u30A2</p>
            <div class="row g-2 mb-2">
              <div class="col-7">
                <select class="form-select form-select-sm" id="restore-table-select">
                  ${tables.map((t) => `<option value="${t.key}">${t.label}</option>`).join("")}
                </select>
              </div>
              <div class="col-5">
                <select class="form-select form-select-sm" id="restore-mode-select">
                  <option value="append">\u8FFD\u8A18\uFF08\u65E2\u5B58\u4FDD\u6301\uFF09</option>
                  <option value="replace">\u7F6E\u63DB\uFF08\u5168\u524A\u9664\u5F8C\uFF09</option>
                </select>
              </div>
            </div>
            <div class="mb-2">
              <input type="file" class="form-control form-control-sm" id="restore-file-csv" accept=".csv">
            </div>
            <button class="btn btn-warning btn-sm w-100 text-dark" id="btn-restore-csv">
              <i class="fas fa-file-import me-1"></i>CSV\u30EA\u30B9\u30C8\u30A2\u5B9F\u884C
            </button>
          </div>
        </div>

        <!-- \u7D50\u679C\u8868\u793A -->
        <div id="restore-result" class="mt-3" style="display:none"></div>
      </div>
    </div>
  </div>
</div>

<!-- \u904B\u7528\u30A2\u30C9\u30D0\u30A4\u30B9 -->
<div class="card mt-4 border-0 bg-light">
  <div class="card-body">
    <h6 class="fw-semibold mb-3"><i class="fas fa-lightbulb me-1 text-warning"></i>\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u904B\u7528\u306E\u30DD\u30A4\u30F3\u30C8</h6>
    <div class="row g-3">
      <div class="col-md-4">
        <div class="d-flex gap-2">
          <div class="text-primary flex-shrink-0 mt-1"><i class="fas fa-calendar-week"></i></div>
          <div>
            <div class="fw-semibold small">\u5B9A\u671F\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7</div>
            <div class="text-muted small">\u90311\u56DE\u3092\u76EE\u5B89\u306B\u300C\u5168\u30C7\u30FC\u30BF\u4E00\u62EC\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u300D\u3092\u5B9F\u884C\u3057\u3001\u65E5\u4ED8\u4ED8\u304D\u3067\u4FDD\u5B58\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="d-flex gap-2">
          <div class="text-success flex-shrink-0 mt-1"><i class="fas fa-folder"></i></div>
          <div>
            <div class="fw-semibold small">\u4FDD\u5B58\u5834\u6240</div>
            <div class="text-muted small">\u793E\u5185\u5171\u6709\u30D5\u30A9\u30EB\u30C0\u3084\u30AF\u30E9\u30A6\u30C9\u30B9\u30C8\u30EC\u30FC\u30B8\uFF08OneDrive\u7B49\uFF09\u306B\u4FDD\u5B58\u3057\u3001\u8907\u6570\u4E16\u4EE3\u3092\u4FDD\u6301\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="d-flex gap-2">
          <div class="text-warning flex-shrink-0 mt-1"><i class="fas fa-history"></i></div>
          <div>
            <div class="fw-semibold small">\u30EA\u30B9\u30C8\u30A2\u306E\u30BF\u30A4\u30DF\u30F3\u30B0</div>
            <div class="text-muted small">\u8AA4\u64CD\u4F5C\u3084\u969C\u5BB3\u767A\u751F\u6642\u306E\u307F\u4F7F\u7528\u3057\u307E\u3059\u3002\u5FC5\u305A\u73FE\u5728\u306E\u30C7\u30FC\u30BF\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3057\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
  const scripts = `<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script>
// \u2500\u2500 \u5168\u30C7\u30FC\u30BFJSON\u30EA\u30B9\u30C8\u30A2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.getElementById('btn-restore-all').addEventListener('click', async function() {
  var file = document.getElementById('restore-file-all').files[0];
  if (!file) { alert('\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
  if (!confirm('\u5168\u30C7\u30FC\u30BF\u3092\u524A\u9664\u3057\u3066\u5FA9\u5143\u3057\u307E\u3059\u3002\u672C\u5F53\u306B\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F\\n\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
  var text = await file.text();
  var data;
  try { data = JSON.parse(text); } catch(e) { alert('JSON\u30D5\u30A1\u30A4\u30EB\u306E\u89E3\u6790\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ' + e.message); return; }
  this.disabled = true;
  this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u30EA\u30B9\u30C8\u30A2\u4E2D\u2026';
  var resp = await fetch('/api/backup/restore/all', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  var result = await resp.json();
  showRestoreResult(resp.ok, result);
  this.disabled = false;
  this.innerHTML = '<i class="fas fa-undo me-1"></i>\u30EA\u30B9\u30C8\u30A2\u5B9F\u884C';
});

// \u2500\u2500 \u30C6\u30FC\u30D6\u30EB\u5225CSV\u30EA\u30B9\u30C8\u30A2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.getElementById('btn-restore-csv').addEventListener('click', async function() {
  var file = document.getElementById('restore-file-csv').files[0];
  var table = document.getElementById('restore-table-select').value;
  var mode  = document.getElementById('restore-mode-select').value;
  if (!file) { alert('\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
  var modeLabel = mode === 'replace' ? '\uFF08\u5168\u524A\u9664\u5F8C\u306B\u5FA9\u5143\uFF09' : '\uFF08\u65E2\u5B58\u30C7\u30FC\u30BF\u306B\u8FFD\u8A18\uFF09';
  if (!confirm(table + ' \u3092' + modeLabel + '\u30EA\u30B9\u30C8\u30A2\u3057\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F')) return;

  var text = await file.text();
  var wb = XLSX.read(text, {type:'string', codepage:65001});
  var ws = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});

  this.disabled = true;
  this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>\u30EA\u30B9\u30C8\u30A2\u4E2D\u2026';
  var resp = await fetch('/api/backup/restore/csv', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ table: table, mode: mode, rows: rows })
  });
  var result = await resp.json();
  showRestoreResult(resp.ok, result);
  this.disabled = false;
  this.innerHTML = '<i class="fas fa-file-import me-1"></i>CSV\u30EA\u30B9\u30C8\u30A2\u5B9F\u884C';
});

function showRestoreResult(ok, result) {
  var el = document.getElementById('restore-result');
  if (ok) {
    el.innerHTML = '<div class="alert alert-success py-2 small"><i class="fas fa-check-circle me-1"></i>'
      + '<strong>\u30EA\u30B9\u30C8\u30A2\u5B8C\u4E86\uFF01</strong> '
      + (result.inserted !== undefined ? '\u633F\u5165: ' + result.inserted + '\u4EF6' : '')
      + (result.details ? '<ul class="mt-1 mb-0">' + Object.entries(result.details).map(function(e){ return '<li>' + e[0] + ': ' + e[1] + '\u4EF6</li>'; }).join('') + '</ul>' : '')
      + '</div>';
  } else {
    el.innerHTML = '<div class="alert alert-danger py-2 small"><i class="fas fa-exclamation-circle me-1"></i>'
      + '<strong>\u30A8\u30E9\u30FC:</strong> ' + (result.error || '\u30EA\u30B9\u30C8\u30A2\u306B\u5931\u6557\u3057\u307E\u3057\u305F') + '</div>';
  }
  el.style.display = '';
}
</script>`;
  const o16 = getLayoutOpts(c);
  return layout("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u7BA1\u7406", content, scripts, o16.username, o16);
});

// src/auth.ts
var COOKIE_NAME = "gw_session";
var SESSION_TTL = 60 * 60 * 24 * 7;
var DEFAULT_SECRET = "golfwing-secret-key-change-in-production";
async function sign(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function verify(payload, signature, secret) {
  const expected = await sign(payload, secret);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
async function createToken(username, tenantId, secret) {
  const expires = Math.floor(Date.now() / 1e3) + SESSION_TTL;
  const payload = `${username}:${tenantId}:${expires}`;
  const sig = await sign(payload, secret);
  return `${payload}:${sig}`;
}
async function verifyToken(token, secret) {
  if (!token) return null;
  const parts = token.split(":");
  if (parts.length < 4) return null;
  const username = parts[0];
  const tenantId = parseInt(parts[1]);
  const expires = parseInt(parts[2]);
  const sig = parts.slice(3).join(":");
  if (isNaN(tenantId) || isNaN(expires)) return null;
  if (Date.now() / 1e3 > expires) return null;
  const payload = `${username}:${tenantId}:${expires}`;
  const ok = await verify(payload, sig, secret);
  return ok ? { username, tenantId } : null;
}
function parseCookie(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((s) => s.trim().split("=").map((v) => decodeURIComponent(v.trim()))).filter((p) => p.length === 2)
  );
}
async function getCurrentUser(req, db2, secret) {
  const cookies = parseCookie(req.headers.get("Cookie"));
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const result = await verifyToken(token, secret);
  if (!result) return null;
  const { username, tenantId } = result;
  if (tenantId === 0) return null;
  if (username.startsWith("env:")) {
    return {
      username: username.slice(4),
      tenantId: 1,
      displayName: username.slice(4),
      isDemo: false,
      isAdmin: true
    };
  }
  const staffRow = await db2.prepare(
    "SELECT name FROM public.staff WHERE auth_user_id = ? AND deleted_at IS NULL"
  ).bind(username).first();
  if (!staffRow) return null;
  return {
    username,
    tenantId: 1,
    displayName: staffRow.name || "\u30B9\u30BF\u30C3\u30D5",
    isDemo: false,
    isAdmin: true
    // TODO: rolesテーブル連携（発注管理は現状全スタッフ管理者扱い）
  };
}
async function attemptLogin(username, password, env) {
  const secret = env.AUTH_SECRET || DEFAULT_SECRET;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(env.SUPABASE_URL + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password })
      });
      if (res.ok) {
        const data = await res.json();
        const uid2 = data.user?.id;
        if (uid2) {
          const staffRow = await env.DB.prepare(
            "SELECT id FROM public.staff WHERE auth_user_id = ? AND deleted_at IS NULL"
          ).bind(uid2).first();
          if (staffRow) {
            const token = await createToken(uid2, 1, secret);
            const cookie = makeCookie(token);
            return new Response(null, {
              status: 302,
              headers: { "Location": "/dashboard", "Set-Cookie": cookie }
            });
          }
        }
      }
    } catch (_e) {
    }
  }
  if (env.AUTH_USERNAME && env.AUTH_PASSWORD && username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD) {
    const token = await createToken("env:" + username, 1, secret);
    const cookie = makeCookie(token);
    return new Response(null, {
      status: 302,
      headers: { "Location": "/dashboard", "Set-Cookie": cookie }
    });
  }
  return null;
}
function makeCookie(token) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL}`,
    "HttpOnly",
    "SameSite=Strict"
  ].join("; ");
}
function logoutResponse() {
  const cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
  return new Response(null, {
    status: 302,
    headers: { "Location": "/login", "Set-Cookie": cookie }
  });
}
function unauthorizedRedirect(path) {
  return new Response(null, {
    status: 302,
    headers: { "Location": `/login?next=${encodeURIComponent(path)}` }
  });
}
function loginPage(error = false, next = "/", appName) {
  const sysName = appName || "\u767A\u6CE8\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0";
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>\u30ED\u30B0\u30A4\u30F3 | ${sysName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body {
      font-family: 'Inter','Hiragino Sans','Yu Gothic UI',sans-serif;
      background: #0f2417;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      position: relative;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      width: 600px; height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(26,122,74,.25) 0%, transparent 70%);
      top: -200px; right: -200px;
      pointer-events: none;
    }
    body::after {
      content: '';
      position: fixed;
      width: 400px; height: 400px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(46,204,113,.15) 0%, transparent 70%);
      bottom: -150px; left: -150px;
      pointer-events: none;
    }
    .login-wrap {
      width: 100%;
      max-width: 400px;
      position: relative;
      z-index: 1;
    }
    .login-logo {
      text-align: center;
      margin-bottom: 2rem;
    }
    .logo-icon {
      width: 56px; height: 56px;
      background: #1a7a4a;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      color: #fff;
      margin-bottom: 0.75rem;
      box-shadow: 0 8px 24px rgba(26,122,74,.4);
    }
    .login-logo h1 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .login-logo p {
      font-size: 0.78rem;
      color: rgba(255,255,255,.45);
      margin: 4px 0 0;
    }
    .login-card {
      background: #fff;
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 24px 64px rgba(0,0,0,.4);
    }
    .login-card .form-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.3rem;
      letter-spacing: 0.01em;
    }
    .login-card .form-control {
      font-family: 'Inter',sans-serif;
      font-size: 0.875rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 0.55rem 0.85rem;
      transition: border-color .15s, box-shadow .15s;
    }
    .login-card .form-control:focus {
      border-color: #1a7a4a;
      box-shadow: 0 0 0 3px rgba(26,122,74,.15);
      outline: none;
    }
    .input-group-text {
      background: #f9fafb;
      border-color: #d1d5db;
      border-radius: 8px 0 0 8px;
      color: #9ca3af;
    }
    .input-group .form-control { border-radius: 0 8px 8px 0; }
    .btn-login {
      background: #1a7a4a;
      border: none;
      border-radius: 8px;
      font-family: 'Inter',sans-serif;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.65rem;
      color: #fff;
      width: 100%;
      transition: background .15s, box-shadow .15s;
      cursor: pointer;
    }
    .btn-login:hover {
      background: #145e38;
      box-shadow: 0 4px 12px rgba(26,122,74,.35);
    }
    .btn-demo {
      display: block;
      width: 100%;
      padding: 0.6rem;
      border-radius: 8px;
      border: 2px solid #7c3aed;
      background: transparent;
      color: #7c3aed;
      font-family: 'Inter',sans-serif;
      font-size: 0.875rem;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      transition: background .15s, color .15s;
      cursor: pointer;
    }
    .btn-demo:hover {
      background: #7c3aed;
      color: #fff;
    }
    .demo-divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.25rem 0;
      color: #9ca3af;
      font-size: 0.75rem;
    }
    .demo-divider::before,
    .demo-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e5e7eb;
    }
    .alert-danger {
      background: #fef2f2;
      border: none;
      border-left: 3px solid #ef4444;
      border-radius: 8px;
      color: #b91c1c;
      font-size: 0.82rem;
      padding: 0.65rem 0.85rem;
    }
    .login-footer {
      text-align: center;
      margin-top: 1.25rem;
      font-size: 0.72rem;
      color: rgba(255,255,255,.3);
    }
  </style>
</head>
<body>
<div class="login-wrap">
  <div class="login-logo">
    <div class="logo-icon"><i class="fas fa-golf-ball"></i></div>
    <h1>${sysName}</h1>
    <p>Order Management System</p>
  </div>
  <div class="login-card">
    ${error ? `
    <div class="alert-danger mb-3">
      <i class="fas fa-exclamation-circle me-1"></i>
      \u30E6\u30FC\u30B6\u30FC\u540D\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093
    </div>` : ""}
    <form method="POST" action="/login">
      <input type="hidden" name="next" value="${next}">
      <div class="mb-3">
        <label class="form-label">\u30E6\u30FC\u30B6\u30FC\u540D</label>
        <div class="input-group">
          <span class="input-group-text"><i class="fas fa-user"></i></span>
          <input type="text" class="form-control" name="username" autofocus autocomplete="username"
            placeholder="username" required>
        </div>
      </div>
      <div class="mb-4">
        <label class="form-label">\u30D1\u30B9\u30EF\u30FC\u30C9</label>
        <div class="input-group">
          <span class="input-group-text"><i class="fas fa-lock"></i></span>
          <input type="password" class="form-control" name="password" autocomplete="current-password"
            placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required>
        </div>
      </div>
      <button type="submit" class="btn-login">
        <i class="fas fa-sign-in-alt me-2"></i>\u30ED\u30B0\u30A4\u30F3
      </button>
    </form>

    <div class="demo-divider">\u307E\u305F\u306F</div>

    <a href="/demo-login" class="btn-demo">
      <i class="fas fa-flask me-2"></i>\u30C7\u30E2\u3092\u8A66\u3059\uFF08\u767B\u9332\u4E0D\u8981\uFF09
    </a>
  </div>
  <p class="login-footer"><i class="fas fa-shield-alt me-1"></i>\u793E\u5185\u5C02\u7528\u30B7\u30B9\u30C6\u30E0</p>
</div>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// src/routes/landing.ts
function landingPage(appName) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName} | \u30B4\u30EB\u30D5\u30B7\u30E7\u30C3\u30D7\u5C02\u7528 \u767A\u6CE8\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
    body { font-family: 'Noto Sans JP', sans-serif; }
    .gradient-hero { background: linear-gradient(135deg, #0f4c81 0%, #1a7abf 50%, #22a6d6 100%); }
    .gradient-green { background: linear-gradient(135deg, #065f46 0%, #059669 100%); }
    .card-shadow { box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
    .mockup-window { border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
    .mockup-titlebar { background: #e5e7eb; padding: 10px 16px; display: flex; align-items: center; gap: 6px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot-red   { background: #ef4444; }
    .dot-yellow{ background: #f59e0b; }
    .dot-green { background: #10b981; }
    .pulse-badge { animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
    .stat-card { transition: transform .2s; }
    .stat-card:hover { transform: translateY(-4px); }
    .feature-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    .timeline-line::before { content:''; position:absolute; left:19px; top:40px; bottom:-20px; width:2px; background:#e5e7eb; }
  </style>
</head>
<body class="bg-white text-gray-800">

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u30CA\u30D3\u30D0\u30FC
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<nav class="fixed top-0 w-full z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
        <i class="fas fa-golf-ball-tee text-white text-sm"></i>
      </div>
      <span class="font-bold text-blue-900 text-lg">${appName}</span>
    </div>
    <div class="flex items-center gap-3">
      <a href="/login" class="text-sm text-gray-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
        \u30ED\u30B0\u30A4\u30F3
      </a>
      <a href="/demo-login" class="text-sm bg-blue-700 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-800 transition shadow-sm">
        <i class="fas fa-play mr-1.5"></i>\u7121\u6599\u30C7\u30E2\u3092\u8A66\u3059
      </a>
    </div>
  </div>
</nav>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u30D2\u30FC\u30ED\u30FC\u30BB\u30AF\u30B7\u30E7\u30F3
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="gradient-hero pt-28 pb-16 px-4 sm:px-6 text-white overflow-hidden relative">
  <!-- \u80CC\u666F\u88C5\u98FE -->
  <div class="absolute inset-0 opacity-10">
    <div class="absolute top-10 right-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
    <div class="absolute bottom-0 left-0 w-64 h-64 bg-blue-300 rounded-full blur-3xl"></div>
  </div>

  <div class="max-w-6xl mx-auto relative">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <!-- \u5DE6\uFF1A\u30AD\u30E3\u30C3\u30C1\u30B3\u30D4\u30FC -->
      <div>
        <div class="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-white/30">
          <i class="fas fa-star text-yellow-300"></i>
          \u30B4\u30EB\u30D5\u30B7\u30E7\u30C3\u30D7\u5C02\u7528\u306E\u767A\u6CE8\u7BA1\u7406\u30C4\u30FC\u30EB
        </div>
        <h1 class="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-6">
          \u767A\u6CE8\u696D\u52D9\u3092<br>
          <span class="text-yellow-300">1/3\u306E\u6642\u9593</span>\u306B\u3002<br>
          \u6F0F\u308C\u3082\u91CD\u8907\u3082<br>
          <span class="text-yellow-300">\u30BC\u30ED</span>\u3078\u3002
        </h1>
        <p class="text-blue-100 text-base sm:text-lg leading-relaxed mb-8">
          \u4ED5\u5165\u5148\u3054\u3068\u306E\u30E1\u30FC\u30EB\u30FBFAX\u30FBLINE\u767A\u6CE8\u3092<br class="hidden sm:block">
          \u4E00\u3064\u306E\u753B\u9762\u3067\u307E\u3068\u3081\u3066\u7BA1\u7406\u3002<br>
          \u304A\u5BA2\u69D8\u304B\u3089\u306E\u53D7\u6CE8\u304B\u3089\u5165\u8377\u78BA\u8A8D\u307E\u3067\u3001<br class="hidden sm:block">
          \u30B4\u30EB\u30D5\u30B7\u30E7\u30C3\u30D7\u306B\u7279\u5316\u3057\u305F\u767A\u6CE8\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0\u3067\u3059\u3002
        </p>
        <div class="flex flex-col sm:flex-row gap-3">
          <a href="/demo-login"
             class="inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold px-8 py-4 rounded-xl text-base shadow-lg transition">
            <i class="fas fa-play-circle text-xl"></i>
            \u30C7\u30E2\u753B\u9762\u3092\u898B\u3066\u307F\u308B\uFF08\u7121\u6599\u30FB\u767B\u9332\u4E0D\u8981\uFF09
          </a>
          <a href="#features"
             class="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-4 rounded-xl text-base border border-white/30 transition">
            <i class="fas fa-chevron-down"></i>
            \u6A5F\u80FD\u3092\u898B\u308B
          </a>
        </div>
        <p class="text-blue-200 text-sm mt-4">
          <i class="fas fa-shield-alt mr-1"></i>\u30C7\u30E2\u306F\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3002\u767B\u9332\u30FB\u30AF\u30EC\u30AB\u4E0D\u8981\u3067\u3059\u3002
        </p>
      </div>

      <!-- \u53F3\uFF1A\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u30E2\u30C3\u30AF\u30A2\u30C3\u30D7 -->
      <div class="lg:block">
        <div class="mockup-window bg-white text-gray-800">
          <div class="mockup-titlebar">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
            <span class="flex-1 text-center text-xs text-gray-400 font-mono">golforder.app / \u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9</span>
          </div>
          <div class="bg-gray-50 p-4">
            <!-- \u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u30E2\u30C3\u30AF -->
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm font-bold text-gray-700">
                <i class="fas fa-golf-ball-tee text-blue-600 mr-1"></i>\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9
              </div>
              <div class="text-xs text-gray-400">2024\u5E746\u670820\u65E5\uFF08\u6728\uFF09</div>
            </div>
            <!-- \u30B5\u30DE\u30EA\u30FC\u30AB\u30FC\u30C9 -->
            <div class="grid grid-cols-4 gap-2 mb-4">
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-blue-600">12</div>
                <div class="text-xs text-gray-500">\u5546\u54C1\u767B\u9332\u6570</div>
              </div>
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-green-600">5</div>
                <div class="text-xs text-gray-500">\u4ED5\u5165\u5148\u6570</div>
              </div>
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-orange-500">3</div>
                <div class="text-xs text-gray-500 flex items-center justify-center gap-1">
                  \u767A\u6CE8\u4E2D
                  <span class="pulse-badge w-1.5 h-1.5 bg-orange-400 rounded-full inline-block"></span>
                </div>
              </div>
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-red-500">2</div>
                <div class="text-xs text-gray-500">\u5165\u8377\u5F85\u3061</div>
              </div>
            </div>
            <!-- \u767A\u6CE8\u30EA\u30B9\u30C8 -->
            <div class="bg-white rounded-lg p-3 card-shadow">
              <div class="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                <i class="fas fa-clock text-orange-400"></i> \u6700\u8FD1\u306E\u767A\u6CE8
              </div>
              <div class="space-y-2">
                ${mockOrderRow("\u9234\u6728 \u4E00\u90CE \u69D8", "WS-DR \u03B1 45S", "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8", "ordered", "6/17")}
                ${mockOrderRow("\u7530\u4E2D \u82B1\u5B50 \u69D8", "PS-FW Xtra 65R", "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8", "ordered", "6/15")}
                ${mockOrderRow("\u4F50\u85E4 \u5065 \u69D8", "YG-PRO \u30B3\u30FC\u30C9\u30EC\u30B9 \xD713", "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", "received", "6/10")}
                ${mockOrderRow("\uFF08\u5E97\u8217\u5728\u5EAB\u88DC\u5145\uFF09", "\u30DD\u30ED\u30B7\u30E3\u30C4\u307B\u304B2\u70B9", "\u30B9\u30DD\u30FC\u30C4\u30A2\u30D1\u30EC\u30EB", "ordered", "6/19")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u6570\u5B57\u3067\u898B\u308B\u52B9\u679C
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="bg-blue-900 text-white py-14 px-4">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-xl sm:text-2xl font-bold text-blue-100">
        \u5C0E\u5165\u3067\u5909\u308F\u308B\u3001\u767A\u6CE8\u696D\u52D9\u306E\u300C\u6642\u9593\u300D\u3068\u300C\u30B9\u30C8\u30EC\u30B9\u300D
      </h2>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">\u25BC70%</div>
        <div class="text-sm text-blue-200 font-medium">\u767A\u6CE8\u30E1\u30FC\u30EB<br>\u4F5C\u6210\u6642\u9593</div>
        <div class="text-xs text-blue-400 mt-1">30\u5206 \u2192 \u7D0410\u5206</div>
      </div>
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">\u30BC\u30ED\u3078</div>
        <div class="text-sm text-blue-200 font-medium">\u767A\u6CE8\u6F0F\u308C\u30FB<br>\u91CD\u8907\u767A\u6CE8</div>
        <div class="text-xs text-blue-400 mt-1">\u30B9\u30C6\u30FC\u30BF\u30B9\u3067\u4E00\u5143\u7BA1\u7406</div>
      </div>
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">\u5373\u78BA\u8A8D</div>
        <div class="text-sm text-blue-200 font-medium">\u5165\u8377\u72B6\u6CC1\u30FB<br>\u30D0\u30C3\u30AF\u30AA\u30FC\u30C0\u30FC</div>
        <div class="text-xs text-blue-400 mt-1">\u3069\u3053\u304B\u3089\u3067\u3082\u78BA\u8A8D\u53EF</div>
      </div>
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">\u81EA\u52D5\u5316</div>
        <div class="text-sm text-blue-200 font-medium">\u4ED5\u5165\u5148\u5225<br>\u767A\u6CE8\u30E1\u30FC\u30EB</div>
        <div class="text-xs text-blue-400 mt-1">\u30C6\u30F3\u30D7\u30EC\u304B\u3089\u81EA\u52D5\u751F\u6210</div>
      </div>
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     Before / After
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="py-16 px-4 sm:px-6 bg-gray-50">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-2">\u5C0E\u5165\u524D\u3068\u5F8C\u306E\u9055\u3044</h2>
      <p class="text-gray-500">\u6BCE\u65E5\u306E\u767A\u6CE8\u4F5C\u696D\u304C\u3001\u3053\u3046\u5909\u308F\u308A\u307E\u3059</p>
    </div>
    <div class="grid md:grid-cols-2 gap-6">
      <!-- Before -->
      <div class="bg-white rounded-2xl p-6 card-shadow border-l-4 border-red-400">
        <div class="flex items-center gap-2 mb-5">
          <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-red-500 text-sm"></i>
          </div>
          <span class="font-bold text-gray-700">\u5C0E\u5165\u524D\uFF08\u4ECA\u307E\u3067\uFF09</span>
        </div>
        <div class="space-y-3">
          ${beforeItem("\u5404\u4ED5\u5165\u5148\u306B\u6BCE\u56DE\u30E1\u30FC\u30EB\u3092\u624B\u66F8\u304D\u3002\u66F8\u304D\u65B9\u30FB\u5B9B\u5148\u3092\u90FD\u5EA6\u78BA\u8A8D")}
          ${beforeItem("Excel\u3067\u7BA1\u7406\u3057\u3066\u3044\u308B\u304C\u3001\u8AB0\u304C\u6700\u65B0\u304B\u5206\u304B\u3089\u306A\u304F\u306A\u308B")}
          ${beforeItem("\u300C\u3042\u306E\u5546\u54C1\u3001\u767A\u6CE8\u3057\u305F\u3063\u3051\uFF1F\u300D\u3068\u4E8C\u91CD\u78BA\u8A8D\u304C\u767A\u751F")}
          ${beforeItem("\u4ED5\u5165\u5148\u306B\u3088\u3063\u3066\u30E1\u30FC\u30EB\u30FBFAX\u30FBLINE\u304C\u30D0\u30E9\u30D0\u30E9\u3067\u7BA1\u7406\u304C\u5927\u5909")}
          ${beforeItem("\u5165\u8377\u72B6\u6CC1\u3092\u78BA\u8A8D\u3059\u308B\u305F\u3073\u306B\u96FB\u8A71\u3084\u5225\u8868\u3092\u898B\u308B")}
          ${beforeItem("\u6708\u672B\u306B\u307E\u3068\u3081\u3066\u78BA\u8A8D\u3059\u308B\u3068\u767A\u6CE8\u6F0F\u308C\u304C\u767A\u899A")}
        </div>
      </div>
      <!-- After -->
      <div class="bg-white rounded-2xl p-6 card-shadow border-l-4 border-green-500">
        <div class="flex items-center gap-2 mb-5">
          <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <i class="fas fa-check text-green-600 text-sm"></i>
          </div>
          <span class="font-bold text-gray-700">\u5C0E\u5165\u5F8C\uFF08GolfOrder\u3067\uFF09</span>
        </div>
        <div class="space-y-3">
          ${afterItem("\u5546\u54C1\u9078\u629E\u2192\u6570\u91CF\u5165\u529B\u2192\u9001\u4FE1\u3067\u5B8C\u4E86\u3002\u767A\u6CE8\u30E1\u30FC\u30EB\u304C\u81EA\u52D5\u751F\u6210")}
          ${afterItem("\u5168\u767A\u6CE8\u304C1\u753B\u9762\u306B\u96C6\u7D04\u3002\u30B9\u30C6\u30FC\u30BF\u30B9\u304C\u4E00\u76EE\u3067\u308F\u304B\u308B")}
          ${afterItem("\u300C\u767A\u6CE8\u6E08\u307F\u300D\u300C\u5165\u8377\u5F85\u3061\u300D\u3092\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u3067\u78BA\u8A8D\u3067\u304D\u308B")}
          ${afterItem("\u30E1\u30FC\u30EB\u30FBFAX\u30FBLINE\u306E\u9055\u3044\u3092\u30B7\u30B9\u30C6\u30E0\u304C\u899A\u3048\u3066\u81EA\u52D5\u9078\u629E")}
          ${afterItem("\u5165\u8377\u78BA\u8A8D\u30DC\u30BF\u30F31\u3064\u3067\u5B8C\u4E86\u3002\u30D0\u30C3\u30AF\u30AA\u30FC\u30C0\u30FC\u3082\u81EA\u52D5\u7BA1\u7406")}
          ${afterItem("\u767A\u6CE8\u6F0F\u308C\u30FB\u672A\u5165\u8377\u30EA\u30B9\u30C8\u3092\u6BCE\u65E5\u81EA\u52D5\u3067\u8868\u793A")}
        </div>
      </div>
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u6A5F\u80FD\u7D39\u4ECB
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section id="features" class="py-16 px-4 sm:px-6 bg-white">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-2">\u4E3B\u306A\u6A5F\u80FD</h2>
      <p class="text-gray-500">\u30B4\u30EB\u30D5\u30B7\u30E7\u30C3\u30D7\u306E\u767A\u6CE8\u696D\u52D9\u306B\u5FC5\u8981\u306A\u6A5F\u80FD\u3060\u3051\u3092\u3001<br class="hidden sm:block">\u30B7\u30F3\u30D7\u30EB\u306B\u307E\u3068\u3081\u307E\u3057\u305F</p>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${featureCard(
    "fas fa-magic",
    "bg-blue-50 text-blue-600",
    "\u767A\u6CE8\u30E1\u30FC\u30EB\u81EA\u52D5\u751F\u6210",
    "\u5546\u54C1\u30FB\u6570\u91CF\u3092\u9078\u3076\u3060\u3051\u3067\u3001\u4ED5\u5165\u5148\u3054\u3068\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u3092\u81EA\u52D5\u4F5C\u6210\u3002\u9001\u4FE1\u524D\u306B\u5185\u5BB9\u3092\u78BA\u8A8D\u30FB\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002"
  )}
      ${featureCard(
    "fas fa-route",
    "bg-green-50 text-green-600",
    "\u4ED5\u5165\u5148\u81EA\u52D5\u632F\u308A\u5206\u3051",
    "\u5546\u54C1\u30AB\u30C6\u30B4\u30EA\u30FB\u30E1\u30FC\u30AB\u30FC\u306B\u5FDC\u3058\u3066\u3001\u3069\u306E\u4ED5\u5165\u5148\u306B\u767A\u6CE8\u3059\u3079\u304D\u304B\u3092\u30B7\u30B9\u30C6\u30E0\u304C\u81EA\u52D5\u3067\u5224\u5B9A\u3057\u307E\u3059\u3002"
  )}
      ${featureCard(
    "fas fa-clipboard-list",
    "bg-orange-50 text-orange-600",
    "\u30B9\u30C6\u30FC\u30BF\u30B9\u4E00\u5143\u7BA1\u7406",
    "\u4E0B\u66F8\u304D\u2192\u767A\u6CE8\u6E08\u307F\u2192\u5165\u8377\u5F85\u3061\u2192\u5165\u8377\u5B8C\u4E86\u307E\u3067\u3001\u5168\u767A\u6CE8\u30921\u753B\u9762\u3067\u8FFD\u8DE1\u3067\u304D\u307E\u3059\u3002"
  )}
      ${featureCard(
    "fas fa-box-open",
    "bg-purple-50 text-purple-600",
    "\u30D0\u30C3\u30AF\u30AA\u30FC\u30C0\u30FC\u8FFD\u8DE1",
    "\u672A\u5165\u8377\u30FB\u5165\u8377\u5F85\u3061\u306E\u767A\u6CE8\u3092\u81EA\u52D5\u3067\u30EA\u30B9\u30C8\u5316\u3002\u304A\u5BA2\u69D8\u3078\u306E\u8FD4\u7B54\u3082\u7D20\u65E9\u304F\u5BFE\u5FDC\u3067\u304D\u307E\u3059\u3002"
  )}
      ${featureCard(
    "fas fa-address-book",
    "bg-pink-50 text-pink-600",
    "\u4ED5\u5165\u5148\u60C5\u5831\u3092\u4E00\u62EC\u7BA1\u7406",
    "\u30E1\u30FC\u30EB\u30FBFAX\u30FBLINE\u30FB\u96FB\u8A71\u306A\u3069\u767A\u6CE8\u65B9\u6CD5\u3092\u4ED5\u5165\u5148\u3054\u3068\u306B\u767B\u9332\u3002\u9023\u7D61\u5148\u3092\u90FD\u5EA6\u63A2\u3059\u624B\u9593\u304C\u306A\u304F\u306A\u308A\u307E\u3059\u3002"
  )}
      ${featureCard(
    "fas fa-chart-bar",
    "bg-teal-50 text-teal-600",
    "\u767A\u6CE8\u5C65\u6B74\u30FB\u5B9F\u7E3E\u7BA1\u7406",
    "\u904E\u53BB\u306E\u767A\u6CE8\u5C65\u6B74\u3092\u3044\u3064\u3067\u3082\u78BA\u8A8D\u3002\u540C\u3058\u5546\u54C1\u306E\u524D\u56DE\u767A\u6CE8\u5185\u5BB9\u3092\u53C2\u8003\u306B\u3057\u3066\u7D20\u65E9\u304F\u518D\u767A\u6CE8\u3067\u304D\u307E\u3059\u3002"
  )}
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u30E2\u30C3\u30AF\u30A2\u30C3\u30D7\u8A73\u7D30\uFF1A\u767A\u6CE8\u4E00\u89A7\u753B\u9762
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="py-16 px-4 sm:px-6 bg-gray-50">
  <div class="max-w-5xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div class="inline-block bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          \u767A\u6CE8\u7BA1\u7406\u753B\u9762
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-4">
          \u5168\u767A\u6CE8\u30921\u753B\u9762\u3067\u3002<br>\u30B9\u30C6\u30FC\u30BF\u30B9\u304C\u4E00\u76EE\u3067\u308F\u304B\u308B\u3002
        </h2>
        <p class="text-gray-500 leading-relaxed mb-6">
          \u304A\u5BA2\u69D8\u540D\u30FB\u5546\u54C1\u30FB\u4ED5\u5165\u5148\u30FB\u767A\u6CE8\u65E5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u3059\u3079\u3066\u4E00\u89A7\u8868\u793A\u3002
          \u30D5\u30A3\u30EB\u30BF\u30FC\u3067\u300C\u767A\u6CE8\u6E08\u307F\u300D\u300C\u5165\u8377\u5F85\u3061\u300D\u3060\u3051\u3092\u7D5E\u308A\u8FBC\u307F\u3082\u7C21\u5358\u3067\u3059\u3002
        </p>
        <ul class="space-y-3">
          ${checkItem("\u4E0B\u66F8\u304D\u304B\u3089\u59CB\u3081\u3066\u3001\u6E96\u5099\u304C\u3067\u304D\u305F\u3089\u4E00\u62EC\u9001\u4FE1")}
          ${checkItem("\u4ED5\u5165\u5148\u3054\u3068\u306B\u81EA\u52D5\u3067\u767A\u6CE8\u66F8\u3092\u5206\u5272")}
          ${checkItem("\u5165\u8377\u5F8C\u306F\u30EF\u30F3\u30AF\u30EA\u30C3\u30AF\u3067\u5B8C\u4E86\u51E6\u7406")}
        </ul>
      </div>
      <div class="mockup-window bg-white text-gray-800 text-xs">
        <div class="mockup-titlebar">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="flex-1 text-center text-xs text-gray-400 font-mono">/ \u767A\u6CE8\u4E00\u89A7</span>
        </div>
        <div class="p-3 bg-gray-50">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-sm text-gray-700">\u767A\u6CE8\u4E00\u89A7</span>
            <div class="flex gap-1">
              <span class="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">\u767A\u6CE8\u6E08\u307F 3\u4EF6</span>
              <span class="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">\u672A\u5165\u8377 2\u4EF6</span>
            </div>
          </div>
          <div class="bg-white rounded-lg overflow-hidden card-shadow">
            <table class="w-full text-xs">
              <thead>
                <tr class="bg-gray-100 text-gray-500">
                  <th class="text-left px-2 py-2">\u9867\u5BA2\u540D</th>
                  <th class="text-left px-2 py-2">\u4ED5\u5165\u5148</th>
                  <th class="text-left px-2 py-2">\u767A\u6CE8\u65E5</th>
                  <th class="text-left px-2 py-2">\u72B6\u614B</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                ${orderTableRow("\u9234\u6728 \u4E00\u90CE \u69D8", "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8", "6/17", "ordered")}
                ${orderTableRow("\u7530\u4E2D \u82B1\u5B50 \u69D8", "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8", "6/15", "ordered")}
                ${orderTableRow("\u4F50\u85E4 \u5065 \u69D8", "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", "6/10", "received")}
                ${orderTableRow("\uFF08\u5728\u5EAB\u88DC\u5145\uFF09", "\u30B9\u30DD\u30FC\u30C4\u30A2\u30D1\u30EC\u30EB", "6/19", "ordered")}
                ${orderTableRow("\uFF08\u5DE5\u623F\u6D88\u8017\u54C1\uFF09", "\u5DE5\u623F\u5099\u54C1\u30BB\u30F3\u30BF\u30FC", "6/20", "draft")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u30E2\u30C3\u30AF\u30A2\u30C3\u30D7\u8A73\u7D30\uFF1A\u30E1\u30FC\u30EB\u81EA\u52D5\u751F\u6210
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="py-16 px-4 sm:px-6 bg-white">
  <div class="max-w-5xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <!-- \u30E1\u30FC\u30EB\u30E2\u30C3\u30AF\u30A2\u30C3\u30D7 -->
      <div class="mockup-window bg-white text-gray-800 text-xs order-2 lg:order-1">
        <div class="mockup-titlebar">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="flex-1 text-center text-xs text-gray-400 font-mono">\u767A\u6CE8\u30E1\u30FC\u30EB \u30D7\u30EC\u30D3\u30E5\u30FC</span>
        </div>
        <div class="p-4 space-y-3">
          <div class="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <div class="flex gap-2">
              <span class="text-gray-400 w-10 shrink-0">\u5B9B\u5148</span>
              <span class="text-blue-600">order@works-shaft.example.com</span>
            </div>
            <div class="flex gap-2">
              <span class="text-gray-400 w-10 shrink-0">\u4EF6\u540D</span>
              <span class="font-medium">\u3010\u30B4\u30EB\u30D5\u30A6\u30A3\u30F3\u30B0\u3011\u767A\u6CE8\u306E\u3054\u4F9D\u983C 2024-06-17</span>
            </div>
          </div>
          <div class="bg-white border border-gray-100 rounded-lg p-3 text-gray-700 space-y-2 leading-relaxed">
            <p>\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8\u682A\u5F0F\u4F1A\u793E<br>\u5C0F\u68EE \u5065\u592A \u69D8</p>
            <p>\u304A\u4E16\u8A71\u306B\u306A\u3063\u3066\u304A\u308A\u307E\u3059\u3002<br>\u30B4\u30EB\u30D5\u30A6\u30A3\u30F3\u30B0\u306E\u53E4\u5DDD\u3067\u3054\u3056\u3044\u307E\u3059\u3002</p>
            <p>\u4E0B\u8A18\u306E\u901A\u308A\u3054\u767A\u6CE8\u3092\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002</p>
            <div class="bg-gray-50 rounded p-2 text-xs font-mono space-y-0.5">
              <div class="flex justify-between"><span>WS-DR \u03B1 45S</span><span>\xD7 1\u672C</span></div>
              <div class="flex justify-between"><span>WS-IRON \u03B2 95S</span><span>\xD7 2\u672C</span></div>
              <div class="border-t border-gray-200 pt-1 flex justify-between font-bold">
                <span>\u5408\u8A08</span><span>\xA570,200\uFF08\u7A0E\u8FBC\uFF09</span>
              </div>
            </div>
            <p>\u304A\u624B\u6570\u3092\u304A\u304B\u3051\u3057\u307E\u3059\u304C\u3001\u3088\u308D\u3057\u304F\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002</p>
          </div>
          <div class="flex gap-2 justify-end">
            <button class="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">\u7DE8\u96C6</button>
            <button class="bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg">
              <i class="fas fa-paper-plane mr-1"></i>\u9001\u4FE1
            </button>
          </div>
        </div>
      </div>
      <div class="order-1 lg:order-2">
        <div class="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          \u30E1\u30FC\u30EB\u81EA\u52D5\u751F\u6210
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-4">
          \u767A\u6CE8\u30E1\u30FC\u30EB\u306F<br>\u81EA\u52D5\u3067\u751F\u6210\u3002<br>\u9001\u308B\u3060\u3051\u3002
        </h2>
        <p class="text-gray-500 leading-relaxed mb-6">
          \u5546\u54C1\u30FB\u6570\u91CF\u3092\u5165\u529B\u3059\u308B\u3060\u3051\u3067\u3001\u4ED5\u5165\u5148\u3054\u3068\u306E\u767A\u6CE8\u30E1\u30FC\u30EB\u304C\u81EA\u52D5\u4F5C\u6210\u3055\u308C\u307E\u3059\u3002
          \u6BCE\u56DE\u30BC\u30ED\u304B\u3089\u66F8\u304F\u5FC5\u8981\u306F\u3042\u308A\u307E\u305B\u3093\u3002
        </p>
        <ul class="space-y-3">
          ${checkItem("\u4ED5\u5165\u5148\u3054\u3068\u306E\u6328\u62F6\u6587\u30FB\u7F72\u540D\u3092\u81EA\u52D5\u3067\u633F\u5165")}
          ${checkItem("\u9001\u4FE1\u524D\u306B\u30D7\u30EC\u30D3\u30E5\u30FC\u3057\u3066\u5185\u5BB9\u3092\u78BA\u8A8D")}
          ${checkItem("FAX\u30FBLINE\u767A\u6CE8\u3082\u30B7\u30B9\u30C6\u30E0\u3067\u7BA1\u7406")}
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u30E2\u30C3\u30AF\u30A2\u30C3\u30D7\u8A73\u7D30\uFF1A\u4ED5\u5165\u5148\u632F\u308A\u5206\u3051\u30EB\u30FC\u30EB
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="py-16 px-4 sm:px-6 bg-gray-50">
  <div class="max-w-5xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div class="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          \u81EA\u52D5\u632F\u308A\u5206\u3051\u30EB\u30FC\u30EB
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-4">
          \u3069\u306E\u5546\u54C1\u3092<br>\u3069\u3053\u306B\u767A\u6CE8\u3059\u308B\u304B\u3001<br>\u30B7\u30B9\u30C6\u30E0\u304C\u899A\u3048\u308B\u3002
        </h2>
        <p class="text-gray-500 leading-relaxed mb-6">
          \u300C\u3053\u306E\u30B7\u30E3\u30D5\u30C8\u306F\u30EF\u30FC\u30AF\u30B9\u3078\u3001\u3053\u306E\u30B0\u30EA\u30C3\u30D7\u306F\u5C71\u7530\u30B0\u30EA\u30C3\u30D7\u3078\u300D\u3068\u3044\u3046
          \u4ED5\u5165\u30EB\u30FC\u30EB\u3092\u30B7\u30B9\u30C6\u30E0\u306B\u767B\u9332\u3057\u3066\u304A\u3051\u3070\u3001\u3042\u3068\u306F\u81EA\u52D5\u3067\u632F\u308A\u5206\u3051\u307E\u3059\u3002
        </p>
        <ul class="space-y-3">
          ${checkItem("\u30AB\u30C6\u30B4\u30EA\u30FB\u30E1\u30FC\u30AB\u30FC\u30FB\u30AF\u30E9\u30D6\u7A2E\u5225\u3067\u30EB\u30FC\u30EB\u8A2D\u5B9A")}
          ${checkItem("\u4F8B\u5916\u30EB\u30FC\u30EB\u3082\u512A\u5148\u5EA6\u8A2D\u5B9A\u3067\u67D4\u8EDF\u306B\u5BFE\u5FDC")}
          ${checkItem("\u62C5\u5F53\u8005\u304C\u5909\u308F\u3063\u3066\u3082\u767A\u6CE8\u30DF\u30B9\u3092\u9632\u3052\u308B")}
        </ul>
      </div>
      <div class="mockup-window bg-white text-gray-800 text-xs">
        <div class="mockup-titlebar">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="flex-1 text-center text-xs text-gray-400 font-mono">\u4ED5\u5165\u5148\u5224\u5B9A\u30EB\u30FC\u30EB</span>
        </div>
        <div class="p-3 bg-gray-50">
          <div class="text-sm font-bold text-gray-700 mb-3">\u4ED5\u5165\u5148\u81EA\u52D5\u632F\u308A\u5206\u3051\u30EB\u30FC\u30EB</div>
          <div class="space-y-2">
            ${ruleRow("\u30B7\u30E3\u30D5\u30C8", "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8", "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8\u682A\u5F0F\u4F1A\u793E", "\u30E1\u30FC\u30EB")}
            ${ruleRow("\u30B7\u30E3\u30D5\u30C8", "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8", "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8\u5DE5\u696D", "\u30E1\u30FC\u30EB")}
            ${ruleRow("\u30B0\u30EA\u30C3\u30D7", "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7\u5546\u4E8B", "LINE")}
            ${ruleRow("\u30A2\u30D1\u30EC\u30EB", "\uFF08\u5168\u30E1\u30FC\u30AB\u30FC\uFF09", "\u30B9\u30DD\u30FC\u30C4\u30A2\u30D1\u30EC\u30EB\u30B8\u30E3\u30D1\u30F3", "\u30E1\u30FC\u30EB")}
            ${ruleRow("\u5DE5\u623F\u7528\u54C1", "\uFF08\u5168\u30E1\u30FC\u30AB\u30FC\uFF09", "\u5DE5\u623F\u5099\u54C1\u30BB\u30F3\u30BF\u30FC", "FAX")}
          </div>
          <div class="mt-3 text-xs text-gray-400 text-center">
            <i class="fas fa-info-circle mr-1"></i>\u5546\u54C1\u767B\u9332\u6642\u306B\u81EA\u52D5\u3067\u3053\u306E\u30EB\u30FC\u30EB\u304C\u9069\u7528\u3055\u308C\u307E\u3059
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     CTA\uFF08\u30C7\u30E2\u8A98\u5C0E\uFF09
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section class="gradient-green py-16 px-4 text-white">
  <div class="max-w-2xl mx-auto text-center">
    <div class="text-3xl mb-4">\u26F3</div>
    <h2 class="text-2xl sm:text-3xl font-black mb-4">
      \u307E\u305A\u306F\u7121\u6599\u30C7\u30E2\u3067<br>\u4F53\u9A13\u3057\u3066\u307F\u3066\u304F\u3060\u3055\u3044
    </h2>
    <p class="text-green-100 leading-relaxed mb-8">
      \u5B9F\u969B\u306E\u753B\u9762\u3092\u64CD\u4F5C\u3067\u304D\u308B\u30C7\u30E2\u74B0\u5883\u3092\u7528\u610F\u3057\u3066\u3044\u307E\u3059\u3002<br>
      \u767B\u9332\u4E0D\u8981\u30FB\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9\u4E0D\u8981\u3002\u4ECA\u3059\u3050\u8A66\u305B\u307E\u3059\u3002
    </p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/demo-login"
         class="inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold px-10 py-4 rounded-xl text-base shadow-lg transition">
        <i class="fas fa-play-circle text-xl"></i>
        \u30C7\u30E2\u3092\u59CB\u3081\u308B\uFF08\u7121\u6599\uFF09
      </a>
      <a href="/login"
         class="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-8 py-4 rounded-xl text-base border border-white/30 transition">
        <i class="fas fa-sign-in-alt mr-1"></i>
        \u30ED\u30B0\u30A4\u30F3
      </a>
    </div>
    <p class="text-green-200 text-sm mt-5">
      <i class="fas fa-lock mr-1"></i>\u30C7\u30E2\u30E2\u30FC\u30C9\u306F\u53C2\u7167\u306E\u307F\u3002\u30C7\u30FC\u30BF\u306E\u5909\u66F4\u30FB\u767B\u9332\u306F\u3067\u304D\u307E\u305B\u3093\u3002
    </p>
  </div>
</section>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     \u30D5\u30C3\u30BF\u30FC
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<footer class="bg-gray-900 text-gray-400 py-8 px-4 text-center text-sm">
  <div class="flex items-center justify-center gap-2 mb-2">
    <div class="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
      <i class="fas fa-golf-ball-tee text-white text-xs"></i>
    </div>
    <span class="font-bold text-white">${appName}</span>
  </div>
  <p class="text-gray-500 text-xs">\u30B4\u30EB\u30D5\u30B7\u30E7\u30C3\u30D7\u5C02\u7528 \u767A\u6CE8\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0</p>
</footer>

<script>
// \u30B9\u30E0\u30FC\u30B9\u30B9\u30AF\u30ED\u30FC\u30EB
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault()
    const el = document.querySelector(a.getAttribute('href'))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})
</script>
</body>
</html>`;
}
function statusBadge2(status) {
  const map = {
    draft: ["bg-gray-100 text-gray-600", "\u4E0B\u66F8\u304D"],
    ordered: ["bg-orange-100 text-orange-700", "\u767A\u6CE8\u6E08"],
    received: ["bg-green-100 text-green-700", "\u5165\u8377\u6E08"]
  };
  const [cls, label] = map[status] ?? ["bg-gray-100 text-gray-500", status];
  return `<span class="${cls} text-xs px-1.5 py-0.5 rounded-full font-medium">${label}</span>`;
}
function methodBadge(method) {
  const map = {
    "\u30E1\u30FC\u30EB": "bg-blue-50 text-blue-600",
    "LINE": "bg-green-50 text-green-600",
    "FAX": "bg-purple-50 text-purple-600",
    "\u96FB\u8A71": "bg-yellow-50 text-yellow-700"
  };
  return `<span class="${map[method] ?? "bg-gray-100 text-gray-500"} text-xs px-1.5 py-0.5 rounded font-medium">${method}</span>`;
}
function mockOrderRow(customer, product, supplier, status, date) {
  return `
  <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
    <div class="flex-1 min-w-0">
      <div class="font-medium text-gray-800 text-xs truncate">${customer}</div>
      <div class="text-gray-400 text-xs truncate">${product} / ${supplier}</div>
    </div>
    <div class="flex items-center gap-1.5 ml-2 shrink-0">
      <span class="text-gray-400 text-xs">${date}</span>
      ${statusBadge2(status)}
    </div>
  </div>`;
}
function orderTableRow(customer, supplier, date, status) {
  return `
  <tr class="hover:bg-gray-50">
    <td class="px-2 py-2 text-gray-700">${customer}</td>
    <td class="px-2 py-2 text-gray-500">${supplier}</td>
    <td class="px-2 py-2 text-gray-400">${date}</td>
    <td class="px-2 py-2">${statusBadge2(status)}</td>
  </tr>`;
}
function ruleRow(category, maker, supplier, method) {
  return `
  <div class="bg-white rounded-lg p-2.5 flex items-center gap-2 card-shadow">
    <div class="flex-1 min-w-0">
      <span class="text-gray-700 font-medium">${category}</span>
      <span class="text-gray-400 mx-1">\u203A</span>
      <span class="text-gray-500 text-xs">${maker}</span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <span class="text-blue-700 text-xs font-medium">${supplier}</span>
      ${methodBadge(method)}
    </div>
  </div>`;
}
function featureCard(icon, iconStyle, title, desc) {
  return `
  <div class="bg-white rounded-2xl p-6 card-shadow hover:shadow-lg transition">
    <div class="feature-icon ${iconStyle} mb-4">
      <i class="${icon}"></i>
    </div>
    <h3 class="font-bold text-gray-800 mb-2">${title}</h3>
    <p class="text-gray-500 text-sm leading-relaxed">${desc}</p>
  </div>`;
}
function beforeItem(text) {
  return `
  <div class="flex items-start gap-2">
    <i class="fas fa-circle-xmark text-red-400 mt-0.5 shrink-0"></i>
    <span class="text-sm text-gray-600">${text}</span>
  </div>`;
}
function afterItem(text) {
  return `
  <div class="flex items-start gap-2">
    <i class="fas fa-circle-check text-green-500 mt-0.5 shrink-0"></i>
    <span class="text-sm text-gray-600">${text}</span>
  </div>`;
}
function checkItem(text) {
  return `
  <div class="flex items-start gap-3">
    <div class="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
      <i class="fas fa-check text-blue-600 text-xs"></i>
    </div>
    <span class="text-gray-600">${text}</span>
  </div>`;
}

// src/index.ts
var app3 = new Hono2();
app3.use("/static/*", module({ root: "./public" }));
app3.get("/favicon.ico", (c) => c.body(null, 204));
app3.get("/demo-login", (c) => c.redirect("/login"));
app3.get("/login", async (c) => {
  const secret = c.env.AUTH_SECRET || "golfwing-secret-key-change-in-production";
  const user = await getCurrentUser(c.req.raw, c.env.DB, secret);
  if (user) return c.redirect("/dashboard");
  const next = c.req.query("next") || "/dashboard";
  return loginPage(false, next, c.env.APP_NAME);
});
app3.post("/login", async (c) => {
  const form = await c.req.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/dashboard");
  const result = await attemptLogin(username, password, c.env);
  if (result) {
    const rawDest = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const dest = rawDest === "/" ? "/dashboard" : rawDest;
    return new Response(null, {
      status: 302,
      headers: {
        "Location": dest,
        "Set-Cookie": result.headers.get("Set-Cookie") || ""
      }
    });
  }
  return loginPage(true, next, c.env.APP_NAME);
});
app3.get("/logout", (c) => {
  return logoutResponse();
});
app3.use("/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/static/") || path === "/favicon.ico" || path === "/demo-login") {
    return next();
  }
  if (path === "/login") return next();
  if (path === "/") return next();
  if (path === "/api/demo-reset") return next();
  const secret = c.env.AUTH_SECRET || "golfwing-secret-key-change-in-production";
  if (c.env.DEMO_MODE === "1") {
    c.set("sessionUser", {
      username: "demo",
      tenantId: 0,
      displayName: "\u30C7\u30E2\u30E6\u30FC\u30B6\u30FC",
      isDemo: true,
      isAdmin: false
    });
    return next();
  }
  const user = await getCurrentUser(c.req.raw, c.env.DB, secret);
  if (!user) return unauthorizedRedirect(path);
  c.set("sessionUser", user);
  return next();
});
app3.use("/api/*", cors());
app3.route("/api", app);
app3.get("/api/demo-reset", async (c) => {
  const secret = c.req.query("secret") || "";
  const expected = c.env.AUTH_SECRET || "golfwing-secret-key-change-in-production";
  if (secret !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await resetDemoData(c.env.DB);
  return c.json({ ok: true, message: "Demo data reset completed." });
});
app3.get("/", async (c) => {
  const secret = c.env.AUTH_SECRET || "golfwing-secret-key-change-in-production";
  const user = await getCurrentUser(c.req.raw, c.env.DB, secret);
  if (user) return c.redirect("/dashboard");
  const appName = c.env.APP_NAME || "GolfOrder";
  return c.html(landingPage(appName));
});
app3.route("/", app2);
var DEMO_TENANT_ID = 0;
var DEMO_SUPPLIERS = [
  {
    name: "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8\u682A\u5F0F\u4F1A\u793E",
    contact_name: "\u5C0F\u68EE \u5065\u592A",
    honorific: "\u69D8",
    order_method: "\u30E1\u30FC\u30EB",
    email: "order@works-shaft.example.com",
    notes: "\u5927\u53E3\u5272\u5F15\u3042\u308A\u3002\xA525,000\u672A\u6E80\u306F\u9001\u6599\u5225\u9014",
    shipping_rule: "\xA525,000\u4EE5\u4E0A\u9001\u6599\u7121\u6599"
  },
  {
    name: "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8\u5DE5\u696D",
    contact_name: "\u7530\u4E2D \u6D69\u4E8C",
    honorific: "\u69D8",
    order_method: "\u30E1\u30FC\u30EB",
    email: "sales@premium-shaft.example.com",
    notes: "\u5728\u5EAB\u78BA\u8A8D\u306F\u96FB\u8A71\u3067\u3082\u53EF",
    shipping_rule: "\xA530,000\u4EE5\u4E0A\u9001\u6599\u7121\u6599"
  },
  {
    name: "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7\u5546\u4E8B",
    contact_name: "\u5C71\u7530 \u307F\u304D",
    honorific: "\u69D8",
    order_method: "LINE",
    email: "",
    notes: "LINE\u3067\u767A\u6CE8\u3002\u7D19\u306E\u6CE8\u6587\u7968\u3042\u308A\u3002\xA510,000\u672A\u6E80\u9001\u6599\u5225\u9014",
    shipping_rule: "\xA510,000\u4EE5\u4E0A\u9001\u6599\u7121\u6599"
  },
  {
    name: "\u30B9\u30DD\u30FC\u30C4\u30A2\u30D1\u30EC\u30EB\u30B8\u30E3\u30D1\u30F3",
    contact_name: "\u6E21\u8FBA \u6075",
    honorific: "\u69D8",
    order_method: "\u30E1\u30FC\u30EB",
    email: "order@sports-apparel.example.com",
    notes: "\u30B7\u30FC\u30BA\u30F3\u524D\u306B\u4E00\u62EC\u767A\u6CE8\u304C\u591A\u3044",
    shipping_rule: "\u4E00\u5F8B\u9001\u6599\xA5500"
  },
  {
    name: "\u5DE5\u623F\u5099\u54C1\u30BB\u30F3\u30BF\u30FC",
    contact_name: "\u4F50\u85E4 \u8AA0",
    honorific: "\u69D8",
    order_method: "FAX",
    email: "",
    notes: "\u5DE5\u623F\u7528\u6D88\u8017\u54C1\u5C02\u9580\u3002FAX\u6CE8\u6587\u306E\u307F",
    shipping_rule: "\xA55,000\u4EE5\u4E0A\u9001\u6599\u7121\u6599"
  }
];
var DEMO_PRODUCTS = [
  // シャフト 3種
  { item_category: "\u30B7\u30E3\u30D5\u30C8", manufacturer: "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8", name: "WS-DR \u03B1 45S", spec: "45g S", club_type: "DR", list_price: 58e3, default_rate: 0.45, unit: "\u672C", supplier_idx: 0 },
  { item_category: "\u30B7\u30E3\u30D5\u30C8", manufacturer: "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8", name: "WS-IRON \u03B2 95S", spec: "95g S", club_type: "IRON", list_price: 48e3, default_rate: 0.45, unit: "\u672C", supplier_idx: 0 },
  { item_category: "\u30B7\u30E3\u30D5\u30C8", manufacturer: "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8", name: "PS-FW Xtra 65R", spec: "65g R", club_type: "FW", list_price: 42e3, default_rate: 0.48, unit: "\u672C", supplier_idx: 1 },
  // グリップ 4種
  { item_category: "\u30B0\u30EA\u30C3\u30D7", manufacturer: "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", name: "YG-PRO \u30B3\u30FC\u30C9\u30EC\u30B9 M60", spec: "M60", club_type: null, list_price: 1800, default_rate: 0.55, unit: "\u500B", supplier_idx: 2 },
  { item_category: "\u30B0\u30EA\u30C3\u30D7", manufacturer: "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", name: "YG-TOUR \u30B3\u30FC\u30C9 M60", spec: "M60", club_type: null, list_price: 2200, default_rate: 0.55, unit: "\u500B", supplier_idx: 2 },
  { item_category: "\u30B0\u30EA\u30C3\u30D7", manufacturer: "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", name: "YG-\u30D1\u30BF\u30FC \u30DF\u30C3\u30C9\u30B5\u30A4\u30BA", spec: "M62", club_type: "PT", list_price: 3500, default_rate: 0.55, unit: "\u500B", supplier_idx: 2 },
  { item_category: "\u30B0\u30EA\u30C3\u30D7", manufacturer: "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", name: "YG-\u30B8\u30E5\u30CB\u30A2 S52", spec: "S52", club_type: null, list_price: 1200, default_rate: 0.55, unit: "\u500B", supplier_idx: 2 },
  // アパレル 2種
  { item_category: "\u30A2\u30D1\u30EC\u30EB", manufacturer: "\u30B9\u30DD\u30FC\u30C4\u30A2\u30D1\u30EC\u30EB", name: "\u30DD\u30ED\u30B7\u30E3\u30C4 \u5438\u6C34\u901F\u4E7E M", spec: "M", club_type: null, list_price: 8800, default_rate: 0.6, unit: "\u679A", supplier_idx: 3 },
  { item_category: "\u30A2\u30D1\u30EC\u30EB", manufacturer: "\u30B9\u30DD\u30FC\u30C4\u30A2\u30D1\u30EC\u30EB", name: "\u30B9\u30C8\u30EC\u30C3\u30C1\u30D1\u30F3\u30C4 L", spec: "L", club_type: null, list_price: 12e3, default_rate: 0.6, unit: "\u672C", supplier_idx: 3 },
  // 工房用品 3種
  { item_category: "\u5DE5\u623F\u7528\u54C1", manufacturer: "\u5DE5\u623F\u5099\u54C1\u30BB\u30F3\u30BF\u30FC", name: "\u30A8\u30DD\u30AD\u30B7\u63A5\u7740\u5264 2\u6DB2\u578B", spec: "100ml", club_type: null, list_price: 2400, default_rate: 0.65, unit: "\u672C", supplier_idx: 4 },
  { item_category: "\u5DE5\u623F\u7528\u54C1", manufacturer: "\u5DE5\u623F\u5099\u54C1\u30BB\u30F3\u30BF\u30FC", name: "\u30B0\u30EA\u30C3\u30D7\u30C6\u30FC\u30D7 (10\u672C\u5165)", spec: "10\u672C", club_type: null, list_price: 1500, default_rate: 0.65, unit: "\u888B", supplier_idx: 4 },
  { item_category: "\u5DE5\u623F\u7528\u54C1", manufacturer: "\u5DE5\u623F\u5099\u54C1\u30BB\u30F3\u30BF\u30FC", name: "\u30EA\u30E0\u30FC\u30D0\u30FC\u6EB6\u5264 500ml", spec: "500ml", club_type: null, list_price: 3200, default_rate: 0.65, unit: "\u672C", supplier_idx: 4 }
];
var DEMO_ORDERS = [
  {
    // 対応が必要：14日前発注・未入荷（赤アラート）
    supplierIdx: 0,
    customerName: "\u9234\u6728 \u4E00\u90CE \u69D8",
    status: "ordered",
    daysAgo: 14,
    items: [{ productIdx: 0, quantity: 1 }, { productIdx: 1, quantity: 2 }]
  },
  {
    // 対応が必要：8日前発注・未入荷（要確認）
    supplierIdx: 1,
    customerName: "\u7530\u4E2D \u82B1\u5B50 \u69D8",
    status: "ordered",
    daysAgo: 8,
    items: [{ productIdx: 2, quantity: 1 }]
  },
  {
    // 検品待ち：一部入荷・入荷レコードあり → 検品待ちセクションに表示
    supplierIdx: 2,
    customerName: "\u4F50\u85E4 \u5065 \u69D8",
    status: "partial",
    daysAgo: 11,
    items: [{ productIdx: 3, quantity: 13 }, { productIdx: 4, quantity: 6 }]
  },
  {
    // お客様対応中（最近の発注）
    supplierIdx: 3,
    customerName: "\uFF08\u5E97\u8217\u5728\u5EAB\u88DC\u5145\uFF09",
    status: "ordered",
    daysAgo: 2,
    items: [{ productIdx: 7, quantity: 5 }, { productIdx: 8, quantity: 3 }]
  },
  {
    // 発注し忘れ確認：下書き
    supplierIdx: 4,
    customerName: "\uFF08\u5DE5\u623F\u6D88\u8017\u54C1\uFF09",
    status: "draft",
    daysAgo: 1,
    items: [{ productIdx: 9, quantity: 3 }, { productIdx: 10, quantity: 10 }, { productIdx: 11, quantity: 2 }]
  }
];
async function resetDemoData(db2) {
  const receiptRows = await db2.prepare(
    "SELECT id FROM receipts WHERE tenant_id=?"
  ).bind(DEMO_TENANT_ID).all();
  for (const r of receiptRows.results) {
    await db2.prepare("DELETE FROM receipt_items WHERE receipt_id=?").bind(r.id).run();
  }
  await db2.prepare("DELETE FROM receipts WHERE tenant_id=?").bind(DEMO_TENANT_ID).run();
  const orderRows = await db2.prepare(
    "SELECT id FROM purchase_orders WHERE tenant_id=?"
  ).bind(DEMO_TENANT_ID).all();
  for (const o of orderRows.results) {
    await db2.prepare("DELETE FROM purchase_order_items WHERE purchase_order_id=?").bind(o.id).run();
  }
  await db2.prepare("DELETE FROM purchase_orders WHERE tenant_id=?").bind(DEMO_TENANT_ID).run();
  await db2.prepare("DELETE FROM supplier_rules WHERE tenant_id=?").bind(DEMO_TENANT_ID).run();
  await db2.prepare("DELETE FROM products WHERE tenant_id=?").bind(DEMO_TENANT_ID).run();
  await db2.prepare("DELETE FROM suppliers WHERE tenant_id=?").bind(DEMO_TENANT_ID).run();
  const supplierIds = [];
  for (const s of DEMO_SUPPLIERS) {
    const r = await db2.prepare(`
      INSERT INTO suppliers
        (name, contact_name, honorific, order_method, email, notes, shipping_rule,
         is_active, tenant_id)
      VALUES (?,?,?,?,?,?,?,1,?)
    `).bind(
      s.name,
      s.contact_name,
      s.honorific,
      s.order_method,
      s.email,
      s.notes,
      s.shipping_rule,
      DEMO_TENANT_ID
    ).run();
    supplierIds.push(r.meta.last_row_id);
  }
  const productIds = [];
  for (const p of DEMO_PRODUCTS) {
    const sid = supplierIds[p.supplier_idx];
    const r = await db2.prepare(`
      INSERT INTO products
        (item_category, manufacturer, name, spec, club_type,
         list_price, default_rate, unit, default_supplier_id,
         is_active, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,1,?)
    `).bind(
      p.item_category,
      p.manufacturer,
      p.name,
      p.spec ?? null,
      p.club_type ?? null,
      p.list_price,
      p.default_rate,
      p.unit,
      sid,
      DEMO_TENANT_ID
    ).run();
    productIds.push(r.meta.last_row_id);
  }
  const rules = [
    { item_category: "\u30B7\u30E3\u30D5\u30C8", manufacturer: "\u30EF\u30FC\u30AF\u30B9\u30B7\u30E3\u30D5\u30C8", supplier_idx: 0, rate: 0.45 },
    { item_category: "\u30B7\u30E3\u30D5\u30C8", manufacturer: "\u30D7\u30EC\u30DF\u30A2\u30E0\u30B7\u30E3\u30D5\u30C8", supplier_idx: 1, rate: 0.48 },
    { item_category: "\u30B0\u30EA\u30C3\u30D7", manufacturer: "\u5C71\u7530\u30B0\u30EA\u30C3\u30D7", supplier_idx: 2, rate: 0.55 },
    { item_category: "\u30A2\u30D1\u30EC\u30EB", manufacturer: null, supplier_idx: 3, rate: 0.6 },
    { item_category: "\u5DE5\u623F\u7528\u54C1", manufacturer: null, supplier_idx: 4, rate: 0.65 }
  ];
  for (const rule of rules) {
    await db2.prepare(`
      INSERT INTO supplier_rules
        (item_category, manufacturer, supplier_id, rate, priority, tenant_id)
      VALUES (?,?,?,?,10,?)
    `).bind(
      rule.item_category,
      rule.manufacturer ?? null,
      supplierIds[rule.supplier_idx],
      rule.rate,
      DEMO_TENANT_ID
    ).run();
  }
  for (let oi = 0; oi < DEMO_ORDERS.length; oi++) {
    const od = DEMO_ORDERS[oi];
    const orderDate = new Date(Date.now() - od.daysAgo * 864e5);
    const dateStr = orderDate.toISOString().slice(0, 10);
    const batchCode = `DEMO-${dateStr.replace(/-/g, "")}`;
    const orderNo = `DEMO-${dateStr.replace(/-/g, "")}-${String(oi + 1).padStart(3, "0")}`;
    const sid = supplierIds[od.supplierIdx];
    const ins = await db2.prepare(`
      INSERT INTO purchase_orders
        (batch_code, order_no, order_date, ordered_by,
         supplier_id, customer_name, status, tenant_id)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      batchCode,
      orderNo,
      dateStr,
      "\u30C7\u30E2\u30B9\u30BF\u30C3\u30D5",
      sid,
      od.customerName,
      od.status,
      DEMO_TENANT_ID
    ).run();
    const orderId = ins.meta.last_row_id;
    for (const item of od.items) {
      const p = DEMO_PRODUCTS[item.productIdx];
      const unitPrice = Math.floor((p.list_price ?? 0) * p.default_rate);
      await db2.prepare(`
        INSERT INTO purchase_order_items
          (purchase_order_id, item_category, manufacturer, product_name,
           spec, club_type, quantity, list_price, rate, unit_price, amount,
           customer_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        orderId,
        p.item_category,
        p.manufacturer,
        p.name,
        p.spec ?? null,
        p.club_type ?? null,
        item.quantity,
        p.list_price ?? null,
        p.default_rate,
        unitPrice,
        unitPrice * item.quantity,
        od.customerName
      ).run();
    }
    if (od.status === "received" || od.status === "partial") {
      const recIns = await db2.prepare(`
        INSERT INTO receipts
          (purchase_order_id, received_date, inspected_by, tenant_id)
        VALUES (?,?,?,?)
      `).bind(orderId, dateStr, "\u30C7\u30E2\u30B9\u30BF\u30C3\u30D5", DEMO_TENANT_ID).run();
      const recId = recIns.meta.last_row_id;
      const poItems = await db2.prepare(
        "SELECT id, quantity FROM purchase_order_items WHERE purchase_order_id=?"
      ).bind(orderId).all();
      for (const poi of poItems.results) {
        const recvQty = od.status === "partial" ? Math.max(1, Math.floor(poi.quantity / 2)) : poi.quantity;
        await db2.prepare(`
          INSERT INTO receipt_items
            (receipt_id, purchase_order_item_id, received_quantity)
          VALUES (?,?,?)
        `).bind(recId, poi.id, recvQty).run();
      }
    }
  }
}
var index_default = {
  fetch: app3.fetch,
  async scheduled(_event, env, _ctx) {
    await resetDemoData(env.DB);
    console.log("[Cron] Demo data reset completed.");
  }
};

// node_modules/postgres/src/index.js
import os from "os";
import fs from "fs";

// node_modules/postgres/src/query.js
var originCache = /* @__PURE__ */ new Map();
var originStackCache = /* @__PURE__ */ new Map();
var originError = /* @__PURE__ */ Symbol("OriginError");
var CLOSE = {};
var Query = class extends Promise {
  constructor(strings, args, handler2, canceller, options = {}) {
    let resolve, reject;
    super((a, b2) => {
      resolve = a;
      reject = b2;
    });
    this.tagged = Array.isArray(strings.raw);
    this.strings = strings;
    this.args = args;
    this.handler = handler2;
    this.canceller = canceller;
    this.options = options;
    this.state = null;
    this.statement = null;
    this.resolve = (x) => (this.active = false, resolve(x));
    this.reject = (x) => (this.active = false, reject(x));
    this.active = false;
    this.cancelled = null;
    this.executed = false;
    this.signature = "";
    this[originError] = this.handler.debug ? new Error() : this.tagged && cachedError(this.strings);
  }
  get origin() {
    return (this.handler.debug ? this[originError].stack : this.tagged && originStackCache.has(this.strings) ? originStackCache.get(this.strings) : originStackCache.set(this.strings, this[originError].stack).get(this.strings)) || "";
  }
  static get [Symbol.species]() {
    return Promise;
  }
  cancel() {
    return this.canceller && (this.canceller(this), this.canceller = null);
  }
  simple() {
    this.options.simple = true;
    this.options.prepare = false;
    return this;
  }
  async readable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  async writable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  cursor(rows = 1, fn) {
    this.options.simple = false;
    if (typeof rows === "function") {
      fn = rows;
      rows = 1;
    }
    this.cursorRows = rows;
    if (typeof fn === "function")
      return this.cursorFn = fn, this;
    let prev;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (this.executed && !this.active)
            return { done: true };
          prev && prev();
          const promise = new Promise((resolve, reject) => {
            this.cursorFn = (value) => {
              resolve({ value, done: false });
              return new Promise((r) => prev = r);
            };
            this.resolve = () => (this.active = false, resolve({ done: true }));
            this.reject = (x) => (this.active = false, reject(x));
          });
          this.execute();
          return promise;
        },
        return() {
          prev && prev(CLOSE);
          return { done: true };
        }
      })
    };
  }
  describe() {
    this.options.simple = false;
    this.onlyDescribe = this.options.prepare = true;
    return this;
  }
  stream() {
    throw new Error(".stream has been renamed to .forEach");
  }
  forEach(fn) {
    this.forEachFn = fn;
    this.handle();
    return this;
  }
  raw() {
    this.isRaw = true;
    return this;
  }
  values() {
    this.isRaw = "values";
    return this;
  }
  async handle() {
    !this.executed && (this.executed = true) && await 1 && this.handler(this);
  }
  execute() {
    this.handle();
    return this;
  }
  then() {
    this.handle();
    return super.then.apply(this, arguments);
  }
  catch() {
    this.handle();
    return super.catch.apply(this, arguments);
  }
  finally() {
    this.handle();
    return super.finally.apply(this, arguments);
  }
};
function cachedError(xs) {
  if (originCache.has(xs))
    return originCache.get(xs);
  const x = Error.stackTraceLimit;
  Error.stackTraceLimit = 4;
  originCache.set(xs, new Error());
  Error.stackTraceLimit = x;
  return originCache.get(xs);
}

// node_modules/postgres/src/errors.js
var PostgresError = class extends Error {
  constructor(x) {
    super(x.message);
    this.name = this.constructor.name;
    Object.assign(this, x);
  }
};
var Errors = {
  connection,
  postgres,
  generic,
  notSupported
};
function connection(x, options, socket) {
  const { host, port } = socket || options;
  const error = Object.assign(
    new Error("write " + x + " " + (options.path || host + ":" + port)),
    {
      code: x,
      errno: x,
      address: options.path || host
    },
    options.path ? {} : { port }
  );
  Error.captureStackTrace(error, connection);
  return error;
}
function postgres(x) {
  const error = new PostgresError(x);
  Error.captureStackTrace(error, postgres);
  return error;
}
function generic(code, message) {
  const error = Object.assign(new Error(code + ": " + message), { code });
  Error.captureStackTrace(error, generic);
  return error;
}
function notSupported(x) {
  const error = Object.assign(
    new Error(x + " (B) is not supported"),
    {
      code: "MESSAGE_NOT_SUPPORTED",
      name: x
    }
  );
  Error.captureStackTrace(error, notSupported);
  return error;
}

// node_modules/postgres/src/types.js
var types = {
  string: {
    to: 25,
    from: null,
    // defaults to string
    serialize: (x) => "" + x
  },
  number: {
    to: 0,
    from: [21, 23, 26, 700, 701],
    serialize: (x) => "" + x,
    parse: (x) => +x
  },
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (x) => JSON.stringify(x),
    parse: (x) => JSON.parse(x)
  },
  boolean: {
    to: 16,
    from: 16,
    serialize: (x) => x === true ? "t" : "f",
    parse: (x) => x === "t"
  },
  date: {
    to: 1184,
    from: [1082, 1114, 1184],
    serialize: (x) => (x instanceof Date ? x : new Date(x)).toISOString(),
    parse: (x) => new Date(x)
  },
  bytea: {
    to: 17,
    from: 17,
    serialize: (x) => "\\x" + Buffer.from(x).toString("hex"),
    parse: (x) => Buffer.from(x.slice(2), "hex")
  }
};
var NotTagged = class {
  then() {
    notTagged();
  }
  catch() {
    notTagged();
  }
  finally() {
    notTagged();
  }
};
var Identifier = class extends NotTagged {
  constructor(value) {
    super();
    this.value = escapeIdentifier(value);
  }
};
var Parameter = class extends NotTagged {
  constructor(value, type, array) {
    super();
    this.value = value;
    this.type = type;
    this.array = array;
  }
};
var Builder = class extends NotTagged {
  constructor(first, rest) {
    super();
    this.first = first;
    this.rest = rest;
  }
  build(before, parameters, types2, options) {
    const keyword = builders.map(([x, fn]) => ({ fn, i: before.search(x) })).sort((a, b2) => a.i - b2.i).pop();
    return keyword.i === -1 ? escapeIdentifiers(this.first, options) : keyword.fn(this.first, this.rest, parameters, types2, options);
  }
};
function handleValue(x, parameters, types2, options) {
  let value = x instanceof Parameter ? x.value : x;
  if (value === void 0) {
    x instanceof Parameter ? x.value = options.transform.undefined : value = x = options.transform.undefined;
    if (value === void 0)
      throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
  }
  return "$" + types2.push(
    x instanceof Parameter ? (parameters.push(x.value), x.array ? x.array[x.type || inferType(x.value)] || x.type || firstIsString(x.value) : x.type) : (parameters.push(x), inferType(x))
  );
}
var defaultHandlers = typeHandlers(types);
function stringify(q, string, value, parameters, types2, options) {
  for (let i = 1; i < q.strings.length; i++) {
    string += stringifyValue(string, value, parameters, types2, options) + q.strings[i];
    value = q.args[i];
  }
  return string;
}
function stringifyValue(string, value, parameters, types2, o) {
  return value instanceof Builder ? value.build(string, parameters, types2, o) : value instanceof Query ? fragment(value, parameters, types2, o) : value instanceof Identifier ? value.value : value && value[0] instanceof Query ? value.reduce((acc, x) => acc + " " + fragment(x, parameters, types2, o), "") : handleValue(value, parameters, types2, o);
}
function fragment(q, parameters, types2, options) {
  q.fragment = true;
  return stringify(q, q.strings[0], q.args[0], parameters, types2, options);
}
function valuesBuilder(first, parameters, types2, columns, options) {
  return first.map(
    (row) => "(" + columns.map(
      (column) => stringifyValue("values", row[column], parameters, types2, options)
    ).join(",") + ")"
  ).join(",");
}
function values(first, rest, parameters, types2, options) {
  const multi = Array.isArray(first[0]);
  const columns = rest.length ? rest.flat() : Object.keys(multi ? first[0] : first);
  return valuesBuilder(multi ? first : [first], parameters, types2, columns, options);
}
function select(first, rest, parameters, types2, options) {
  typeof first === "string" && (first = [first].concat(rest));
  if (Array.isArray(first))
    return escapeIdentifiers(first, options);
  let value;
  const columns = rest.length ? rest.flat() : Object.keys(first);
  return columns.map((x) => {
    value = first[x];
    return (value instanceof Query ? fragment(value, parameters, types2, options) : value instanceof Identifier ? value.value : handleValue(value, parameters, types2, options)) + " as " + escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x);
  }).join(",");
}
var builders = Object.entries({
  values,
  in: (...xs) => {
    const x = values(...xs);
    return x === "()" ? "(null)" : x;
  },
  select,
  as: select,
  returning: select,
  "\\(": select,
  update(first, rest, parameters, types2, options) {
    return (rest.length ? rest.flat() : Object.keys(first)).map(
      (x) => escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x) + "=" + stringifyValue("values", first[x], parameters, types2, options)
    );
  },
  insert(first, rest, parameters, types2, options) {
    const columns = rest.length ? rest.flat() : Object.keys(Array.isArray(first) ? first[0] : first);
    return "(" + escapeIdentifiers(columns, options) + ")values" + valuesBuilder(Array.isArray(first) ? first : [first], parameters, types2, columns, options);
  }
}).map(([x, fn]) => [new RegExp("((?:^|[\\s(])" + x + "(?:$|[\\s(]))(?![\\s\\S]*\\1)", "i"), fn]);
function notTagged() {
  throw Errors.generic("NOT_TAGGED_CALL", "Query not called as a tagged template literal");
}
var serializers = defaultHandlers.serializers;
var parsers = defaultHandlers.parsers;
function firstIsString(x) {
  if (Array.isArray(x))
    return firstIsString(x[0]);
  return typeof x === "string" ? 1009 : 0;
}
var mergeUserTypes = function(types2) {
  const user = typeHandlers(types2 || {});
  return {
    serializers: Object.assign({}, serializers, user.serializers),
    parsers: Object.assign({}, parsers, user.parsers)
  };
};
function typeHandlers(types2) {
  return Object.keys(types2).reduce((acc, k) => {
    types2[k].from && [].concat(types2[k].from).forEach((x) => acc.parsers[x] = types2[k].parse);
    if (types2[k].serialize) {
      acc.serializers[types2[k].to] = types2[k].serialize;
      types2[k].from && [].concat(types2[k].from).forEach((x) => acc.serializers[x] = types2[k].serialize);
    }
    return acc;
  }, { parsers: {}, serializers: {} });
}
function escapeIdentifiers(xs, { transform: { column } }) {
  return xs.map((x) => escapeIdentifier(column.to ? column.to(x) : x)).join(",");
}
var escapeIdentifier = function escape(str) {
  return '"' + str.replace(/"/g, '""').replace(/\./g, '"."') + '"';
};
var inferType = function inferType2(x) {
  return x instanceof Parameter ? x.type : x instanceof Date ? 1184 : x instanceof Uint8Array ? 17 : x === true || x === false ? 16 : typeof x === "bigint" ? 20 : Array.isArray(x) ? inferType2(x[0]) : 0;
};
var escapeBackslash = /\\/g;
var escapeQuote = /"/g;
function arrayEscape(x) {
  return x.replace(escapeBackslash, "\\\\").replace(escapeQuote, '\\"');
}
var arraySerializer = function arraySerializer2(xs, serializer, options, typarray) {
  if (Array.isArray(xs) === false)
    return xs;
  if (!xs.length)
    return "{}";
  const first = xs[0];
  const delimiter = typarray === 1020 ? ";" : ",";
  if (Array.isArray(first) && !first.type)
    return "{" + xs.map((x) => arraySerializer2(x, serializer, options, typarray)).join(delimiter) + "}";
  return "{" + xs.map((x) => {
    if (x === void 0) {
      x = options.transform.undefined;
      if (x === void 0)
        throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
    }
    return x === null ? "null" : '"' + arrayEscape(serializer ? serializer(x.type ? x.value : x) : "" + x) + '"';
  }).join(delimiter) + "}";
};
var arrayParserState = {
  i: 0,
  char: null,
  str: "",
  quoted: false,
  last: 0
};
var arrayParser = function arrayParser2(x, parser, typarray) {
  arrayParserState.i = arrayParserState.last = 0;
  return arrayParserLoop(arrayParserState, x, parser, typarray);
};
function arrayParserLoop(s, x, parser, typarray) {
  const xs = [];
  const delimiter = typarray === 1020 ? ";" : ",";
  for (; s.i < x.length; s.i++) {
    s.char = x[s.i];
    if (s.quoted) {
      if (s.char === "\\") {
        s.str += x[++s.i];
      } else if (s.char === '"') {
        xs.push(parser ? parser(s.str) : s.str);
        s.str = "";
        s.quoted = x[s.i + 1] === '"';
        s.last = s.i + 2;
      } else {
        s.str += s.char;
      }
    } else if (s.char === '"') {
      s.quoted = true;
    } else if (s.char === "{") {
      s.last = ++s.i;
      xs.push(arrayParserLoop(s, x, parser, typarray));
    } else if (s.char === "}") {
      s.quoted = false;
      s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
      break;
    } else if (s.char === delimiter && s.p !== "}" && s.p !== '"') {
      xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
    }
    s.p = s.char;
  }
  s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i + 1)) : x.slice(s.last, s.i + 1));
  return xs;
}
var toCamel = (x) => {
  let str = x[0];
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toPascal = (x) => {
  let str = x[0].toUpperCase();
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toKebab = (x) => x.replace(/_/g, "-");
var fromCamel = (x) => x.replace(/([A-Z])/g, "_$1").toLowerCase();
var fromPascal = (x) => (x.slice(0, 1) + x.slice(1).replace(/([A-Z])/g, "_$1")).toLowerCase();
var fromKebab = (x) => x.replace(/-/g, "_");
function createJsonTransform(fn) {
  return function jsonTransform(x, column) {
    return typeof x === "object" && x !== null && (column.type === 114 || column.type === 3802) ? Array.isArray(x) ? x.map((x2) => jsonTransform(x2, column)) : Object.entries(x).reduce((acc, [k, v]) => Object.assign(acc, { [fn(k)]: jsonTransform(v, column) }), {}) : x;
  };
}
toCamel.column = { from: toCamel };
toCamel.value = { from: createJsonTransform(toCamel) };
fromCamel.column = { to: fromCamel };
var camel = { ...toCamel };
camel.column.to = fromCamel;
toPascal.column = { from: toPascal };
toPascal.value = { from: createJsonTransform(toPascal) };
fromPascal.column = { to: fromPascal };
var pascal = { ...toPascal };
pascal.column.to = fromPascal;
toKebab.column = { from: toKebab };
toKebab.value = { from: createJsonTransform(toKebab) };
fromKebab.column = { to: fromKebab };
var kebab = { ...toKebab };
kebab.column.to = fromKebab;

// node_modules/postgres/src/connection.js
import net from "net";
import tls from "tls";
import crypto2 from "crypto";
import Stream from "stream";
import { performance } from "perf_hooks";

// node_modules/postgres/src/result.js
var Result = class extends Array {
  constructor() {
    super();
    Object.defineProperties(this, {
      count: { value: null, writable: true },
      state: { value: null, writable: true },
      command: { value: null, writable: true },
      columns: { value: null, writable: true },
      statement: { value: null, writable: true }
    });
  }
  static get [Symbol.species]() {
    return Array;
  }
};

// node_modules/postgres/src/queue.js
var queue_default = Queue;
function Queue(initial = []) {
  let xs = initial.slice();
  let index = 0;
  return {
    get length() {
      return xs.length - index;
    },
    remove: (x) => {
      const index2 = xs.indexOf(x);
      return index2 === -1 ? null : (xs.splice(index2, 1), x);
    },
    push: (x) => (xs.push(x), x),
    shift: () => {
      const out = xs[index++];
      if (index === xs.length) {
        index = 0;
        xs = [];
      } else {
        xs[index - 1] = void 0;
      }
      return out;
    }
  };
}

// node_modules/postgres/src/bytes.js
var size = 256;
var buffer = Buffer.allocUnsafe(size);
var messages = "BCcDdEFfHPpQSX".split("").reduce((acc, x) => {
  const v = x.charCodeAt(0);
  acc[x] = () => {
    buffer[0] = v;
    b.i = 5;
    return b;
  };
  return acc;
}, {});
var b = Object.assign(reset, messages, {
  N: String.fromCharCode(0),
  i: 0,
  inc(x) {
    b.i += x;
    return b;
  },
  str(x) {
    const length = Buffer.byteLength(x);
    fit(length);
    b.i += buffer.write(x, b.i, length, "utf8");
    return b;
  },
  i16(x) {
    fit(2);
    buffer.writeUInt16BE(x, b.i);
    b.i += 2;
    return b;
  },
  i32(x, i) {
    if (i || i === 0) {
      buffer.writeUInt32BE(x, i);
      return b;
    }
    fit(4);
    buffer.writeUInt32BE(x, b.i);
    b.i += 4;
    return b;
  },
  z(x) {
    fit(x);
    buffer.fill(0, b.i, b.i + x);
    b.i += x;
    return b;
  },
  raw(x) {
    buffer = Buffer.concat([buffer.subarray(0, b.i), x]);
    b.i = buffer.length;
    return b;
  },
  end(at = 1) {
    buffer.writeUInt32BE(b.i - at, at);
    const out = buffer.subarray(0, b.i);
    b.i = 0;
    buffer = Buffer.allocUnsafe(size);
    return out;
  }
});
var bytes_default = b;
function fit(x) {
  if (buffer.length - b.i < x) {
    const prev = buffer, length = prev.length;
    buffer = Buffer.allocUnsafe(length + (length >> 1) + x);
    prev.copy(buffer);
  }
}
function reset() {
  b.i = 0;
  return b;
}

// node_modules/postgres/src/connection.js
var connection_default = Connection;
var uid = 1;
var Sync = bytes_default().S().end();
var Flush = bytes_default().H().end();
var SSLRequest = bytes_default().i32(8).i32(80877103).end(8);
var ExecuteUnnamed = Buffer.concat([bytes_default().E().str(bytes_default.N).i32(0).end(), Sync]);
var DescribeUnnamed = bytes_default().D().str("S").str(bytes_default.N).end();
var noop = () => {
};
var retryRoutines = /* @__PURE__ */ new Set([
  "FetchPreparedStatement",
  "RevalidateCachedQuery",
  "transformAssignedExpr"
]);
var errorFields = {
  83: "severity_local",
  // S
  86: "severity",
  // V
  67: "code",
  // C
  77: "message",
  // M
  68: "detail",
  // D
  72: "hint",
  // H
  80: "position",
  // P
  112: "internal_position",
  // p
  113: "internal_query",
  // q
  87: "where",
  // W
  115: "schema_name",
  // s
  116: "table_name",
  // t
  99: "column_name",
  // c
  100: "data type_name",
  // d
  110: "constraint_name",
  // n
  70: "file",
  // F
  76: "line",
  // L
  82: "routine"
  // R
};
function Connection(options, queues = {}, { onopen = noop, onend = noop, onclose = noop } = {}) {
  const {
    sslnegotiation,
    ssl,
    max,
    user,
    host,
    port,
    database,
    parsers: parsers2,
    transform,
    onnotice,
    onnotify,
    onparameter,
    max_pipeline,
    keep_alive,
    backoff: backoff2,
    target_session_attrs
  } = options;
  const sent = queue_default(), id = uid++, backend = { pid: null, secret: null }, idleTimer = timer(end, options.idle_timeout), lifeTimer = timer(end, options.max_lifetime), connectTimer = timer(connectTimedOut, options.connect_timeout);
  let socket = null, cancelMessage, errorResponse = null, result = new Result(), incoming = Buffer.alloc(0), needsTypes = options.fetch_types, backendParameters = {}, statements = {}, statementId = Math.random().toString(36).slice(2), statementCount = 1, closedTime = 0, remaining = 0, hostIndex = 0, retries = 0, length = 0, delay = 0, rows = 0, serverSignature = null, nextWriteTimer = null, terminated = false, incomings = null, results = null, initial = null, ending = null, stream = null, chunk = null, ended = null, nonce = null, query = null, final = null;
  const connection2 = {
    queue: queues.closed,
    idleTimer,
    connect(query2) {
      initial = query2;
      reconnect();
    },
    terminate,
    execute,
    cancel,
    end,
    count: 0,
    id
  };
  queues.closed && queues.closed.push(connection2);
  return connection2;
  async function createSocket() {
    let x;
    try {
      x = options.socket ? await Promise.resolve(options.socket(options)) : new net.Socket();
    } catch (e) {
      error(e);
      return;
    }
    x.on("error", error);
    x.on("close", closed);
    x.on("drain", drain);
    return x;
  }
  async function cancel({ pid, secret }, resolve, reject) {
    try {
      cancelMessage = bytes_default().i32(16).i32(80877102).i32(pid).i32(secret).end(16);
      await connect();
      socket.once("error", reject);
      socket.once("close", resolve);
    } catch (error2) {
      reject(error2);
    }
  }
  function execute(q) {
    if (terminated)
      return queryError(q, Errors.connection("CONNECTION_DESTROYED", options));
    if (stream)
      return queryError(q, Errors.generic("COPY_IN_PROGRESS", "You cannot execute queries during copy"));
    if (q.cancelled)
      return;
    try {
      q.state = backend;
      query ? sent.push(q) : (query = q, query.active = true);
      build(q);
      return write(toBuffer(q)) && !q.describeFirst && !q.cursorFn && sent.length < max_pipeline && (!q.options.onexecute || q.options.onexecute(connection2));
    } catch (error2) {
      sent.length === 0 && write(Sync);
      errored(error2);
      return true;
    }
  }
  function toBuffer(q) {
    if (q.parameters.length >= 65534)
      throw Errors.generic("MAX_PARAMETERS_EXCEEDED", "Max number of parameters (65534) exceeded");
    return q.options.simple ? bytes_default().Q().str(q.statement.string + bytes_default.N).end() : q.describeFirst ? Buffer.concat([describe(q), Flush]) : q.prepare ? q.prepared ? prepared(q) : Buffer.concat([describe(q), prepared(q)]) : unnamed(q);
  }
  function describe(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types, q.statement.name),
      Describe("S", q.statement.name)
    ]);
  }
  function prepared(q) {
    return Buffer.concat([
      Bind(q.parameters, q.statement.types, q.statement.name, q.cursorName),
      q.cursorFn ? Execute("", q.cursorRows) : ExecuteUnnamed
    ]);
  }
  function unnamed(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types),
      DescribeUnnamed,
      prepared(q)
    ]);
  }
  function build(q) {
    const parameters = [], types2 = [];
    const string = stringify(q, q.strings[0], q.args[0], parameters, types2, options);
    !q.tagged && q.args.forEach((x) => handleValue(x, parameters, types2, options));
    q.prepare = options.prepare && ("prepare" in q.options ? q.options.prepare : true);
    q.string = string;
    q.signature = q.prepare && types2 + string;
    q.onlyDescribe && delete statements[q.signature];
    q.parameters = q.parameters || parameters;
    q.prepared = q.prepare && q.signature in statements;
    q.describeFirst = q.onlyDescribe || parameters.length && !q.prepared;
    q.statement = q.prepared ? statements[q.signature] : { string, types: types2, name: q.prepare ? statementId + statementCount++ : "" };
    typeof options.debug === "function" && options.debug(id, string, parameters, types2);
  }
  function write(x, fn) {
    chunk = chunk ? Buffer.concat([chunk, x]) : Buffer.from(x);
    if (fn || chunk.length >= 1024)
      return nextWrite(fn);
    nextWriteTimer === null && (nextWriteTimer = setImmediate(nextWrite));
    return true;
  }
  function nextWrite(fn) {
    const x = socket.write(chunk, fn);
    nextWriteTimer !== null && clearImmediate(nextWriteTimer);
    chunk = nextWriteTimer = null;
    return x;
  }
  function connectTimedOut() {
    errored(Errors.connection("CONNECT_TIMEOUT", options, socket));
    socket.destroy();
  }
  async function secure() {
    if (sslnegotiation !== "direct") {
      write(SSLRequest);
      const canSSL = await new Promise((r) => socket.once("data", (x) => r(x[0] === 83)));
      if (!canSSL && ssl === "prefer")
        return connected();
    }
    const options2 = {
      socket,
      servername: net.isIP(socket.host) ? void 0 : socket.host
    };
    if (sslnegotiation === "direct")
      options2.ALPNProtocols = ["postgresql"];
    if (ssl === "require" || ssl === "allow" || ssl === "prefer")
      options2.rejectUnauthorized = false;
    else if (typeof ssl === "object")
      Object.assign(options2, ssl);
    socket.removeAllListeners();
    socket = tls.connect(options2);
    socket.on("secureConnect", connected);
    socket.on("error", error);
    socket.on("close", closed);
    socket.on("drain", drain);
  }
  function drain() {
    !query && onopen(connection2);
  }
  function data(x) {
    if (incomings) {
      incomings.push(x);
      remaining -= x.length;
      if (remaining > 0)
        return;
    }
    incoming = incomings ? Buffer.concat(incomings, length - remaining) : incoming.length === 0 ? x : Buffer.concat([incoming, x], incoming.length + x.length);
    while (incoming.length > 4) {
      length = incoming.readUInt32BE(1);
      if (length >= incoming.length) {
        remaining = length - incoming.length;
        incomings = [incoming];
        break;
      }
      try {
        handle(incoming.subarray(0, length + 1));
      } catch (e) {
        query && (query.cursorFn || query.describeFirst) && write(Sync);
        errored(e);
      }
      incoming = incoming.subarray(length + 1);
      remaining = 0;
      incomings = null;
    }
  }
  async function connect() {
    terminated = false;
    backendParameters = {};
    socket || (socket = await createSocket());
    if (!socket)
      return;
    connectTimer.start();
    if (options.socket)
      return ssl ? secure() : connected();
    socket.on("connect", ssl ? secure : connected);
    if (options.path)
      return socket.connect(options.path);
    socket.ssl = ssl;
    socket.connect(port[hostIndex], host[hostIndex]);
    socket.host = host[hostIndex];
    socket.port = port[hostIndex];
    hostIndex = (hostIndex + 1) % port.length;
  }
  function reconnect() {
    setTimeout(connect, closedTime ? Math.max(0, closedTime + delay - performance.now()) : 0);
  }
  function connected() {
    try {
      statements = {};
      needsTypes = options.fetch_types;
      statementId = Math.random().toString(36).slice(2);
      statementCount = 1;
      lifeTimer.start();
      socket.on("data", data);
      keep_alive && socket.setKeepAlive && socket.setKeepAlive(true, 1e3 * keep_alive);
      const s = StartupMessage();
      write(s);
    } catch (err) {
      error(err);
    }
  }
  function error(err) {
    if (connection2.queue === queues.connecting && options.host[retries + 1])
      return;
    errored(err);
    while (sent.length)
      queryError(sent.shift(), err);
  }
  function errored(err) {
    stream && (stream.destroy(err), stream = null);
    query && queryError(query, err);
    initial && (queryError(initial, err), initial = null);
  }
  function queryError(query2, err) {
    if (query2.reserve)
      return query2.reject(err);
    if (!err || typeof err !== "object")
      err = new Error(err);
    "query" in err || "parameters" in err || Object.defineProperties(err, {
      stack: { value: err.stack + query2.origin.replace(/.*\n/, "\n"), enumerable: options.debug },
      query: { value: query2.string, enumerable: options.debug },
      parameters: { value: query2.parameters, enumerable: options.debug },
      args: { value: query2.args, enumerable: options.debug },
      types: { value: query2.statement && query2.statement.types, enumerable: options.debug }
    });
    query2.reject(err);
  }
  function end() {
    return ending || (!connection2.reserved && onend(connection2), !connection2.reserved && !initial && !query && sent.length === 0 ? (terminate(), new Promise((r) => socket && socket.readyState !== "closed" ? socket.once("close", r) : r())) : ending = new Promise((r) => ended = r));
  }
  function terminate() {
    terminated = true;
    if (stream || query || initial || sent.length)
      error(Errors.connection("CONNECTION_DESTROYED", options));
    clearImmediate(nextWriteTimer);
    if (socket) {
      socket.removeListener("data", data);
      socket.removeListener("connect", connected);
      socket.readyState === "open" && socket.end(bytes_default().X().end());
    }
    ended && (ended(), ending = ended = null);
  }
  async function closed(hadError) {
    incoming = Buffer.alloc(0);
    remaining = 0;
    incomings = null;
    clearImmediate(nextWriteTimer);
    socket.removeListener("data", data);
    socket.removeListener("connect", connected);
    idleTimer.cancel();
    lifeTimer.cancel();
    connectTimer.cancel();
    socket.removeAllListeners();
    socket = null;
    if (initial)
      return reconnect();
    !hadError && (query || sent.length) && error(Errors.connection("CONNECTION_CLOSED", options, socket));
    closedTime = performance.now();
    hadError && options.shared.retries++;
    delay = (typeof backoff2 === "function" ? backoff2(options.shared.retries) : backoff2) * 1e3;
    onclose(connection2, Errors.connection("CONNECTION_CLOSED", options, socket));
  }
  function handle(xs, x = xs[0]) {
    (x === 68 ? DataRow : (
      // D
      x === 100 ? CopyData : (
        // d
        x === 65 ? NotificationResponse : (
          // A
          x === 83 ? ParameterStatus : (
            // S
            x === 90 ? ReadyForQuery : (
              // Z
              x === 67 ? CommandComplete : (
                // C
                x === 50 ? BindComplete : (
                  // 2
                  x === 49 ? ParseComplete : (
                    // 1
                    x === 116 ? ParameterDescription : (
                      // t
                      x === 84 ? RowDescription : (
                        // T
                        x === 82 ? Authentication : (
                          // R
                          x === 110 ? NoData : (
                            // n
                            x === 75 ? BackendKeyData : (
                              // K
                              x === 69 ? ErrorResponse : (
                                // E
                                x === 115 ? PortalSuspended : (
                                  // s
                                  x === 51 ? CloseComplete : (
                                    // 3
                                    x === 71 ? CopyInResponse : (
                                      // G
                                      x === 78 ? NoticeResponse : (
                                        // N
                                        x === 72 ? CopyOutResponse : (
                                          // H
                                          x === 99 ? CopyDone : (
                                            // c
                                            x === 73 ? EmptyQueryResponse : (
                                              // I
                                              x === 86 ? FunctionCallResponse : (
                                                // V
                                                x === 118 ? NegotiateProtocolVersion : (
                                                  // v
                                                  x === 87 ? CopyBothResponse : (
                                                    // W
                                                    /* c8 ignore next */
                                                    UnknownMessage
                                                  )
                                                )
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ))(xs);
  }
  function DataRow(x) {
    let index = 7;
    let length2;
    let column;
    let value;
    const row = query.isRaw ? new Array(query.statement.columns.length) : {};
    for (let i = 0; i < query.statement.columns.length; i++) {
      column = query.statement.columns[i];
      length2 = x.readInt32BE(index);
      index += 4;
      value = length2 === -1 ? null : query.isRaw === true ? x.subarray(index, index += length2) : column.parser === void 0 ? x.toString("utf8", index, index += length2) : column.parser.array === true ? column.parser(x.toString("utf8", index + 1, index += length2)) : column.parser(x.toString("utf8", index, index += length2));
      query.isRaw ? row[i] = query.isRaw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
    }
    query.forEachFn ? query.forEachFn(transform.row.from ? transform.row.from(row) : row, result) : result[rows++] = transform.row.from ? transform.row.from(row) : row;
  }
  function ParameterStatus(x) {
    const [k, v] = x.toString("utf8", 5, x.length - 1).split(bytes_default.N);
    backendParameters[k] = v;
    if (options.parameters[k] !== v) {
      options.parameters[k] = v;
      onparameter && onparameter(k, v);
    }
  }
  function ReadyForQuery(x) {
    if (query) {
      if (errorResponse) {
        query.retried ? errored(query.retried) : query.prepared && retryRoutines.has(errorResponse.routine) ? retry(query, errorResponse) : errored(errorResponse);
      } else {
        query.resolve(results || result);
      }
    } else if (errorResponse) {
      errored(errorResponse);
    }
    query = results = errorResponse = null;
    result = new Result();
    connectTimer.cancel();
    if (initial) {
      if (target_session_attrs) {
        if (!backendParameters.in_hot_standby || !backendParameters.default_transaction_read_only)
          return fetchState();
        else if (tryNext(target_session_attrs, backendParameters))
          return terminate();
      }
      if (needsTypes) {
        initial.reserve && (initial = null);
        return fetchArrayTypes();
      }
      initial && !initial.reserve && execute(initial);
      options.shared.retries = retries = 0;
      initial = null;
      return;
    }
    while (sent.length && (query = sent.shift()) && (query.active = true, query.cancelled))
      Connection(options).cancel(query.state, query.cancelled.resolve, query.cancelled.reject);
    if (query)
      return;
    connection2.reserved ? !connection2.reserved.release && x[5] === 73 ? ending ? terminate() : (connection2.reserved = null, onopen(connection2)) : connection2.reserved() : ending ? terminate() : onopen(connection2);
  }
  function CommandComplete(x) {
    rows = 0;
    for (let i = x.length - 1; i > 0; i--) {
      if (x[i] === 32 && x[i + 1] < 58 && result.count === null)
        result.count = +x.toString("utf8", i + 1, x.length - 1);
      if (x[i - 1] >= 65) {
        result.command = x.toString("utf8", 5, i);
        result.state = backend;
        break;
      }
    }
    final && (final(), final = null);
    if (result.command === "BEGIN" && max !== 1 && !connection2.reserved)
      return errored(Errors.generic("UNSAFE_TRANSACTION", "Only use sql.begin, sql.reserved or max: 1"));
    if (query.options.simple)
      return BindComplete();
    if (query.cursorFn) {
      result.count && query.cursorFn(result);
      write(Sync);
    }
  }
  function ParseComplete() {
    query.parsing = false;
  }
  function BindComplete() {
    !result.statement && (result.statement = query.statement);
    result.columns = query.statement.columns;
  }
  function ParameterDescription(x) {
    const length2 = x.readUInt16BE(5);
    for (let i = 0; i < length2; ++i)
      !query.statement.types[i] && (query.statement.types[i] = x.readUInt32BE(7 + i * 4));
    query.prepare && (statements[query.signature] = query.statement);
    query.describeFirst && !query.onlyDescribe && (write(prepared(query)), query.describeFirst = false);
  }
  function RowDescription(x) {
    if (result.command) {
      results = results || [result];
      results.push(result = new Result());
      result.count = null;
      query.statement.columns = null;
    }
    const length2 = x.readUInt16BE(5);
    let index = 7;
    let start;
    query.statement.columns = Array(length2);
    for (let i = 0; i < length2; ++i) {
      start = index;
      while (x[index++] !== 0) ;
      const table = x.readUInt32BE(index);
      const number = x.readUInt16BE(index + 4);
      const type = x.readUInt32BE(index + 6);
      query.statement.columns[i] = {
        name: transform.column.from ? transform.column.from(x.toString("utf8", start, index - 1)) : x.toString("utf8", start, index - 1),
        parser: parsers2[type],
        table,
        number,
        type
      };
      index += 18;
    }
    result.statement = query.statement;
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  async function Authentication(x, type = x.readUInt32BE(5)) {
    (type === 3 ? AuthenticationCleartextPassword : type === 5 ? AuthenticationMD5Password : type === 10 ? SASL : type === 11 ? SASLContinue : type === 12 ? SASLFinal : type !== 0 ? UnknownAuth : noop)(x, type);
  }
  async function AuthenticationCleartextPassword() {
    const payload = await Pass();
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function AuthenticationMD5Password(x) {
    const payload = "md5" + await md5(
      Buffer.concat([
        Buffer.from(await md5(await Pass() + user)),
        x.subarray(9)
      ])
    );
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function SASL() {
    nonce = (await crypto2.randomBytes(18)).toString("base64");
    bytes_default().p().str("SCRAM-SHA-256" + bytes_default.N);
    const i = bytes_default.i;
    write(bytes_default.inc(4).str("n,,n=*,r=" + nonce).i32(bytes_default.i - i - 4, i).end());
  }
  async function SASLContinue(x) {
    const res = x.toString("utf8", 9).split(",").reduce((acc, x2) => (acc[x2[0]] = x2.slice(2), acc), {});
    const saltedPassword = await crypto2.pbkdf2Sync(
      await Pass(),
      Buffer.from(res.s, "base64"),
      parseInt(res.i),
      32,
      "sha256"
    );
    const clientKey = await hmac(saltedPassword, "Client Key");
    const auth = "n=*,r=" + nonce + ",r=" + res.r + ",s=" + res.s + ",i=" + res.i + ",c=biws,r=" + res.r;
    serverSignature = (await hmac(await hmac(saltedPassword, "Server Key"), auth)).toString("base64");
    const payload = "c=biws,r=" + res.r + ",p=" + xor(
      clientKey,
      Buffer.from(await hmac(await sha256(clientKey), auth))
    ).toString("base64");
    write(
      bytes_default().p().str(payload).end()
    );
  }
  function SASLFinal(x) {
    if (x.toString("utf8", 9).split(bytes_default.N, 1)[0].slice(2) === serverSignature)
      return;
    errored(Errors.generic("SASL_SIGNATURE_MISMATCH", "The server did not return the correct signature"));
    socket.destroy();
  }
  function Pass() {
    return Promise.resolve(
      typeof options.pass === "function" ? options.pass() : options.pass
    );
  }
  function NoData() {
    result.statement = query.statement;
    result.statement.columns = [];
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  function BackendKeyData(x) {
    backend.pid = x.readUInt32BE(5);
    backend.secret = x.readUInt32BE(9);
  }
  async function fetchArrayTypes() {
    needsTypes = false;
    const types2 = await new Query([`
      select b.oid, b.typarray
      from pg_catalog.pg_type a
      left join pg_catalog.pg_type b on b.oid = a.typelem
      where a.typcategory = 'A'
      group by b.oid, b.typarray
      order by b.oid
    `], [], execute);
    types2.forEach(({ oid, typarray }) => addArrayType(oid, typarray));
  }
  function addArrayType(oid, typarray) {
    if (!!options.parsers[typarray] && !!options.serializers[typarray]) return;
    const parser = options.parsers[oid];
    options.shared.typeArrayMap[oid] = typarray;
    options.parsers[typarray] = (xs) => arrayParser(xs, parser, typarray);
    options.parsers[typarray].array = true;
    options.serializers[typarray] = (xs) => arraySerializer(xs, options.serializers[oid], options, typarray);
  }
  function tryNext(x, xs) {
    return x === "read-write" && xs.default_transaction_read_only === "on" || x === "read-only" && xs.default_transaction_read_only === "off" || x === "primary" && xs.in_hot_standby === "on" || x === "standby" && xs.in_hot_standby === "off" || x === "prefer-standby" && xs.in_hot_standby === "off" && options.host[retries];
  }
  function fetchState() {
    const query2 = new Query([`
      show transaction_read_only;
      select pg_catalog.pg_is_in_recovery()
    `], [], execute, null, { simple: true });
    query2.resolve = ([[a], [b2]]) => {
      backendParameters.default_transaction_read_only = a.transaction_read_only;
      backendParameters.in_hot_standby = b2.pg_is_in_recovery ? "on" : "off";
    };
    query2.execute();
  }
  function ErrorResponse(x) {
    if (query) {
      (query.cursorFn || query.describeFirst) && write(Sync);
      errorResponse = Errors.postgres(parseError(x));
    } else {
      errored(Errors.postgres(parseError(x)));
    }
  }
  function retry(q, error2) {
    delete statements[q.signature];
    q.retried = error2;
    execute(q);
  }
  function NotificationResponse(x) {
    if (!onnotify)
      return;
    let index = 9;
    while (x[index++] !== 0) ;
    onnotify(
      x.toString("utf8", 9, index - 1),
      x.toString("utf8", index, x.length - 1)
    );
  }
  async function PortalSuspended() {
    try {
      const x = await Promise.resolve(query.cursorFn(result));
      rows = 0;
      x === CLOSE ? write(Close(query.portal)) : (result = new Result(), write(Execute("", query.cursorRows)));
    } catch (err) {
      write(Sync);
      query.reject(err);
    }
  }
  function CloseComplete() {
    result.count && query.cursorFn(result);
    query.resolve(result);
  }
  function CopyInResponse() {
    stream = new Stream.Writable({
      autoDestroy: true,
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
        stream = null;
      }
    });
    query.resolve(stream);
  }
  function CopyOutResponse() {
    stream = new Stream.Readable({
      read() {
        socket.resume();
      }
    });
    query.resolve(stream);
  }
  function CopyBothResponse() {
    stream = new Stream.Duplex({
      autoDestroy: true,
      read() {
        socket.resume();
      },
      /* c8 ignore next 11 */
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
      }
    });
    query.resolve(stream);
  }
  function CopyData(x) {
    stream && (stream.push(x.subarray(5)) || socket.pause());
  }
  function CopyDone() {
    stream && stream.push(null);
    stream = null;
  }
  function NoticeResponse(x) {
    onnotice ? onnotice(parseError(x)) : console.log(parseError(x));
  }
  function EmptyQueryResponse() {
  }
  function FunctionCallResponse() {
    errored(Errors.notSupported("FunctionCallResponse"));
  }
  function NegotiateProtocolVersion() {
    errored(Errors.notSupported("NegotiateProtocolVersion"));
  }
  function UnknownMessage(x) {
    console.error("Postgres.js : Unknown Message:", x[0]);
  }
  function UnknownAuth(x, type) {
    console.error("Postgres.js : Unknown Auth:", type);
  }
  function Bind(parameters, types2, statement = "", portal = "") {
    let prev, type;
    bytes_default().B().str(portal + bytes_default.N).str(statement + bytes_default.N).i16(0).i16(parameters.length);
    parameters.forEach((x, i) => {
      if (x === null)
        return bytes_default.i32(4294967295);
      type = types2[i];
      parameters[i] = x = type in options.serializers ? options.serializers[type](x) : "" + x;
      prev = bytes_default.i;
      bytes_default.inc(4).str(x).i32(bytes_default.i - prev - 4, prev);
    });
    bytes_default.i16(0);
    return bytes_default.end();
  }
  function Parse(str, parameters, types2, name = "") {
    bytes_default().P().str(name + bytes_default.N).str(str + bytes_default.N).i16(parameters.length);
    parameters.forEach((x, i) => bytes_default.i32(types2[i] || 0));
    return bytes_default.end();
  }
  function Describe(x, name = "") {
    return bytes_default().D().str(x).str(name + bytes_default.N).end();
  }
  function Execute(portal = "", rows2 = 0) {
    return Buffer.concat([
      bytes_default().E().str(portal + bytes_default.N).i32(rows2).end(),
      Flush
    ]);
  }
  function Close(portal = "") {
    return Buffer.concat([
      bytes_default().C().str("P").str(portal + bytes_default.N).end(),
      bytes_default().S().end()
    ]);
  }
  function StartupMessage() {
    return cancelMessage || bytes_default().inc(4).i16(3).z(2).str(
      Object.entries(Object.assign(
        {
          user,
          database,
          client_encoding: "UTF8"
        },
        options.connection
      )).filter(([, v]) => v).map(([k, v]) => k + bytes_default.N + v).join(bytes_default.N)
    ).z(2).end(0);
  }
}
function parseError(x) {
  const error = {};
  let start = 5;
  for (let i = 5; i < x.length - 1; i++) {
    if (x[i] === 0) {
      error[errorFields[x[start]]] = x.toString("utf8", start + 1, i);
      start = i + 1;
    }
  }
  return error;
}
function md5(x) {
  return crypto2.createHash("md5").update(x).digest("hex");
}
function hmac(key, x) {
  return crypto2.createHmac("sha256", key).update(x).digest();
}
function sha256(x) {
  return crypto2.createHash("sha256").update(x).digest();
}
function xor(a, b2) {
  const length = Math.max(a.length, b2.length);
  const buffer2 = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++)
    buffer2[i] = a[i] ^ b2[i];
  return buffer2;
}
function timer(fn, seconds) {
  seconds = typeof seconds === "function" ? seconds() : seconds;
  if (!seconds)
    return { cancel: noop, start: noop };
  let timer2;
  return {
    cancel() {
      timer2 && (clearTimeout(timer2), timer2 = null);
    },
    start() {
      timer2 && clearTimeout(timer2);
      timer2 = setTimeout(done, seconds * 1e3, arguments);
    }
  };
  function done(args) {
    fn.apply(null, args);
    timer2 = null;
  }
}

// node_modules/postgres/src/subscribe.js
var noop2 = () => {
};
function Subscribe(postgres2, options) {
  const subscribers = /* @__PURE__ */ new Map(), slot = "postgresjs_" + Math.random().toString(36).slice(2), state = {};
  let connection2, stream, ended = false;
  const sql = subscribe.sql = postgres2({
    ...options,
    transform: { column: {}, value: {}, row: {} },
    max: 1,
    fetch_types: false,
    idle_timeout: null,
    max_lifetime: null,
    connection: {
      ...options.connection,
      replication: "database"
    },
    onclose: async function() {
      if (ended)
        return;
      stream = null;
      state.pid = state.secret = void 0;
      connected(await init(sql, slot, options.publications));
      subscribers.forEach((event) => event.forEach(({ onsubscribe }) => onsubscribe()));
    },
    no_subscribe: true
  });
  const end = sql.end, close = sql.close;
  sql.end = async () => {
    ended = true;
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return end();
  };
  sql.close = async () => {
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return close();
  };
  return subscribe;
  async function subscribe(event, fn, onsubscribe = noop2, onerror = noop2) {
    event = parseEvent(event);
    if (!connection2)
      connection2 = init(sql, slot, options.publications);
    const subscriber = { fn, onsubscribe };
    const fns = subscribers.has(event) ? subscribers.get(event).add(subscriber) : subscribers.set(event, /* @__PURE__ */ new Set([subscriber])).get(event);
    const unsubscribe = () => {
      fns.delete(subscriber);
      fns.size === 0 && subscribers.delete(event);
    };
    return connection2.then((x) => {
      connected(x);
      onsubscribe();
      stream && stream.on("error", onerror);
      return { unsubscribe, state, sql };
    });
  }
  function connected(x) {
    stream = x.stream;
    state.pid = x.state.pid;
    state.secret = x.state.secret;
  }
  async function init(sql2, slot2, publications) {
    if (!publications)
      throw new Error("Missing publication names");
    const xs = await sql2.unsafe(
      `CREATE_REPLICATION_SLOT ${slot2} TEMPORARY LOGICAL pgoutput NOEXPORT_SNAPSHOT`
    );
    const [x] = xs;
    const stream2 = await sql2.unsafe(
      `START_REPLICATION SLOT ${slot2} LOGICAL ${x.consistent_point} (proto_version '1', publication_names '${publications}')`
    ).writable();
    const state2 = {
      lsn: Buffer.concat(x.consistent_point.split("/").map((x2) => Buffer.from(("00000000" + x2).slice(-8), "hex")))
    };
    stream2.on("data", data);
    stream2.on("error", error);
    stream2.on("close", sql2.close);
    return { stream: stream2, state: xs.state };
    function error(e) {
      console.error("Unexpected error during logical streaming - reconnecting", e);
    }
    function data(x2) {
      if (x2[0] === 119) {
        parse(x2.subarray(25), state2, sql2.options.parsers, handle, options.transform);
      } else if (x2[0] === 107 && x2[17]) {
        state2.lsn = x2.subarray(1, 9);
        pong();
      }
    }
    function handle(a, b2) {
      const path = b2.relation.schema + "." + b2.relation.table;
      call("*", a, b2);
      call("*:" + path, a, b2);
      b2.relation.keys.length && call("*:" + path + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
      call(b2.command, a, b2);
      call(b2.command + ":" + path, a, b2);
      b2.relation.keys.length && call(b2.command + ":" + path + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
    }
    function pong() {
      const x2 = Buffer.alloc(34);
      x2[0] = "r".charCodeAt(0);
      x2.fill(state2.lsn, 1);
      x2.writeBigInt64BE(BigInt(Date.now() - Date.UTC(2e3, 0, 1)) * BigInt(1e3), 25);
      stream2.write(x2);
    }
  }
  function call(x, a, b2) {
    subscribers.has(x) && subscribers.get(x).forEach(({ fn }) => fn(a, b2, x));
  }
}
function Time(x) {
  return new Date(Date.UTC(2e3, 0, 1) + Number(x / BigInt(1e3)));
}
function parse(x, state, parsers2, handle, transform) {
  const char = (acc, [k, v]) => (acc[k.charCodeAt(0)] = v, acc);
  Object.entries({
    R: (x2) => {
      let i = 1;
      const r = state[x2.readUInt32BE(i)] = {
        schema: x2.toString("utf8", i += 4, i = x2.indexOf(0, i)) || "pg_catalog",
        table: x2.toString("utf8", i + 1, i = x2.indexOf(0, i + 1)),
        columns: Array(x2.readUInt16BE(i += 2)),
        keys: []
      };
      i += 2;
      let columnIndex = 0, column;
      while (i < x2.length) {
        column = r.columns[columnIndex++] = {
          key: x2[i++],
          name: transform.column.from ? transform.column.from(x2.toString("utf8", i, i = x2.indexOf(0, i))) : x2.toString("utf8", i, i = x2.indexOf(0, i)),
          type: x2.readUInt32BE(i += 1),
          parser: parsers2[x2.readUInt32BE(i)],
          atttypmod: x2.readUInt32BE(i += 4)
        };
        column.key && r.keys.push(column);
        i += 4;
      }
    },
    Y: () => {
    },
    // Type
    O: () => {
    },
    // Origin
    B: (x2) => {
      state.date = Time(x2.readBigInt64BE(9));
      state.lsn = x2.subarray(1, 9);
    },
    I: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      const { row } = tuples(x2, relation.columns, i += 7, transform);
      handle(row, {
        command: "insert",
        relation
      });
    },
    D: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      handle(
        key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform).row : null,
        {
          command: "delete",
          relation,
          key
        }
      );
    },
    U: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      const xs = key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform) : null;
      xs && (i = xs.i);
      const { row } = tuples(x2, relation.columns, i + 3, transform);
      handle(row, {
        command: "update",
        relation,
        key,
        old: xs && xs.row
      });
    },
    T: () => {
    },
    // Truncate,
    C: () => {
    }
    // Commit
  }).reduce(char, {})[x[0]](x);
}
function tuples(x, columns, xi, transform) {
  let type, column, value;
  const row = transform.raw ? new Array(columns.length) : {};
  for (let i = 0; i < columns.length; i++) {
    type = x[xi++];
    column = columns[i];
    value = type === 110 ? null : type === 117 ? void 0 : column.parser === void 0 ? x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)) : column.parser.array === true ? column.parser(x.toString("utf8", xi + 5, xi += 4 + x.readUInt32BE(xi))) : column.parser(x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)));
    transform.raw ? row[i] = transform.raw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
  }
  return { i: xi, row: transform.row.from ? transform.row.from(row) : row };
}
function parseEvent(x) {
  const xs = x.match(/^(\*|insert|update|delete)?:?([^.]+?\.?[^=]+)?=?(.+)?/i) || [];
  if (!xs)
    throw new Error("Malformed subscribe pattern: " + x);
  const [, command, path, key] = xs;
  return (command || "*") + (path ? ":" + (path.indexOf(".") === -1 ? "public." + path : path) : "") + (key ? "=" + key : "");
}

// node_modules/postgres/src/large.js
import Stream2 from "stream";
function largeObject(sql, oid, mode = 131072 | 262144) {
  return new Promise(async (resolve, reject) => {
    await sql.begin(async (sql2) => {
      let finish;
      !oid && ([{ oid }] = await sql2`select lo_creat(-1) as oid`);
      const [{ fd }] = await sql2`select lo_open(${oid}, ${mode}) as fd`;
      const lo = {
        writable,
        readable,
        close: () => sql2`select lo_close(${fd})`.then(finish),
        tell: () => sql2`select lo_tell64(${fd})`,
        read: (x) => sql2`select loread(${fd}, ${x}) as data`,
        write: (x) => sql2`select lowrite(${fd}, ${x})`,
        truncate: (x) => sql2`select lo_truncate64(${fd}, ${x})`,
        seek: (x, whence = 0) => sql2`select lo_lseek64(${fd}, ${x}, ${whence})`,
        size: () => sql2`
          select
            lo_lseek64(${fd}, location, 0) as position,
            seek.size
          from (
            select
              lo_lseek64($1, 0, 2) as size,
              tell.location
            from (select lo_tell64($1) as location) tell
          ) seek
        `
      };
      resolve(lo);
      return new Promise(async (r) => finish = r);
      async function readable({
        highWaterMark = 2048 * 8,
        start = 0,
        end = Infinity
      } = {}) {
        let max = end - start;
        start && await lo.seek(start);
        return new Stream2.Readable({
          highWaterMark,
          async read(size2) {
            const l = size2 > max ? size2 - max : size2;
            max -= size2;
            const [{ data }] = await lo.read(l);
            this.push(data);
            if (data.length < size2)
              this.push(null);
          }
        });
      }
      async function writable({
        highWaterMark = 2048 * 8,
        start = 0
      } = {}) {
        start && await lo.seek(start);
        return new Stream2.Writable({
          highWaterMark,
          write(chunk, encoding, callback) {
            lo.write(chunk).then(() => callback(), callback);
          }
        });
      }
    }).catch(reject);
  });
}

// node_modules/postgres/src/index.js
Object.assign(Postgres, {
  PostgresError,
  toPascal,
  pascal,
  toCamel,
  camel,
  toKebab,
  kebab,
  fromPascal,
  fromCamel,
  fromKebab,
  BigInt: {
    to: 20,
    from: [20],
    parse: (x) => BigInt(x),
    // eslint-disable-line
    serialize: (x) => x.toString()
  }
});
var src_default = Postgres;
function Postgres(a, b2) {
  const options = parseOptions(a, b2), subscribe = options.no_subscribe || Subscribe(Postgres, { ...options });
  let ending = false;
  const queries = queue_default(), connecting = queue_default(), reserved = queue_default(), closed = queue_default(), ended = queue_default(), open = queue_default(), busy = queue_default(), full = queue_default(), queues = { connecting, reserved, closed, ended, open, busy, full };
  const connections = [...Array(options.max)].map(() => connection_default(options, queues, { onopen, onend, onclose }));
  const sql = Sql(handler2);
  Object.assign(sql, {
    get parameters() {
      return options.parameters;
    },
    largeObject: largeObject.bind(null, sql),
    subscribe,
    CLOSE,
    END: CLOSE,
    PostgresError,
    options,
    reserve,
    listen,
    begin,
    close,
    end
  });
  return sql;
  function Sql(handler3) {
    handler3.debug = options.debug;
    Object.entries(options.types).reduce((acc, [name, type]) => {
      acc[name] = (x) => new Parameter(x, type.to);
      return acc;
    }, typed);
    Object.assign(sql2, {
      types: typed,
      typed,
      unsafe,
      notify,
      array,
      json,
      file
    });
    return sql2;
    function typed(value, type) {
      return new Parameter(value, type);
    }
    function sql2(strings, ...args) {
      const query = strings && Array.isArray(strings.raw) ? new Query(strings, args, handler3, cancel) : typeof strings === "string" && !args.length ? new Identifier(options.transform.column.to ? options.transform.column.to(strings) : strings) : new Builder(strings, args);
      return query;
    }
    function unsafe(string, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([string], args, handler3, cancel, {
        prepare: false,
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
    function file(path, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([], args, (query2) => {
        fs.readFile(path, "utf8", (err, string) => {
          if (err)
            return query2.reject(err);
          query2.strings = [string];
          handler3(query2);
        });
      }, cancel, {
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
  }
  async function listen(name, fn, onlisten) {
    const listener = { fn, onlisten };
    const sql2 = listen.sql || (listen.sql = Postgres({
      ...options,
      max: 1,
      idle_timeout: null,
      max_lifetime: null,
      fetch_types: false,
      onclose() {
        Object.entries(listen.channels).forEach(([name2, { listeners }]) => {
          delete listen.channels[name2];
          Promise.all(listeners.map((l) => listen(name2, l.fn, l.onlisten).catch(() => {
          })));
        });
      },
      onnotify(c, x) {
        c in listen.channels && listen.channels[c].listeners.forEach((l) => l.fn(x));
      }
    }));
    const channels = listen.channels || (listen.channels = {}), exists = name in channels;
    if (exists) {
      channels[name].listeners.push(listener);
      const result2 = await channels[name].result;
      listener.onlisten && listener.onlisten();
      return { state: result2.state, unlisten };
    }
    channels[name] = { result: sql2`listen ${sql2.unsafe('"' + name.replace(/"/g, '""') + '"')}`, listeners: [listener] };
    const result = await channels[name].result;
    listener.onlisten && listener.onlisten();
    return { state: result.state, unlisten };
    async function unlisten() {
      if (name in channels === false)
        return;
      channels[name].listeners = channels[name].listeners.filter((x) => x !== listener);
      if (channels[name].listeners.length)
        return;
      delete channels[name];
      return sql2`unlisten ${sql2.unsafe('"' + name.replace(/"/g, '""') + '"')}`;
    }
  }
  async function notify(channel, payload) {
    return await sql`select pg_notify(${channel}, ${"" + payload})`;
  }
  async function reserve() {
    const queue = queue_default();
    const c = open.length ? open.shift() : await new Promise((resolve, reject) => {
      const query = { reserve: resolve, reject };
      queries.push(query);
      closed.length && connect(closed.shift(), query);
    });
    move(c, reserved);
    c.reserved = () => queue.length ? c.execute(queue.shift()) : move(c, reserved);
    c.reserved.release = true;
    const sql2 = Sql(handler3);
    sql2.release = () => {
      c.reserved = null;
      onopen(c);
    };
    return sql2;
    function handler3(q) {
      c.queue === full ? queue.push(q) : c.execute(q) || move(c, full);
    }
  }
  async function begin(options2, fn) {
    !fn && (fn = options2, options2 = "");
    const queries2 = queue_default();
    let savepoints = 0, connection2, prepare = null;
    try {
      await sql.unsafe("begin " + options2.replace(/[^a-z ]/ig, ""), [], { onexecute }).execute();
      return await Promise.race([
        scope(connection2, fn),
        new Promise((_, reject) => connection2.onclose = reject)
      ]);
    } catch (error) {
      throw error;
    }
    async function scope(c, fn2, name) {
      const sql2 = Sql(handler3);
      sql2.savepoint = savepoint;
      sql2.prepare = (x) => prepare = x.replace(/[^a-z0-9$-_. ]/gi);
      let uncaughtError, result;
      name && await sql2`savepoint ${sql2(name)}`;
      try {
        result = await new Promise((resolve, reject) => {
          const x = fn2(sql2);
          Promise.resolve(Array.isArray(x) ? Promise.all(x) : x).then(resolve, reject);
        });
        if (uncaughtError)
          throw uncaughtError;
      } catch (e) {
        await (name ? sql2`rollback to ${sql2(name)}` : sql2`rollback`);
        throw e instanceof PostgresError && e.code === "25P02" && uncaughtError || e;
      }
      if (!name) {
        prepare ? await sql2`prepare transaction '${sql2.unsafe(prepare)}'` : await sql2`commit`;
      }
      return result;
      function savepoint(name2, fn3) {
        if (name2 && Array.isArray(name2.raw))
          return savepoint((sql3) => sql3.apply(sql3, arguments));
        arguments.length === 1 && (fn3 = name2, name2 = null);
        return scope(c, fn3, "s" + savepoints++ + (name2 ? "_" + name2 : ""));
      }
      function handler3(q) {
        q.catch((e) => uncaughtError || (uncaughtError = e));
        c.queue === full ? queries2.push(q) : c.execute(q) || move(c, full);
      }
    }
    function onexecute(c) {
      connection2 = c;
      move(c, reserved);
      c.reserved = () => queries2.length ? c.execute(queries2.shift()) : move(c, reserved);
    }
  }
  function move(c, queue) {
    c.queue.remove(c);
    queue.push(c);
    c.queue = queue;
    queue === open ? c.idleTimer.start() : c.idleTimer.cancel();
    return c;
  }
  function json(x) {
    return new Parameter(x, 3802);
  }
  function array(x, type) {
    if (!Array.isArray(x))
      return array(Array.from(arguments));
    return new Parameter(x, type || (x.length ? inferType(x) || 25 : 0), options.shared.typeArrayMap);
  }
  function handler2(query) {
    if (ending)
      return query.reject(Errors.connection("CONNECTION_ENDED", options, options));
    if (open.length)
      return go(open.shift(), query);
    if (closed.length)
      return connect(closed.shift(), query);
    busy.length ? go(busy.shift(), query) : queries.push(query);
  }
  function go(c, query) {
    return c.execute(query) ? move(c, busy) : move(c, full);
  }
  function cancel(query) {
    return new Promise((resolve, reject) => {
      query.state ? query.active ? connection_default(options).cancel(query.state, resolve, reject) : query.cancelled = { resolve, reject } : (queries.remove(query), query.cancelled = true, query.reject(Errors.generic("57014", "canceling statement due to user request")), resolve());
    });
  }
  async function end({ timeout = null } = {}) {
    if (ending)
      return ending;
    await 1;
    let timer2;
    return ending = Promise.race([
      new Promise((r) => timeout !== null && (timer2 = setTimeout(destroy, timeout * 1e3, r))),
      Promise.all(connections.map((c) => c.end()).concat(
        listen.sql ? listen.sql.end({ timeout: 0 }) : [],
        subscribe.sql ? subscribe.sql.end({ timeout: 0 }) : []
      ))
    ]).then(() => clearTimeout(timer2));
  }
  async function close() {
    await Promise.all(connections.map((c) => c.end()));
  }
  async function destroy(resolve) {
    await Promise.all(connections.map((c) => c.terminate()));
    while (queries.length)
      queries.shift().reject(Errors.connection("CONNECTION_DESTROYED", options));
    resolve();
  }
  function connect(c, query) {
    move(c, connecting);
    c.connect(query);
    return c;
  }
  function onend(c) {
    move(c, ended);
  }
  function onopen(c) {
    if (queries.length === 0)
      return move(c, open);
    let max = Math.ceil(queries.length / (connecting.length + 1)), ready = true;
    while (ready && queries.length && max-- > 0) {
      const query = queries.shift();
      if (query.reserve)
        return query.reserve(c);
      ready = c.execute(query);
    }
    ready ? move(c, busy) : move(c, full);
  }
  function onclose(c, e) {
    move(c, closed);
    c.reserved = null;
    c.onclose && (c.onclose(e), c.onclose = null);
    options.onclose && options.onclose(c.id);
    queries.length && connect(c, queries.shift());
  }
}
function parseOptions(a, b2) {
  if (a && a.shared)
    return a;
  const env = process.env, o = (!a || typeof a === "string" ? b2 : a) || {}, { url, multihost } = parseUrl(a), query = [...url.searchParams].reduce((a2, [b3, c]) => (a2[b3] = c, a2), {}), host = o.hostname || o.host || multihost || url.hostname || env.PGHOST || "localhost", port = o.port || url.port || env.PGPORT || 5432, user = o.user || o.username || url.username || env.PGUSERNAME || env.PGUSER || osUsername();
  o.no_prepare && (o.prepare = false);
  query.sslmode && (query.ssl = query.sslmode, delete query.sslmode);
  "timeout" in o && (console.log("The timeout option is deprecated, use idle_timeout instead"), o.idle_timeout = o.timeout);
  query.sslrootcert === "system" && (query.ssl = "verify-full");
  const ints = ["idle_timeout", "connect_timeout", "max_lifetime", "max_pipeline", "backoff", "keep_alive"];
  const defaults = {
    max: globalThis.Cloudflare ? 3 : 10,
    ssl: false,
    sslnegotiation: null,
    idle_timeout: null,
    connect_timeout: 30,
    max_lifetime,
    max_pipeline: 100,
    backoff,
    keep_alive: 60,
    prepare: true,
    debug: false,
    fetch_types: true,
    publications: "alltables",
    target_session_attrs: null
  };
  return {
    host: Array.isArray(host) ? host : host.split(",").map((x) => x.split(":")[0]),
    port: Array.isArray(port) ? port : host.split(",").map((x) => parseInt(x.split(":")[1] || port)),
    path: o.path || host.indexOf("/") > -1 && host + "/.s.PGSQL." + port,
    database: o.database || o.db || (url.pathname || "").slice(1) || env.PGDATABASE || user,
    user,
    pass: o.pass || o.password || url.password || env.PGPASSWORD || "",
    ...Object.entries(defaults).reduce(
      (acc, [k, d]) => {
        const value = k in o ? o[k] : k in query ? query[k] === "disable" || query[k] === "false" ? false : query[k] : env["PG" + k.toUpperCase()] || d;
        acc[k] = typeof value === "string" && ints.includes(k) ? +value : value;
        return acc;
      },
      {}
    ),
    connection: {
      application_name: env.PGAPPNAME || "postgres.js",
      ...o.connection,
      ...Object.entries(query).reduce((acc, [k, v]) => (k in defaults || (acc[k] = v), acc), {})
    },
    types: o.types || {},
    target_session_attrs: tsa(o, url, env),
    onnotice: o.onnotice,
    onnotify: o.onnotify,
    onclose: o.onclose,
    onparameter: o.onparameter,
    socket: o.socket,
    transform: parseTransform(o.transform || { undefined: void 0 }),
    parameters: {},
    shared: { retries: 0, typeArrayMap: {} },
    ...mergeUserTypes(o.types)
  };
}
function tsa(o, url, env) {
  const x = o.target_session_attrs || url.searchParams.get("target_session_attrs") || env.PGTARGETSESSIONATTRS;
  if (!x || ["read-write", "read-only", "primary", "standby", "prefer-standby"].includes(x))
    return x;
  throw new Error("target_session_attrs " + x + " is not supported");
}
function backoff(retries) {
  return (0.5 + Math.random() / 2) * Math.min(3 ** retries / 100, 20);
}
function max_lifetime() {
  return 60 * (30 + Math.random() * 30);
}
function parseTransform(x) {
  return {
    undefined: x.undefined,
    column: {
      from: typeof x.column === "function" ? x.column : x.column && x.column.from,
      to: x.column && x.column.to
    },
    value: {
      from: typeof x.value === "function" ? x.value : x.value && x.value.from,
      to: x.value && x.value.to
    },
    row: {
      from: typeof x.row === "function" ? x.row : x.row && x.row.from,
      to: x.row && x.row.to
    }
  };
}
function parseUrl(url) {
  if (!url || typeof url !== "string")
    return { url: { searchParams: /* @__PURE__ */ new Map() } };
  let host = url;
  host = host.slice(host.indexOf("://") + 3).split(/[?/]/)[0];
  host = decodeURIComponent(host.slice(host.indexOf("@") + 1));
  const urlObj = new URL(url.replace(host, host.split(",")[0]));
  return {
    url: {
      username: decodeURIComponent(urlObj.username),
      password: decodeURIComponent(urlObj.password),
      host: urlObj.host,
      hostname: urlObj.hostname,
      port: urlObj.port,
      pathname: urlObj.pathname,
      searchParams: urlObj.searchParams
    },
    multihost: host.indexOf(",") > -1 && host
  };
}
function osUsername() {
  try {
    return os.userInfo().username;
  } catch (_) {
    return process.env.USERNAME || process.env.USER || process.env.LOGNAME;
  }
}

// src/lib/pgdb.ts
var BOOL_COLS = "is_active|is_default|is_admin|is_demo|slip_verified|no_slip";
function translateSql(sql) {
  let s = sql;
  s = s.replace(new RegExp(`\\b(${BOOL_COLS})\\s*=\\s*1\\b`, "g"), "$1 = true");
  s = s.replace(new RegExp(`\\b(${BOOL_COLS})\\s*=\\s*0\\b`, "g"), "$1 = false");
  s = s.replace(/julianday\('now'\)/gi, "(extract(epoch from now())/86400.0 + 2440587.5)");
  s = s.replace(/julianday\(([a-zA-Z0-9_.]+)\)/gi, "(extract(epoch from ($1)::timestamptz)/86400.0 + 2440587.5)");
  s = s.replace(/GROUP_CONCAT\(\s*([^,()]+)\s*,\s*('[^']*')\s*\)/gi, "string_agg(($1)::text, $2)");
  s = s.replace(/GROUP_CONCAT\(\s*([^,()]+)\s*\)/gi, "string_agg(($1)::text, ',')");
  s = s.replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO");
  s = s.replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO");
  return s;
}
function numberPlaceholders(sql) {
  let out = "", n = 0, inStr = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      out += ch;
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = ch;
      out += ch;
      continue;
    }
    if (ch === "?") {
      n++;
      out += "$" + n;
      continue;
    }
    out += ch;
  }
  return out;
}
function isInsert(sql) {
  return /^\s*insert\b/i.test(sql) && !/returning/i.test(sql);
}
var PgStatement = class _PgStatement {
  constructor(client, sqlText, params = []) {
    this.client = client;
    this.sqlText = sqlText;
    this.params = params;
  }
  client;
  sqlText;
  params;
  bind(...args) {
    return new _PgStatement(this.client, this.sqlText, args);
  }
  prepared() {
    let text = numberPlaceholders(translateSql(this.sqlText));
    if (isInsert(text)) text += " RETURNING id";
    return { text, params: this.params };
  }
  async all() {
    const { text, params } = this.prepared();
    const rows = await this.client.unsafe(text, params);
    return {
      results: rows,
      success: true,
      meta: { last_row_id: rows[0]?.id ?? null, changes: rows.count ?? rows.length, duration: 0 }
    };
  }
  async first() {
    const r = await this.all();
    return r.results[0] ?? null;
  }
  async run() {
    return this.all();
  }
  async raw() {
    const r = await this.all();
    return r.results.map((row) => Object.values(row));
  }
};
function createPgD1(databaseUrl) {
  const client = src_default(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connection: { search_path: "golfwing,public" }
  });
  return {
    prepare(sql) {
      return new PgStatement(client, sql);
    },
    async batch(stmts) {
      const out = [];
      for (const st of stmts) out.push(await st.run());
      return out;
    },
    async exec(sql) {
      await client.unsafe(translateSql(sql));
      return { count: 1, duration: 0 };
    }
  };
}

// src/vercel-entry.ts
var db = null;
var handler = async (req) => {
  if (!db) db = createPgD1(process.env.GW_DATABASE_URL || "");
  const env = { ...process.env, DB: db };
  return app3.fetch(req, env);
};
var GET = handler;
var POST = handler;
var PUT = handler;
var PATCH = handler;
var DELETE = handler;
var OPTIONS = handler;
var HEAD = handler;
export {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT
};
