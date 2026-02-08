# サンプルファイル — フィクスチャポリシー

`samples/` 配下のYAMLファイルは**統合テストのフィクスチャ**を兼ねる。

## 原則

1. **改変禁止** — テストを通すためにサンプルYAMLを変更してはならない。テスト失敗時はLSPのコード（パーサー/インデックス）を修正する
2. **実ファイルのみ** — 統合テストでは人工的なインラインYAMLではなく、ここの実ファイルを使用する
3. **依存クラスタ** — ファイル間参照（templateRef, configMapKeyRef等）が解決できるよう関連ファイルをまとめてテストする
4. **意図的エラーファイル** — `*-invalid.yaml` は別テストセクションで「N件エラー期待」として検証する

## ディレクトリ構成

- `argo/` — Plain YAML版（Argo Workflows, ConfigMap/Secret）
- `helm/` — Helm Chart版（templates/, values.yaml, Chart.yaml）
- `README.md` — 各ファイルの用途とテストクラスタ一覧
