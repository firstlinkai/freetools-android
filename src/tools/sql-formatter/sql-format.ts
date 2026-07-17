/**
 * Compact local SQL formatter. Tokenizes with full awareness of string
 * literals, quoted identifiers, and comments, then re-emits either a
 * pretty-printed layout (uppercase keywords, one major clause per line,
 * indented continuations and subqueries) or a minified single line.
 */

type TokType = "word" | "string" | "comment" | "linecomment" | "number" | "punct" | "op";

interface Tok {
  type: TokType;
  text: string;
}

const KEYWORDS = new Set([
  "SELECT", "DISTINCT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "IS", "NULL",
  "LIKE", "ILIKE", "BETWEEN", "EXISTS", "AS", "ON", "JOIN", "INNER", "LEFT",
  "RIGHT", "FULL", "OUTER", "CROSS", "UNION", "ALL", "GROUP", "BY", "HAVING",
  "ORDER", "ASC", "DESC", "NULLS", "FIRST", "LAST", "LIMIT", "OFFSET", "INSERT",
  "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP",
  "ALTER", "ADD", "COLUMN", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE",
  "INDEX", "VIEW", "IF", "CASE", "WHEN", "THEN", "ELSE", "END", "WITH",
  "RECURSIVE", "RETURNING", "DEFAULT", "CONSTRAINT", "CHECK", "USING",
  "NATURAL", "TOP", "TRUE", "FALSE",
]);

/** Uppercased like keywords, but parentheses attach directly: COUNT(*) */
const FUNCTIONS = new Set([
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NULLIF", "CAST", "CONVERT",
  "UPPER", "LOWER", "LENGTH", "SUBSTRING", "SUBSTR", "TRIM", "ROUND", "ABS",
  "NOW", "CONCAT", "REPLACE", "IFNULL",
]);

/** Longest sequences first so LEFT OUTER JOIN wins over LEFT JOIN. */
const CLAUSE_STARTS: string[][] = [
  ["LEFT", "OUTER", "JOIN"], ["RIGHT", "OUTER", "JOIN"], ["FULL", "OUTER", "JOIN"],
  ["LEFT", "JOIN"], ["RIGHT", "JOIN"], ["INNER", "JOIN"], ["FULL", "JOIN"],
  ["CROSS", "JOIN"], ["GROUP", "BY"], ["ORDER", "BY"], ["UNION", "ALL"],
  ["INSERT", "INTO"], ["DELETE", "FROM"],
  ["JOIN"], ["SELECT"], ["FROM"], ["WHERE"], ["HAVING"], ["LIMIT"], ["OFFSET"],
  ["UNION"], ["INSERT"], ["UPDATE"], ["SET"], ["VALUES"], ["DELETE"],
  ["RETURNING"], ["WITH"],
];

export function tokenizeSql(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      let j = sql.indexOf("\n", i);
      if (j === -1) j = sql.length;
      toks.push({ type: "linecomment", text: sql.slice(i, j).trimEnd() });
      i = j;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      let j = sql.indexOf("*/", i + 2);
      j = j === -1 ? sql.length : j + 2;
      toks.push({ type: "comment", text: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "\\" && ch === "'") j += 2; // backslash escape in strings
        else if (sql[j] === ch) {
          if (sql[j + 1] === ch) j += 2; // doubled-quote escape ('' or "")
          else {
            j++;
            break;
          }
        } else j++;
      }
      toks.push({ type: "string", text: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(sql.slice(i));
      const text = m ? m[0] : ch;
      toks.push({ type: "number", text });
      i += text.length;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
      const text = m ? m[0] : ch;
      toks.push({ type: "word", text });
      i += text.length;
      continue;
    }

    if (ch === "(" || ch === ")" || ch === "," || ch === ";") {
      toks.push({ type: "punct", text: ch });
      i++;
      continue;
    }

    const op = /^(?:<>|<=|>=|!=|\|\||::|:=)/.exec(sql.slice(i));
    const text = op ? op[0] : ch;
    toks.push({ type: "op", text });
    i += text.length;
  }
  return toks;
}

