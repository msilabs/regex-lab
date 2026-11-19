// বিপজ্জনক (catastrophic backtracking) pattern ধরে। প্রথমে গঠন দেখে, তারপর tracer চালিয়ে ধাপ গুনে নিশ্চিত করে।
(function (root) {
    var isNode = typeof require !== 'undefined' && typeof module !== 'undefined';
    var Parser = isNode ? require('./parser.js') : root.RegexParser;
    var Tracer = isNode ? require('./tracer.js') : root.RegexTracer;

    var PROBES = 'a1 _x-.AZ09,@';

    function unbounded(node) {
        return node.type === 'quant' && node.max > 1;
    }

    function containsUnbounded(node) {
        if (!node) return false;
        if (unbounded(node)) return true;
        if (node.items && node.items.some(containsUnbounded)) return true;
        if (node.alternatives && node.alternatives.some(containsUnbounded)) return true;
        if (node.body) return containsUnbounded(node.body);
        return false;
    }

    function firstAtom(node) {
        if (node.type === 'seq') return node.items.length ? firstAtom(node.items[0]) : null;
        if (node.type === 'quant') return firstAtom(node.body);
        if (node.type === 'group' && node.body) return firstAtom(node.body);
        return node;
    }

    function probeSet(pattern, atom, flags) {
        if (!atom || ['char', 'any', 'classEscape', 'class', 'prop'].indexOf(atom.type) === -1) return null;
        var source = pattern.slice(atom.start, atom.end);
        var re;
        try {
            re = new RegExp('^(?:' + source + ')$', flags.replace(/[gyd]/g, ''));
        } catch (e) {
            return null;
        }
        var set = [];
        for (var i = 0; i < PROBES.length; i++) if (re.test(PROBES[i])) set.push(PROBES[i]);
        return set;
    }

    function overlap(a, b) {
        if (!a || !b) return false;
        return a.some(function (ch) { return b.indexOf(ch) !== -1; });
    }

    function sampleChar(pattern, node, flags) {
        var atom = firstAtom(node);
        var set = probeSet(pattern, atom, flags);
        return set && set.length ? set[0] : 'a';
    }

    function isSimpleAtom(node) {
        return ['char', 'any', 'classEscape', 'class', 'prop'].indexOf(node.type) !== -1;
    }

    function staticScan(pattern, flags, node, found) {
        if (!node) return found;
        if (node.type === 'quant' && unbounded(node)) {
            if (containsUnbounded(node.body)) {
                found.push({ kind: 'nested', node: node, text: 'quantifier-এর ভেতরে আবার quantifier: ' + pattern.slice(node.start, node.end) });
            } else if (node.body.type === 'group' && node.body.body && node.body.body.type === 'alt') {
                var alts = node.body.body.alternatives.map(function (alt) { return probeSet(pattern, firstAtom(alt), flags); });
                for (var i = 0; i < alts.length; i++) {
                    for (var j = i + 1; j < alts.length; j++) {
                        if (overlap(alts[i], alts[j])) {
                            found.push({ kind: 'alt', node: node, text: 'quantifier-এর ভেতরে এমন একাধিক পথ যারা একই অক্ষরে মিলতে পারে: ' + pattern.slice(node.start, node.end) });
                            i = alts.length;
                            break;
                        }
                    }
                }
            }
        }
        if (node.type === 'seq') {
            for (var k = 0; k + 1 < node.items.length; k++) {
                var left = node.items[k];
                var right = node.items[k + 1];
                if (unbounded(left) && unbounded(right) && left.max === Infinity && right.max === Infinity && isSimpleAtom(left.body) && isSimpleAtom(right.body)) {
                    var l = probeSet(pattern, firstAtom(left), flags);
                    var r = probeSet(pattern, firstAtom(right), flags);
                    if (overlap(l, r)) found.push({ kind: 'adjacent', node: left, text: 'পাশাপাশি দুটো quantifier একই অক্ষরে মিলতে পারে: ' + pattern.slice(left.start, right.end) });
                }
            }
        }
        if (node.items) node.items.forEach(function (n) { staticScan(pattern, flags, n, found); });
        if (node.alternatives) node.alternatives.forEach(function (n) { staticScan(pattern, flags, n, found); });
        if (node.body) staticScan(pattern, flags, node.body, found);
        return found;
    }

    function measure(pattern, flags, ch) {
        var sizes = [8, 12, 16];
        var results = [];
        for (var i = 0; i < sizes.length; i++) {
            var text = new Array(sizes[i] + 1).join(ch) + '!';
            var out = Tracer.countSteps(pattern, flags, text, 100000);
            results.push({ n: sizes[i], steps: out.count, truncated: out.truncated, text: text });
            if (out.truncated) break;
        }
        return results;
    }

    function growsFast(results) {
        if (!results.length) return false;
        var last = results[results.length - 1];
        if (last.truncated) return true;
        var first = results[0];
        return last.steps > first.steps * 25;
    }

    function suggestion(found) {
        var kinds = found.map(function (f) { return f.kind; });
        if (kinds.indexOf('nested') !== -1) return 'ভেতরের আর বাইরের quantifier মিলিয়ে একটা করুন। যেমন (a+)+ -এর বদলে a+ লিখলে একই জিনিসে মেলে, অথচ ধাপ বাড়ে সোজাসুজি।';
        if (kinds.indexOf('alt') !== -1) return 'পথগুলো এমনভাবে ভাগ করুন যেন কোনো অক্ষর দুই পথে মিলতে না পারে। যেমন (a|a)* -এর বদলে a*।';
        return 'দুটো quantifier-এর একটাকে সরু করুন, যেন একই অক্ষর দুটোয় মিলতে না পারে। যেমন \\d+\\d+ -এর বদলে \\d{2,}।';
    }

    function analyze(pattern, flags) {
        var ast;
        try {
            ast = Parser.parse(pattern, flags);
        } catch (e) {
            return { risk: 'none', reasons: [] };
        }
        var found = staticScan(pattern, flags, ast.root, []);
        if (!found.length) return { risk: 'none', reasons: [] };

        var ch = sampleChar(pattern, found[0].node, flags);
        var steps = [];
        try {
            steps = measure(pattern, flags, ch);
        } catch (e) {
            steps = [];
        }
        var confirmed = growsFast(steps);

        // গঠন সন্দেহজনক হলেও চালিয়ে ধাপ না বাড়লে ঝুঁকি নেই (যেমন মাঝে ডট বা হাইফেন থাকলে)।
        // শুধু পাশাপাশি একই অক্ষরের quantifier ধীরে বাড়ে (বহুপদী), সেটা ধাপ গুনে ধরা পড়ে না, তাই সতর্কবার্তা থাকে।
        if (!confirmed) {
            found = found.filter(function (f) { return f.kind === 'adjacent'; });
            if (!found.length) return { risk: 'none', reasons: [] };
        }
        var adjacentOnly = found.every(function (f) { return f.kind === 'adjacent'; });
        var attack = steps.length ? steps[steps.length - 1].text : new Array(25).join(ch) + '!';

        var risk = 'warn';
        if (confirmed) risk = adjacentOnly ? 'warn' : 'danger';
        var message = risk === 'danger'
            ? 'এই pattern server আটকে দিতে পারে। লেখা একটু লম্বা হলেই ধাপ কয়েকগুণ করে বাড়ে।'
            : 'এই pattern-এ ঝুঁকি আছে। কিছু লেখায় বেশি ধাপ লাগতে পারে।';
        return {
            risk: risk,
            message: message,
            reasons: found.map(function (f) { return f.text; }),
            attack: attack,
            steps: steps.map(function (s) { return { n: s.n, steps: s.steps, truncated: s.truncated }; }),
            suggestion: suggestion(found)
        };
    }

    var api = { analyze: analyze };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegexRedos = api;
})(typeof self !== 'undefined' ? self : this);
