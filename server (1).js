const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// APIキーはGlitchの環境変数から取得（安全）
app.post('/api/read-card', async (req, res) => {
  const { imageBase64, mediaType } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

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
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 }
            },
            {
              type: 'text',
              text: `この名刺画像から情報を読み取り、JSONのみで返してください。説明不要。
{"name":"","kana":"","company":"","dept":"","jobTitle":"","email":"","tel":"","address":"","industry":"IT・通信/製造業/金融・保険/医療・福祉/小売・流通/建設・不動産/教育・研究/広告・マーケティング/コンサルティング/官公庁・自治体/その他 から選ぶ"}`
            }
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEISHI server running on port ${PORT}`));