function matchClause(toks: Tok[], i: number): string[] | null {
  outer: for (const seq of CLAUSE_STARTS) {
    for (let k = 0; k < seq.length; k++) {
      const t = toks[i + k];
      if (!t || t.type !== "word" || t.text.toUpperCase() !== seq[k]) continue outer;
    }
    return seq;
  }
  return null;
}

function casedWord(text: string): string {
  const upper = text.toUpperCase();
  return KEYWORDS.has(upper) || FUNCTIONS.has(upper) ? upper : text;
}

export function formatSql(sql: string): string {
  const toks = tokenizeSql(sql);
  const lines: string[] = [];
  let cur = "";
  let depth = 0; // subquery nesting
  const parenStack: boolean[] = []; // true = subquery frame, false = plain parens

  const indent = (n: number) => "  ".repeat(Math.max(n, 0));
  const newline = (level: number) => {
    if (cur.trim()) lines.push(cur.trimEnd());
    cur = indent(level);
  };
  const append = (text: string, noSpaceBefore = false) => {
    if (!cur.trim()) {
      cur += text;
      return;
    }
    if (noSpaceBefore || cur.endsWith("(") || cur.endsWith(".")) cur += text;
    else cur += " " + text;
  };
  // Inside plain parentheses (function args, IN lists, VALUES tuples) the
  // clause/comma line-breaking rules are suspended.
  const inPlainParens = () => parenStack.includes(false);

  let i = 0;
  while (i < toks.length) {
    const t = toks[i];

    if (t.type === "word") {
      const upper = t.text.toUpperCase();
      if (!inPlainParens()) {
        const clause = matchClause(toks, i);
        if (clause) {
          newline(depth);
          append(clause.join(" "));
          i += clause.length;
          continue;
        }
        if (upper === "AND" || upper === "OR") {
          newline(depth + 1);
          append(upper);
          i++;
          continue;
        }
      }
      append(casedWord(t.text));
      i++;
      continue;
    }

    if (t.type === "punct") {
      if (t.text === "(") {
        const next = toks[i + 1];
        const isSub =
          next?.type === "word" && (next.text.toUpperCase() === "SELECT" || next.text.toUpperCase() === "WITH");
        const prev = toks[i - 1];
        const attach =
          !!prev && prev.type === "word" && !KEYWORDS.has(prev.text.toUpperCase());
        append("(", attach);
        parenStack.push(isSub);
        if (isSub) {
          depth++;
          newline(depth);
        }
        i++;
        continue;
      }
      if (t.text === ")") {
        const wasSub = parenStack.pop() ?? false;
        if (wasSub) {
          depth = Math.max(depth - 1, 0);
          newline(depth);
        }
        append(")", true);
        i++;
        continue;
      }
      if (t.text === ",") {
        append(",", true);
        if (!inPlainParens()) newline(depth + 1);
        i++;
        continue;
      }
      // ";"
      append(";", true);
      depth = 0;
      parenStack.length = 0;
      newline(0);
      i++;
      continue;
    }

    if (t.type === "linecomment") {
      append(t.text);
      newline(depth); // a -- comment must end its line
      i++;
      continue;
    }

    append(t.text, t.text === "." || t.text === "::");
    i++;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.join("\n");
}

/** Single line, single spaces, comments dropped, keywords uppercased. */
export function minifySql(sql: string): string {
  const toks = tokenizeSql(sql);
  let out = "";
  let prev: Tok | null = null;
  for (const t of toks) {
    if (t.type === "comment" || t.type === "linecomment") continue;
    const text = t.type === "word" ? casedWord(t.text) : t.text;
    if (!out) {
      out = text;
      prev = t;
      continue;
    }
    const attachParen =
      text === "(" && !!prev && prev.type === "word" && !KEYWORDS.has(prev.text.toUpperCase());
    const noSpace =
      attachParen ||
      text === "," ||
      text === ")" ||
      text === ";" ||
      text === "." ||
      text === "::" ||
      out.endsWith("(") ||
      out.endsWith(".") ||
      out.endsWith("::");
    out += noSpace ? text : " " + text;
    prev = t;
  }
  return out;
}
