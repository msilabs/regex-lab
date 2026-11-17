# Regex Lab

বাংলায় regex শেখা আর পরীক্ষা করার জায়গা। তৈরি বাংলাদেশি pattern, বাংলা ব্যাখ্যাসহ playground, শুরু থেকে regex শেখার course আর challenge। সবকিছু browser-এ চলে, কোনো লেখা কোথাও যায় না।

🔗 **লাইভ:** https://msilabs.github.io/regex-lab/

সাইট বানানো হয় [আলো (Alo)](https://github.com/msilabs/alo) দিয়ে। Node.js ২২ বা নতুন ভার্সন লাগবে।

## চালানো

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # dist/ ফোল্ডারে সাইট
npm test        # engine, pattern, পাঠ আর challenge-এর test
```

GitHub Pages-এর মতো সাব-পাথের জন্য: `node alo build --base /regex-lab/`

Web Worker লাগে, তাই `dist/` সরাসরি `file://` দিয়ে খুললে চলবে না। server দিয়ে চালান।

## পেজ

| ঠিকানা | কী আছে |
|---|---|
| `/` | Pattern সংগ্রহ: pattern-এর তালিকা, ধরন অনুযায়ী বাছাই |
| `/pattern/<slug>/` | একটা pattern: উদাহরণ, নিজে পরীক্ষা আর JS/PHP/Laravel/Python কোড |
| `/playground/` | pattern আর লেখা দিয়ে live মিল, বাংলা ব্যাখ্যা আর ReDoS সতর্কবার্তা |
| `/learn/` | ১৬টা পাঠের course, প্রতিটায় নিজে বদলে দেখার উদাহরণ |
| `/challenge/` | test case সহ অনুশীলন, পাস করলে পরেরটা খোলে |

## ফাইল কোথায়

```
pages/                 প্রতিটা পেজ, উপরের টেবিলের মতো
components/            SiteHeader (মেনুসহ), SiteFooter, PatternCard
data/pattern/*.json    তৈরি pattern (প্রতিটা একটা file)
data/learn/*.md        Learn-এর পাঠ (ক্রম আসে front matter-এর order থেকে)
data/challenges/*.json challenge (নামের শুরুর সংখ্যা ক্রম ঠিক করে)
global/engine.js       worker-এর client আর ছোট helper
global/style.css       সব CSS
public/engine/         worker আর engine (parser, explain, tracer, redos, codegen, challenge)
tests/                 node --test
```

## নতুন কিছু যোগ করা

- **pattern:** `data/pattern/<slug>.json`-এ `title`, `category` (`bd` বা `common`), `pattern`, `flags`, `explain`, `should_match`, `should_not_match`, `notes` আর `order` (তালিকায় কত নম্বরে দেখাবে, ১ থেকে ক্রমানুসারে, কারো সাথে মিলবে না) দিন।
- **পাঠ:** `data/learn/<slug>.md`-এ front matter-এ `title`, `order`, `summary` দিন। চেষ্টা করার বাক্স বানাতে ```` ```regex ```` ব্লক লিখুন: প্রথম লাইনে `/pattern/flags`, বাকি লাইনগুলো লেখা।
- **challenge:** `data/challenges/16-নাম.json`-এ `title`, `level`, `type` (`match`, `extract`, `replace`), `task`, `cases`, `hint`, `solution`, `flags` দিন।
- তারপর `npm test` চালান। উদাহরণ, পাঠের regex বা solution ভুল হলে test ফেল করবে।
