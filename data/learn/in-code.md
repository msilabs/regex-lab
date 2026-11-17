---
title: "কোডে regex: JS, PHP, Laravel, Python"
order: 16
summary: শেখা pattern আসল প্রজেক্টে বসানো।
---

pattern একই, কিন্তু প্রতিটা ভাষায় লেখার নিয়ম একটু আলাদা। উদাহরণে বাংলাদেশি মোবাইল নম্বর।

## JavaScript

```js
const re = /^01[3-9]\d{8}$/;
re.test('01712345678');            // true

const all = [...text.matchAll(/01[3-9]\d{8}/g)];
const fixed = text.replace(/\s+/g, ' ');
```

## PHP

pattern string-এর ভেতরে, দুই পাশে `/`, flag শেষে।

```php
if (preg_match('/^01[3-9]\d{8}$/', $phone)) {
    // ঠিক আছে
}

preg_match_all('/01[3-9]\d{8}/', $text, $matches);
```

## Laravel validation

```php
$request->validate([
    'phone' => ['required', 'regex:/^01[3-9]\d{8}$/'],
]);
```

সবসময় **array** ধরনে লিখুন। `'required|regex:/a|b/'` লিখলে Laravel pattern-এর ভেতরের `|`-কেও rule-এর ভাগ ভাবে, ফলে ভেঙে যায়।

## Python

pattern-এর আগে `r` দিন (raw string), তাহলে `\` দুবার লিখতে হয় না।

```python
import re

if re.fullmatch(r'01[3-9]\d{8}', phone):
    print('ঠিক আছে')

numbers = re.findall(r'01[3-9]\d{8}', text)
```

Python-এ নাম দেওয়া group লেখা হয় `(?P<name>...)`।

## তৈরি কোড

Pattern পেজে প্রতিটা pattern-এর জন্য চার ভাষার কোড তৈরি করা আছে, কপি করলেই চলবে।
