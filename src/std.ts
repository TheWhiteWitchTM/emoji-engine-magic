/**
 * Words every compiled script can call.
 * The text is plain JavaScript. A module imports it. A packed app inlines it.
 */
export const PRELUDE_SOURCE = `function __magic_text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return value.name ? value.name : 'fn';
  return String(value);
}

function __magic_cat(a, b) {
  return __magic_text(a) + __magic_text(b);
}

function __magic_len(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return Array.from(value).length;
  if (typeof value === 'function') return value.length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function __magic_iter(value) {
  if (typeof value === 'string') return Array.from(value);
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}

function __magic_inits(ctor, self) {
  const chain = [];
  let current = ctor;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = current.__magicParent || null;
  }
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const init = chain[i].__magicInit;
    if (typeof init === 'function') init.call(self);
  }
}

function __magic_super(parent, self, args) {
  const fn = parent && parent.prototype && parent.prototype.__magicNew;
  if (typeof fn === 'function') return fn.apply(self, args);
  return null;
}

function __magic_print(...args) {
  if (args.length === 0) {
    console.log('');
    return;
  }
  console.log(args.map(__magic_text).join('\\t'));
}

function __magic_num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function __magic_int(value) {
  const n = __magic_num(value);
  return n === null ? null : Math.trunc(n);
}

function __magic_type(value) {
  if (value === null || value === undefined) return 'nil';
  if (Array.isArray(value)) return 'list';
  const kind = typeof value;
  if (kind === 'number') return 'number';
  if (kind === 'string') return 'string';
  if (kind === 'boolean') return 'bool';
  if (kind === 'function') return 'fn';
  if (kind === 'object') {
    const proto = Object.getPrototypeOf(value);
    const ctor = proto && proto.constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name !== '' && ctor.name !== 'Object') {
      return ctor.name;
    }
    return 'record';
  }
  return kind;
}

function __magic_keys(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value);
  return [];
}

function __magic_values(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function __magic_push(list, item) {
  if (!Array.isArray(list)) throw new Error('push expects a list');
  list.push(item);
  return item;
}

function __magic_pop(list) {
  if (!Array.isArray(list)) throw new Error('pop expects a list');
  const item = list.pop();
  return item === undefined ? null : item;
}

function __magic_time() {
  return Date.now();
}

function __magic_raise(value) {
  if (value instanceof Error) return value;
  const text = __magic_text(value);
  const err = new Error(text === '' ? 'error' : text);
  if (value && typeof value === 'object') {
    err.cause = value;
    if (typeof value.message === 'string' && value.message !== '') err.message = value.message;
  }
  return err;
}

function __magic_error(message) {
  return new Error(__magic_text(message));
}

function __magic_sleep(ms) {
  const n = Number(ms);
  const wait = Number.isFinite(n) && n > 0 ? n : 0;
  return new Promise(function (resolve) {
    setTimeout(resolve, wait);
  });
}

function __magic_decode(res, spec, kind) {
  const want = kind || (/\\.json($|\\?)/i.test(spec) ? 'json' : 'text');
  if (want === 'json') return res.json();
  if (want === 'bytes') {
    return res.arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }
  return res.text();
}

function __magic_load(url, as) {
  const spec = url == null ? '' : String(url);
  const kind = as == null ? '' : String(as);
  const hook = globalThis.__magic_load_hook;
  if (typeof hook === 'function') return Promise.resolve(hook(spec, kind));
  return fetch(spec).then(function (res) {
    if (!res.ok) throw new Error('cannot load ' + spec);
    return __magic_decode(res, spec, kind);
  });
}
`;

/** Names the prelude defines, in import order. `type` in Magic is `__magic_type` in JavaScript. */
export const PRELUDE_EXPORTS = [
  '__magic_print',
  '__magic_len',
  '__magic_text',
  '__magic_num',
  '__magic_int',
  '__magic_type',
  '__magic_keys',
  '__magic_values',
  '__magic_push',
  '__magic_pop',
  '__magic_time',
  '__magic_cat',
  '__magic_iter',
  '__magic_inits',
  '__magic_super',
  '__magic_raise',
  '__magic_error',
  '__magic_sleep',
  '__magic_load',
] as const;

/** Magic spelling → JavaScript binding. Users cannot declare these JavaScript names. */
export const BUILTIN_JS: Record<string, string> = {
  print: '__magic_print',
  len: '__magic_len',
  str: '__magic_text',
  num: '__magic_num',
  int: '__magic_int',
  type: '__magic_type',
  keys: '__magic_keys',
  values: '__magic_values',
  push: '__magic_push',
  pop: '__magic_pop',
  time: '__magic_time',
  error: '__magic_error',
  sleep: '__magic_sleep',
  load: '__magic_load',
};

export const BUILTIN_NAMES = [
  'print',
  'len',
  'str',
  'num',
  'int',
  'type',
  'keys',
  'values',
  'push',
  'pop',
  'time',
  'error',
  'sleep',
  'load',
] as const;

/** An ES module whose exports are the prelude words. */
export function preludeModuleSource(): string {
  const body = PRELUDE_SOURCE;
  const tail = PRELUDE_EXPORTS.map((name) => `export { ${name} };`).join('\n');
  return `${body}\n${tail}\n`;
}

/** Function declarations for an IIFE that already wraps the script. */
export function preludeInlineSource(): string {
  return PRELUDE_SOURCE;
}
