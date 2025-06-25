# M-TUNED Cloudflare Portal

This repository contains a sample implementation for a customer portal running on Cloudflare. It demonstrates a multi-layer design using **Cloudflare Workers**, **R2 object storage**, **D1 database**, and **Workers AI** to guide users through the tuning process.

## Features

- **Account management** – customers can sign up and log in.
- **Order tracking** – each upload generates an order entry in D1 with status updates.
- **File uploads** – logs and finished tunes are stored in R2 buckets.
- **Email notifications** – simple worker function posts to MailChannels to notify customers when files are uploaded or tunes are ready.
- **AI assistant** – integrates with Workers AI (`@cf/meta/llama-2-7b-chat-int8`) to answer tuning questions.

## Structure

- `portal.html` – front-end UI for sign up, login, uploads, order status and chat.
- `app.js` – client-side JavaScript interacting with the worker API.
- `worker.js` – Cloudflare Worker handling API requests, authentication and storage.

## Local Development

1. Install the [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/).
2. Configure `wrangler.toml` (example below) with your R2 buckets, D1 database binding and environment variables.

```toml
name = "mtuned-portal"
main = "worker.js"
compatibility_date = "2024-04-01"

[[r2_buckets]]
binding = "LOG_BUCKET"
bucket_name = "mtuned-logs"

[[r2_buckets]]
binding = "TUNE_BUCKET"
bucket_name = "mtuned-tunes"

[[d1_databases]]
binding = "DB"
database_name = "mtuned-db"

[vars]
JWT_SECRET = "replace-with-random-string"
```

3. Run `wrangler dev` to start a local server.

### Database setup

The Worker expects a `users` table (`email`, `hash`, `role`) and an `orders` table (`id`, `email`, `status`, `updated_at`). D1 SQL example:

```sql
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  role TEXT DEFAULT 'user'
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Deploying

After testing locally, run `wrangler publish`. Cloudflare will deploy the worker and static assets to the edge. Point your domain to the worker or serve `portal.html` via [Cloudflare Pages](https://pages.cloudflare.com/).

## Notes

This code is a starting point and omits robust security and error handling. Before going to production consider adding:

- Secure password hashing (e.g., Argon2 via WebAssembly)
- CSRF protection and rate limiting
- Validation for uploaded file types and sizes
- Admin tooling to update order status and manage users

The AI assistant uses `ai-rules.md` for its system prompt. Edit this file or
set the `AI_RULES` environment variable to customize responses.

