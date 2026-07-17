/** Plain-English regex tokenizer and cheat sheet data. Pure functions, no React. */

export interface ExplainedToken {
  token: string;
  meaning: string;
}

const ESCAPE_MEANINGS: Record<string, string> = {
  d: "Any digit, 0 to 9",
  D: "Any character that is not a digit",
  w: "Word character: letter, digit, or underscore",
  W: "Any character that is not a word character",
  s: "Whitespace character: space, tab, newline",
  S: "Any character that is not whitespace",
  b: "Word boundary",
  B: "Position that is not a word boundary",
  n: "Newline character",
  t: "Tab character",
  r: "Carriage return",
  f: "Form feed",
  v: "Vertical tab",
  "0": "NUL character",
};

function quantifierMeaning(base: string): string {
  if (base === "*") return "Previous item repeated zero or more times";
  if (base === "+") return "Previous item repeated one or more times";
  if (base === "?") return "Previous item is optional, zero or one time";
  const m = /^\{(\d+)(,(\d*))?\}$/.exec(base);
  if (m) {
    if (m[2] === undefined) return `Previous item repeated exactly ${m[1]} times`;
    if (m[3] === "") return `Previous item repeated ${m[1]} or more times`;
    return `Previous item repeated ${m[1]} to ${m[3]} times`;
  }
  return "Quantifier";
}

