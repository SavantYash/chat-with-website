# Deployment

This document describes deployment options for the project.

## Local Deployment

### Prerequisites

- Node.js installed (recommended latest LTS)
- `npm` available
- `GEMINI_API_KEY` set in `.env.local`

### Commands

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default.

### Production Build

```bash
npm run build
npm run start
```

## Render Deployment

The application is compatible with Render because it uses a standard Node/Next.js setup and a local file-backed vector database.

### Notes

- `./data/lancedb` will be stored on the instance filesystem.
- Render's ephemeral filesystem means the LanceDB database will not persist across instance restarts unless a persistent disk is configured.
- Ensure `GEMINI_API_KEY` is added as a secret environment variable.

## Railway Deployment

Railway supports Next.js deployments with environment variables.

### Notes

- Add `GEMINI_API_KEY` as a Railway environment variable.
- Railway also uses an ephemeral filesystem by default, so embedded LanceDB persistence is temporary.
- The app should work if the deployment is configured for a persistent volume or if the vector store is rebuilt on startup.

## Docker Deployment

The project does not currently include a Dockerfile, but a Docker deployment is feasible.

### Recommended Docker approach

1. Use a Node base image.
2. Copy application source.
3. Install dependencies.
4. Set `GEMINI_API_KEY` via environment variables.
5. Mount `./data/lancedb` to a persistent volume if long-term persistence is required.

## Future Supabase Deployment

A Supabase deployment would require:

- a migration from local LanceDB to a hosted vector store or Postgres `pgvector`
- an API key configuration for hosted services
- adaptation of file paths and service startup

## Deployment Considerations

- The system is currently designed for a local or single-instance deployment.
- Persistent storage is necessary if indexing state must survive restarts.
- The application relies on the `fetch` API and network access to crawl external websites.
- Gemini API access must be available from the deployed environment.
