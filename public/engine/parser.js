// regex pattern থেকে AST বানায়। ভুল pattern-এ বাংলা বার্তা আর অবস্থানসহ error ছোড়ে।
(function (root) {
    var CLASS_ESCAPES = 'dDwWsS';
    var SIMPLE_ESCAPES = { n: '\n', r: '\r', t: '\t', v: '\v', f: '\f', '0': '\0' };

    function ParseError(message, pos, length) {
        this.message = message;
        this.pos = pos;
        this.length = length || 1;
    }

    function countGroups(pattern) {
        var count = 0;
        var inClass = false;
        for (var i = 0; i < pattern.length; i++) {
            var c = pattern[i];
            if (c === '\\') { i++; continue; }
            if (inClass) { if (c === ']') inClass = false; continue; }
            if (c === '[') { inClass = true; continue; }
            if (c === '(') {
                if (pattern[i + 1] !== '?') count++;
                else if (pattern[i + 2] === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') count++;
            }
        }
        return count;
    }

    function parse(pattern, flags) {
        flags = flags || '';
        var unicode = flags.indexOf('u') !== -1 || flags.indexOf('v') !== -1;
        var pos = 0;
        var groupCount = 0;
        var totalGroups = countGroups(pattern);
        var names = {};

        function peek() { return pattern[pos]; }

        function readCodePoint() {
            var cp = pattern.codePointAt(pos);
            var ch = String.fromCodePoint(cp);
            pos += ch.length;
            return ch;
        }

        function parseDisjunction(depthStart) {
            var start = pos;
            var alternatives = [parseSequence()];
            while (peek() === '|') {
                pos++;
                alternatives.push(parseSequence());
            }
            if (alternatives.length === 1) return alternatives[0];
            return { type: 'alt', alternatives: alternatives, start: start, end: pos };
        }

        function parseSequence() {
            var start = pos;
            var items = [];
            while (pos < pattern.length && peek() !== '|' && peek() !== ')') {
                var atom = parseAtom();
                atom = parseQuantifier(atom);
                items.push(atom);
            }
            return { type: 'seq', items: items, start: start, end: pos };
        }

        function readNumber() {
            var digits = '';
            while (pos < pattern.length && pattern[pos] >= '0' && pattern[pos] <= '9') digits += pattern[pos++];
            return digits === '' ? null : parseInt(digits, 10);
        }

        function tryBraceQuantifier() {
            var save = pos;
            pos++;
            var min = readNumber();
            if (min === null) { pos = save; return null; }
            var max = min;
            if (peek() === ',') {
                pos++;
                max = readNumber();
                if (max === null) max = Infinity;
            }
            if (peek() !== '}') { pos = save; return null; }
            pos++;
            if (max < min) throw new ParseError('{' + min + ',' + max + '}-এ ছোট সংখ্যা আগে আর বড় সংখ্যা পরে বসাতে হয়', save, pos - save);
            return { min: min, max: max };
        }

        function parseQuantifier(atom) {
            var c = peek();
            var range = null;
            var quantStart = pos;
            if (c === '*') { range = { min: 0, max: Infinity }; pos++; }
            else if (c === '+') { range = { min: 1, max: Infinity }; pos++; }
            else if (c === '?') { range = { min: 0, max: 1 }; pos++; }
            else if (c === '{') {
                range = tryBraceQuantifier();
                if (!range && unicode) throw new ParseError('{ এখানে ঠিকমতো quantifier নয়। আক্ষরিক { লিখতে \\{ লিখুন', pos);
            }
            if (!range) return atom;
            var lazy = false;
            if (peek() === '?') { lazy = true; pos++; }
            var lookaround = atom.type === 'look';
            if (lookaround && (unicode || !atom.ahead)) {
                throw new ParseError('lookaround-এর পরে quantifier বসানো যায় না', quantStart);
            }
            if (atom.type === 'anchor' || atom.type === 'boundary') {
                throw new ParseError('এই চিহ্ন কোনো অক্ষর নেয় না, তাই এর পরে quantifier বসানো যায় না', quantStart);
            }
            return {
                type: 'quant', min: range.min, max: range.max, lazy: lazy, body: atom,
                start: atom.start, end: pos, bodyEnd: atom.end,
                firstGroup: atom.firstGroup, lastGroup: atom.lastGroup
            };
        }

        function withGroupRange(node, before) {
            node.firstGroup = before + 1;
            node.lastGroup = groupCount;
            return node;
        }

        function parseAtom() {
            var start = pos;
            var c = peek();
            var before = groupCount;

            if (c === '*' || c === '+' || c === '?') {
                throw new ParseError('"' + c + '" কিসের quantifier? এর আগে একটা অক্ষর বা group লাগবে', pos);
            }
            if (c === '{') {
                var save = pos;
                if (tryBraceQuantifier()) { pos = save; throw new ParseError('{...} কিসের quantifier? এর আগে একটা অক্ষর বা group লাগবে', pos); }
                if (unicode) throw new ParseError('{ এখানে ঠিকমতো quantifier নয়। আক্ষরিক { লিখতে \\{ লিখুন', pos);
            }
            if (c === '(') return parseGroup(before);
            if (c === '[') return parseClass();
            if (c === '.') { pos++; return { type: 'any', start: start, end: pos }; }
            if (c === '^') { pos++; return { type: 'anchor', kind: '^', start: start, end: pos }; }
            if (c === '$') { pos++; return { type: 'anchor', kind: '$', start: start, end: pos }; }
            if (c === '\\') return parseEscape();
            var ch = readCodePoint();
            return { type: 'char', value: ch, start: start, end: pos };
        }

        function readGroupName() {
            var nameStart = pos;
            while (pos < pattern.length && pattern[pos] !== '>') pos++;
            if (pos >= pattern.length) throw new ParseError('group-এর নামের শেষে > নেই', nameStart - 1);
            var name = pattern.slice(nameStart, pos);
            pos++;
            if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new ParseError('"' + name + '" ঠিক group-নাম নয়। নাম শুরু হয় অক্ষর বা _ দিয়ে', nameStart, name.length || 1);
            return name;
        }

        function parseGroup(before) {
            var start = pos;
            pos++;
            var node = { type: 'group', capture: true, name: null, index: 0, start: start };
            var look = null;
            if (peek() === '?') {
                var next = pattern[pos + 1];
                if (next === ':') { pos += 2; node.capture = false; }
                else if (next === '=') { pos += 2; look = { ahead: true, negate: false }; }
                else if (next === '!') { pos += 2; look = { ahead: true, negate: true }; }
                else if (next === '<' && pattern[pos + 2] === '=') { pos += 3; look = { ahead: false, negate: false }; }
                else if (next === '<' && pattern[pos + 2] === '!') { pos += 3; look = { ahead: false, negate: true }; }
                else if (next === '<') {
                    pos += 2;
                    node.name = readGroupName();
                    if (names[node.name]) throw new ParseError('"' + node.name + '" নামের group আগেই আছে', pos - node.name.length - 1, node.name.length);
                    names[node.name] = true;
                } else {
                    throw new ParseError('(? -এর পরে এই চিহ্ন চলে না। চলে: (?: ) (?= ) (?! ) (?<= ) (?<! ) (?<নাম> )', pos, 2);
                }
            }
            if (look) {
                node.type = 'look';
                node.ahead = look.ahead;
                node.negate = look.negate;
            } else if (node.capture) {
                node.index = ++groupCount;
            }
            var bodyStart = pos;
            node.body = parseDisjunction();
            node.bodyStart = bodyStart;
            if (peek() !== ')') throw new ParseError('এই ( খোলা হয়েছে কিন্তু বন্ধ হয়নি। শেষে ) বসান', start);
            pos++;
            node.end = pos;
            return withGroupRange(node, before);
        }

        function parseHex(count, startPos) {
            var text = pattern.substr(pos, count);
            if (text.length !== count || !/^[0-9a-fA-F]+$/.test(text)) {
                if (unicode) throw new ParseError('এখানে ' + count + 'টা hex অঙ্ক (0-9, a-f) লাগে', startPos, pos - startPos + 1);
                return null;
            }
            pos += count;
            return String.fromCharCode(parseInt(text, 16));
        }

        function parseUnicodeEscape(startPos) {
            if (peek() === '{' && unicode) {
                var close = pattern.indexOf('}', pos);
                var hex = close === -1 ? '' : pattern.slice(pos + 1, close);
                if (!/^[0-9a-fA-F]+$/.test(hex) || parseInt(hex, 16) > 0x10ffff) {
                    throw new ParseError('\\u{...}-এর ভেতরে ঠিক hex সংখ্যা লাগে', startPos, 3);
                }
                pos = close + 1;
                return String.fromCodePoint(parseInt(hex, 16));
            }
            var unit = parseHex(4, startPos);
            if (unit === null) return 'u';
            if (unicode && unit >= '\ud800' && unit <= '\udbff' && pattern.substr(pos, 2) === '\\u') {
                var save = pos;
                pos += 2;
                var low = parseHex(4, save);
                if (low !== null && low >= '\udc00' && low <= '\udfff') return unit + low;
                pos = save;
            }
            return unit;
        }

        function parseProperty(negate, startPos) {
            if (!unicode) return { type: 'char', value: negate ? 'P' : 'p', start: startPos, end: pos };
            if (peek() !== '{') throw new ParseError('\\p-এর পরে {নাম} লাগে, যেমন \\p{Script=Bengali}', startPos, 2);
            var close = pattern.indexOf('}', pos);
            if (close === -1) throw new ParseError('\\p{ বন্ধ হয়নি', startPos, 2);
            var name = pattern.slice(pos + 1, close);
            try {
                new RegExp('\\p{' + name + '}', 'u');
            } catch (e) {
                throw new ParseError('"' + name + '" চেনা Unicode property নয়', pos + 1, name.length || 1);
            }
            pos = close + 1;
            return { type: 'prop', negate: negate, name: name, start: startPos, end: pos };
        }

        function parseEscape() {
            var start = pos;
            pos++;
            if (pos >= pattern.length) throw new ParseError('শেষে একটা \\ আছে, কিন্তু এর পরে কিছু নেই', start);
            var c = pattern[pos];
            var before = groupCount;

            if (CLASS_ESCAPES.indexOf(c) !== -1) { pos++; return { type: 'classEscape', kind: c, start: start, end: pos }; }
            if (c === 'b' || c === 'B') { pos++; return { type: 'boundary', kind: c, start: start, end: pos }; }
            if (c === 'p' || c === 'P') { pos++; return parseProperty(c === 'P', start); }
            if (c === 'k') {
                var hasNames = Object.keys(names).length > 0 || /\(\?<[A-Za-z_$]/.test(pattern);
                if (unicode || hasNames) {
                    pos++;
                    if (peek() !== '<') throw new ParseError('\\k-এর পরে <নাম> লাগে', start, 2);
                    pos++;
                    var refName = readGroupName();
                    return { type: 'backref', name: refName, start: start, end: pos };
                }
            }
            if (c >= '1' && c <= '9') {
                var numStart = pos;
                var num = readNumber();
                if (num <= totalGroups) return { type: 'backref', index: num, start: start, end: pos };
                if (unicode) throw new ParseError('\\' + num + ' দিয়ে যে group capture করতে চান সেটা নেই (মোট group ' + totalGroups + 'টা)', start, pos - start);
                pos = numStart + 1;
                return { type: 'char', value: c, start: start, end: pos };
            }
            if (SIMPLE_ESCAPES.hasOwnProperty(c)) {
                pos++;
                return { type: 'char', value: SIMPLE_ESCAPES[c], start: start, end: pos, escaped: true };
            }
            if (c === 'x') {
                pos++;
                var hx = parseHex(2, start);
                return { type: 'char', value: hx === null ? 'x' : hx, start: start, end: pos, escaped: true };
            }
            if (c === 'u') {
                pos++;
                var uv = parseUnicodeEscape(start);
                return { type: 'char', value: uv, start: start, end: pos, escaped: true };
            }
            if (c === 'c') {
                var letter = pattern[pos + 1];
                if (letter && /[A-Za-z]/.test(letter)) {
                    pos += 2;
                    return { type: 'char', value: String.fromCharCode(letter.charCodeAt(0) % 32), start: start, end: pos, escaped: true };
                }
                if (unicode) throw new ParseError('\\c-এর পরে একটা ইংরেজি অক্ষর লাগে', start, 2);
                return { type: 'char', value: '\\', start: start, end: start + 1 };
            }
            var ch = readCodePoint();
            return { type: 'char', value: ch, start: start, end: pos, escaped: true };
        }

        function parseClassAtom(classStart) {
            var start = pos;
            var c = peek();
            if (c === '\\') {
                pos++;
                if (pos >= pattern.length) throw new ParseError('শেষে একটা \\ আছে, কিন্তু এর পরে কিছু নেই', start);
                var e = pattern[pos];
                if (CLASS_ESCAPES.indexOf(e) !== -1) { pos++; return { type: 'classEscape', kind: e, start: start, end: pos }; }
                if ((e === 'p' || e === 'P') && unicode) { pos++; return parseProperty(e === 'P', start); }
                if (e === 'b') { pos++; return { type: 'char', value: '\b', start: start, end: pos, escaped: true }; }
                if (e === '-' ) { pos++; return { type: 'char', value: '-', start: start, end: pos, escaped: true }; }
                if (SIMPLE_ESCAPES.hasOwnProperty(e)) { pos++; return { type: 'char', value: SIMPLE_ESCAPES[e], start: start, end: pos, escaped: true }; }
                if (e === 'x') { pos++; var hx = parseHex(2, start); return { type: 'char', value: hx === null ? 'x' : hx, start: start, end: pos, escaped: true }; }
                if (e === 'u') { pos++; return { type: 'char', value: parseUnicodeEscape(start), start: start, end: pos, escaped: true }; }
                if (e === 'c') {
                    var letter = pattern[pos + 1];
                    if (letter && /[A-Za-z]/.test(letter)) { pos += 2; return { type: 'char', value: String.fromCharCode(letter.charCodeAt(0) % 32), start: start, end: pos, escaped: true }; }
                    return { type: 'char', value: '\\', start: start, end: start + 1 };
                }
                var escaped = readCodePoint();
                return { type: 'char', value: escaped, start: start, end: pos, escaped: true };
            }
            var ch = readCodePoint();
            return { type: 'char', value: ch, start: start, end: pos };
        }

        function parseClass() {
            var start = pos;
            pos++;
            var negate = false;
            if (peek() === '^') { negate = true; pos++; }
            var items = [];
            while (true) {
                if (pos >= pattern.length) throw new ParseError('এই [ খোলা হয়েছে কিন্তু বন্ধ হয়নি। শেষে ] বসান', start);
                if (peek() === ']') { pos++; break; }
                var first = parseClassAtom(start);
                if (peek() === '-' && pattern[pos + 1] !== ']' && pos + 1 < pattern.length) {
                    var dashPos = pos;
                    pos++;
                    var second = parseClassAtom(start);
                    if (first.type === 'char' && second.type === 'char') {
                        if (second.value.codePointAt(0) < first.value.codePointAt(0)) {
                            throw new ParseError('range উল্টো: শেষের অক্ষর শুরুর অক্ষরের আগে পড়ে', first.start, second.end - first.start);
                        }
                        items.push({ type: 'range', from: first.value, to: second.value, start: first.start, end: second.end });
                        continue;
                    }
                    if (unicode) throw new ParseError('range-এর দুই পাশে সাধারণ অক্ষর লাগে', dashPos);
                    items.push(first);
                    items.push({ type: 'char', value: '-', start: dashPos, end: dashPos + 1 });
                    items.push(second);
                    continue;
                }
                items.push(first);
            }
            return { type: 'class', negate: negate, items: items, start: start, end: pos };
        }

        var tree = parseDisjunction();
        if (pos < pattern.length) {
            if (peek() === ')') throw new ParseError('এই ) -এর সাথে মেলানোর কোনো ( নেই', pos);
            throw new ParseError('pattern বুঝতে পারিনি', pos);
        }
        resolveBackrefs(tree, names);
        return { root: tree, groupCount: groupCount, names: Object.keys(names), flags: flags };
    }

    function resolveBackrefs(node, names) {
        if (!node) return;
        if (node.type === 'backref' && node.name && !names[node.name]) {
            throw new ParseError('"' + node.name + '" নামের কোনো group নেই', node.start, node.end - node.start);
        }
        if (node.items) node.items.forEach(function (n) { resolveBackrefs(n, names); });
        if (node.alternatives) node.alternatives.forEach(function (n) { resolveBackrefs(n, names); });
        if (node.body) resolveBackrefs(node.body, names);
    }

    // native engine-এর English error বাংলায়
    function translateNativeError(message) {
        var m = String(message);
        if (/Unterminated group/i.test(m)) return 'একটা ( খোলা হয়েছে কিন্তু বন্ধ হয়নি';
        if (/Unmatched '\)'/i.test(m)) return 'একটা ) আছে যার সাথে মেলানোর কোনো ( নেই';
        if (/Unterminated character class/i.test(m)) return 'একটা [ খোলা হয়েছে কিন্তু বন্ধ হয়নি';
        if (/Nothing to repeat/i.test(m)) return 'quantifier-এর (* + ? {}) আগে কিছু নেই';
        if (/Invalid group/i.test(m)) return '(? -এর পরে ভুল চিহ্ন';
        if (/Invalid escape|Invalid unicode escape|Invalid Unicode escape/i.test(m)) return 'ভুল escape (\\ দিয়ে লেখা অংশ)';
        if (/Range out of order/i.test(m)) return 'range উল্টো: শেষের অক্ষর শুরুর অক্ষরের আগে পড়ে';
        if (/Invalid capture group name/i.test(m)) return 'group-এর নাম ঠিক নয়';
        if (/Duplicate capture group name/i.test(m)) return 'একই নামে দুটো group';
        if (/Invalid named reference|Invalid named capture referenced/i.test(m)) return 'যে নামের group capture করতে চান সেটা নেই';
        if (/Invalid property name/i.test(m)) return 'চেনা Unicode property নয়';
        if (/Invalid flags|invalid flag/i.test(m)) return 'flag ভুল। চলে: g i m s u d y';
        if (/Lone quantifier brackets/i.test(m)) return 'এই { বা } একা আছে। আক্ষরিক লিখতে \\{ বা \\}';
        if (/\\ at end of pattern/i.test(m)) return 'শেষে একটা \\ আছে, কিন্তু এর পরে কিছু নেই';
        if (/Incomplete quantifier/i.test(m)) return 'quantifier অসম্পূর্ণ';
        return 'pattern ঠিক নয়: ' + m;
    }

    var api = { parse: parse, ParseError: ParseError, translateNativeError: translateNativeError };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegexParser = api;
})(typeof self !== 'undefined' ? self : this);
