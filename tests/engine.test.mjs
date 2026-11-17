import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('../public/engine/parser.js');
const Explain = require('../public/engine/explain.js');
const Redos = require('../public/engine/redos.js');
const Codegen = require('../public/engine/codegen.js');
const Tracer = require('../public/engine/tracer.js');

test('parser: errors are Bengali with a position', () => {
    assert.throws(() => Parser.parse('(ab', ''), (e) => e.pos === 0 && e.message.includes('বন্ধ হয়নি'));
    assert.throws(() => Parser.parse('ab)', ''), (e) => e.pos === 2);
    assert.throws(() => Parser.parse('[ab', ''), (e) => e.message.includes('['));
    assert.throws(() => Parser.parse('*a', ''), (e) => e.pos === 0);
    assert.throws(() => Parser.parse('[z-a]', ''), (e) => e.message.includes('উল্টো'));
    assert.throws(() => Parser.parse('(?<n>a)\\k<m>', ''), (e) => e.message.includes('"m"'));
});

test('explain: quantifier and class text', () => {
    const out = Explain.explain('\\d{3,5}', '');
    assert.ok(out.lines.some((l) => l.text.includes('৩ থেকে ৫বার')));
    const neg = Explain.explain('[^aeiou]', '');
    assert.ok(neg.lines[0].text.includes('এগুলো ছাড়া'));
});

test('explain: flags change the meaning', () => {
    assert.ok(Explain.explain('^a', 'm').lines[0].text.includes('প্রতিটা লাইনের শুরু'));
    assert.ok(Explain.explain('^a', '').lines[0].text.includes('লেখার একদম শুরু'));
});

test('explain: warns about \\d and \\w for Bengali users', () => {
    const out = Explain.explain('\\d+\\w', '');
    assert.equal(out.warnings.length, 2);
});

test('redos: dangerous patterns are flagged, safe ones are not', () => {
    assert.equal(Redos.analyze('(a+)+$', '').risk, 'danger');
    assert.equal(Redos.analyze('(\\w+\\s?)*$', '').risk, 'danger');
    assert.equal(Redos.analyze('^a+$', '').risk, 'none');
    assert.equal(Redos.analyze('(a|aa)*$', '').risk, 'danger');
    assert.equal(Redos.analyze('(x+x+)+y', '').risk, 'danger');
    assert.equal(Redos.analyze('^[\\w.+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}$', '').risk, 'none');
    assert.equal(Redos.analyze('(?:[\\w-]+\\.)+[A-Za-z]{2,}', '').risk, 'none');
    assert.equal(Redos.analyze('\\d+\\d+$', '').risk, 'warn');
    assert.equal(Redos.analyze('^01[3-9]\\d{8}$', '').risk, 'none');
});

test('codegen: PHP, Laravel and Python output', () => {
    const out = Codegen.generate('^01[3-9]\\d{8}$', 'i', {});
    assert.ok(out.php.includes("preg_match('/^01[3-9]\\d{8}$/i'"));
    assert.ok(out.laravel.includes("'regex:/^01[3-9]\\d{8}$/i'"));
    assert.ok(out.python.includes("re.compile") || out.python.includes('re.search'));
    const named = Codegen.generate('(?<y>\\d+)\\/x', 'g', {});
    assert.ok(named.python.includes('(?P<y>'));
    assert.ok(named.php.includes('\\/x'));
});

test('codegen: Bengali pattern gets the u flag for PHP', () => {
    const out = Codegen.generate('[ক-হ]+', '', {});
    assert.ok(out.php.includes("/u'"));
});

test('tracer: counts grow exponentially for (a+)+$', () => {
    const small = Tracer.countSteps('(a+)+$', '', 'aaaaaaaa!', 1000000).count;
    const big = Tracer.countSteps('(a+)+$', '', 'aaaaaaaaaaaa!', 1000000).count;
    assert.ok(big > small * 10);
});

test('tracer: lookbehind is reported as unsupported', () => {
    assert.throws(() => Tracer.run('(?<=a)b', '', 'ab'), (e) => e instanceof Tracer.Unsupported);
});
