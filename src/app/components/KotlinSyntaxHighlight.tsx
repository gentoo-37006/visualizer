import styles from "../page.module.css";

const KOTLIN_KEYWORDS = new Set([
  "abstract", "actual", "annotation", "as", "break", "by", "catch", "class",
  "companion", "const", "constructor", "continue", "crossinline", "data", "do",
  "dynamic", "else", "enum", "expect", "external", "false", "field", "final",
  "finally", "for", "fun", "get", "if", "import", "in", "infix", "init",
  "inline", "inner", "interface", "internal", "is", "lateinit", "noinline", "null",
  "object", "open", "operator", "out", "override", "package", "param", "private",
  "property", "protected", "public", "receiver", "reified", "return", "sealed", "set",
  "setparam", "super", "suspend", "tailrec", "this", "throw", "true", "try",
  "typealias", "typeof", "val", "var", "vararg", "when", "where", "while",
]);

type KotlinTokenKind = "allianceConstant" | "annotation" | "comment" | "constant" | "keyword" | "number" | "string";

type KotlinToken = {
  text: string;
  kind?: KotlinTokenKind;
};

const TOKEN_PATTERNS: Array<{ kind: KotlinTokenKind; pattern: RegExp }> = [
  { kind: "comment", pattern: /^\/\*[\s\S]*?(?:\*\/|$)/ },
  { kind: "comment", pattern: /^\/\/[^\n]*/ },
  { kind: "string", pattern: /^"""[\s\S]*?(?:"""|$)/ },
  { kind: "string", pattern: /^"(?:\\[\s\S]|[^"\\])*"/ },
  { kind: "string", pattern: /^'(?:\\[\s\S]|[^'\\])*'/ },
  { kind: "annotation", pattern: /^@[A-Za-z_][A-Za-z0-9_]*/ },
  { kind: "number", pattern: /^(?:0[xX][0-9A-Fa-f_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)[uUlLfFdD]*/ },
];

const tokenizeKotlin = (contents: string) => {
  const tokens: KotlinToken[] = [];
  let offset = 0;

  while (offset < contents.length) {
    const remaining = contents.slice(offset);
    const patternMatch = TOKEN_PATTERNS
      .map(({ kind, pattern }) => ({ kind, match: remaining.match(pattern) }))
      .find(({ match }) => match !== null);

    if (patternMatch?.match) {
      tokens.push({ text: patternMatch.match[0], kind: patternMatch.kind });
      offset += patternMatch.match[0].length;
      continue;
    }

    const identifier = remaining.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (identifier) {
      const precedingText = contents.slice(0, offset);
      const kind = KOTLIN_KEYWORDS.has(identifier)
        ? "keyword"
        : /^[A-Z][A-Z0-9_]*$/.test(identifier)
          ? /Alliance\.\s*$/.test(precedingText)
            ? "allianceConstant"
            : "constant"
          : undefined;
      tokens.push({ text: identifier, kind });
      offset += identifier.length;
      continue;
    }

    const plainText = remaining.match(/^[\s.,:;!?+\-*/%=<>&|^~()[\]{}]+/)?.[0] ?? remaining[0];
    tokens.push({ text: plainText });
    offset += plainText.length;
  }

  return tokens;
};

const TOKEN_CLASS_NAMES: Record<KotlinTokenKind, string> = {
  allianceConstant: styles.kotlinAllianceConstant,
  annotation: styles.kotlinAnnotation,
  comment: styles.kotlinComment,
  constant: styles.kotlinConstant,
  keyword: styles.kotlinKeyword,
  number: styles.kotlinNumber,
  string: styles.kotlinString,
};

export function KotlinSyntaxHighlight({ contents }: { contents: string }) {
  return tokenizeKotlin(contents).map((token, index) =>
    token.kind ? (
      <span className={TOKEN_CLASS_NAMES[token.kind]} key={`${index}-${token.kind}`}>
        {token.text}
      </span>
    ) : (
      token.text
    )
  );
}
