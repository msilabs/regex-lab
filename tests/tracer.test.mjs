import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Tracer = require('../public/engine/tracer.js');

const cases = [
    ['a+b', '', 'xaaab'],
    ['(a+)+b', '', 'aaab'],
    ['^\\d{3}-\\d{4}$', '', '555-1234'],
    ['\\bfoo\\b', 'i', 'a FOO b'],
    ['(\\w+)@(\\w+)\\.com', '', 'mail bob@site.com now'],
    ['(?<y>\\d{4})-(?<m>\\d\\d)', '', 'on 2026-11-17'],
    ['a.c', '', 'a\nc abc'],
    ['a.c', 's', 'a\nc'],
    ['^b', 'm', 'a\nb'],
    ['b$', 'm', 'b\na'],
    ['(a|ab)(c|bcd)(d*)', '', 'abcd'],
    ['a*?b', '', 'aaab'],
    ['a{2,3}', '', 'aaaa'],
    ['a{2,3}?', '', 'aaaa'],
    ['(a*)*b', '', 'aab'],
    ['(a*)+', '', 'b'],
    ['(z)((a+)?(b+)?(c))*', '', 'zaacbbbcac'],
    ['(\\d)\\1', '', 'a 11'],
    ['(?<c>.)\\k<c>', '', 'abccd'],
    ['foo(?=bar)', '', 'foobar foobaz'],
    ['foo(?!bar)', '', 'foobar foobaz'],
    ['[a-c]+', '', 'xxabcabcx'],
    ['[^a-c]+', '', 'abcxyz'],
    ['[\\u0980-\\u09FF]+', '', 'hello বাংলা world'],
    ['\\p{Script=Bengali}+', 'u', 'hi বাংলা'],
    ['01[3-9]\\d{8}', '', 'call 01712345678 now'],
    ['(?:ab)+', '', 'ababab'],
    ['x*', '', 'abc'],
    ['', '', 'abc'],
    ['A', 'i', 'a'],
    ['[A-Z]+', 'i', 'abcDEF'],
    ['(a)|b', '', 'b'],
    ['\\s+', '', 'a   b'],
    ['\\W', '', 'ab c'],
    ['.', 'u', '😀'],
];

for (const [pattern, flags, text] of cases) {
    test(`tracer == native: /${pattern}/${flags} on ${JSON.stringify(text)}`, () => {
        const native = new RegExp(pattern, flags + 'd').exec(text);
        const out = Tracer.run(pattern, flags, text, { limit: 1000000 });
        if (!native) {
            assert.equal(out.match, null);
            return;
        }
        assert.ok(out.match, 'tracer found no match');
        assert.equal(out.match.index, native.index);
        assert.equal(out.match.end, native.index + native[0].length);
        for (let g = 1; g < native.length; g++) {
            const expected = native.indices[g];
            const got = out.match.groups[g];
            if (expected === undefined) assert.equal(got, undefined, `group ${g}`);
            else assert.deepEqual(got, [expected[0], expected[1]], `group ${g}`);
        }
    });
}
