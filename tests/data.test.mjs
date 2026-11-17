import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Challenge = require('../public/engine/challenge.js');
const Parser = require('../public/engine/parser.js');
const Redos = require('../public/engine/redos.js');

const root = path.resolve(import.meta.dirname, '..', 'data');

function readAll(folder) {
    return fs.readdirSync(path.join(root, folder))
        .filter((name) => name.endsWith('.json'))
        .map((name) => ({ name, ...JSON.parse(fs.readFileSync(path.join(root, folder, name), 'utf8')) }));
}

for (const item of readAll('pattern')) {
    test(`pattern/${item.name}: example lists`, () => {
        const re = new RegExp(item.pattern, item.flags);
        for (const text of item.should_match) assert.ok(re.test(text), `should match: ${text}`);
        for (const text of item.should_not_match) assert.ok(!re.test(text), `should not match: ${text}`);
    });

    test(`pattern/${item.name}: parser accepts and no ReDoS flag`, () => {
        Parser.parse(item.pattern, item.flags);
        const verdict = Redos.analyze(item.pattern, item.flags);
        assert.equal(verdict.risk, 'none', verdict.reasons.join(' / '));
    });
}

for (const item of readAll('challenges')) {
    test(`challenges/${item.name}: solution passes every case`, () => {
        const out = Challenge.evaluate(item.type, item.solution, item.flags, item.cases, item.replacement);
        assert.ok(!out.error, out.error && out.error.message);
        const failed = out.results.filter((r) => !r.pass);
        assert.deepEqual(failed, []);
    });
}

function lessonBlocks() {
    const folder = path.join(root, 'learn');
    const blocks = [];
    for (const name of fs.readdirSync(folder).filter((n) => n.endsWith('.md'))) {
        const source = fs.readFileSync(path.join(folder, name), 'utf8');
        for (const m of source.matchAll(/```regex\n([\s\S]*?)```/g)) {
            const lines = m[1].replace(/\n$/, '').split('\n');
            const head = lines.shift();
            const slash = head.lastIndexOf('/');
            blocks.push({ name, head, pattern: head.slice(1, slash), flags: head.slice(slash + 1), text: lines.join('\n') });
        }
    }
    return blocks;
}

test('learn: every lesson has a unique order from 1', () => {
    const folder = path.join(root, 'learn');
    const orders = fs.readdirSync(folder).filter((n) => n.endsWith('.md'))
        .map((n) => Number(/^order: (\d+)$/m.exec(fs.readFileSync(path.join(folder, n), 'utf8'))[1]))
        .sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, i) => i + 1));
});

for (const block of lessonBlocks()) {
    test(`learn/${block.name}: ${block.head} compiles`, () => {
        assert.ok(block.head.startsWith('/'), 'first line must be /pattern/flags');
        new RegExp(block.pattern, block.flags);
        Parser.parse(block.pattern, block.flags);
    });
}

test('pattern: every pattern has a unique order from 1', () => {
    const orders = readAll('pattern').map((item) => item.order).sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, i) => i + 1));
});
