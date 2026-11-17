// AST থেকে বাংলা ব্যাখ্যা আর pattern-এ রঙ দেওয়ার token।
(function (root) {
    var Parser = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./parser.js') : root.RegexParser;

    var DIGITS = '০১২৩৪৫৬৭৮৯';

    function bn(n) {
        return String(n).replace(/[0-9]/g, function (d) { return DIGITS[d]; });
    }

    var CHAR_NAMES = {
        '\n': 'নতুন লাইন (\\n)', '\r': 'carriage return (\\r)', '\t': 'tab (\\t)', '\v': 'vertical tab (\\v)',
        '\f': 'form feed (\\f)', '\0': 'null অক্ষর (\\0)', ' ': 'ফাঁকা জায়গা (space)', '\b': 'backspace'
    };

    function showChar(ch) {
        if (CHAR_NAMES[ch]) return CHAR_NAMES[ch];
        return '"' + ch + '"';
    }

    function describeEscapeClass(kind, flags) {
        var unicodeNote = flags.indexOf('u') !== -1 ? '' : '';
        switch (kind) {
            case 'd': return 'একটা ইংরেজি সংখ্যা (0-9)। বাংলা সংখ্যা ০-৯ নয়' + unicodeNote;
            case 'D': return 'সংখ্যা ছাড়া যেকোনো একটা অক্ষর';
            case 'w': return 'একটা ইংরেজি অক্ষর, সংখ্যা বা _ (a-z, A-Z, 0-9, _)। বাংলা অক্ষর নয়';
            case 'W': return 'ইংরেজি অক্ষর, সংখ্যা বা _ ছাড়া যেকোনো একটা অক্ষর (বাংলা অক্ষরও এর মধ্যে পড়ে)';
            case 's': return 'একটা ফাঁকা জায়গা (space, tab, নতুন লাইন)';
            case 'S': return 'ফাঁকা জায়গা ছাড়া যেকোনো একটা অক্ষর';
        }
        return '';
    }

    function describeClassItem(item, flags) {
        if (item.type === 'range') {
            var bengali = item.from.codePointAt(0) >= 0x980 && item.to.codePointAt(0) <= 0x9ff;
            var text = showChar(item.from) + ' থেকে ' + showChar(item.to);
            if (item.from === '0' && item.to === '9') text = '0 থেকে 9 (ইংরেজি সংখ্যা)';
            else if (item.from === 'a' && item.to === 'z') text = 'a থেকে z (ছোট হাতের ইংরেজি অক্ষর)';
            else if (item.from === 'A' && item.to === 'Z') text = 'A থেকে Z (বড় হাতের ইংরেজি অক্ষর)';
            else if (item.from === '০' && item.to === '৯') text = '০ থেকে ৯ (বাংলা সংখ্যা)';
            else if (bengali && item.from === 'ঀ' && item.to === '৿') text = 'বাংলা Unicode ব্লকের যেকোনো অক্ষর (অ, আ, ক, খ, ০-৯ সহ)';
            return text;
        }
        if (item.type === 'classEscape') return describeEscapeClass(item.kind, flags);
        if (item.type === 'prop') return propertyText(item);
        return showChar(item.value);
    }

    function propertyText(node) {
        var name = node.name;
        var base;
        if (/^Script(_Extensions)?=Bengali$|^sc=Beng$|^scx=Beng$/.test(name)) base = 'বাংলা লিপির অক্ষর';
        else if (/^Script(_Extensions)?=Latin$/.test(name)) base = 'ল্যাটিন (ইংরেজি) লিপির অক্ষর';
        else if (name === 'L' || name === 'Letter') base = 'যেকোনো ভাষার অক্ষর';
        else if (name === 'Lu') base = 'বড় হাতের অক্ষর';
        else if (name === 'Ll') base = 'ছোট হাতের অক্ষর';
        else if (name === 'N' || name === 'Nd') base = 'যেকোনো ভাষার সংখ্যা';
        else if (name === 'P') base = 'যতি বা punctuation চিহ্ন';
        else if (name === 'Emoji') base = 'emoji';
        else base = 'Unicode property "' + name + '"-এর অক্ষর';
        return node.negate ? base + ' ছাড়া যেকোনো অক্ষর' : base;
    }

    function quantText(node) {
        var min = node.min;
        var max = node.max;
        var text;
        if (min === 0 && max === Infinity) text = 'শূন্য বা তার বেশিবার';
        else if (min === 1 && max === Infinity) text = 'অন্তত একবার, যতবার খুশি';
        else if (min === 0 && max === 1) text = 'থাকতেও পারে, না-ও থাকতে পারে (০ বা ১বার)';
        else if (min === max) text = 'ঠিক ' + bn(min) + 'বার';
        else if (max === Infinity) text = 'অন্তত ' + bn(min) + 'বার, তার বেশিও চলবে';
        else text = bn(min) + ' থেকে ' + bn(max) + 'বার';
        return text;
    }

    function nounFor(node, flags) {
        switch (node.type) {
            case 'char': return showChar(node.value);
            case 'any': return flags.indexOf('s') !== -1 ? 'যেকোনো অক্ষর (নতুন লাইনসহ)' : 'যেকোনো একটা অক্ষর (নতুন লাইন ছাড়া)';
            case 'classEscape': return describeEscapeClass(node.kind, flags);
            case 'prop': return propertyText(node);
            case 'class': return classText(node, flags);
            case 'group': return node.capture ? 'group' : 'group';
        }
        return '';
    }

    function classText(node, flags) {
        var parts = node.items.map(function (item) { return describeClassItem(item, flags); });
        var joined = parts.join(', ');
        if (node.negate) return 'এগুলো ছাড়া যেকোনো একটা অক্ষর: ' + joined;
        if (node.items.length === 1) return 'একটা অক্ষর: ' + joined;
        return 'এগুলোর যেকোনো একটা: ' + joined;
    }

    function ignoreCaseNote(flags) {
        return flags.indexOf('i') !== -1 ? ' (ছোট-বড় হাতের পার্থক্য ধরা হয় না)' : '';
    }

    // কোনো node-এর এক লাইনের বাংলা মানে। সন্তান থাকলে আলাদা লাইনে আসে।
    function describe(node, flags) {
        switch (node.type) {
            case 'char':
                if (node.value === ' ') return 'একটা ফাঁকা জায়গা (space)';
                return 'অক্ষর ' + showChar(node.value) + ' হুবহু' + ignoreCaseNote(flags);
            case 'any': return nounFor(node, flags);
            case 'classEscape': return describeEscapeClass(node.kind, flags);
            case 'prop': return propertyText(node);
            case 'class': return classText(node, flags);
            case 'anchor':
                if (node.kind === '^') return flags.indexOf('m') !== -1 ? 'লাইনের শুরু (প্রতিটা লাইনের শুরুতে মিলবে, কারণ m flag আছে)' : 'লেখার একদম শুরু';
                return flags.indexOf('m') !== -1 ? 'লাইনের শেষ (প্রতিটা লাইনের শেষে মিলবে, কারণ m flag আছে)' : 'লেখার একদম শেষ';
            case 'boundary':
                return node.kind === 'b' ? 'শব্দের সীমা: এক পাশে ইংরেজি অক্ষর/সংখ্যা, অন্য পাশে নেই' : 'শব্দের সীমা নয়: দুই পাশেই অক্ষর অথবা দুই পাশেই অক্ষর নয়';
            case 'backref':
                return node.name ? '"' + node.name + '" group যা ধরেছিল ঠিক সেটাই আবার' : bn(node.index) + ' নম্বর group যা ধরেছিল ঠিক সেটাই আবার';
            case 'group':
                if (node.name) return '"' + node.name + '" নামের group (' + bn(node.index) + ' নম্বর), মিলে যাওয়া অংশ আলাদা করে রাখে';
                if (node.capture) return bn(node.index) + ' নম্বর group, মিলে যাওয়া অংশ আলাদা করে রাখে';
                return 'group যা অংশ আলাদা করে রাখে না (শুধু একসাথে বাঁধে)';
            case 'look':
                if (node.ahead) return node.negate ? 'এর ঠিক পরে নিচেরটা থাকলে চলবে না (পরে দেখে, কিছু ধরে না)' : 'এর ঠিক পরে নিচেরটা থাকতে হবে (পরে দেখে, কিছু ধরে না)';
                return node.negate ? 'এর ঠিক আগে নিচেরটা থাকলে চলবে না (আগে দেখে, কিছু ধরে না)' : 'এর ঠিক আগে নিচেরটা থাকতে হবে (আগে দেখে, কিছু ধরে না)';
            case 'alt': return 'এর যেকোনো একটা পথ মিললেই হবে (বাঁ দিক থেকে চেষ্টা)';
            case 'quant': {
                var text = quantText(node);
                if (node.lazy) text += ', তবে যত কম সম্ভব (lazy)';
                else if (!(node.min === node.max)) text += ', তবে যত বেশি সম্ভব (greedy)';
                return text;
            }
        }
        return 'এই অংশের ব্যাখ্যা এখনো নেই';
    }

    function flat(node, depth, flags, pattern, lines) {
        if (node.type === 'seq') {
            node.items.forEach(function (item) { flat(item, depth, flags, pattern, lines); });
            return;
        }
        var line = { depth: depth, start: node.start, end: node.end, raw: pattern.slice(node.start, node.end), text: describe(node, flags) };
        if (node.type === 'quant') {
            lines.push(line);
            line.raw = pattern.slice(node.bodyEnd, node.end);
            line.start = node.bodyEnd;
            flat(node.body, depth + 1, flags, pattern, lines);
            return;
        }
        lines.push(line);
        if (node.type === 'alt') {
            node.alternatives.forEach(function (alt, i) {
                lines.push({ depth: depth + 1, start: alt.start, end: alt.end, raw: pattern.slice(alt.start, alt.end), text: bn(i + 1) + ' নম্বর পথ', branch: true });
                flat(alt, depth + 2, flags, pattern, lines);
            });
            return;
        }
        if (node.type === 'group' || node.type === 'look') flat(node.body, depth + 1, flags, pattern, lines);
    }

    function warnings(pattern, flags) {
        var out = [];
        var unicode = flags.indexOf('u') !== -1 || flags.indexOf('v') !== -1;
        if (/\\d/.test(pattern)) out.push('\\d শুধু ইংরেজি সংখ্যা (0-9) ধরে। বাংলা সংখ্যা (০-৯) ধরতে [০-৯] লিখুন।');
        if (/\\w/.test(pattern)) out.push('\\w বাংলা অক্ষর ধরে না। বাংলা অক্ষরের জন্য [\\u0980-\\u09FF] বা u flag দিয়ে \\p{Script=Bengali} লিখুন।');
        if (/[ঀ-৿]/.test(pattern) && !unicode && /[ঀ-৿]\s*[*+?{]/.test(pattern)) {
            out.push('বাংলা যুক্তাক্ষর বা কারচিহ্ন আলাদা Unicode অক্ষর। ' + 'একটা "অক্ষর" দেখতে এক হলেও ভেতরে একাধিক হতে পারে।');
        }
        return out;
    }

    function tokens(node, pattern, out) {
        out = out || [];
        if (!node) return out;
        switch (node.type) {
            case 'seq': node.items.forEach(function (n) { tokens(n, pattern, out); }); break;
            case 'alt':
                node.alternatives.forEach(function (n, i) {
                    tokens(n, pattern, out);
                    if (i < node.alternatives.length - 1) out.push({ start: n.end, end: n.end + 1, kind: 'alt' });
                });
                break;
            case 'quant':
                tokens(node.body, pattern, out);
                out.push({ start: node.bodyEnd, end: node.end, kind: 'quant' });
                break;
            case 'group':
            case 'look':
                out.push({ start: node.start, end: node.bodyStart, kind: 'group' });
                tokens(node.body, pattern, out);
                out.push({ start: node.end - 1, end: node.end, kind: 'group' });
                break;
            case 'class': out.push({ start: node.start, end: node.end, kind: 'class' }); break;
            case 'classEscape':
            case 'prop':
            case 'backref': out.push({ start: node.start, end: node.end, kind: 'escape' }); break;
            case 'anchor':
            case 'boundary': out.push({ start: node.start, end: node.end, kind: 'anchor' }); break;
            case 'any': out.push({ start: node.start, end: node.end, kind: 'escape' }); break;
            default: out.push({ start: node.start, end: node.end, kind: node.escaped ? 'escape' : 'char' });
        }
        return out;
    }

    function explain(pattern, flags) {
        var ast = Parser.parse(pattern, flags);
        var lines = [];
        flat(ast.root, 0, flags, pattern, lines);
        return {
            lines: lines,
            tokens: tokens(ast.root, pattern).sort(function (a, b) { return a.start - b.start; }),
            warnings: warnings(pattern, flags),
            groupCount: ast.groupCount,
            names: ast.names
        };
    }

    var api = { explain: explain, bn: bn, quantText: quantText };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegexExplain = api;
})(typeof self !== 'undefined' ? self : this);
