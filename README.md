# Refined Fairgrit

Fairgritの「勤怠・経費の申請」で、閉じたカードにも申請内容を表示するChrome拡張です。

- 経費：費用科目・支払先・摘要・金額
- 交通費：区間・路線・片道往復・金額

申請・承認・コピーの操作はFairgritの既存ボタンを使います。通信の追加や申請データの保存・外部送信は行いません。

## 開発・利用

```sh
direnv exec . bun install --frozen-lockfile
direnv exec . bun test
direnv exec . bun run compile
direnv exec . bun run build
```

Chromeの `chrome://extensions` でデベロッパーモードを有効にし、「パッケージ化されていない拡張機能を読み込む」から `.output/chrome-mv3` を選択します。Fairgritのタブを再読み込みすると有効になります。

## DOM変更への対応

カードのクラス名・コンポーネント名・DOMの階層数・配列の並び順に依存せず、「申請番号」を持つボタンとVueの既存データの `wf_id` を照合します。ページ切替や再描画を監視し、要約を更新します。情報が欠落・重複した場合は該当する要約を取り除きます。

対象は `https://gigooo.fairgrit.com` のChromeです。ページ側のVue 2の `__vue__` / `$parent` / `$props` と申請データの項目名には依存します。Vueの入替やラベル・データ形式の変更すべてに対応できる保証はありません。