/** Splits a regex source string into constructs, each with a short meaning. */
export function explainRegex(source: string): ExplainedToken[] {
  const out: ExplainedToken[] = [];
  let i = 0;

  const pushLiteralRun = (run: string) => {
    if (run.length === 1) out.push({ token: run, meaning: `The character "${run}"` });
    else out.push({ token: run, meaning: `The literal text "${run}"` });
  };

  while (i < source.length) {
    const ch = source[i];

    if (ch === "\\") {
      const next = source[i + 1];
      if (next === undefined) {
        out.push({ token: "\\", meaning: "Trailing backslash, incomplete escape" });
        i++;
      } else if (/[1-9]/.test(next)) {
        let j = i + 1;
        while (j < source.length && /\d/.test(source[j])) j++;
        const token = source.slice(i, j);
        out.push({ token, meaning: `Backreference to capturing group ${token.slice(1)}` });
        i = j;
      } else if (next === "k" && source[i + 2] === "<") {
        const end = source.indexOf(">", i + 3);
        const token = end === -1 ? source.slice(i) : source.slice(i, end + 1);
        out.push({ token, meaning: "Backreference to a named capturing group" });
        i += token.length;
      } else if (next === "u" || next === "x") {
        let token = source.slice(i, i + 2);
        if (next === "u" && source[i + 2] === "{") {
          const end = source.indexOf("}", i + 3);
          token = end === -1 ? source.slice(i) : source.slice(i, end + 1);
        } else {
          const len = next === "u" ? 4 : 2;
          token = source.slice(i, i + 2 + len);
        }
        out.push({ token, meaning: "Character by hex code" });
        i += token.length;
      } else if (next === "p" || next === "P") {
        let token = source.slice(i, i + 2);
        if (source[i + 2] === "{") {
          const end = source.indexOf("}", i + 3);
          token = end === -1 ? source.slice(i) : source.slice(i, end + 1);
        }
        out.push({
          token,
          meaning:
            next === "p"
              ? "Character with a Unicode property (needs u flag)"
              : "Character without a Unicode property (needs u flag)",
        });
        i += token.length;
      } else if (ESCAPE_MEANINGS[next]) {
        out.push({ token: `\\${next}`, meaning: ESCAPE_MEANINGS[next] });
        i += 2;
      } else {
        out.push({ token: `\\${next}`, meaning: `Escaped literal "${next}"` });
        i += 2;
      }
      continue;
    }

    if (ch === "[") {
      let j = i + 1;
      const negated = source[j] === "^";
      if (negated) j++;
      if (source[j] === "]") j++;
      while (j < source.length && source[j] !== "]") {
        if (source[j] === "\\") j++;
        j++;
      }
      const token = source.slice(i, Math.min(j + 1, source.length));
      out.push({
        token,
        meaning: negated
          ? "Any single character not in this set"
          : "Any single character from this set",
      });
      i += token.length;
      continue;
    }

    if (ch === "(") {
      if (source.startsWith("(?:", i)) {
        out.push({ token: "(?:", meaning: "Start of a non-capturing group" });
        i += 3;
      } else if (source.startsWith("(?=", i)) {
        out.push({ token: "(?=", meaning: "Lookahead: the following must match here, without consuming it" });
        i += 3;
      } else if (source.startsWith("(?!", i)) {
        out.push({ token: "(?!", meaning: "Negative lookahead: the following must not match here" });
        i += 3;
      } else if (source.startsWith("(?<=", i)) {
        out.push({ token: "(?<=", meaning: "Lookbehind: the preceding text must match this" });
        i += 4;
      } else if (source.startsWith("(?<!", i)) {
        out.push({ token: "(?<!", meaning: "Negative lookbehind: the preceding text must not match this" });
        i += 4;
      } else if (source.startsWith("(?<", i)) {
        const end = source.indexOf(">", i + 3);
        const token = end === -1 ? source.slice(i) : source.slice(i, end + 1);
        const name = end === -1 ? "?" : source.slice(i + 3, end);
        out.push({ token, meaning: `Start of a capturing group named "${name}"` });
        i += token.length;
      } else {
        out.push({ token: "(", meaning: "Start of a capturing group" });
        i++;
      }
      continue;
    }

    if (ch === ")") {
      out.push({ token: ")", meaning: "End of group" });
      i++;
      continue;
    }

    if (ch === "^") {
      out.push({ token: "^", meaning: "Start of string, or start of line with the m flag" });
      i++;
      continue;
    }

    if (ch === "$") {
      out.push({ token: "$", meaning: "End of string, or end of line with the m flag" });
      i++;
      continue;
    }

    if (ch === "|") {
      out.push({ token: "|", meaning: "Alternation: match either the left or the right side" });
      i++;
      continue;
    }

    if (ch === ".") {
      out.push({ token: ".", meaning: "Any character except newline (any at all with the s flag)" });
      i++;
      continue;
    }

    if (ch === "*" || ch === "+" || ch === "?" || ch === "{") {
      let base = ch;
      if (ch === "{") {
        const m = /^\{\d+(,\d*)?\}/.exec(source.slice(i));
        if (!m) {
          pushLiteralRun("{");
          i++;
          continue;
        }
        base = m[0];
      }
      let token = base;
      let meaning = quantifierMeaning(base);
      if (source[i + base.length] === "?") {
        token += "?";
        meaning += ", lazy (matches as little as possible)";
      }
      out.push({ token, meaning });
      i += token.length;
      continue;
    }

    // Literal run: consume until the next special character.
    let j = i;
    while (j < source.length && !/[\\[\](){}^$|.*+?]/.test(source[j])) j++;
    if (j === i) j = i + 1;
    // Keep the last literal free if a quantifier follows, so "ab+" reads as "a", "b", "+".
    let run = source.slice(i, j);
    if (run.length > 1 && j < source.length && /[*+?{]/.test(source[j])) {
      run = run.slice(0, -1);
      j--;
    }
    pushLiteralRun(run);
    i = j;
  }

  return out;
}

export interface CheatRow {
  token: string;
  desc: string;
}

export const CHEAT_SHEET: { group: string; rows: CheatRow[] }[] = [
  {
    group: "Character Classes",
    rows: [
      { token: ".", desc: "Any character except newline" },
      { token: "\\d", desc: "Digit, 0 to 9" },
      { token: "\\w", desc: "Word character: letter, digit, underscore" },
      { token: "\\s", desc: "Whitespace: space, tab, newline" },
      { token: "\\D \\W \\S", desc: "Negated versions of the above" },
      { token: "[abc]", desc: "One of a, b, or c" },
      { token: "[^abc]", desc: "Any character except a, b, or c" },
      { token: "[a-z0-9]", desc: "Character in a range" },
    ],
  },
  {
    group: "Anchors",
    rows: [
      { token: "^", desc: "Start of string, or line with m flag" },
      { token: "$", desc: "End of string, or line with m flag" },
      { token: "\\b", desc: "Word boundary" },
      { token: "\\B", desc: "Not a word boundary" },
    ],
  },
  {
    group: "Quantifiers",
    rows: [
      { token: "*", desc: "Zero or more times" },
      { token: "+", desc: "One or more times" },
      { token: "?", desc: "Zero or one time, optional" },
      { token: "{3}", desc: "Exactly 3 times" },
      { token: "{2,}", desc: "2 or more times" },
      { token: "{2,5}", desc: "Between 2 and 5 times" },
      { token: "+? *? ??", desc: "Lazy: match as little as possible" },
    ],
  },
  {
    group: "Groups & Lookaround",
    rows: [
      { token: "(abc)", desc: "Capturing group" },
      { token: "(?:abc)", desc: "Non-capturing group" },
      { token: "(?<name>abc)", desc: "Named capturing group" },
      { token: "\\1", desc: "Backreference to group 1" },
      { token: "a|b", desc: "Match a or b" },
      { token: "(?=abc)", desc: "Lookahead: followed by abc" },
      { token: "(?!abc)", desc: "Negative lookahead: not followed by abc" },
      { token: "(?<=abc)", desc: "Lookbehind: preceded by abc" },
      { token: "(?<!abc)", desc: "Negative lookbehind: not preceded by abc" },
    ],
  },
];
