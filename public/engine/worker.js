// regex-এর সব কাজ এখানে চলে, যাতে খারাপ pattern আটকে গেলে পেজ আটকায় না।
importScripts('parser.js', 'explain.js', 'tracer.js', 'redos.js', 'codegen.js', 'challenge.js');

var MAX_MATCHES = 1000;
var TRACE_TEXT_LIMIT = 200;

function groupInfo(indices, text) {
    if (!indices) return null;
    return { start: indices[0], end: indices[1], text: text.slice(indices[0], indices[1]) };
}

function compile(pattern, flags) {
    try {
        return { re: new RegExp(pattern, flags) };
    } catch (nativeError) {
        try {
            RegexParser.parse(pattern, flags);
        } catch (e) {
            if (e instanceof RegexParser.ParseError) {
                return { error: { message: e.message, pos: e.pos, length: e.length } };
            }
        }
        return { error: { message: RegexParser.translateNativeError(nativeError.message), pos: -1, length: 0 } };
    }
}

function doMatch(msg) {
    var flags = msg.flags.replace(/[gyd]/g, '');
    var compiled = compile(msg.pattern, flags + 'dg');
    if (compiled.error) return { error: compiled.error };

    var re = compiled.re;
    var matches = [];
    var total = 0;
    var iterator = msg.text.matchAll(re);
    var next = iterator.next();
    while (!next.done) {
        total++;
        if (matches.length < MAX_MATCHES) {
            var m = next.value;
            var groups = [];
            for (var g = 1; g < m.length; g++) groups.push(groupInfo(m.indices[g], msg.text));
            var named = {};
            if (m.indices.groups) {
                Object.keys(m.indices.groups).forEach(function (name) {
                    named[name] = groupInfo(m.indices.groups[name], msg.text);
                });
            }
            matches.push({
                index: m.index,
                end: m.index + m[0].length,
                text: m[0],
                groups: groups,
                named: named
            });
        }
        next = iterator.next();
    }

    var out = { matches: matches, total: total };
    if (!msg.flags.includes('g')) {
        out.matches = matches.slice(0, 1);
        out.total = Math.min(total, 1);
    }
    var userRe = new RegExp(msg.pattern, msg.flags.replace(/[yd]/g, ''));
    if (msg.mode === 'replace') out.replaced = msg.text.replace(userRe, msg.replacement || '');
    return out;
}

function doExplain(msg) {
    try {
        return RegexExplain.explain(msg.pattern, msg.flags);
    } catch (e) {
        if (e instanceof RegexParser.ParseError) return { error: { message: e.message, pos: e.pos, length: e.length } };
        throw e;
    }
}

function doTrace(msg) {
    var text = msg.text;
    var shortened = false;
    if (text.length > TRACE_TEXT_LIMIT) {
        text = text.slice(0, TRACE_TEXT_LIMIT);
        shortened = true;
    }
    try {
        var out = RegexTracer.run(msg.pattern, msg.flags, text, { limit: 100000, startAt: 0 });
        return { steps: out.steps, count: out.count, truncated: out.truncated, match: out.match, text: text, shortened: shortened };
    } catch (e) {
        if (e instanceof RegexTracer.Unsupported) return { unsupported: e.message };
        if (e instanceof RegexParser.ParseError) return { error: { message: e.message, pos: e.pos, length: e.length } };
        throw e;
    }
}

onmessage = function (event) {
    var msg = event.data;
    var result;
    try {
        if (msg.type === 'match') result = doMatch(msg);
        else if (msg.type === 'explain') result = doExplain(msg);
        else if (msg.type === 'trace') result = doTrace(msg);
        else if (msg.type === 'redos') result = RegexRedos.analyze(msg.pattern, msg.flags);
        else if (msg.type === 'codegen') result = RegexCodegen.generate(msg.pattern, msg.flags, { mode: msg.mode, replacement: msg.replacement });
        else if (msg.type === 'challenge') result = RegexChallenge.evaluate(msg.kind, msg.pattern, msg.flags, msg.cases, msg.replacement);
        else result = { error: { message: 'অচেনা কাজ', pos: -1, length: 0 } };
    } catch (e) {
        result = { error: { message: 'ভেতরে সমস্যা হয়েছে: ' + e.message, pos: -1, length: 0 } };
    }
    postMessage({ id: msg.id, type: msg.type, result: result });
};
