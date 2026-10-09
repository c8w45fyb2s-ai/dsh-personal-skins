/** Canonical on-disk types. APNG retains its PNG container and original bytes. */
export const ASSET_ID_RE = /^[a-f0-9]{64}\.(?:jpg|png|webp|gif)$/;
export const ASSET_MIME = Object.freeze({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' });
