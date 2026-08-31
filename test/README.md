# ブラウザスモークテスト（開発者向け）

サイト本体はビルド不要で動きます。ここのテストは変更時の確認用で、公開には不要です。

```sh
npm i playwright && npx playwright install chromium
python3 -m http.server 8123 &
SP=$(mktemp -d) node test/smoke.mjs   # 公開ページ: 横スクロール・ホイール・キー操作・モバイル
SP=$(mktemp -d) node test/admin.mjs   # 編集ページ: 貼り付け振り分け・下書き保持・並べ替え・削除
```

`smoke.mjs` は外部アセット（YouTubeサムネイル・Google Fonts）を
`$SP/cache/` から差し替えて読み込みます。キャッシュが無い場合は
画像とフォントが欠けた状態で描画されますが、レイアウトの検証はできます。

## 回帰として押さえている点

- 縦ホイールが横移動に変換され、ドキュメント自体はスクロールしないこと
- 指スワイプでトラックだけが動くこと
- `IntersectionObserver` の threshold が 0 であること
  （WORKSパネルは数画面分の幅があり、閾値を上げると狭い画面で永久に非表示になる）
- リンク未設定のカードがページ自身へのリンクにならないこと
- 未公開の編集がリロードをまたいで残ること
