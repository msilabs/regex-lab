// AST-এর ওপর চলা ছোট backtracking matcher। প্রতিটা সিদ্ধান্ত রেকর্ড করে।
// ব্রাউজারের engine-ও backtracking-ভিত্তিক, তাই ধাপগুলো বাস্তবের কাছাকাছি।
(function (root) {
    var Parser = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./parser.js') : root.RegexParser;

    function StepLimit() {}
    function Unsupported(message) { this.message = message; }

    var LINE_END = /[\n\r\u2028\u2029]/;
    var WORD = /\w/;

    function nativeTest(source, flags) {
        var re = new RegExp('^(?:' + source + ')$', flags);
        return function (ch) { return re.test(ch); };
    }

    function nodeSource(pattern, node) {
        return pattern.slice(node.start, node.end);
    }

    // tree-তে lookbehind আছে কিনা
    function findUnsupported(node) {
        if (!node) return null;
        if (node.type === 'look' && !node.ahead) return 'lookbehind';
        var found = null;
        if (node.items) node.items.forEach(function (n) { found = found || findUnsupported(n); });
        if (node.alternatives) node.alternatives.forEach(function (n) { found = found || findUnsupported(n); });
        if (node.body) found = found || findUnsupported(node.body);
        return found;
    }

    // options: { record: bool, limit: number, startAt: number, sticky: bool }
    function run(pattern, flags, text, options) {
        options = options || {};
        var limit = options.limit || 100000;
        var record = options.record !== false;
        var ignoreCase = flags.indexOf('i') !== -1;
        var multiline = flags.indexOf('m') !== -1;
        var dotAll = flags.indexOf('s') !== -1;
        var unicode = flags.indexOf('u') !== -1 || flags.indexOf('v') !== -1;
        var nativeFlags = (ignoreCase ? 'i' : '') + (unicode ? 'u' : '') + (dotAll ? 's' : '');

        var ast = Parser.parse(pattern, flags);
        var bad = findUnsupported(ast.root);
        if (bad) throw new Unsupported('এই pattern-এ ' + bad + ' আছে, step mode এখনো এটা বোঝে না');

        var steps = [];
        var count = 0;
        var caps = [];
        var testers = new Map();

        function step(node, pos, action, extra) {
            count++;
            if (count > limit) throw new StepLimit();
            if (record) {
                var entry = { start: node.start, end: node.end, pos: pos, action: action };
                if (extra) for (var key in extra) entry[key] = extra[key];
                steps.push(entry);
            }
        }

        function readChar(i) {
            if (i >= text.length) return null;
            if (unicode) return String.fromCodePoint(text.codePointAt(i));
            return text[i];
        }

        function sameChar(a, b) {
            if (a === b) return true;
            if (!ignoreCase) return false;
            return a.toLowerCase() === b.toLowerCase() || a.toUpperCase() === b.toUpperCase();
        }

        function tester(node) {
            var fn = testers.get(node);
            if (fn) return fn;
            var source;
            if (node.type === 'any') {
                fn = dotAll ? function () { return true; } : function (ch) { return !LINE_END.test(ch); };
            } else if (node.type === 'classEscape') {
                source = '\\' + node.kind;
                fn = nativeTest(source, nativeFlags);
            } else if (node.type === 'prop') {
                source = '\\' + (node.negate ? 'P' : 'p') + '{' + node.name + '}';
                fn = nativeTest(source, 'u' + (ignoreCase ? 'i' : ''));
            } else if (node.type === 'class') {
                source = pattern.slice(node.start, node.end);
                try {
                    fn = nativeTest(source, nativeFlags);
                } catch (e) {
                    fn = nativeTest(source, nativeFlags.replace('u', ''));
                }
            }
            testers.set(node, fn);
            return fn;
        }

        function isWordAt(i) {
            return i >= 0 && i < text.length && WORD.test(text[i]);
        }

        function clearGroups(node) {
            var saved = [];
            if (!node.firstGroup) return saved;
            for (var g = node.firstGroup; g <= node.lastGroup; g++) {
                saved.push([g, caps[g]]);
                caps[g] = undefined;
            }
            return saved;
        }

        function restoreGroups(saved) {
            for (var s = 0; s < saved.length; s++) caps[saved[s][0]] = saved[s][1];
        }

        function matchItems(items, idx, i, k) {
            if (idx === items.length) return k(i);
            return matchNode(items[idx], i, function (j) { return matchItems(items, idx + 1, j, k); });
        }

        function matchNode(node, i, k) {
            switch (node.type) {
                case 'seq':
                    return matchItems(node.items, 0, i, k);

                case 'alt':
                    for (var a = 0; a < node.alternatives.length; a++) {
                        var alt = node.alternatives[a];
                        step(alt, i, 'try', { alt: a + 1 });
                        if (matchNode(alt, i, k)) return true;
                        step(alt, i, 'backtrack', { alt: a + 1 });
                    }
                    return false;

                case 'char': {
                    step(node, i, 'try');
                    var ch = readChar(i);
                    if (ch !== null && sameChar(ch, node.value)) {
                        step(node, i, 'match', { len: ch.length });
                        if (k(i + ch.length)) return true;
                        return false;
                    }
                    step(node, i, 'fail');
                    return false;
                }

                case 'any':
                case 'classEscape':
                case 'prop':
                case 'class': {
                    step(node, i, 'try');
                    var c = readChar(i);
                    if (c !== null && tester(node)(c)) {
                        step(node, i, 'match', { len: c.length });
                        return k(i + c.length);
                    }
                    step(node, i, 'fail');
                    return false;
                }

                case 'anchor': {
                    step(node, i, 'try');
                    var ok = node.kind === '^'
                        ? (i === 0 || (multiline && LINE_END.test(text[i - 1])))
                        : (i === text.length || (multiline && LINE_END.test(text[i])));
                    if (ok) {
                        step(node, i, 'match', { len: 0 });
                        return k(i);
                    }
                    step(node, i, 'fail');
                    return false;
                }

                case 'boundary': {
                    step(node, i, 'try');
                    var atBoundary = isWordAt(i - 1) !== isWordAt(i);
                    var good = node.kind === 'b' ? atBoundary : !atBoundary;
                    if (good) {
                        step(node, i, 'match', { len: 0 });
                        return k(i);
                    }
                    step(node, i, 'fail');
                    return false;
                }

                case 'group': {
                    if (!node.capture) return matchNode(node.body, i, k);
                    var index = node.index;
                    return matchNode(node.body, i, function (j) {
                        var previous = caps[index];
                        caps[index] = [i, j];
                        if (k(j)) return true;
                        caps[index] = previous;
                        return false;
                    });
                }

                case 'look': {
                    step(node, i, 'try');
                    var snapshot = caps.slice();
                    var inner = matchNode(node.body, i, function () { return true; });
                    if (node.negate) {
                        caps = snapshot;
                        if (inner) { step(node, i, 'fail'); return false; }
                        step(node, i, 'match', { len: 0 });
                        return k(i);
                    }
                    if (!inner) { caps = snapshot; step(node, i, 'fail'); return false; }
                    step(node, i, 'match', { len: 0 });
                    if (k(i)) return true;
                    caps = snapshot;
                    return false;
                }

                case 'backref': {
                    step(node, i, 'try');
                    var idx = node.index;
                    if (node.name) idx = ast.nameToIndex[node.name];
                    var captured = caps[idx];
                    if (!captured) {
                        step(node, i, 'match', { len: 0 });
                        return k(i);
                    }
                    var piece = text.slice(captured[0], captured[1]);
                    var here = text.substr(i, piece.length);
                    if (here.length === piece.length && sameChar(here, piece)) {
                        step(node, i, 'match', { len: piece.length });
                        return k(i + piece.length);
                    }
                    step(node, i, 'fail');
                    return false;
                }

                case 'quant':
                    return matchQuant(node, i, k);
            }
            throw new Unsupported('অচেনা অংশ: ' + node.type);
        }

        function matchQuant(node, start, k) {
            var min = node.min;
            var max = node.max;

            function iterate(n, i) {
                var saved = clearGroups(node);
                var tried = matchNode(node.body, i, function (j) {
                    if (j === i && n >= min) return false;
                    return again(n + 1, j);
                });
                if (!tried) restoreGroups(saved);
                return tried;
            }

            function again(n, i) {
                if (node.lazy) {
                    if (n >= min) {
                        step(node, i, 'try', { count: n, lazy: true });
                        if (k(i)) return true;
                        step(node, i, 'backtrack', { count: n, lazy: true });
                    }
                    if (n < max) return iterate(n, i);
                    return false;
                }
                if (n < max) {
                    if (iterate(n, i)) return true;
                }
                if (n >= min) {
                    if (n > 0 || min === 0) step(node, i, 'backtrack', { count: n });
                    return k(i);
                }
                return false;
            }

            return again(0, start);
        }

        ast.nameToIndex = {};
        (function collect(node) {
            if (!node) return;
            if (node.type === 'group' && node.name) ast.nameToIndex[node.name] = node.index;
            if (node.items) node.items.forEach(collect);
            if (node.alternatives) node.alternatives.forEach(collect);
            if (node.body) collect(node.body);
        })(ast.root);

        var result = null;
        var truncated = false;
        var first = options.startAt || 0;
        var rootNode = { start: 0, end: pattern.length };
        try {
            for (var s = first; s <= text.length; s++) {
                caps = [];
                step(rootNode, s, 'start');
                var endPos = -1;
                var matched = matchNode(ast.root, s, function (j) { endPos = j; return true; });
                if (matched) {
                    result = { index: s, end: endPos, groups: caps.slice(0, ast.groupCount + 1) };
                    step(rootNode, endPos, 'success');
                    break;
                }
                if (options.sticky) break;
                if (unicode && text.codePointAt(s) > 0xffff) s++;
            }
        } catch (e) {
            if (e instanceof StepLimit) truncated = true;
            else throw e;
        }
        return { match: result, steps: steps, count: count, truncated: truncated, groupCount: ast.groupCount };
    }

    function countSteps(pattern, flags, text, limit) {
        var out = run(pattern, flags, text, { record: false, limit: limit || 200000 });
        return { count: out.count, truncated: out.truncated };
    }

    var api = { run: run, countSteps: countSteps, Unsupported: Unsupported, StepLimit: StepLimit, nodeSource: nodeSource };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegexTracer = api;
})(typeof self !== 'undefined' ? self : this);
