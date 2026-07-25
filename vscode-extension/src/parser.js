'use strict';

const DEFAULT_KEY_PATTERN =
  '((^|_)(PASSWORD|PASSWD|PASSPHRASE|TOKEN|SECRET|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|AUTH_KEY|CREDENTIALS?)($|_))|^(DATABASE_URL|REDIS_URL|MONGODB_URI|AMQP_URL|BROKER_URL|SENTRY_DSN)$';

const DEFAULT_CONFIG = Object.freeze({
  autoDetect: true,
  keepStart: 3,
  keepEnd: 3,
  labels: ['secret', 'shadow', 'blur'],
  publicLabels: ['public', 'reveal', 'visible'],
  keyPattern: DEFAULT_KEY_PATTERN,
});

function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  return {
    autoDetect: Boolean(merged.autoDetect),
    keepStart: nonNegativeInteger(merged.keepStart, DEFAULT_CONFIG.keepStart),
    keepEnd: nonNegativeInteger(merged.keepEnd, DEFAULT_CONFIG.keepEnd),
    labels: normalizeLabels(merged.labels, DEFAULT_CONFIG.labels),
    publicLabels: normalizeLabels(merged.publicLabels, DEFAULT_CONFIG.publicLabels),
    keyPattern:
      typeof merged.keyPattern === 'string' && merged.keyPattern.length > 0
        ? merged.keyPattern
        : DEFAULT_KEY_PATTERN,
  };
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeLabels(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function compileKeyPattern(pattern) {
  try {
    return { regex: new RegExp(pattern, 'i'), usedFallback: false };
  } catch {
    return { regex: new RegExp(DEFAULT_KEY_PATTERN, 'i'), usedFallback: true };
  }
}

function splitLines(text) {
  if (text.length === 0) {
    return [{ text: '', start: 0, end: 0, newlineLength: 0 }];
  }

  const lines = [];
  let start = 0;

  while (start < text.length) {
    let end = start;
    while (end < text.length && text[end] !== '\n' && text[end] !== '\r') {
      end += 1;
    }

    let newlineLength = 0;
    if (end < text.length) {
      if (text[end] === '\r' && text[end + 1] === '\n') {
        newlineLength = 2;
      } else {
        newlineLength = 1;
      }
    }

    lines.push({ text: text.slice(start, end), start, end, newlineLength });
    start = end + newlineLength;
  }

  if (text.endsWith('\n') || text.endsWith('\r')) {
    lines.push({ text: '', start: text.length, end: text.length, newlineLength: 0 });
  }

  return lines;
}

function parseAssignment(line) {
  const match = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  const [, prefix, key, separator, rest] = match;
  return {
    prefix,
    key,
    separator,
    rest,
    restStart: prefix.length + key.length + separator.length,
  };
}

function splitValueComment(input) {
  let quote = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote === '"') {
      if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '#' && (i === 0 || /\s/.test(input[i - 1]))) {
      return { value: input.slice(0, i), comment: input.slice(i), commentStart: i };
    }
  }

  return { value: input, comment: '', commentStart: input.length };
}

function finalCommentLabel(comment) {
  if (!comment) {
    return '';
  }

  const body = comment.replace(/^\s*#/, '').trim();
  const match = /([A-Za-z0-9_-]+)[,;]?\s*$/.exec(body);
  return match ? match[1].toLowerCase() : '';
}

function shouldRedact(key, comment, config, keyRegex) {
  const label = finalCommentLabel(comment);

  if (label && config.publicLabels.includes(label)) {
    return { redact: false, reason: 'public-label', label };
  }

  if (label && config.labels.includes(label)) {
    return { redact: true, reason: 'secret-label', label };
  }

  if (config.autoDetect && keyRegex.test(key)) {
    return { redact: true, reason: 'key-pattern', label };
  }

  return { redact: false, reason: 'none', label };
}

function findClosingQuote(input, quote, startIndex = 0, escapedAtStart = false) {
  let escaped = escapedAtStart;

  for (let i = startIndex; i < input.length; i += 1) {
    const char = input[i];

    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        return { index: i, escaped: false };
      }
    } else if (char === "'") {
      return { index: i, escaped: false };
    }
  }

  return { index: -1, escaped };
}

function multilineStart(rest) {
  const leadingMatch = /^\s*/.exec(rest);
  const leadingLength = leadingMatch ? leadingMatch[0].length : 0;
  const quote = rest[leadingLength];

  if (quote !== '"' && quote !== "'") {
    return null;
  }

  const close = findClosingQuote(rest, quote, leadingLength + 1);
  if (close.index >= 0) {
    return null;
  }

  return { quote, leadingLength, escaped: close.escaped };
}

