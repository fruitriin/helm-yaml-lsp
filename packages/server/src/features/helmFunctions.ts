/**
 * Helm Built-in Functions Catalog
 *
 * Catalog of Helm and Sprig template functions:
 * - Function signatures and descriptions
 * - Categorized by functionality
 * - Used for hover and completion support
 */

/**
 * Function category
 */
export type FunctionCategory =
  | 'string'
  | 'conversion'
  | 'default'
  | 'list'
  | 'dict'
  | 'logic'
  | 'math'
  | 'encoding'
  | 'date'
  | 'crypto'
  | 'other';

/**
 * Helm function definition
 */
export type HelmFunction = {
  /** Function name */
  name: string;
  /** Function signature */
  signature: string;
  /** Description */
  description: string;
  /** Category */
  category: FunctionCategory;
  /** Usage examples (optional) */
  examples?: string[];
};

/**
 * Catalog of all Helm built-in functions
 */
export const HELM_FUNCTIONS: readonly HelmFunction[] = [
  // ===== String Functions =====
  {
    name: 'quote',
    signature: 'quote VALUE',
    description: 'Wraps a string in double quotes',
    category: 'string',
    examples: ['{{ .Values.name | quote }}  # "myapp"'],
  },
  {
    name: 'squote',
    signature: 'squote VALUE',
    description: 'Wraps a string in single quotes',
    category: 'string',
    examples: ["{{ .Values.name | squote }}  # 'myapp'"],
  },
  {
    name: 'cat',
    signature: 'cat STRING1 STRING2 ...',
    description: 'Concatenates multiple strings with spaces',
    category: 'string',
    examples: ['{{ cat "hello" "world" }}  # "hello world"'],
  },
  {
    name: 'indent',
    signature: 'indent COUNT STRING',
    description: 'Indents every line in a string to the specified number of spaces',
    category: 'string',
    examples: ['{{ .Values.config | toYaml | indent 4 }}'],
  },
  {
    name: 'nindent',
    signature: 'nindent COUNT STRING',
    description: 'Same as indent but prepends a new line',
    category: 'string',
    examples: ['{{ .Values.config | toYaml | nindent 4 }}'],
  },
  {
    name: 'trim',
    signature: 'trim STRING',
    description: 'Removes whitespace from both sides of a string',
    category: 'string',
    examples: ['{{ trim "  hello  " }}  # "hello"'],
  },
  {
    name: 'trimSuffix',
    signature: 'trimSuffix SUFFIX STRING',
    description: 'Removes a suffix from a string',
    category: 'string',
    examples: ['{{ "hello-world" | trimSuffix "-world" }}  # "hello"'],
  },
  {
    name: 'trimPrefix',
    signature: 'trimPrefix PREFIX STRING',
    description: 'Removes a prefix from a string',
    category: 'string',
    examples: ['{{ "hello-world" | trimPrefix "hello-" }}  # "world"'],
  },
  {
    name: 'upper',
    signature: 'upper STRING',
    description: 'Converts a string to uppercase',
    category: 'string',
    examples: ['{{ "hello" | upper }}  # "HELLO"'],
  },
  {
    name: 'lower',
    signature: 'lower STRING',
    description: 'Converts a string to lowercase',
    category: 'string',
    examples: ['{{ "HELLO" | lower }}  # "hello"'],
  },
  {
    name: 'title',
    signature: 'title STRING',
    description: 'Converts a string to title case',
    category: 'string',
    examples: ['{{ "hello world" | title }}  # "Hello World"'],
  },
  {
    name: 'repeat',
    signature: 'repeat COUNT STRING',
    description: 'Repeats a string COUNT times',
    category: 'string',
    examples: ['{{ "hello" | repeat 3 }}  # "hellohellohello"'],
  },
  {
    name: 'replace',
    signature: 'replace OLD NEW STRING',
    description: 'Replaces all occurrences of OLD with NEW in STRING',
    category: 'string',
    examples: ['{{ "hello-world" | replace "-" "_" }}  # "hello_world"'],
  },

  // ===== Conversion Functions =====
  {
    name: 'toYaml',
    signature: 'toYaml VALUE',
    description: 'Converts a value to YAML format',
    category: 'conversion',
    examples: ['{{ .Values.config | toYaml }}'],
  },
  {
    name: 'toJson',
    signature: 'toJson VALUE',
    description: 'Converts a value to JSON format',
    category: 'conversion',
    examples: ['{{ .Values.config | toJson }}'],
  },
  {
    name: 'fromYaml',
    signature: 'fromYaml STRING',
    description: 'Parses a YAML string into a structure',
    category: 'conversion',
    examples: ['{{ .Files.Get "config.yaml" | fromYaml }}'],
  },
  {
    name: 'fromJson',
    signature: 'fromJson STRING',
    description: 'Parses a JSON string into a structure',
    category: 'conversion',
    examples: ['{{ .Files.Get "config.json" | fromJson }}'],
  },
  {
    name: 'toString',
    signature: 'toString VALUE',
    description: 'Converts a value to a string',
    category: 'conversion',
    examples: ['{{ 123 | toString }}  # "123"'],
  },
  {
    name: 'toDate',
    signature: 'toDate FORMAT STRING',
    description: 'Converts a string to a date using the specified format',
    category: 'conversion',
    examples: ['{{ "2006-01-02" | toDate "2020-01-01" }}'],
  },
  {
    name: 'int',
    signature: 'int VALUE',
    description: 'Converts a value to an integer',
    category: 'conversion',
    examples: ['{{ "123" | int }}  # 123'],
  },
  {
    name: 'float64',
    signature: 'float64 VALUE',
    description: 'Converts a value to a float64',
    category: 'conversion',
    examples: ['{{ "123.45" | float64 }}  # 123.45'],
  },

  // ===== Default and Required Functions =====
  {
    name: 'default',
    signature: 'default DEFAULT_VALUE GIVEN_VALUE',
    description: 'Returns DEFAULT_VALUE if GIVEN_VALUE is empty, nil, 0, or false',
    category: 'default',
    examples: ['{{ .Values.image.tag | default "latest" }}'],
  },
  {
    name: 'required',
    signature: 'required MESSAGE VALUE',
    description: 'Fails template rendering with MESSAGE if VALUE is empty',
    category: 'default',
    examples: ['{{ required "image.repository is required" .Values.image.repository }}'],
  },
  {
    name: 'empty',
    signature: 'empty VALUE',
    description: 'Returns true if VALUE is empty',
    category: 'default',
    examples: ['{{ if empty .Values.name }}...{{ end }}'],
  },
  {
    name: 'fail',
    signature: 'fail MESSAGE',
    description: 'Unconditionally fails template rendering with MESSAGE',
    category: 'default',
    examples: ['{{ fail "Unsupported configuration" }}'],
  },

  // ===== List Functions =====
  {
    name: 'list',
    signature: 'list ITEM1 ITEM2 ...',
    description: 'Creates a list from arguments',
    category: 'list',
    examples: ['{{ list "a" "b" "c" }}  # [a, b, c]'],
  },
  {
    name: 'first',
    signature: 'first LIST',
    description: 'Returns the first item of a list',
    category: 'list',
    examples: ['{{ list "a" "b" "c" | first }}  # "a"'],
  },
  {
    name: 'last',
    signature: 'last LIST',
    description: 'Returns the last item of a list',
    category: 'list',
    examples: ['{{ list "a" "b" "c" | last }}  # "c"'],
  },
  {
    name: 'append',
    signature: 'append LIST ITEM',
    description: 'Appends an item to a list',
    category: 'list',
    examples: ['{{ list "a" "b" | append "c" }}  # [a, b, c]'],
  },
  {
    name: 'prepend',
    signature: 'prepend LIST ITEM',
    description: 'Prepends an item to a list',
    category: 'list',
    examples: ['{{ list "b" "c" | prepend "a" }}  # [a, b, c]'],
  },
  {
    name: 'slice',
    signature: 'slice LIST FROM TO',
    description: 'Returns a slice of a list',
    category: 'list',
    examples: ['{{ list "a" "b" "c" "d" | slice 1 3 }}  # [b, c]'],
  },
  {
    name: 'has',
    signature: 'has ITEM LIST',
    description: 'Checks if a list contains an item',
    category: 'list',
    examples: ['{{ has "b" (list "a" "b" "c") }}  # true'],
  },
  {
    name: 'compact',
    signature: 'compact LIST',
    description: 'Removes empty/nil items from a list',
    category: 'list',
    examples: ['{{ list "a" "" "b" nil "c" | compact }}  # [a, b, c]'],
  },
  {
    name: 'uniq',
    signature: 'uniq LIST',
    description: 'Removes duplicate items from a list',
    category: 'list',
    examples: ['{{ list "a" "b" "a" "c" | uniq }}  # [a, b, c]'],
  },

  // ===== Dictionary Functions =====
  {
    name: 'dict',
    signature: 'dict KEY1 VALUE1 KEY2 VALUE2 ...',
    description: 'Creates a dictionary from key-value pairs',
    category: 'dict',
    examples: ['{{ dict "name" "myapp" "version" "1.0" }}'],
  },
  {
    name: 'get',
    signature: 'get DICT KEY',
    description: 'Gets a value from a dictionary by key',
    category: 'dict',
    examples: ['{{ get $mydict "name" }}'],
  },
  {
    name: 'set',
    signature: 'set DICT KEY VALUE',
    description: 'Sets a value in a dictionary',
    category: 'dict',
    examples: ['{{ $d := set $mydict "name" "newapp" }}'],
  },
  {
    name: 'unset',
    signature: 'unset DICT KEY',
    description: 'Removes a key from a dictionary',
    category: 'dict',
    examples: ['{{ $d := unset $mydict "name" }}'],
  },
  {
    name: 'hasKey',
    signature: 'hasKey DICT KEY',
    description: 'Checks if a dictionary has a key',
    category: 'dict',
    examples: ['{{ if hasKey $mydict "name" }}...{{ end }}'],
  },
  {
    name: 'pluck',
    signature: 'pluck KEY DICT1 DICT2 ...',
    description: 'Extracts a specific key from multiple dictionaries',
    category: 'dict',
    examples: ['{{ pluck "name" $dict1 $dict2 }}'],
  },
  {
    name: 'merge',
    signature: 'merge DEST SOURCE1 SOURCE2 ...',
    description: 'Merges dictionaries (last value wins)',
    category: 'dict',
    examples: ['{{ merge $defaults $overrides }}'],
  },
  {
    name: 'mergeOverwrite',
    signature: 'mergeOverwrite DEST SOURCE1 SOURCE2 ...',
    description: 'Merges dictionaries recursively',
    category: 'dict',
    examples: ['{{ mergeOverwrite $defaults $overrides }}'],
  },

  // ===== Logic Functions =====
  {
    name: 'ternary',
    signature: 'ternary TRUE_VALUE FALSE_VALUE CONDITION',
    description: 'Returns TRUE_VALUE if CONDITION is true, else FALSE_VALUE',
    category: 'logic',
    examples: ['{{ ternary "enabled" "disabled" .Values.feature.enabled }}'],
  },
  {
    name: 'and',
    signature: 'and ARG1 ARG2 ...',
    description: 'Returns true if all arguments are true',
    category: 'logic',
    examples: ['{{ and .Values.enabled .Values.ready }}'],
  },
  {
    name: 'or',
    signature: 'or ARG1 ARG2 ...',
    description: 'Returns true if any argument is true',
    category: 'logic',
    examples: ['{{ or .Values.mode1 .Values.mode2 }}'],
  },
  {
    name: 'not',
    signature: 'not ARG',
    description: 'Returns the boolean negation of ARG',
    category: 'logic',
    examples: ['{{ if not .Values.disabled }}...{{ end }}'],
  },

  // ===== Math Functions =====
  {
    name: 'add',
    signature: 'add NUM1 NUM2 ...',
    description: 'Adds numbers',
    category: 'math',
    examples: ['{{ add 1 2 3 }}  # 6'],
  },
  {
    name: 'sub',
    signature: 'sub NUM1 NUM2',
    description: 'Subtracts NUM2 from NUM1',
    category: 'math',
    examples: ['{{ sub 10 3 }}  # 7'],
  },
  {
    name: 'mul',
    signature: 'mul NUM1 NUM2 ...',
    description: 'Multiplies numbers',
    category: 'math',
    examples: ['{{ mul 2 3 4 }}  # 24'],
  },
  {
    name: 'div',
    signature: 'div NUM1 NUM2',
    description: 'Divides NUM1 by NUM2',
    category: 'math',
    examples: ['{{ div 10 2 }}  # 5'],
  },
  {
    name: 'mod',
    signature: 'mod NUM1 NUM2',
    description: 'Returns the modulus of NUM1 divided by NUM2',
    category: 'math',
    examples: ['{{ mod 10 3 }}  # 1'],
  },
  {
    name: 'max',
    signature: 'max NUM1 NUM2 ...',
    description: 'Returns the maximum number',
    category: 'math',
    examples: ['{{ max 1 5 3 }}  # 5'],
  },
  {
    name: 'min',
    signature: 'min NUM1 NUM2 ...',
    description: 'Returns the minimum number',
    category: 'math',
    examples: ['{{ min 1 5 3 }}  # 1'],
  },

  // ===== Encoding Functions =====
  {
    name: 'b64enc',
    signature: 'b64enc STRING',
    description: 'Encodes a string to Base64',
    category: 'encoding',
    examples: ['{{ "hello" | b64enc }}  # "aGVsbG8="'],
  },
  {
    name: 'b64dec',
    signature: 'b64dec STRING',
    description: 'Decodes a Base64 string',
    category: 'encoding',
    examples: ['{{ "aGVsbG8=" | b64dec }}  # "hello"'],
  },
  {
    name: 'urlquery',
    signature: 'urlquery STRING',
    description: 'URL-encodes a string',
    category: 'encoding',
    examples: ['{{ "hello world" | urlquery }}  # "hello+world"'],
  },

  // ===== Crypto Functions =====
  {
    name: 'sha256sum',
    signature: 'sha256sum STRING',
    description: 'Computes SHA256 hash',
    category: 'crypto',
    examples: ['{{ "hello" | sha256sum }}'],
  },
  {
    name: 'sha1sum',
    signature: 'sha1sum STRING',
    description: 'Computes SHA1 hash',
    category: 'crypto',
    examples: ['{{ "hello" | sha1sum }}'],
  },

  // ===== Date Functions =====
  {
    name: 'now',
    signature: 'now',
    description: 'Returns the current time',
    category: 'date',
    examples: ['{{ now }}'],
  },
  {
    name: 'date',
    signature: 'date FORMAT TIME',
    description: 'Formats a time using the specified format',
    category: 'date',
    examples: ['{{ now | date "2006-01-02" }}'],
  },
  {
    name: 'dateInZone',
    signature: 'dateInZone FORMAT TIME TIMEZONE',
    description: 'Formats a time in a specific timezone',
    category: 'date',
    examples: ['{{ now | dateInZone "2006-01-02" "UTC" }}'],
  },

  // ===== Other Functions =====
  {
    name: 'uuidv4',
    signature: 'uuidv4',
    description: 'Generates a random UUID v4',
    category: 'other',
    examples: ['{{ uuidv4 }}  # "550e8400-e29b-41d4-a716-446655440000"'],
  },
  {
    name: 'trunc',
    signature: 'trunc LENGTH STRING',
    description: 'Truncates a string to the specified length',
    category: 'string',
    examples: ['{{ "hello world" | trunc 5 }}  # "hello"'],
  },
  {
    name: 'contains',
    signature: 'contains SUBSTRING STRING',
    description: 'Checks if STRING contains SUBSTRING',
    category: 'string',
    examples: ['{{ contains "world" "hello world" }}  # true'],
  },
];

/**
 * Map of function names to HelmFunction objects for fast lookup
 */
const FUNCTION_MAP = new Map<string, HelmFunction>(HELM_FUNCTIONS.map(fn => [fn.name, fn]));

/**
 * Finds a Helm function by name
 *
 * @param name - Function name
 * @returns HelmFunction if found, undefined otherwise
 */
export function findFunction(name: string): HelmFunction | undefined {
  return FUNCTION_MAP.get(name);
}

/**
 * Gets all functions in a specific category
 *
 * @param category - Function category
 * @returns Array of HelmFunction objects
 */
export function findFunctionsByCategory(category: FunctionCategory): HelmFunction[] {
  return HELM_FUNCTIONS.filter(fn => fn.category === category);
}

/**
 * Gets all function names
 *
 * @returns Array of function names
 */
export function getAllFunctionNames(): string[] {
  return HELM_FUNCTIONS.map(fn => fn.name);
}

/**
 * Gets all functions
 *
 * @returns Array of all HelmFunction objects
 */
export function getAllFunctions(): readonly HelmFunction[] {
  return HELM_FUNCTIONS;
}
