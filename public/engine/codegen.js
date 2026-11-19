// pattern থেকে JS, PHP, Laravel আর Python কোড।
(function (root) {
    var BENGALI = /[\u0980-\u09FF]/;

    function escapeSlash(pattern) {
        var out = '';
        var inClass = false;
        for (var i = 0; i < pattern.length; i++) {
            var c = pattern[i];
            if (c === '\\') { out += c + (pattern[i + 1] || ''); i++; continue; }
            if (c === '[') inClass = true;
            else if (c === ']') inClass = false;
            if (c === '/' && !inClass) { out += '\\/'; continue; }
            if (c === '/' && inClass) { out += '\\/'; continue; }
            out += c;
        }
        return out;
    }

    function phpString(text) {
        var out = '';
        for (var i = 0; i < text.length; i++) {
            var c = text[i];
            if (c === '\\') {
                var next = text[i + 1];
                if (next === '\\') { out += '\\\\\\\\'; i++; }
                else if (next === "'") { out += "\\\\\\'"; i++; }
                else out += '\\';
            } else if (c === "'") out += "\\'";
            else out += c;
        }
        return "'" + out + "'";
    }

    function phpFlags(flags) {
        return flags.replace(/[gydv]/g, '');
    }

    function jsString(text) {
        return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
    }

    function convertReplacement(replacement, target) {
        var out = '';
        for (var i = 0; i < replacement.length; i++) {
            var c = replacement[i];
            if (c !== '$') { out += c; continue; }
            var next = replacement[i + 1];
            if (next === '$') { out += '$'; i++; continue; }
            if (next === '&') { out += target === 'python' ? '\\g<0>' : '$0'; i++; continue; }
            var named = /^<([A-Za-z_$][\w$]*)>/.exec(replacement.slice(i + 1));
            if (named) {
                out += target === 'python' ? '\\g<' + named[1] + '>' : '$' + named[1];
                i += named[0].length;
                continue;
            }
            var digits = /^\d{1,2}/.exec(replacement.slice(i + 1));
            if (digits) {
                out += target === 'python' ? '\\g<' + digits[0] + '>' : '${' + digits[0] + '}';
                i += digits[0].length;
                continue;
            }
            out += c;
        }
        return out;
    }

    function pythonPattern(pattern) {
        return pattern
            .replace(/\(\?<([A-Za-z_$][\w$]*)>/g, '(?P<$1>')
            .replace(/\\k<([A-Za-z_$][\w$]*)>/g, '(?P=$1)');
    }

    function pythonLiteral(text) {
        if (text.indexOf("'") === -1 && !/\\$/.test(text)) return "r'" + text + "'";
        if (text.indexOf('"') === -1 && !/\\$/.test(text)) return 'r"' + text + '"';
        return "r'''" + text + "'''";
    }

    function pythonString(text) {
        return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    }

    function generate(pattern, flags, options) {
        options = options || {};
        var mode = options.mode || 'match';
        var replacement = options.replacement || '';
        var global = flags.indexOf('g') !== -1;
        var jsLiteral = '/' + escapeSlash(pattern) + '/' + flags;
        var notes = { php: [], laravel: [], python: [], js: [] };
        var hasBengali = BENGALI.test(pattern);
        var phpF = phpFlags(flags);
        if (hasBengali && phpF.indexOf('u') === -1) {
            notes.php.push('বাংলা অক্ষর আছে, তাই u flag লাগবে। না দিলে PHP অক্ষরকে ভেঙে বাইটে দেখে।');
            notes.laravel.push('বাংলা অক্ষর আছে, তাই শেষে u flag লাগবে (…/u)।');
            phpF += 'u';
        }
        var phpPatternText = '/' + escapeSlash(pattern) + '/' + phpF;
        var phpPattern = phpString(phpPatternText);

        // JS
        var js;
        if (mode === 'replace') {
            js = 'const result = text.replace(' + jsLiteral + ', ' + jsString(replacement) + ');';
        } else if (mode === 'split') {
            js = 'const parts = text.split(' + jsLiteral + ');';
        } else if (global) {
            js = 'const matches = [...text.matchAll(' + jsLiteral + ')];\nfor (const m of matches) {\n  console.log(m[0], m.index);\n}';
        } else {
            js = 'const m = ' + jsLiteral + '.exec(text);\nif (m) {\n  console.log(m[0], m.index);\n}';
        }

        // PHP
        var php;
        if (mode === 'replace') {
            php = '$result = preg_replace(' + phpPattern + ', ' + phpString(convertReplacement(replacement, 'php')) + ', $text);';
            if (/\$</.test(replacement)) notes.php.push('PHP-র preg_replace-এ $<নাম> চলে না। group-এর নম্বর (${1}) ব্যবহার করুন।');
        } else if (mode === 'split') {
            php = '$parts = preg_split(' + phpPattern + ', $text);';
        } else if (global) {
            php = 'preg_match_all(' + phpPattern + ', $text, $matches, PREG_SET_ORDER);\nforeach ($matches as $m) {\n    echo $m[0];\n}';
        } else {
            php = 'if (preg_match(' + phpPattern + ', $text, $m)) {\n    echo $m[0];\n}';
        }
        if (global && mode === 'match') notes.php.push('g flag PHP-তে নেই। preg_match_all সেই কাজ করে।');
        if (/\\p\{Script=/.test(pattern)) notes.php.push('PHP-তে \\p{Script=Bengali}-এর বদলে \\p{Bengali} লিখতে হয়।');

        // Laravel
        var laravel = "$request->validate([\n    'field' => ['required', " + phpString('regex:' + phpPatternText) + "],\n]);";
        notes.laravel.push('regex rule-এ | বা , থাকলে string ধরনের rule ("required|regex:...") ভেঙে যায়। তাই সবসময় array ধরন দেখানো হয়েছে।');
        if (global) notes.laravel.push('validation পুরো মান মেলায়। শুরুতে ^ আর শেষে $ না দিলে অংশ মিললেই পাস হয়ে যায়।');

        // Python
        var pyFlags = [];
        if (flags.indexOf('i') !== -1) pyFlags.push('re.I');
        if (flags.indexOf('m') !== -1) pyFlags.push('re.M');
        if (flags.indexOf('s') !== -1) pyFlags.push('re.S');
        var pyFlagText = pyFlags.length ? ', ' + pyFlags.join(' | ') : '';
        var pyPattern = pythonLiteral(pythonPattern(pattern));
        var python;
        if (mode === 'replace') {
            python = 'import re\n\nresult = re.sub(' + pyPattern + ', ' + pythonString(convertReplacement(replacement, 'python')) + ', text' + (pyFlags.length ? ', flags=' + pyFlags.join(' | ') : '') + ')';
        } else if (mode === 'split') {
            python = 'import re\n\nparts = re.split(' + pyPattern + ', text' + (pyFlags.length ? ', flags=' + pyFlags.join(' | ') : '') + ')';
        } else if (global) {
            python = 'import re\n\npattern = re.compile(' + pyPattern + pyFlagText + ')\nfor m in pattern.finditer(text):\n    print(m.group(0), m.start())';
        } else {
            python = 'import re\n\nm = re.search(' + pyPattern + pyFlagText + ', text)\nif m:\n    print(m.group(0), m.start())';
        }
        if (/\\d/.test(pattern)) notes.python.push('Python-এ \\d বাংলা সংখ্যায়ও (০-৯) মেলে। শুধু 0-9 চাইলে re.A flag দিন বা [0-9] লিখুন।');
        if (/\\p\{/.test(pattern)) notes.python.push('Python-এর বিল্ট-ইন re মডিউলে \\p{...} নেই। তৃতীয় পক্ষের regex প্যাকেজ লাগবে, অথবা [\\u0980-\\u09FF] লিখুন।');
        if (/\(\?<[=!]/.test(pattern)) notes.python.push('Python-এর lookbehind-এ লম্বা অংশ ঠিক একই দৈর্ঘ্যের হতে হয়।');

        return { js: js, php: php, laravel: laravel, python: python, notes: notes };
    }

    var api = { generate: generate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegexCodegen = api;
})(typeof self !== 'undefined' ? self : this);
