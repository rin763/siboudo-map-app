# 就活モチベーションマップ（Rails版）セットアップ手順

このディレクトリには、丸ごとの Rails アプリではなく「新規アプリに追加するファイル一式」が入っています。
Rails Tutorial と同じ要領で `rails new` から始めてください。

## 1. アプリを新規作成する

```bash
rails new motivation_map --skip-test
cd motivation_map
```

（デフォルトの SQLite3 / importmap 構成のままで大丈夫です）

## 2. このディレクトリの中身をコピーする

このフォルダの中身を、生成した `motivation_map` の同じ相対パスに上書きコピーしてください。

```
app/models/company.rb
app/models/point.rb
app/controllers/map_controller.rb
app/controllers/companies_controller.rb
app/controllers/points_controller.rb
app/views/map/show.html.erb
app/javascript/controllers/motivation_map_controller.js
app/assets/stylesheets/application.css   ← 既存ファイルを上書き
config/routes.rb                          ← 既存ファイルを上書き
db/migrate/20260912000001_create_companies.rb
db/migrate/20260912000002_create_points.rb
```

## 3. Stimulus コントローラーを登録する

`app/javascript/controllers/index.js` に以下の2行を追記してください
（`import { application }` の行より下ならどこでもOKです）。

```js
import MotivationMapController from "./motivation_map_controller"
application.register("motivation-map", MotivationMapController)
```

## 4. DB を作成してマイグレーションする

```bash
bin/rails db:create
bin/rails db:migrate
```

## 5. 起動する

```bash
bin/rails server
```

`http://localhost:3000` を開くと、企業を追加してモチベーションマップを作れます。

---

## 構成のポイント

- `Company` と `Point` はどちらも普通の ActiveRecord モデルです（`has_many` / `belongs_to` のみ）。
- 画面遷移は無く、`app/javascript/controllers/motivation_map_controller.js`（Stimulus）が
  `fetch` で `POST /companies`・`POST /points`・`PATCH /points/:id` などを呼び、
  JSON レスポンスを使って画面を再描画しています。CSRF トークンは
  レイアウトの `<meta name="csrf-token">`（`rails new` のデフォルトで既に入っています）から取得しています。
- 企業ごとの色は `Company#color_index`（作成順の連番）を、JS 側の `PALETTE` 配列の
  インデックスとして使うことで対応させています。緑系の色を8種類用意してあります。
- 認証は入れていません。今のところ全員が同じデータを見る単一の共有マップです。
  参加者ごとに分けたい場合は、Rails Tutorial でやった `has_secure_password` の要領で
  `User` を追加し、`Company belongs_to :user` にすると自然に拡張できます。
