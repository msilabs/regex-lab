// worker-এর সাথে কথা বলার ছোট client। কাজ ২ সেকেন্ডের বেশি নিলে worker বন্ধ করে নতুন চালু করে।
(function () {
    var TIMEOUT_MS = 2000;
    var base = document.documentElement.dataset.base || '/';
    var worker = null;
    var nextId = 1;
    var pending = {};
    var timer = null;

    function start() {
        worker = new Worker(base + 'engine/worker.js');
        worker.onmessage = function (event) {
            var reply = event.data;
            var entry = pending[reply.id];
            if (!entry) return;
            delete pending[reply.id];
            entry.resolve(reply.result);
            if (!Object.keys(pending).length) clearTimeout(timer);
        };
        worker.onerror = function () {
            killAll({ timeout: false, crashed: true });
        };
    }

    function killAll(reason) {
        clearTimeout(timer);
        if (worker) worker.terminate();
        worker = null;
        var old = pending;
        pending = {};
        Object.keys(old).forEach(function (id) { old[id].reject(reason); });
    }

    function watch() {
        clearTimeout(timer);
        timer = setTimeout(function () { killAll({ timeout: true }); }, TIMEOUT_MS);
    }

    function call(type, payload) {
        if (!worker) start();
        var id = nextId++;
        var message = Object.assign({ id: id, type: type }, payload);
        return new Promise(function (resolve, reject) {
            pending[id] = { resolve: resolve, reject: reject };
            watch();
            worker.postMessage(message);
        });
    }

    window.RegexEngine = { call: call };

    window.RegexUtil = {
        escapeHtml: function (text) {
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        },
        debounce: function (fn, ms) {
            var t;
            return function () {
                var args = arguments;
                clearTimeout(t);
                t = setTimeout(function () { fn.apply(null, args); }, ms);
            };
        },
        bn: function (n) {
            return String(n).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; });
        },
        copy: function (text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
            }
            return Promise.resolve(false);
        },
        store: {
            get: function (key) {
                try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
            },
            set: function (key, value) {
                try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
            }
        },
        // মিলগুলো রঙ করে লেখার HTML বানায়। ছোট group-এর রঙ বড় group-এর ওপরে বসে।
        highlight: function (text, matches) {
            var esc = window.RegexUtil.escapeHtml;
            var cuts = [0, text.length];
            matches.forEach(function (m) {
                cuts.push(m.index, m.end);
                m.groups.forEach(function (g) { if (g) cuts.push(g.start, g.end); });
            });
            cuts = cuts.filter(function (c) { return c >= 0 && c <= text.length; }).sort(function (a, b) { return a - b; });
            var html = '';
            for (var i = 0; i < cuts.length - 1; i++) {
                var a = cuts[i];
                var b = cuts[i + 1];
                if (a === b) continue;
                var piece = esc(text.slice(a, b));
                var k = matches.findIndex(function (m) { return m.index <= a && m.end >= b; });
                if (k === -1) { html += piece; continue; }
                var cls = 'hm' + (k % 2 ? ' odd' : '');
                var best = -1;
                var size = Infinity;
                matches[k].groups.forEach(function (g, gi) {
                    if (g && g.start <= a && g.end >= b && g.end - g.start < size) { best = gi; size = g.end - g.start; }
                });
                if (best >= 0) cls += ' hg' + (best % 6);
                html += '<span class="' + cls + '">' + piece + '</span>';
            }
            return html + '\n';
        },
        readHash: function () {
            var hash = location.hash.replace(/^#/, '');
            if (!hash) return null;
            var params = {};
            hash.split('&').forEach(function (pair) {
                var at = pair.indexOf('=');
                if (at > 0) {
                    try { params[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1)); } catch (e) {}
                }
            });
            if (params.p === undefined) return null;
            params.f = params.f || '';
            params.t = params.t || '';
            return params;
        },
        timeoutMessage: 'এই pattern অনেক সময় নিচ্ছে, সম্ভবত catastrophic backtracking। চালানো থামিয়ে দেওয়া হয়েছে।'
    };
})();