function valueCore(value, absoluteStart) {
  const leadingLength = value.length - value.trimStart().length;
  const withoutLeading = value.slice(leadingLength);
  const trailingLength = withoutLeading.length - withoutLeading.trimEnd().length;
  const coreEndInValue = value.length - trailingLength;
  const coreStartInValue = leadingLength;
  const core = value.slice(coreStartInValue, coreEndInValue);

  if (core.length >= 2) {
    const first = core[0];
    const last = core[core.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return {
        start: absoluteStart + coreStartInValue + 1,
        end: absoluteStart + coreEndInValue - 1,
        quoted: true,
      };
    }
  }

  return {
    start: absoluteStart + coreStartInValue,
    end: absoluteStart + coreEndInValue,
    quoted: false,
  };
}

function analyzeDotenv(text, suppliedConfig = {}) {
  const config = normalizeConfig(suppliedConfig);
  const compiled = compileKeyPattern(config.keyPattern);
  const keyRegex = compiled.regex;
  const lines = splitLines(text);
  const secrets = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const assignment = parseAssignment(line.text);
    if (!assignment) {
      continue;
    }

    const multiStart = multilineStart(assignment.rest);
    if (multiStart) {
      let closeLineIndex = -1;
      let closeIndex = -1;
      let escaped = multiStart.escaped;

      for (let candidate = lineIndex + 1; candidate < lines.length; candidate += 1) {
        const close = findClosingQuote(lines[candidate].text, multiStart.quote, 0, escaped);
        if (close.index >= 0) {
          closeLineIndex = candidate;
          closeIndex = close.index;
          break;
        }
        escaped = close.escaped;
      }

      const valueStart =
        line.start + assignment.restStart + multiStart.leadingLength + 1;

      if (closeLineIndex >= 0) {
        const closeLine = lines[closeLineIndex];
        const suffix = closeLine.text.slice(closeIndex + 1);
        const { comment } = splitValueComment(suffix);
        const decision = shouldRedact(assignment.key, comment, config, keyRegex);

        if (decision.redact) {
          secrets.push({
            key: assignment.key,
            start: valueStart,
            end: closeLine.start + closeIndex,
            assignmentStart: line.start,
            assignmentEnd: closeLine.end,
            startLine: lineIndex,
            endLine: closeLineIndex,
            multiline: true,
            reason: decision.reason,
            label: decision.label,
          });
        }

        lineIndex = closeLineIndex;
        continue;
      }

      const decision = shouldRedact(assignment.key, '', config, keyRegex);
      if (decision.redact) {
        secrets.push({
          key: assignment.key,
          start: valueStart,
          end: text.length,
          assignmentStart: line.start,
          assignmentEnd: text.length,
          startLine: lineIndex,
          endLine: lines.length - 1,
          multiline: true,
          unterminated: true,
          reason: decision.reason,
          label: decision.label,
        });
      }
      break;
    }

    const { value, comment } = splitValueComment(assignment.rest);
    const decision = shouldRedact(assignment.key, comment, config, keyRegex);
    if (!decision.redact) {
      continue;
    }

    const core = valueCore(value, line.start + assignment.restStart);
    if (core.end <= core.start) {
      continue;
    }

    secrets.push({
      key: assignment.key,
      start: core.start,
      end: core.end,
      assignmentStart: line.start,
      assignmentEnd: line.end,
      startLine: lineIndex,
      endLine: lineIndex,
      multiline: false,
      reason: decision.reason,
      label: decision.label,
    });
  }

  return { secrets, usedFallbackKeyPattern: compiled.usedFallback, config };
}

function buildMaskRanges(text, secrets, suppliedConfig = {}) {
  const config = normalizeConfig(suppliedConfig);
  const ranges = [];

  for (const secret of secrets) {
    const characterOffsets = [];
    for (let offset = secret.start; offset < secret.end; offset += 1) {
      const char = text[offset];
      if (char !== '\n' && char !== '\r') {
        characterOffsets.push(offset);
      }
    }

    const hideStart = Math.min(config.keepStart, characterOffsets.length);
    const hideEnd = Math.max(hideStart, characterOffsets.length - config.keepEnd);
    const hiddenOffsets =
      characterOffsets.length <= config.keepStart + config.keepEnd
        ? characterOffsets
        : characterOffsets.slice(hideStart, hideEnd);

    if (hiddenOffsets.length === 0) {
      continue;
    }

    let rangeStart = hiddenOffsets[0];
    let previous = hiddenOffsets[0];

    for (let index = 1; index < hiddenOffsets.length; index += 1) {
      const current = hiddenOffsets[index];
      if (current !== previous + 1) {
        ranges.push({ start: rangeStart, end: previous + 1, secret });
        rangeStart = current;
      }
      previous = current;
    }

    ranges.push({ start: rangeStart, end: previous + 1, secret });
  }

  return ranges;
}

function applyMaskForPreview(text, ranges, mask = '...') {
  let output = text;
  const sorted = [...ranges].sort((a, b) => b.start - a.start || b.end - a.end);
  for (const range of sorted) {
    output = output.slice(0, range.start) + mask + output.slice(range.end);
  }
  return output;
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_KEY_PATTERN,
  analyzeDotenv,
  applyMaskForPreview,
  buildMaskRanges,
  compileKeyPattern,
  finalCommentLabel,
  normalizeConfig,
  parseAssignment,
  splitValueComment,
};
