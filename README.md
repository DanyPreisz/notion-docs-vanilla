# Notion / Docs · Vanilla JS + MongoDB Atlas

Páginas con título y cuerpo, guardado automático. Node `http` nativo.
Colección Atlas: `notion.pages`.

## Local

```bash
npm install
npm start
```

Sin `MONGODB_URI` usa `/tmp`.

## Cloud Run

```bash
export GCP_PROJECT_ID=project-778283d9-dc7e-4c2c-947
export MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER.mongodb.net/notion?retryWrites=true&w=majority&authSource=admin"

gcloud run deploy notion-docs-vanilla \
  --project $GCP_PROJECT_ID \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --update-env-vars="MONGODB_URI=${MONGODB_URI},MONGODB_DB=notion,MONGODB_COLLECTION=pages"
```

`/health` tiene que decir `"store":"mongodb"`.

## API

- `GET /api/pages?q=`
- `POST /api/pages`
- `GET /api/pages/:id`
- `PUT /api/pages/:id`
- `DELETE /api/pages/:id`
- `GET /health`
