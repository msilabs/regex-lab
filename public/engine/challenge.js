// challenge-এর উত্তর যাচাই। worker আর test দুজনেই এটা ব্যবহার করে।
(function (root) {
    function extractAll(re, text) {
        var list = [];
        var found = re.exec(text);
        var guard = 0;
        while (found && guard < 1000) {
            list.push(found[1] !== undefined ? found[1] : found[0]);
            if (found[0] === '') re.lastIndex++;
            found = re.exec(text);
            guard++;
        }
        return list;
    }

    function evaluate(kind, pattern, flags, cases, replacement) {
        var plain = flags.replace(/[gy]/g, '');
        var results;
        try {
            var test = new RegExp(pattern, plain);
            var all = new RegExp(pattern, plain + 'g');
            var replacer = new RegExp(pattern, flags.replace(/y/g, ''));
        } catch (e) {
            return { error: { message: root.RegexParser ? root.RegexParser.translateNativeError(e.message) : e.message, pos: -1, length: 0 } };
        }
        results = cases.map(function (c) {
            if (kind === 'match') {
                var ok = test.test(c.text);
                return { text: c.text, pass: ok === c.expect, got: ok };
            }
            if (kind === 'extract') {
                all.lastIndex = 0;
                var list = extractAll(all, c.text);
                return { text: c.text, pass: JSON.stringify(list) === JSON.stringify(c.expect), got: list };
            }
            replacer.lastIndex = 0;
            var replaced = c.text.replace(replacer, replacement || '');
            return { text: c.text, pass: replaced === c.expect, got: replaced };
        });
        return { results: results, allPass: results.every(function (r) { return r.pass; }) };
    }

    var api = { evaluate: evaluate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegexChallenge = api;
})(typeof self !== 'undefined' ? self : this);
