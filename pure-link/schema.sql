-- PureLink 核心資料表
CREATE TABLE IF NOT EXISTS links (
    slug TEXT PRIMARY KEY,          -- 縮網址後綴 (例如 kopi)
    content TEXT NOT NULL,          -- 原始內容 (URL 或 LaTeX)
    type TEXT DEFAULT 'url',        -- 內容類型: url, latex, text
    is_affiliate INTEGER DEFAULT 0, -- 是否為分潤連結 (0: 否, 1: 是)
    view_count INTEGER DEFAULT 0,   -- 點擊次數統計
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);