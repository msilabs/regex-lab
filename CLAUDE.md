# কাজের নিয়ম

## Commit
- Commit শুধু এই নামে ও ইমেইলে হবে: `msisaif <61042251+msisaif@users.noreply.github.com>`।
- Author ও committer দুটোই এই পরিচয়ে থাকবে।
- Commit মেসেজে কোনো attribution লাইন রাখা যাবে না।

## Push
- মালিক না বললে `git push` করা যাবে না।

## Stack
- সাইট [Alo](https://github.com/msilabs/alo) (`@msilabs/alo`) দিয়ে বানানো। কোনো `.alo` ফাইল বদলানোর আগে `AGENTS.md` পড়তে হবে।
- CSS `global/style.css`-এ। JS-এ বানানো HTML-এ scoped `<style>` পৌঁছায় না।
- engine `public/engine/`-এ, worker-এর ভেতরে চলে। এগুলো সাধারণ script, Node-এও `require` করা যায়।
- `node alo build` আর `npm test` দুটোই ভুল ছাড়া শেষ হতে হবে। `dist/` আর `.alo/` হাতে বদলানো যাবে না।
- `data/pattern`, `data/learn` বা `data/challenges` বদলালে `npm test` চালাতে হবে।
- `[slug]` পেজের ডেটা ফোল্ডারের নাম route-এর নামের সাথে মিলতে হয়: `pages/learn/[slug]` পড়ে `data/learn/`।
