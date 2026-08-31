# JUGEM — Portfolio LP

作曲家・アーティスト **JUGEM** のポートフォリオLP。
ビルド不要の静的サイトで、GitHub Pages にそのまま載ります。

| | |
|---|---|
| お客様用 | <https://order-arch.github.io/jugem/> 誰でも無料で閲覧できる公開ページ |
| 本人専用 | <https://order-arch.github.io/jugem/admin/> リンクを貼るだけで実績とニュースを更新できる編集ページ |

セットアップと使い方は **[docs/SETUP.md](docs/SETUP.md)** を参照してください。

---

## 設計

### 横スクロール

サイト全体が1本の水平トラックで、コンテンツは右から左へ流れます。

- マウスホイール / トラックパッドの縦回転を横移動に変換
- ドラッグ、スワイプ、`←` `→` `PageUp/Down` `Home/End` に対応
- 右上のインデックス（`00`〜`06`）からどこへでも一手で移動
- 下端の進捗バーで現在位置がわかる
- 各セクションの左に、番号・英語・日本語を縦組みしたラベルを固定

セクションは `data/*.json` から生成され、**中身が空のセクションは自動で消えます**。
使わない機能を無効化する操作は要りません。

### 更新のしかた

編集ページの操作は3手だけです。

```
リンクを貼る  →  追加する  →  公開する
```

貼られたURLは oEmbed（YouTube / noembed）でタイトル・投稿者・サムネイルを自動取得し、
ドメインから行き先セクションを推測して振り分けます。
「公開する」で GitHub Contents API 経由で `data/*.json` にコミットされ、Pages が再ビルドします。

未公開の編集は `localStorage` に残るため、途中でブラウザを閉じても消えません。

### なぜサーバーがないのか

書き込みに必要なのは GitHub のトークンだけで、これは本人の端末のブラウザにしか保存されません。
公開サイトにも、リポジトリにも、トークンは一切含まれません。
サーバーもデータベースも運用費もゼロのまま、本人だけが更新できます。

---

## 構成

```
index.html            公開ページ
admin/index.html      編集ページ（noindex）
assets/
  css/app.css         公開ページのスタイル
  css/admin.css       編集ページのスタイル
  js/lib.js           共通処理（oEmbed解決・アフィリエイト付与・エスケープ）
  js/app.js           公開ページの描画と横スクロール制御
  js/admin.js         編集ページ
  js/github.js        GitHub Contents API クライアント
data/
  site.json           プロフィール・注目作品・解析設定・アフィリエイト設定
  news.json           最新情報
  works.json          実績
  voices.json         ファンの声
  picks.json          愛用品（アフィリエイト）
```

## セクション

| # | 英 | 和 | 内容 |
|---|---|---|---|
| 00 | INTRO | 序 | 名前とキャッチ |
| 01 | NOW | 最新作 | いま一番見せたい作品を1枚で |
| 02 | NEWS | 最新 | 30日以内は `NEW` が付く |
| 03 | WORKS | 実績 | 2段の横並び。`PICK UP` を先頭に |
| 04 | VOICE | 声 | ファンのコメントと投稿窓口 |
| 05 | PICKS | 愛用 | 機材紹介（アフィリエイト・広告表記自動） |
| 06 | ABOUT | 経歴 | 紹介文・業務内容・提供アーティスト |
| 07 | CONTACT | 連絡 | メールとSNS |

## アクセス解析

`data/site.json` の `analytics.provider` に `cloudflare` / `plausible` / `umami` / `ga4` のいずれかと
ID を入れると、公開ページに計測タグが挿入されます。既定は未設定（何も読み込まない）。
`analytics.dashboardUrl` を入れると、編集ページの「アクセス」タブに数字が埋め込み表示されます。

## アフィリエイト

`data/site.json` の `affiliate` に ID を入れると、`picks` と各実績の配信リンクへ
自動でパラメータが付きます（Amazon `tag` / Apple `at` / 楽天 `scid`）。
ID が設定されている間は景表法対応の広告表記が自動表示され、リンクには `rel="sponsored"` が付きます。

## ローカルで動かす

ES モジュールを使うため `file://` では動きません。

```sh
python3 -m http.server 8000
# http://localhost:8000/        公開ページ
# http://localhost:8000/admin/  編集ページ
```
