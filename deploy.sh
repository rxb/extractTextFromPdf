gcloud functions deploy extractTextFromPdf \
    --runtime=nodejs20 \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars=STORAGE_BUCKET=vision-box-1 \
    --region=us-central1 \
    --memory=1024MB \
    --timeout=540
