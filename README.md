# MY NEXT PHASE - 未来への手帳

退職カウントダウン手帳アプリ

## デプロイ方法

### Vercel（おすすめ・無料）

1. GitHubにリポジトリを作成してこのフォルダをpush
2. [vercel.com](https://vercel.com) にGitHubでログイン
3. 「New Project」→ リポジトリを選択 → 「Deploy」
4. 完了！URLが発行されます

### Claude Codeでやる場合

```bash
# プロジェクトフォルダで実行
npm install
npm run dev      # ローカル確認 → http://localhost:5173

# Vercelにデプロイ
npx vercel
```

## スマホでアプリっぽく使う

1. デプロイしたURLをスマホのブラウザで開く
2. 共有ボタン →「ホーム画面に追加」
3. アプリアイコンとして表示されます

## データについて

- すべてのデータはブラウザのlocalStorageに保存
- 同じブラウザで開けばデータは残ります
- ブラウザのデータを消去するとリセットされます
