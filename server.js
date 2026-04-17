const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// DB接続
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// テーブル作成
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}
initDB().catch(console.error);

// 名刺一覧取得
app.get('/api/cards', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM cards ORDER BY created_at DESC');
    res.json(result.rows.map(r => r.data));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 名刺保存
app.post('/api/cards', async (req, res) => {
  try {
    const card = req.body;
    await pool.query(
      'INSERT INTO cards (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
      [card.id, card]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 名刺削除
app.delete('/api/cards/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cards WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// AI読み取り
app.post('/api/read-card', async (req, res) => {
  const { imageBase64, mediaType } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: `この名刺画像から情報を読み取り、JSONのみで返してください。説明不要。
{"name":"","kana":"","company":"","dept":"","jobTitle":"","email":"","tel":"","address":"","industry":"IT・通信/製造業/金融・保険/医療・福祉/小売・流通/建設・不動産/教育・研究/広告・マーケティング/コンサルティング/官公庁・自治体/その他 から選ぶ"}` }
          ]
        }]
      })
    });
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = (data.content || []).map(b => b.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(400).json({ error: '解析失敗' });
    res.json(JSON.parse(match[0]));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEISHI server running on port ${PORT}`));
