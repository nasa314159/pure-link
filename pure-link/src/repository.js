export function createLinkRepository(db) {
  if (!db) throw new Error('D1 binding pure_link_db is required.');

  return {
    async findBySlug(slug) {
      return db.prepare(`
        SELECT slug, content_type, content, signature, theme, is_affiliate,
               management_token_hash, owner_user_id, status, created_at, updated_at, expires_at
        FROM links
        WHERE slug = ?
      `).bind(slug).first();
    },

    async exists(slug) {
      const row = await db.prepare('SELECT 1 AS found FROM links WHERE slug = ?').bind(slug).first();
      return Boolean(row);
    },

    async create(link) {
      return db.prepare(`
        INSERT INTO links (
          slug, content_type, content, signature, theme, is_affiliate,
          management_token_hash, owner_user_id, status, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
      `).bind(
        link.slug,
        link.contentType,
        link.content,
        link.signature,
        link.theme,
        link.isAffiliate ? 1 : 0,
        link.managementTokenHash,
        link.ownerUserId || null,
      ).run();
    },

    async delete(slug, managementTokenHash) {
      return db.prepare(`
        DELETE FROM links
        WHERE slug = ? AND management_token_hash = ?
      `).bind(slug, managementTokenHash).run();
    },

    async deleteOwned(slug, ownerUserId) {
      return db.prepare('DELETE FROM links WHERE slug = ? AND owner_user_id = ?')
        .bind(slug, ownerUserId).run();
    },

    async claim(slug, managementTokenHash, ownerUserId) {
      return db.prepare(`
        UPDATE links SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE slug = ? AND management_token_hash = ?
      `).bind(ownerUserId, slug, managementTokenHash).run();
    },

    async listByOwner(ownerUserId) {
      const result = await db.prepare(`
        SELECT slug, content_type, content, signature, theme, status, created_at
        FROM links WHERE owner_user_id = ?
        ORDER BY created_at DESC LIMIT 200
      `).bind(ownerUserId).all();
      return result?.results || [];
    },
  };
}
